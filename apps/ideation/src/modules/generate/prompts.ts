import { LlmMessage } from '@shortsmith/llm';
import { BrollCue, VisualSpec } from '@shortsmith/shared';

export interface PublishPromptOpts {
  emoji?: boolean;
  maxHashtags?: number;
}

/** Channel/niche config threaded into the scriptwriter prompt (ADR-006). */
export interface GenerateSystemOpts {
  /** The subject the channel is about, e.g. "the flagship phone". */
  subjectName?: string | null;
  /** Short forms/aliases of the subject people also search by. */
  subjectAliases?: string[];
  /** The channel persona (what used to be hardcoded). */
  personality?: string | null;
  /** Label for "our subject" in a comparison visual; defaults to subjectName. */
  comparisonLabel?: string | null;
  /** Channel display/brand name — so the voiceover never says it aloud. */
  displayName?: string | null;
  /** Extra delivery/voice notes layered on top of the persona. */
  voiceTone?: string | null;
  formatRules?: unknown;
  publish?: PublishPromptOpts;
  performanceHint?: string | null;
}

/**
 * The scriptwriter prompt. Produces a Shorts/Reels script in the channel's
 * personality, the on-screen VISUAL spec (ADR-027/028), a source citation, and the
 * Gate-1 upload metadata (ADR-018). Grounding stays strict (ADR-005); compliance
 * footer/tags are added in code. The SUBJECT, persona, brand, and tag rules are all
 * niche CONFIG (ADR-006) — nothing about the topic is hardcoded here.
 */
