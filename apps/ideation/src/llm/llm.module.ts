import { Global, Module } from '@nestjs/common';
import { createLlmProvider } from '@shortsmith/llm';

/**
 * DI token for the provider-agnostic LlmProvider. Inject the interface with
 * `@Inject(LLM_PROVIDER)` so stages never construct a provider themselves.
 */
export const LLM_PROVIDER = 'LLM_PROVIDER';

/**
 * Global so the extract/generate stages can inject the LlmProvider without each
 * importing this module or `new`-ing its own instance. The concrete provider is
 * resolved once from the LLM_PROVIDER env via the packages/llm factory — stages
 * only ever see the interface, never a vendor SDK (ADR-010). See CLAUDE.md
 * ("Code conventions").
 */
@Global()
@Module({
  providers: [{ provide: LLM_PROVIDER, useFactory: () => createLlmProvider() }],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
