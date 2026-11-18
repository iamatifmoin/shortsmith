/**
 * Provider-agnostic LLM interface.
 *
 * The pipeline's `extract` and `generate` stages depend ONLY on this interface,
 * never on a concrete vendor SDK. Implementations live under `providers/` and
 * are selected at runtime via the LLM_PROVIDER env var. See docs/architecture.md
 * ("LLM abstraction") and ADR-010.
 */

/** A single chat message in a completion request. */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Options shared by all providers. Providers map these onto their own params. */
export interface LlmCompletionOptions {
  /** Provider model id. If omitted, the provider picks its default. */
  model?: string;
  /** Sampling temperature. */
  temperature?: number;
  /** Max tokens to generate. */
  maxTokens?: number;
  /** Optional system prompt (alternative to a system message). */
  system?: string;
}

/** A normalized completion result, provider-independent. */
export interface LlmCompletionResult {
  /** The generated text. */
  text: string;
  /** Model id that produced the result. */
  model: string;
  /** Token usage, when the provider reports it. */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Minimal contract every provider implements. Kept small on purpose — add
 * capabilities (tools, streaming, JSON mode) here only when a stage needs them,
 * so all providers stay swappable.
 */
export interface LlmProvider {
  /** Stable identifier, e.g. "anthropic" | "openai". */
  readonly name: string;

  /** Run a completion over the given messages. */
  complete(
    messages: LlmMessage[],
    options?: LlmCompletionOptions,
  ): Promise<LlmCompletionResult>;
}

/**
 * Supported provider keys, selected via the LLM_PROVIDER env var.
 * - `gemini`  — default; free-tier quality-ranked fallback queue (ADR-012).
 * - `manual`  — human-in-the-loop paste mode / fallback (ADR-013).
 * - `anthropic` — Claude API (stub; optional paid upgrade later).
 * - `openai`  — reserved; not implemented.
 */
export type LlmProviderName = 'gemini' | 'manual' | 'anthropic' | 'openai';
