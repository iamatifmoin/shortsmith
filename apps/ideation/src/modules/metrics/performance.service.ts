import { Injectable } from '@nestjs/common';
import {
  classifyHookOpener,
  HOOK_OPENER_LABELS,
  HookOpener,
  InsightBucket,
  PerformanceInsights,
} from '@shortsmith/shared';

import { PrismaService } from '../../prisma/prisma.service';

/** Below this many posts we don't trust the signal enough to steer generation. */
export const MIN_POSTS_FOR_FEEDBACK = 5;
/** A single dimension bucket needs at least this many posts to sway a decision. */
export const MIN_BUCKET_POSTS = 2;
/** How hard performance nudges the hook score. Small on purpose. */
const ADJUST_K = 0.3;
const FACTOR_MIN = 0.6;
const FACTOR_MAX = 1.4;

/** Human-friendly labels for the confidence buckets. */
const CONFIDENCE_LABELS: Record<string, string> = {
  CONFIRMED: 'Confirmed facts',
  STRONG_RUMOR: 'Strong rumors',
  RUMOR: 'Rumors',
};

/** One post reduced to the dimensions + normalized inputs we score on. */
interface ScoredPost {
  angleType: string;
  hookOpener: HookOpener;
  confidence: string;
  views: number;
  retentionPct: number | null;
  engagementRate: number;
  subRate: number;
  retentionFrac: number | null;
  score: number; // filled in after normalization
}

/** The signal generation reads to steer hook scoring + angle selection. */
export interface GenerationSignal {
  enoughData: boolean;
  /** angleType -> 0..1 performance (only buckets with enough posts). */
  angleScores: Record<string, number>;
  /** hookOpener -> 0..1 performance (only buckets with enough posts). */
  openerScores: Record<string, number>;
  /** A short "what's working" line for the generate prompt, or null. */
  hint: string | null;
}

/**
 * Turns the hand-entered post metrics into performance insights, and into the
 * signal that feeds back into generation (ADR-020). Scoring blends retention
 * (the strongest Shorts signal), reach, engagement, and subs gained, each
 * min-max normalized across the dataset so one runaway clip can't dominate.
 */
@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getInsights(): Promise<PerformanceInsights> {
    const scored = await this.loadScoredPosts();
    const total = scored.length;
    return {
      totalPosts: total,
      enoughData: total >= MIN_POSTS_FOR_FEEDBACK,
      byAngleType: bucketBy(scored, (p) => p.angleType, (k) => k),
      byHookOpener: bucketBy(scored, (p) => p.hookOpener, (k) => HOOK_OPENER_LABELS[k as HookOpener] ?? k),
      byConfidence: bucketBy(scored, (p) => p.confidence, (k) => CONFIDENCE_LABELS[k] ?? k),
    };
  }

  /** The feedback the generate stage applies (no-op until there's enough data). */
  async getGenerationSignal(): Promise<GenerationSignal> {
    const insights = await this.getInsights();
    if (!insights.enoughData) {
      return { enoughData: false, angleScores: {}, openerScores: {}, hint: null };
    }
    const angleScores = scoreMap(insights.byAngleType);
    const openerScores = scoreMap(insights.byHookOpener);
    return { enoughData: true, angleScores, openerScores, hint: buildHint(insights) };
  }

  /**
   * Blend a raw (LLM self-rated) hook score with this channel's learned
   * performance for the chosen angle type + hook opener. Returns the raw score
   * unchanged when the signal isn't trusted yet.
   */
  adjustHookScore(rawScore: number, angleType: string, hook: string, signal: GenerationSignal): number {
    if (!signal.enoughData) return rawScore;
    const a = signal.angleScores[angleType] ?? 0.5;
    const o = signal.openerScores[classifyHookOpener(hook)] ?? 0.5;
    const factor = clamp(1 + ADJUST_K * (a - 0.5 + (o - 0.5)), FACTOR_MIN, FACTOR_MAX);
    return Math.max(0, Math.min(100, Math.round(rawScore * factor)));
  }

  /** Load posts, derive dimensions, and min-max normalize into a 0..1 score. */
  private async loadScoredPosts(): Promise<ScoredPost[]> {
    const posts = await this.prisma.post.findMany({
      include: { script: { include: { angle: { include: { primaryFactUnit: true } } } } },
    });

    const rows: ScoredPost[] = posts.map((p) => {
      const est = p.script.estDurationSec || 0;
      const retentionFrac =
        p.retentionPct != null
          ? p.retentionPct / 100
          : p.avgViewDurationSec != null && est > 0
            ? Math.min(1, p.avgViewDurationSec / est)
            : null;
      const engagementRate = p.views > 0 ? (p.likes + p.comments + p.shares) / p.views : 0;
      const subRate = p.views > 0 ? p.subscribersGained / p.views : 0;
      return {
        angleType: p.script.angle.angleType,
        hookOpener: classifyHookOpener(p.script.hook),
        confidence: p.script.angle.primaryFactUnit.confidence,
        views: p.views,
        retentionPct: p.retentionPct ?? (retentionFrac != null ? retentionFrac * 100 : null),
        engagementRate,
        subRate,
        retentionFrac,
        score: 0,
      };
    });

    const viewsN = minMax(rows.map((r) => r.views));
    const engN = minMax(rows.map((r) => r.engagementRate));
    const subN = minMax(rows.map((r) => r.subRate));

    rows.forEach((r, i) => {
      const parts: Array<[number, number]> = []; // [weight, value]
      if (r.retentionFrac != null) parts.push([0.45, r.retentionFrac]);
      parts.push([0.15, viewsN(r.views, i)]);
      parts.push([0.25, engN(r.engagementRate, i)]);
      parts.push([0.15, subN(r.subRate, i)]);
      const wSum = parts.reduce((s, [w]) => s + w, 0);
      r.score = wSum > 0 ? parts.reduce((s, [w, v]) => s + w * v, 0) / wSum : 0.5;
    });

    return rows;
  }
}

