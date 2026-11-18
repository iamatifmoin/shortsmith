/**
 * @shortsmith/shared
 *
 * Framework-free shared types for the content pipeline. These are the stable
 * vocabulary used across apps/packages: the pipeline enums and the EXPORT
 * CONTRACT — the boundary the later render/publish halves consume.
 *
 * These enums mirror the Prisma enums in apps/ideation/prisma/schema.prisma.
 * Keep them in sync. See docs/architecture.md and docs/decisions.md (ADR-009).
 */

// ---------------------------------------------------------------------------
// Pipeline enums (mirror prisma/schema.prisma)
// ---------------------------------------------------------------------------

/** Confidence a FactUnit has earned from its source tier + corroboration. */
export enum Confidence {
  /** Any Tier-1 source OR >= 2 independent Tier-2 sources. */
  CONFIRMED = 'CONFIRMED',
  /** Exactly 1 Tier-2 source. */
  STRONG_RUMOR = 'STRONG_RUMOR',
  /** Tier-3 only. */
  RUMOR = 'RUMOR',
}

/** The kind of take an Angle expresses on its primary fact. */
export enum AngleType {
  FACT = 'FACT',
  LIST = 'LIST',
  EXPLAINER = 'EXPLAINER',
  COMPARISON = 'COMPARISON',
  PREDICTION = 'PREDICTION',
}

/** Lifecycle of an Angle as it walks the pipeline. */
export enum AngleStatus {
  PROPOSED = 'PROPOSED',
  GENERATED = 'GENERATED',
  PRODUCED = 'PRODUCED',
  REJECTED = 'REJECTED',
}

/** Lifecycle of a Script around the human review gate. */
export enum ScriptStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/** Where a clip was posted. YouTube Shorts + Instagram Reels only (ADR-003). */
export enum Platform {
  YOUTUBE = 'YOUTUBE',
  INSTAGRAM = 'INSTAGRAM',
}

// ---------------------------------------------------------------------------
// Performance metrics + feedback (ADR-020) — the manual-learning loop
// ---------------------------------------------------------------------------

/** Operator-entered performance snapshot for one posted clip (manual phase). */
export interface PostMetrics {
  views: number;
  /** YouTube average view duration in seconds (optional). */
  avgViewDurationSec?: number | null;
  /** Average percentage of the clip viewed, 0-100 (optional). */
  retentionPct?: number | null;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
}

/** How a hook opens — a coarse, heuristic style bucket used to learn what hits. */
export type HookOpener = 'question' | 'direct-you' | 'number' | 'pov' | 'bold-claim';

/** Plain-language labels for the hook-opener buckets. */
export const HOOK_OPENER_LABELS: Record<HookOpener, string> = {
  question: 'Opens with a question',
  'direct-you': 'Speaks directly to "you"',
  number: 'Leads with a number or date',
  pov: 'POV framing',
  'bold-claim': 'Opens with a bold claim',
};

/**
 * Classify a hook's opening style. Deliberately simple and deterministic so the
 * generator and the metrics engine bucket hooks the same way. Heuristic, not NLP.
 */
