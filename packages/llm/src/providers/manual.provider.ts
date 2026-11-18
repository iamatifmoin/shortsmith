import {
  LlmCompletionOptions,
  LlmCompletionResult,
  LlmMessage,
  LlmProvider,
} from '../llm.interface';
import { ManualInterventionRequired } from '../errors';

/**
 * Flatten a conversation into one copy-pasteable block a human can run in a
 * chat UI (e.g. Claude Pro / AI Studio). Exported so a stage or the review UI
 * can show the operator exactly what to paste.
 */
export function renderConversation(messages: LlmMessage[], options?: LlmCompletionOptions): string {
  const parts: string[] = [];
  if (options?.system) parts.push(`[SYSTEM]\n${options.system}`);
  for (const message of messages) {
    parts.push(`[${message.role.toUpperCase()}]\n${message.content}`);
  }
  return parts.join('\n\n');
}

/**
 * Manual (human-in-the-loop) provider — calls NO API. For the free fallback and
 * for unblocking when automation fails (ADR-013). The operator runs the prompt
 * themselves and pastes the result back; automating a chat UI would break its
 * terms, so this is strictly hand-driven.
 *
 * Contract: `complete()` throws ManualInterventionRequired carrying the rendered
 * prompt. The calling stage parks a manual task and resumes once the operator
 * supplies the output. (The task-parking + ingest path is wired when the
 * extract/generate stages are built.)
 */
export class ManualProvider implements LlmProvider {
  readonly name = 'manual';

  async complete(messages: LlmMessage[], options?: LlmCompletionOptions): Promise<LlmCompletionResult> {
    throw new ManualInterventionRequired(renderConversation(messages, options));
  }
}
