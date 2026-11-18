import {
  LlmCompletionOptions,
  LlmCompletionResult,
  LlmMessage,
  LlmProvider,
} from '../llm.interface';

/**
 * Default LLM provider: Anthropic. STUB ONLY for this scaffold pass.
 *
 * TODO(phase-1): implement `complete()` using the Anthropic SDK
 * (`@anthropic-ai/sdk`). Read ANTHROPIC_API_KEY from env, default to the latest
 * Claude model, map LlmCompletionOptions onto the Messages API, and normalize
 * the response into LlmCompletionResult. Keep all Anthropic-specific code inside
 * this file so the `extract`/`generate` stages stay provider-agnostic.
 * See docs/architecture.md ("LLM abstraction") and ADR-010.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';

  constructor(private readonly apiKey: string | undefined = process.env.ANTHROPIC_API_KEY) {
    // TODO(phase-1): construct the Anthropic SDK client from this.apiKey.
    void this.apiKey;
  }

  async complete(
    _messages: LlmMessage[],
    _options?: LlmCompletionOptions,
  ): Promise<LlmCompletionResult> {
    // TODO(phase-1): real implementation. Throwing keeps callers honest until
    // the extract/generate stages are built.
    throw new Error('NotImplemented: AnthropicProvider.complete (scaffold stub)');
  }
}
