import { LlmMessage } from '@shortsmith/llm';

/**
 * The extraction prompt lives here so the voice/rules are editable in one place
 * (ADR-017 keeps prompts out of the logic). Grounding is strict: claims must be
 * stated in the text, each with a verbatim supporting snippet (ADR-005). The
 * SUBJECT is niche config (ADR-006) — the channel's topic, not hardcoded.
 */
export function buildExtractSystem(subject?: string | null, aliases: string[] = []): string {
  const subjectName = (subject ?? '').trim() || "the channel's subject";
  const aliasNote = aliases.length ? ` (also referred to as ${aliases.join(', ')})` : '';
  return `You extract atomic, verifiable factual claims about ${subjectName}${aliasNote} from an article's text.

Rules:
- Output ONLY claims explicitly stated in the TEXT. Never add outside knowledge, speculation, or inference.
- Each claim is ATOMIC: a single self-contained fact, understandable without the article.
- Keep only claims about ${subjectName} and things directly related to it. Ignore unrelated topics, ads, navigation, cookie notices, and site boilerplate.
- For each claim include a SNIPPET: a short quote copied EXACTLY (verbatim) from the TEXT that supports it. Do not paraphrase the snippet.
- Prefer concrete facts (dates, numbers, features, confirmations) over opinions.
- If the TEXT contains no ${subjectName} facts, return an empty array.

Return STRICT JSON ONLY — no prose, no markdown fences — in exactly this shape:
{"claims":[{"claim":"<the fact>","snippet":"<verbatim quote from TEXT>"}]}
Return at most 10 claims.`;
}

export function buildExtractMessages(articleText: string): LlmMessage[] {
  return [{ role: 'user', content: `TEXT:\n"""\n${articleText}\n"""` }];
}

export interface RawClaim {
  claim: string;
  snippet: string;
}

/** Parse the model's reply into claims, tolerant of fences/prose around the JSON. */
export function parseClaims(raw: string): RawClaim[] {
  const json = extractJsonObject(raw);
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const claims = (parsed as { claims?: unknown })?.claims;
  if (!Array.isArray(claims)) return [];
  return claims
    .map((c) => c as Record<string, unknown>)
    .filter((c) => c && typeof c.claim === 'string' && typeof c.snippet === 'string')
    .map((c) => ({ claim: (c.claim as string).trim(), snippet: (c.snippet as string).trim() }))
    .filter((c) => c.claim.length > 0);
}

function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return body.slice(start, end + 1);
}

/**
 * Is the snippet present verbatim in the source text? Whitespace- and
 * case-insensitive to tolerate trivial reformatting, but no paraphrase. A
 * `false` result becomes a non-blocking review flag (ADR-015) — never a delete.
 */
export function snippetMatches(snippet: string, text: string): boolean {
  if (!snippet) return false;
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  return norm(text).includes(norm(snippet));
}
