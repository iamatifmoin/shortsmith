import { GoogleGenAI } from '@google/genai';

import {
  LlmCompletionOptions,
  LlmCompletionResult,
  LlmMessage,
  LlmProvider,
} from '../llm.interface';
import { AllModelsExhaustedError, ContentBlockedError } from '../errors';

/**
 * Default quality-ranked model queue (best first). Uses floating `-latest`
 * aliases so Google's version churn (3.x, 4, …) doesn't break us, and stays on
 * the free tier (Flash / Flash-Lite). Override with GEMINI_MODEL_QUEUE
 * (comma-separated, best first) — prepend e.g. `gemini-pro-latest` once billing
 * is enabled. See docs/decisions.md (ADR-012).
 */
const DEFAULT_MODEL_QUEUE = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

/** HTTP statuses that mean "capacity/availability — try the next model". */
const CAPACITY_STATUSES = new Set([403, 404, 429, 500, 503]);

function isCapacityError(err: unknown): boolean {
  const status = (err as { status?: number } | undefined)?.status;
  if (typeof status === 'number' && CAPACITY_STATUSES.has(status)) return true;
  const message = String((err as Error | undefined)?.message ?? '').toUpperCase();
  return /RESOURCE_EXHAUSTED|UNAVAILABLE|OVERLOAD|RATE.?LIMIT|QUOTA|TIMEOUT|TIMED.?OUT|ABORT|DEADLINE/.test(
    message,
  );
}

export interface GeminiProviderOptions {
  apiKey?: string;
  /** Quality-ranked model ids, best first. */
  models?: string[];
  /** How long to skip a model after it returns a capacity error (ms). */
  cooldownMs?: number;
  /** Per-request timeout (ms). Keeps a slow/overloaded model from stalling the queue. */
  requestTimeoutMs?: number;
}

/**
 * Gemini provider with a quality-ranked fallback queue (ADR-012). Tries the best
 * model first; on a capacity error (rate limit / quota / unavailable) it marks
 * that model as cooling down and falls through to the next, lower-quality model
 * — no manual retries. A content block or a genuine error is surfaced, not
 * retried on another model. When the whole queue is spent it throws
 * AllModelsExhaustedError (operator waits for the daily reset or goes manual).
 *
 * The client is created lazily, so the app boots without a GEMINI_API_KEY.
 */
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';

  private client?: GoogleGenAI;
  private readonly apiKey?: string;
  private readonly models: string[];
  private readonly cooldownMs: number;
  private readonly requestTimeoutMs: number;
  /** model id -> epoch ms until which it is skipped after a capacity error. */
  private readonly cooldownUntil = new Map<string, number>();

  constructor(options: GeminiProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    this.models = options.models ?? parseQueue(process.env.GEMINI_MODEL_QUEUE) ?? DEFAULT_MODEL_QUEUE;
    this.cooldownMs = options.cooldownMs ?? Number(process.env.GEMINI_MODEL_COOLDOWN_MS ?? 60_000);
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? Number(process.env.GEMINI_REQUEST_TIMEOUT_MS ?? 20_000);
  }

  private getClient(): GoogleGenAI {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not set. Set it, or use LLM_PROVIDER=manual.');
    }
    if (!this.client) {
      this.client = new GoogleGenAI({
        apiKey: this.apiKey,
        // Fail fast so OUR queue controls fall-through: cap each attempt and don't
        // let the SDK slow-retry a 503 on the top model — we'd rather drop to the
        // next, available model immediately (ADR-012).
        httpOptions: { timeout: this.requestTimeoutMs, retryOptions: { attempts: 1 } },
      });
    }
    return this.client;
  }

  async complete(messages: LlmMessage[], options?: LlmCompletionOptions): Promise<LlmCompletionResult> {
    const client = this.getClient();
    const queue = options?.model ? [options.model] : this.models;
    const { systemInstruction, contents } = toGeminiRequest(messages, options);
    const attempted: string[] = [];

    for (const model of queue) {
      if ((this.cooldownUntil.get(model) ?? 0) > Date.now()) continue;
      attempted.push(model);
      try {
        const response = await client.models.generateContent({
          model,
          contents,
          config: {
            ...(systemInstruction ? { systemInstruction } : {}),
            ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
            ...(options?.maxTokens !== undefined ? { maxOutputTokens: options.maxTokens } : {}),
          },
        });

        const text = response.text ?? '';
        if (!text) {
          const feedback = response as {
            promptFeedback?: { blockReason?: string };
            candidates?: Array<{ finishReason?: string }>;
          };
          const reason = feedback.promptFeedback?.blockReason ?? feedback.candidates?.[0]?.finishReason;
          throw new ContentBlockedError(reason ? String(reason) : undefined);
        }

        return {
          text,
          model,
          usage: response.usageMetadata
            ? {
                inputTokens: response.usageMetadata.promptTokenCount ?? 0,
                outputTokens: response.usageMetadata.candidatesTokenCount ?? 0,
              }
            : undefined,
        };
      } catch (err) {
        if (err instanceof ContentBlockedError) throw err; // not capacity — surface it
        if (isCapacityError(err)) {
          this.cooldownUntil.set(model, Date.now() + this.cooldownMs);
          continue; // fall through to the next, lower-quality model
        }
        throw err; // a genuine error (bad request, auth, …) — don't mask it
      }
    }

    throw new AllModelsExhaustedError(attempted.length ? attempted : queue);
  }
}

function parseQueue(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

/** Map our provider-agnostic messages onto Gemini's shape (role `assistant` -> `model`). */
function toGeminiRequest(messages: LlmMessage[], options?: LlmCompletionOptions) {
  const systemParts: string[] = [];
  if (options?.system) systemParts.push(options.system);

  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content);
      continue;
    }
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    });
  }

  return {
    systemInstruction: systemParts.length ? systemParts.join('\n\n') : undefined,
    contents,
  };
}
