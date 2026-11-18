import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AngleStatus, AngleType, PublishPackage, ScriptClaim, ScriptStatus } from '@shortsmith/shared';
import { AllModelsExhaustedError, LlmProvider, ManualInterventionRequired } from '@shortsmith/llm';

import { PrismaService } from '../../prisma/prisma.service';
import { LLM_PROVIDER } from '../../llm/llm.module';
import { GenerationSignal, PerformanceService } from '../metrics/performance.service';
import {
  buildGenerateMessages,
  buildGenerateSystem,
  buildVisualRetryMessage,
  hasValueLayer,
  parseScript,
} from './prompts';

/** The generated script payload before persistence. */
export interface GeneratedScript {
  hook: string;
  body: string;
  cta: string;
  claims: ScriptClaim[];
  /** Self-rated hook strength; drives the review-queue ordering. */
  hookScore: number;
  wordCount: number;
  estDurationSec: number;
  /** The Gate-1 upload metadata (ADR-018). */
  publish: PublishPackage;
}

/** Brand defaults stored on Series.publishDefaults (seeded; see ADR-018). */
interface PublishDefaults {
  descriptionFooter?: string;
  defaultTags?: string[];
  aiDisclosure?: string;
  emoji?: boolean;
  maxHashtags?: number;
  maxTags?: number;
}

const WPM = 165;
const MAX_SNIPPETS = 6;
/**
 * How many times to (re)ask the LLM for a script until it carries the full ADR-028
 * value layer (visual + >=2 b-roll). The free Gemini tier drops these intermittently;
 * re-asking with a corrective nudge makes the value layer reliable. See docs/content-strategy.md.
 */
const GEN_ATTEMPTS = 3;

/** Highest-to-lowest so we can gate by a series' minConfidence. */
const CONFIDENCE_RANK: Record<string, number> = { CONFIRMED: 2, STRONG_RUMOR: 1, RUMOR: 0 };

/**
 * STAGE 4 — generate. Draws a series' eligible, NOVEL FactUnits (confidence >=
 * series.minConfidence, not flaggedOut, not already scripted), writes ONE grounded
 * script per fact in the series' voice (ADR-007/017), AND the full Gate-1 upload
 * package (ADR-018) — title/description/tags/hashtags/caption/thumbnail text —
 * with the compliance footer/disclaimer + default tags applied deterministically
 * in code. Persists an Angle (GENERATED) + Script (DRAFT) for review.
 * Volume is DYNAMIC (ADR-008). See docs/architecture.md#4-generate.
 */
@Injectable()
export class GenerateService {
  private readonly logger = new Logger(GenerateService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly performance: PerformanceService,
  ) {}

  async generateForSeries(seriesId: string): Promise<GeneratedScript[]> {
    const series = await this.prisma.series.findUniqueOrThrow({ where: { id: seriesId } });
    const minRank = CONFIDENCE_RANK[series.minConfidence] ?? 2;

    // Learned performance feedback (ADR-020) — a no-op until enough posts exist.
    const signal = await this.performance.getGenerationSignal();
    if (signal.enoughData) {
      this.logger.log('generate: applying learned performance feedback to hook scoring + prompt');
    }

    const units = await this.prisma.factUnit.findMany({
      where: { flaggedOut: false },
      include: {
        facts: { include: { sourceDocument: { select: { publishedAt: true } } } },
        angles: { where: { seriesId }, select: { id: true } },
      },
    });

    const maxAgeDays = Number((series.formatRules as { maxFactAgeDays?: number } | null)?.maxFactAgeDays ?? 120);
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

    const eligible = units
      .filter(
        (u) => (CONFIDENCE_RANK[u.confidence] ?? 0) >= minRank && u.facts.length > 0 && u.angles.length === 0,
      )
      // Drop clearly-stale facts (newest source older than the window) so we don't
      // script superseded info; keep facts whose date is unknown. (ADR-019)
      .filter((u) => {
        const n = newestSourceMs(u);
        return n === 0 || n >= cutoff;
      })
      // Freshest first, so under a quota cap current facts get scripted first.
      .sort((a, b) => newestSourceMs(b) - newestSourceMs(a));

    this.logger.log(
      `generateForSeries(${series.key}): ${eligible.length} novel eligible fact(s) at >= ${series.minConfidence} (<= ${maxAgeDays}d old)`,
    );

    const out: GeneratedScript[] = [];
    for (const unit of eligible) {
      try {
        const script = await this.generateOne(series, unit, signal);
        if (script) out.push(script);
      } catch (err) {
        if (err instanceof ManualInterventionRequired) {
          this.logger.warn('generate: manual LLM step required — stopping; remaining facts stay novel');
          break;
        }
        if (err instanceof AllModelsExhaustedError) {
          this.logger.warn(`generate: quota exhausted after ${out.length} script(s) — will retry`);
          throw err;
        }
        this.logger.warn(`generate: unit ${unit.id} failed: ${(err as Error).message}`);
      }
    }

    this.logger.log(`generateForSeries(${series.key}): ${out.length} draft script(s)`);
    return out;
  }

