/**
 * @shortsmith/llm
 *
 * Provider-agnostic LLM access. Callers import the interface + a factory;
 * concrete providers stay behind `createLlmProvider`, selected by LLM_PROVIDER.
 *
 * Default is Gemini (free-tier, quality-ranked fallback queue). A manual
 * (human-in-the-loop paste) provider is the zero-cost fallback. Claude (Anthropic)
 * is a stub for an optional paid upgrade later. See docs/decisions.md (ADR-012/013)
 * and docs/architecture.md ("LLM abstraction").
 */

export * from './llm.interface';
export * from './errors';
export { GeminiProvider } from './providers/gemini.provider';
export { ManualProvider, renderConversation } from './providers/manual.provider';
export { AnthropicProvider } from './providers/anthropic.provider';

import { LlmProvider, LlmProviderName } from './llm.interface';
import { GeminiProvider } from './providers/gemini.provider';
import { ManualProvider } from './providers/manual.provider';
import { AnthropicProvider } from './providers/anthropic.provider';

/**
 * Resolve an LlmProvider from the LLM_PROVIDER env var (default: "gemini").
 *
 * Adding a provider must not require changes in the extract/generate stages —
 * they only see the LlmProvider interface. See ADR-010/012.
 */
export function createLlmProvider(
  provider: LlmProviderName = (process.env.LLM_PROVIDER as LlmProviderName) ?? 'gemini',
): LlmProvider {
  switch (provider) {
    case 'gemini':
      return new GeminiProvider();
    case 'manual':
      return new ManualProvider();
    case 'anthropic':
      return new AnthropicProvider();
    case 'openai':
      // TODO(later): return new OpenAIProvider();
      throw new Error('NotImplemented: openai provider not yet added');
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${String(provider)}`);
  }
}
