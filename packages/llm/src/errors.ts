/**
 * Typed errors the LLM layer raises. Callers (pipeline stages) branch on these:
 * a capacity problem is retried/queued, a content block is surfaced, and a
 * manual step parks work for the operator. See docs/decisions.md (ADR-012/013).
 */

/**
 * Raised by the manual (human-in-the-loop) provider. The provider cannot return
 * an answer synchronously — a human must run the prompt in a chat UI and paste
 * the result back. The calling stage catches this, parks a manual task carrying
 * `prompt`, and resumes when the operator supplies the output. See ADR-013.
 */
export class ManualInterventionRequired extends Error {
  readonly prompt: string;

  constructor(
    prompt: string,
    message = 'Manual LLM step required: run the prompt in a chat and paste the result back.',
  ) {
    super(message);
    this.name = 'ManualInterventionRequired';
    this.prompt = prompt;
  }
}

/**
 * Raised by the Gemini provider when every model in the ranked queue is
 * rate-limited, out of quota, or unavailable. The operator can wait for the
 * daily free-tier reset, or fall back to manual mode. See ADR-012.
 */
export class AllModelsExhaustedError extends Error {
  readonly attempted: string[];

  constructor(attempted: string[]) {
    super(`All Gemini models exhausted or unavailable (tried: ${attempted.join(', ') || 'none'}).`);
    this.name = 'AllModelsExhaustedError';
    this.attempted = attempted;
  }
}

/**
 * Raised when a model returns no usable text (e.g. safety-blocked). This is NOT
 * a capacity problem, so the provider does not fall through to another model —
 * the same content would be blocked everywhere. The stage surfaces it.
 */
export class ContentBlockedError extends Error {
  readonly reason?: string;

  constructor(reason?: string) {
    super(`LLM returned no usable content${reason ? ` (reason: ${reason})` : ''}.`);
    this.name = 'ContentBlockedError';
    this.reason = reason;
  }
}