export function classifyHookOpener(hook: string): HookOpener {
  const h = (hook ?? '').trim();
  const firstSentence = h.split(/(?<=[.!?])\s/)[0] ?? h;
  const head = h.toLowerCase().split(/\s+/).slice(0, 8).join(' ');
  if (/\bpov\b/i.test(firstSentence)) return 'pov';
  if (firstSentence.includes('?')) return 'question';
  if (/^\s*(?:\$|\d)/.test(h) || /\b\d{2,}\b/.test(firstSentence) || /\b(19|20)\d{2}\b/.test(firstSentence))
    return 'number';
  if (/\byou\b|\byour\b|\byou're\b/i.test(head)) return 'direct-you';
  return 'bold-claim';
}

/** One dimension bucket (an angle type, a hook opener, a confidence level). */
export interface InsightBucket {
  /** Raw key, e.g. "PREDICTION" or "question". */
  key: string;
  /** Plain-language label for display. */
  label: string;
  /** Number of posts in this bucket (sample size). */
  posts: number;
  avgViews: number;
  avgRetentionPct: number | null;
  /** (likes + comments + shares) / views, averaged. */
  avgEngagementRate: number;
  /** Normalized performance, 0-1, blending retention, reach, engagement, subs. */
  score: number;
}

/** Aggregated performance, grouped by the dimensions that drive generation. */
export interface PerformanceInsights {
  totalPosts: number;
  /** True once there is enough data to feed back into the generator. */
  enoughData: boolean;
  byAngleType: InsightBucket[];
  byHookOpener: InsightBucket[];
  byConfidence: InsightBucket[];
}

// ---------------------------------------------------------------------------
// Export contract (ADR-009) — the stable ideation -> render/publish boundary
// ---------------------------------------------------------------------------

/**
 * One sourced claim carried by an exported script. Every claim must trace back
 * to the exact source it was grounded on (per-claim traceability, ADR-005).
 */
export interface ScriptClaim {
  /** The Fact this claim was grounded on. */
  factId: string;
  /** Exact source URL the claim came from. */
  sourceUrl: string;
  /** Verbatim snippet from the source supporting the claim. */
  snippet: string;
}

/**
 * The upload "publish package" decided at Gate 1 (ADR-018): everything that goes
 * with the video except what physically needs the rendered asset (the thumbnail
 * image, caption word-timing, final duration, chosen clip). Approving the script
 * locks all of this, so Gate 2 is a quick visual spot-check.
 */
export interface PublishPackage {
  /** YouTube title — hooky, keyword-first, not a plain restatement of the fact. */
  title: string;
  /** Full YouTube description (fact recap + CTA + hashtags + standing footer/disclaimer). */
  description: string;
  /** YouTube tags (channel defaults + per-video). */
  tags: string[];
  /** Hashtags used (also embedded in the description/caption). */
  hashtags: string[];
  /** Instagram Reels caption (Reels has no title). */
  igCaption: string;
  /** On-screen overlay words for the thumbnail/first frame (a decision; the image renders later). */
  thumbnailText: string;
  /** Suggested cleared background gameplay (type/mood). */
  backgroundSuggestion?: string;
  /** Suggested music mood for the YouTube Audio Library pick. */
  musicMood?: string;
  /** The top-half subject graphic to render (ADR-027/028). */
  visual?: VisualSpec;
  /** On-screen source citation label, e.g. "Official Trailer". */
  source?: string;
  /** B-roll cues: images shown synced to the narration (ADR-027). */
  broll?: BrollCue[];
}

/** One item in a comparison visual (a game + its metric value). */
export interface VisualBarItem {
  label: string;
  value: number;
}

/**
 * What the top half shows (ADR-028): a small, closed set of kinds, each mapped to
 * a render graphics template (ADR-027). Mirrors apps/render/remotion/types.ts.
 */
export type VisualSpec =
  | { kind: 'comparison'; title: string; a: VisualBarItem; b: VisualBarItem; unit?: string }
  | { kind: 'stat'; value: string; label: string }
  | { kind: 'headline'; text: string };

/**
 * A b-roll cue (ADR-027): show a stock image for `query` while `term` is spoken.
 * `term` is matched against the voiceover word timings to place the image.
 */
export interface BrollCue {
  /** A short phrase from the script (verbatim-ish), e.g. a place or product name. */
  term: string;
  /** Real-world image search query — NEVER copyrighted imagery of the subject (e.g. "city skyline neon"). */
  query: string;
  /** A single relevant emoji shown on the beat (optional). */
  emoji?: string;
}

/**
 * The EXPORT CONTRACT. An APPROVED Script serialized to this shape is the only
 * thing the later render and publish halves consume from ideation. Do not widen
 * this without an ADR — downstream depends on it.
 */
export interface ScriptExport {
  /** Series.key, e.g. "example". */
  seriesKey: string;
  hook: string;
  /** The approved copy to voice (editedBody ?? body). */
  body: string;
  cta: string;
  /** Every claim asserted in the script, each traceable to a source. */
  claims: ScriptClaim[];
  /** Estimated spoken duration in seconds (drives the render length). */
  estDurationSec: number;
  /** Primary-fact confidence — drives the on-screen CONFIRMED/RUMOR badge (ADR-005/015). */
  confidence?: Confidence;
  /** The Gate-1 upload metadata (ADR-018). */
  publish?: PublishPackage;
}

// ---------------------------------------------------------------------------
// Source tiers (see config/sources.ts and docs/sources.md)
// ---------------------------------------------------------------------------

/**
 * Source trust tier. 1 = canonical/first-party, 2 = press, 3 = community
 * (rumor-flagged), 4 = open web (lowest; always rumor, operator-judged — ADR-014).
 */
export type SourceTier = 1 | 2 | 3 | 4;

/**
 * One whitelisted source a channel harvests. Mirrors the prisma `Source` model;
 * sources are per-channel DATA now (not the old code whitelist). `rssUrl`, when
 * present, is the preferred static harvest entry.
 */
export interface SourceDef {
  key: string;
  name: string;
  tier: SourceTier;
  url: string;
  rssUrl?: string | null;
  rumorOnly?: boolean;
  active?: boolean;
}

/**
 * The channel-identity + niche config a person fills in at onboarding — the values
 * that make the pipeline about THEIR topic instead of being hardcoded. Stored on
 * the Series row; consumed by the harvest/extract/rank/generate stages and the
 * dashboard chrome. Everything here is optional so a channel can be filled in
 * incrementally; the stages fall back sensibly when a field is blank.
 */
export interface ChannelConfig {
  /** Url-safe channel slug (Series.key). */
  key: string;
  /** Internal series name. */
  name: string;
  description?: string | null;
  /** Brand name shown in the dashboard chrome. */
  displayName?: string | null;
  /** Logo path/URL for the dashboard. */
  logoPath?: string | null;
  /** The subject the channel is about, e.g. "the flagship phone". */
  subjectName?: string | null;
  /** Short forms/aliases of the subject people also search by. */
  subjectAliases?: string[];
  /** Harvest relevance keywords (falls back to subjectName + aliases). */
  topicTerms?: string[];
  /** Label for "our subject" in comparison visuals (defaults to subjectName). */
  comparisonLabel?: string | null;
  /** Channel persona for the scriptwriter prompt. */
  personality?: string | null;
  /** Channel links (website/socials). */
  links?: Record<string, string> | null;
  /** Delivery/voice notes layered on top of the persona. */
  voiceTone?: string | null;
  /** Confidence floor a fact must clear to be scripted. */
  minConfidence?: Confidence;
  /** Source tiers this channel is allowed to harvest. */
  allowedTiers?: SourceTier[];
}

// ---------------------------------------------------------------------------
// Render (Phase 3) — see docs/phase-3-render.md and ADR-021..025
// ---------------------------------------------------------------------------

/** Lifecycle of a render job (mirrors prisma RenderStatus). */
export enum RenderStatus {
  QUEUED = 'QUEUED',
  RENDERING = 'RENDERING',
  DONE = 'DONE',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/** Payload carried on the `render` BullMQ queue (ideation -> render worker). */
export interface RenderJobData {
  /** The APPROVED Script to render. */
  scriptId: string;
  /** The RenderJob row tracking this attempt (for status callbacks). */
  renderJobId: string;
}

/**
 * Status update the render worker POSTs back to ideation, the DB owner (ADR-021).
 * Partial: only the fields relevant to the new status are sent.
 */
export interface RenderStatusUpdate {
  status: RenderStatus;
  /** Local path to the finished vertical video (on DONE). */
  videoPath?: string;
  /** Local path to the composed thumbnail still (on DONE, ADR-025). */
  thumbnailPath?: string;
  /** Final video length in seconds — measured audio drives this (ADR-022). */
  durationSec?: number;
  /** Measured voiceover audio length in seconds. */
  audioDurationSec?: number;
  /** ElevenLabs voice id used. */
  voiceId?: string;
  /** Background clip filenames used. */
  backgroundClips?: string[];
  /** Music track filename used, if any. */
  musicTrack?: string;
  /** Failure reason (on FAILED). */
  error?: string;
}

/** A RenderJob as surfaced for listing / UX. */
export interface RenderJobView {
  id: string;
  scriptId: string;
  status: RenderStatus;
  videoPath?: string | null;
  thumbnailPath?: string | null;
  durationSec?: number | null;
  error?: string | null;
  queuedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

// ---------------------------------------------------------------------------
// Publishing (Phase 4) — see docs/phase-4-publish.md and ADR-030..034
// ---------------------------------------------------------------------------

/**
 * A pending Gate-1 choice staged on a DRAFT script (ADR-031). Recorded without
 * changing ScriptStatus; the single Render (commit) action transitions all
 * staged scripts at once (APPROVE -> APPROVED + render, REJECT -> REJECTED).
 */
export enum ReviewSelection {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

/**
 * Lifecycle of a clip's journey to a slot (ADR-032). READY = rendered, awaiting
 * notify; NOTIFIED = pushed to Telegram, awaiting the operator's schedule;
 * SCHEDULED = operator confirmed it's scheduled on both platforms; CANCELLED =
 * dropped via Reject/Redo.
 */
export enum PublishStatus {
  READY = 'READY',
  NOTIFIED = 'NOTIFIED',
  SCHEDULED = 'SCHEDULED',
  CANCELLED = 'CANCELLED',
}

/** One slot time rendered in the markets we target + the operator's zone. */
export interface SlotTimes {
  /** The slot instant, ISO-8601 UTC. */
  iso: string;
  /** Human strings per zone, e.g. { "US (ET)": "Mon 12:00 PM", ... }. */
  byZone: Record<string, string>;
}

/** Ready-to-paste upload text for each platform, built from the PublishPackage. */
export interface CopyBlocks {
  youtube: {
    title: string;
    description: string;
    tags: string[];
    /** Operator settings checklist (category, not-for-kids, visibility=Schedule). */
    settings: string[];
  };
  instagram: {
    caption: string;
    settings: string[];
  };
}

/** A clip awaiting Gate-2 scheduling, as surfaced to the dashboard + Telegram. */
export interface PublishTaskView {
  id: string;
  scriptId: string;
  renderJobId: string;
  status: PublishStatus;
  slot: SlotTimes;
  hook: string;
  videoPath?: string | null;
  thumbnailPath?: string | null;
  notifiedAt?: string | null;
  scheduledAt?: string | null;
  createdAt: string;
}

/** How many more scripts the operator may approve toward today's slots (ADR-031). */
export interface ReviewCapacity {
  /** Series daily clip cap. */
  dailyClips: number;
  /** Clips already moving toward a slot (rendering + rendered-awaiting-schedule). */
  inFlight: number;
  /** Scripts currently staged APPROVE (not yet committed). */
  pendingApprovals: number;
  /** dailyClips - inFlight - pendingApprovals, floored at 0. */
  remaining: number;
}