export function buildGenerateSystem(opts: GenerateSystemOpts = {}): string {
  const subject = (opts.subjectName ?? '').trim() || 'the subject';
  const aliases = (opts.subjectAliases ?? []).map((a) => a.trim()).filter(Boolean);
  const primaryAlias = aliases[0] ?? subject;
  const compareLabel = (opts.comparisonLabel ?? '').trim() || subject;
  const aliasLine = aliases.length ? ` Accepted names/aliases: ${aliases.join(', ')}.` : '';

  const persona = (opts.personality ?? '').trim();
  const personaBlock = persona
    ? persona
    : `Confident, upbeat, and clued-in — a knowledgeable friend who always has the real info first. Attitude and the occasional bold take, but never over the top.`;

  const tone = (opts.voiceTone ?? '').trim();
  const toneNote = tone ? `\n- Operator voice notes: ${tone}` : '';
  const brand = (opts.displayName ?? '').trim();
  const brandRule = brand
    ? `- SPOKEN ALOUD — NEVER say the channel name ("${brand}") in the hook/body/cta; invite a follow WITHOUT naming the channel.`
    : `- SPOKEN ALOUD — do NOT name the channel in the hook/body/cta; invite a follow WITHOUT naming the channel.`;

  const rules = opts.formatRules ? JSON.stringify(opts.formatRules) : '{}';
  const pub = opts.publish ?? {};
  const maxHashtags = pub.maxHashtags ?? 5;
  const emojiRule = pub.emoji
    ? 'You MAY use at most one tasteful emoji in the title.'
    : 'Do NOT use any emoji anywhere.';
  const perf = opts.performanceHint ? `\n\n${opts.performanceHint}` : '';

  return `You are the scriptwriter for a faceless YouTube Shorts / Instagram Reels channel about ${subject}.${aliasLine} You write ONE short about ONE fact — its spoken script, its on-screen VISUAL, a source citation, and the upload metadata — all optimized to PERFORM (hook, retention, click-through).

VOICE & PERSONALITY:
- ${personaBlock}
- Keep it PG-13 and advertiser-friendly throughout: no explicit, crude, or demeaning content.
- Credibility is the whole brand: grounded facts only, no fake claims. Sound sure of yourself.${toneNote}

WRITING STYLE (critical — the script is read by an AI voice):
- Write FLOWING, COMPLETE SENTENCES, not choppy fragments. Fragments make the AI voice sound robotic; full sentences give it natural rhythm and emphasis.
- Stay TIGHT and economical — every sentence earns its place. Target ~18-26 seconds total when read at ~165 wpm. No padding, no rambling.
- Conversational, not formal. Contractions welcome.

FORMAT RULES (JSON):
${rules}${perf}

SCRIPT — hard requirements:
- GROUND STRICTLY: state only the given FACT and what its SNIPPETS support. Never invent numbers, dates, names, or claims.
- HOOK (first sentence): a scroll-stopping opener that teases THIS fact — a bold claim, a surprising number, a "you won't believe", a hot-take. VARY it per fact; avoid formulaic starts. This is the #1 retention driver.
- BODY: deliver the fact and its payoff in 1-3 flowing sentences — what it is and why it matters. NAME THE SOURCE out loud where natural ("the makers confirmed…", "according to the announcement…").
- CTA (final sentence): a confident invitation to follow with a REASON tied to the channel's cadence (e.g. "follow along, because I break down a new one every day"). VARY the wording; never a fixed template.
${brandRule}

ON-SCREEN VISUAL (REQUIRED — never omit) — produce "visual", the graphic shown while the fact is spoken. Pick the kind that best fits THIS fact (every number MUST be truthful to the fact/snippets):
- {"kind":"comparison","title":"<2-4 word label>","a":{"label":"${compareLabel}","value":<number>},"b":{"label":"<other>","value":<number>},"unit":"<x | % | mi | ...>"} — when the fact compares two things numerically. Put OUR subject ("${compareLabel}") as "a".
- {"kind":"stat","value":"<short, e.g. 2X or $500M>","label":"<2-5 word label>"} — when the fact is one striking number/stat.
- {"kind":"headline","text":"<3-7 word punchy phrase>"} — when there's no clean number; a bold short summary of the fact.

SOURCE — produce "source": a short on-screen citation label (2-4 words), truthful to the snippets (the outlet or announcement name). If unknown, use "Confirmed".

B-ROLL (REQUIRED — never omit, minimum 2 cues) — produce "broll": 2-4 cues for images shown WHILE the fact is spoken, so the visual keeps changing. Each cue is {"term":"<a short phrase that appears VERBATIM in your hook or body>","query":"<a real-world stock-image search>","emoji":"<one relevant emoji>"}. The query must describe a REAL, photographable thing — NEVER copyrighted imagery of ${subject} itself (artwork, screenshots, logos, trademarked characters). If ${subject} uses fictional names based on real places, query the REAL place instead (e.g. a fictional city -> the real city it is based on). Prefer concrete, searchable nouns (a city, a map, money, a car, a crowd); skip abstract words that have no image. The emoji should match the term (a map term -> 🗺️, money -> 💰, a city -> 🌆). Order them to follow the script.

UPLOAD METADATA — also produce:
- "title": a scroll-stopping, curiosity-driven YouTube title — lead with the hook/intrigue, keep "${primaryAlias}" near the front for search, include a concrete number when the fact has one. TRUTHFUL, max 70 characters. ${emojiRule}
- "thumbnailText": 3-6 words of BOLD on-screen text — a curiosity gap or punchy tease (a number, a bold claim). Never a plain label. Truthful.
- "descriptionLines": sentence 1 states the fact in plain, keyword-rich words (search — first ~100 chars); then ONE short line in the channel's voice. NO hashtags/disclaimer/footer.
- "igCaption": 1-2 lines in the channel's brand voice (personality forward) leading with the fact/keyword.
- "hashtags": up to ${maxHashtags}, most important first — one broad then niche. No "#Shorts". Use ONLY correct, accurate tags for ${subject} / its real aliases — never invented or wrong variants.
- "tags": 6-8 YouTube keyword tags specific to this fact — ${subject} / its aliases only. No "#".
- "backgroundSuggestion": a CLEARED, monetization-permitted, muted background only — operator-owned footage or a cleared gameplay loop (e.g. Minecraft parkour). NEVER copyrighted footage of ${subject}, and NEVER uncleared games.
- "musicMood": a short music mood for the YouTube Audio Library.
- "angleType": one of FACT, LIST, EXPLAINER, COMPARISON, PREDICTION.
- "hookScore": the hook's scroll-stopping strength, 0-100.

CRITICAL: "visual" and "broll" (at least 2 valid cues, each "term" appearing VERBATIM in your hook or body) are MANDATORY on every single script — a response missing either, or with an empty/garbled one, is INVALID and will be rejected and regenerated. Fill them in before you answer.

Return STRICT JSON ONLY — no prose, no markdown fences — in exactly this shape:
{"hook":"...","body":"...","cta":"...","angleType":"FACT","hookScore":0,"source":"<outlet>","visual":{"kind":"headline","text":"..."},"broll":[{"term":"<phrase from script>","query":"<real-world image search>","emoji":"🌆"}],"title":"...","descriptionLines":"...","igCaption":"...","hashtags":["#..."],"tags":["..."],"thumbnailText":"...","backgroundSuggestion":"...","musicMood":"..."}`;
}

export function buildGenerateMessages(fact: string, snippets: string[]): LlmMessage[] {
  const evidence = snippets.length ? snippets.map((s, i) => `(${i + 1}) ${s}`).join('\n') : '(none)';
  return [{ role: 'user', content: `FACT:\n${fact}\n\nSNIPPETS (verbatim support from sources):\n${evidence}` }];
}