  private async generateOne(
    series: Prisma.SeriesGetPayload<object>,
    unit: Prisma.FactUnitGetPayload<{
      include: { facts: { include: { sourceDocument: { select: { publishedAt: true } } } } };
    }>,
    signal: GenerationSignal,
  ): Promise<GeneratedScript | null> {
    const defaults = (series.publishDefaults ?? {}) as PublishDefaults;
    const snippets = unit.facts.map((f) => f.snippet).filter(Boolean).slice(0, MAX_SNIPPETS);

    const system = buildGenerateSystem({
      subjectName: series.subjectName,
      subjectAliases: series.subjectAliases,
      personality: series.personality,
      comparisonLabel: series.comparisonLabel,
      displayName: series.displayName,
      voiceTone: series.voiceTone,
      formatRules: series.formatRules,
      publish: { emoji: defaults.emoji, maxHashtags: defaults.maxHashtags },
      performanceHint: signal.hint,
    });
    const messages = buildGenerateMessages(unit.canonicalClaim, snippets);

    // Regenerate until the script carries the ADR-028 value layer (visual + >=2
    // b-roll cues); the free LLM tier omits these intermittently. We keep the
    // first usable parse as a fallback so we still draft even if the model never
    // fully complies. ManualInterventionRequired / AllModelsExhaustedError bubble
    // up to generateForSeries (don't swallow them here).
    let parsed: ReturnType<typeof parseScript> = null;
    for (let attempt = 1; attempt <= GEN_ATTEMPTS; attempt++) {
      const res = await this.llm.complete(messages, { system, temperature: 0.8, maxTokens: 1500 });
      const candidate = parseScript(res.text);
      if (hasValueLayer(candidate)) {
        parsed = candidate;
        break;
      }
      if (candidate && !parsed) parsed = candidate; // best-effort fallback
      if (attempt < GEN_ATTEMPTS) {
        this.logger.warn(
          `generate: unit ${unit.id} missing value layer (attempt ${attempt}/${GEN_ATTEMPTS}) — regenerating`,
        );
        // Feed the model its own reply + a corrective nudge so it can keep the
        // hook/body and just add the missing visual/b-roll.
        messages.push({ role: 'assistant', content: res.text }, buildVisualRetryMessage());
      }
    }
    if (!parsed) {
      this.logger.warn(`generate: unparseable script for unit ${unit.id}`);
      return null;
    }
    if (!hasValueLayer(parsed)) {
      this.logger.warn(
        `generate: unit ${unit.id} still lacks full value layer after ${GEN_ATTEMPTS} attempts — drafting anyway`,
      );
    }

    const angleType = (Object.values(AngleType) as string[]).includes(parsed.angleType)
      ? (parsed.angleType as AngleType)
      : AngleType.FACT;
    const claims: ScriptClaim[] = unit.facts.map((f) => ({
      factId: f.id,
      sourceUrl: f.sourceUrl,
      snippet: f.snippet,
    }));
    const wordCount = `${parsed.hook} ${parsed.body} ${parsed.cta}`.trim().split(/\s+/).filter(Boolean).length;
    const estDurationSec = Math.round((wordCount / WPM) * 60);
    const publish = this.assemblePackage(parsed, defaults);

    // Angle.score keeps the raw LLM self-rating; Script.hookScore is the one the
    // review queue sorts by — nudged by learned performance (ADR-020).
    const adjustedHookScore = this.performance.adjustHookScore(
      parsed.hookScore,
      angleType,
      parsed.hook,
      signal,
    );

    const angle = await this.prisma.angle.create({
      data: {
        seriesId: series.id,
        primaryFactUnitId: unit.id,
        hook: parsed.hook,
        angleType,
        noveltyHash: `${series.id}:${unit.id}`,
        score: parsed.hookScore,
        status: AngleStatus.GENERATED,
        script: {
          create: {
            seriesId: series.id,
            hook: parsed.hook,
            body: parsed.body,
            cta: parsed.cta,
            claims: claims as unknown as Prisma.InputJsonValue,
            publishPackage: publish as unknown as Prisma.InputJsonValue,
            wordCount,
            estDurationSec,
            hookScore: adjustedHookScore,
            status: ScriptStatus.DRAFT,
          },
        },
      },
      include: { script: true },
    });

    this.logger.debug(`generate: drafted script ${angle.script?.id} for unit ${unit.id}`);
    return { hook: parsed.hook, body: parsed.body, cta: parsed.cta, claims, hookScore: adjustedHookScore, wordCount, estDurationSec, publish };
  }

  /** Combine the LLM's creative parts with deterministic brand defaults (footer, tags, disclaimer). */
  private assemblePackage(
    parsed: ReturnType<typeof parseScript> & object,
    defaults: PublishDefaults,
  ): PublishPackage {
    const hashtags = parsed.hashtags.slice(0, defaults.maxHashtags ?? 5);
    const footer = defaults.descriptionFooter;
    const disclosure = defaults.aiDisclosure;

    const block = (lead: string) =>
      [lead, hashtags.join(' '), footer, disclosure].map((s) => (s ?? '').trim()).filter(Boolean).join('\n\n');

    const tags = dedupe([...(defaults.defaultTags ?? []), ...parsed.tags]).slice(0, defaults.maxTags ?? 15);

    return {
      title: parsed.title,
      description: block(parsed.descriptionLines),
      tags,
      hashtags,
      igCaption: block(parsed.igCaption),
      thumbnailText: parsed.thumbnailText || parsed.title,
      backgroundSuggestion: parsed.backgroundSuggestion || undefined,
      musicMood: parsed.musicMood || undefined,
      visual: parsed.visual ?? undefined,
      source: parsed.source || undefined,
      broll: parsed.broll.length ? parsed.broll : undefined,
    };
  }
}

/** Newest source publish date (epoch ms) across a unit's facts; 0 when unknown. */
function newestSourceMs(unit: {
  facts: { sourceDocument: { publishedAt: Date | null } | null }[];
}): number {
  return unit.facts.reduce((max, f) => {
    const t = f.sourceDocument?.publishedAt?.getTime() ?? 0;
    return t > max ? t : max;
  }, 0);
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}
