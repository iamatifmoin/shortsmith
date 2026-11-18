import type { PublishPackage } from '@shortsmith/shared';

/** One sourced claim, enriched by the review API with its receipts. */
export interface ReviewClaim {
  factId: string;
  sourceUrl: string;
  snippet: string;
  sourceTier: number | null;
  confidence: string | null;
  snippetVerified: boolean | null;
  publishedAt: string | null;
  fetchedAt: string | null;
}

/** The primary fact a script is built on. */
export interface PrimaryFact {
  canonicalClaim: string;
  confidence: string;
  corroborationCount: number;
}

/**
 * One script in the review queue, exactly as `GET /review/queue` returns it.
 * See apps/ideation/src/modules/review/review.service.ts (listQueue).
 */
export interface ReviewItem {
  id: string;
  seriesKey: string;
  angleType: string;
  status: string;
  /** Staged Gate-1 choice before the Render commit (ADR-031); null = undecided. */
  reviewSelection: 'APPROVE' | 'REJECT' | null;
  hook: string;
  body: string;
  cta: string;
  hookScore: number;
  wordCount: number;
  estDurationSec: number;
  publish: PublishPackage | null;
  primaryFact: PrimaryFact;
  claims: ReviewClaim[];
  flags: string[];
}

/** What the operator can change before approving. */
export interface ScriptEdits {
  hook: string;
  body: string;
  cta: string;
  publish: PublishPackage | null;
}

/** One source row in the setup wizard (mirrors the channel API). */
export interface ChannelSource {
  id: string;
  key: string;
  name: string;
  tier: number;
  url: string;
  rssUrl: string | null;
  rumorOnly: boolean;
  active: boolean;
}

/** Which integrations the ideation process can see configured (setup wizard). */
export interface ConnectionsStatus {
  llm: { provider: string; keyConfigured: boolean };
  telegram: { botConfigured: boolean; chatConfigured: boolean };
}

/** The active channel config as `GET /channel` returns it (setup wizard). */
export interface ChannelConfigView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  displayName: string | null;
  logoPath: string | null;
  subjectName: string | null;
  subjectAliases: string[];
  topicTerms: string[];
  comparisonLabel: string | null;
  personality: string | null;
  links: Record<string, string> | null;
  voiceTone: string | null;
  formatRules: unknown;
  publishDefaults: Record<string, unknown> | null;
  publishConfig: Record<string, unknown> | null;
  minConfidence: string;
  allowedTiers: number[];
  active: boolean;
  sources: ChannelSource[];
}

/** A recorded post + its hand-entered performance snapshot. */
export interface MetricPost {
  id: string;
  scriptId: string;
  platform: 'YOUTUBE' | 'INSTAGRAM';
  externalUrl: string | null;
  postedAt: string;
  views: number;
  avgViewDurationSec: number | null;
  retentionPct: number | null;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  metricsUpdatedAt: string | null;
}

/** An approved script with its derived dimensions, for the performance screen. */
export interface MetricScript {
  id: string;
  hook: string;
  title: string | null;
  angleType: string;
  confidence: string;
  primaryFact: string;
  hookOpener: string;
  hookOpenerLabel: string;
  background: string | null;
  approvedAt: string | null;
  posts: MetricPost[];
}