/**
 * Corrective nudge appended on a regeneration when the model omitted the required
 * on-screen VISUAL and/or B-ROLL cues (ADR-028 value layer). The free LLM tier
 * drops these optional-looking fields intermittently, so we re-ask explicitly.
 */
export function buildVisualRetryMessage(): LlmMessage {
  return {
    role: 'user',
    content:
      'Your previous response was missing the mandatory "visual" and/or at least 2 valid "broll" cues. ' +
      'Regenerate the FULL JSON for the SAME fact — same hook/body/cta are fine — but this time you MUST include ' +
      'a valid "visual" object AND a "broll" array of 2-4 cues, each "term" appearing VERBATIM in the hook or body, ' +
      'with a real-world (never copyrighted-subject) stock-image "query". Return STRICT JSON only, no prose.',
  };
}

/** True when a parsed script carries the full ADR-028 value layer (visual + >=2 b-roll). */
export function hasValueLayer(parsed: GeneratedScriptRaw | null): boolean {
  return !!parsed && !!parsed.visual && Array.isArray(parsed.broll) && parsed.broll.length >= 2;
}

export interface GeneratedScriptRaw {
  hook: string;
  body: string;
  cta: string;
  angleType: string;
  hookScore: number;
  /** On-screen source citation label (ADR-027). */
  source: string;
  /** On-screen top-half graphic (ADR-028); null when the model omitted/garbled it. */
  visual: VisualSpec | null;
  /** B-roll cues (term -> image query), synced to the narration (ADR-027). */
  broll: BrollCue[];
  title: string;
  descriptionLines: string;
  igCaption: string;
  hashtags: string[];
  tags: string[];
  thumbnailText: string;
  backgroundSuggestion: string;
  musicMood: string;
}

export function parseScript(raw: string): GeneratedScriptRaw | null {
  const json = extractJsonObject(raw);
  if (!json) return null;
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof p.hook !== 'string' || typeof p.body !== 'string') return null;

  const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v.trim() : fallback);
  const strArr = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [];

  return {
    hook: str(p.hook),
    body: str(p.body),
    cta: str(p.cta, 'Follow for more.'),
    angleType: str(p.angleType, 'FACT').toUpperCase(),
    hookScore: clampScore(p.hookScore),
    source: str(p.source),
    visual: parseVisual(p.visual),
    broll: parseBroll(p.broll),
    title: str(p.title),
    descriptionLines: str(p.descriptionLines),
    igCaption: str(p.igCaption),
    hashtags: strArr(p.hashtags).map((h) => (h.startsWith('#') ? h : `#${h}`)),
    tags: strArr(p.tags).map((t) => t.replace(/^#/, '')),
    thumbnailText: str(p.thumbnailText),
    backgroundSuggestion: str(p.backgroundSuggestion),
    musicMood: str(p.musicMood),
  };
}

/** Validate the LLM's visual spec into a known VisualSpec, or null. */
function parseVisual(v: unknown): VisualSpec | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const kind = typeof o.kind === 'string' ? o.kind : '';
  if (kind === 'comparison') {
    const a = parseBar(o.a);
    const b = parseBar(o.b);
    if (!a || !b || typeof o.title !== 'string') return null;
    return {
      kind: 'comparison',
      title: o.title.trim(),
      a,
      b,
      unit: typeof o.unit === 'string' ? o.unit.trim() : undefined,
    };
  }
  if (kind === 'stat' && typeof o.value === 'string' && typeof o.label === 'string') {
    return { kind: 'stat', value: o.value.trim(), label: o.label.trim() };
  }
  if (kind === 'headline' && typeof o.text === 'string') {
    return { kind: 'headline', text: o.text.trim() };
  }
  return null;
}

/** Validate the b-roll cues (drop malformed ones), cap at 4. */
function parseBroll(v: unknown): BrollCue[] {
  if (!Array.isArray(v)) return [];
  const out: BrollCue[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.term === 'string' && typeof o.query === 'string' && o.term.trim() && o.query.trim()) {
      const emoji = typeof o.emoji === 'string' ? o.emoji.trim() : '';
      out.push({ term: o.term.trim(), query: o.query.trim(), ...(emoji ? { emoji } : {}) });
    }
    if (out.length >= 4) break;
  }
  return out;
}

function parseBar(v: unknown): { label: string; value: number } | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const value = typeof o.value === 'number' ? o.value : Number(o.value);
  if (typeof o.label !== 'string' || !Number.isFinite(value)) return null;
  return { label: o.label.trim(), value };
}

function clampScore(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return body.slice(start, end + 1);
}