/** Build the performance buckets for one dimension, sorted best-first. */
function bucketBy(
  rows: ScoredPost[],
  keyOf: (p: ScoredPost) => string,
  labelOf: (key: string) => string,
): InsightBucket[] {
  const groups = new Map<string, ScoredPost[]>();
  for (const r of rows) {
    const k = keyOf(r);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  const buckets: InsightBucket[] = [];
  for (const [key, members] of groups) {
    const withRet = members.filter((m) => m.retentionPct != null);
    buckets.push({
      key,
      label: labelOf(key),
      posts: members.length,
      avgViews: avg(members.map((m) => m.views)),
      avgRetentionPct: withRet.length ? avg(withRet.map((m) => m.retentionPct as number)) : null,
      avgEngagementRate: avg(members.map((m) => m.engagementRate)),
      score: avg(members.map((m) => m.score)),
    });
  }
  return buckets.sort((a, b) => b.score - a.score);
}

/** key -> score, keeping only buckets with enough posts to trust. */
function scoreMap(buckets: InsightBucket[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of buckets) if (b.posts >= MIN_BUCKET_POSTS) out[b.key] = b.score;
  return out;
}

/** A compact "what's working" line for the generate system prompt. */
function buildHint(insights: PerformanceInsights): string | null {
  const topAngles = insights.byAngleType
    .filter((b) => b.posts >= MIN_BUCKET_POSTS)
    .slice(0, 2)
    .map((b) => b.key);
  const topOpeners = insights.byHookOpener
    .filter((b) => b.posts >= MIN_BUCKET_POSTS)
    .slice(0, 2)
    .map((b) => b.label);
  if (!topAngles.length && !topOpeners.length) return null;
  const bits: string[] = [];
  if (topAngles.length) bits.push(`best-performing angle types: ${topAngles.join(', ')}`);
  if (topOpeners.length) bits.push(`best-performing hook openers: ${topOpeners.join('; ').toLowerCase()}`);
  return `WHAT'S WORKING ON THIS CHANNEL (from our own posts so far — lean this way when it fits the fact, never force it): ${bits.join('; ')}.`;
}

/** Returns a normalizer fn mapping a value to 0..1 across the given array. */
function minMax(values: number[]): (v: number, i: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return (v: number) => (span <= 0 ? 0.5 : (v - min) / span);
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
