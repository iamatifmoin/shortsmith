import { LlmMessage } from '@shortsmith/llm';

/**
 * Clustering prompt. Groups claims that state the SAME underlying fact so
 * near-duplicates collapse into one canonical FactUnit. Deliberately
 * conservative — "when unsure, keep separate" — per the start-simple decision
 * (better to under-merge than wrongly merge two different facts).
 */
export function buildClusterSystem(subject?: string | null): string {
  const subjectName = (subject ?? '').trim() || "the channel's subject";
  return `You group factual claims about ${subjectName} that state the SAME underlying fact, so near-duplicates become one canonical fact.

You are given NEW CLAIMS (numbered from 0) and optionally EXISTING GROUPS (each with an id and its canonical fact).

Rules:
- Put claims that assert the same underlying fact into one group, even if worded differently.
- If a claim matches an EXISTING GROUP's fact, add it to that group by setting "existingId" to that group's id.
- Claims about different facts go in different groups. When unsure, KEEP THEM SEPARATE — do not over-merge.
- Every NEW CLAIM index must appear in exactly one group.
- For each group, write a concise, self-contained canonical statement of the fact, and a short lowercase category slug that fits the fact (e.g. "release-date", "features", "pricing", "availability").

Return STRICT JSON ONLY — no prose, no markdown fences — in exactly this shape:
{"groups":[{"existingId":<id-string-or-null>,"canonicalClaim":"<canonical fact>","category":"<slug>","factIndexes":[<indexes of NEW CLAIMS>]}]}`;
}

export interface ExistingUnit {
  id: string;
  canonicalClaim: string;
}

export function buildClusterMessages(claims: string[], existing: ExistingUnit[]): LlmMessage[] {
  const existingBlock = existing.length
    ? existing.map((u) => `${u.id}: ${u.canonicalClaim}`).join('\n')
    : '(none)';
  const claimsBlock = claims.map((c, i) => `${i}: ${c}`).join('\n');
  return [
    {
      role: 'user',
      content: `EXISTING GROUPS:\n${existingBlock}\n\nNEW CLAIMS:\n${claimsBlock}`,
    },
  ];
}

export interface ClaimGroup {
  existingId: string | null;
  canonicalClaim: string;
  category: string | null;
  factIndexes: number[];
}

/** Parse the model's grouping reply, tolerant of fences/prose around the JSON. */
export function parseGroups(raw: string): ClaimGroup[] {
  const json = extractJsonObject(raw);
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const groups = (parsed as { groups?: unknown })?.groups;
  if (!Array.isArray(groups)) return [];
  return groups
    .map((g) => g as Record<string, unknown>)
    .filter((g) => g && Array.isArray(g.factIndexes))
    .map((g) => ({
      existingId: typeof g.existingId === 'string' ? g.existingId : null,
      canonicalClaim: typeof g.canonicalClaim === 'string' ? g.canonicalClaim.trim() : '',
      category: typeof g.category === 'string' ? g.category.trim() : null,
      factIndexes: (g.factIndexes as unknown[])
        .filter((n): n is number => Number.isInteger(n))
        .map((n) => n as number),
    }))
    .filter((g) => g.factIndexes.length > 0);
}

function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return body.slice(start, end + 1);
}
