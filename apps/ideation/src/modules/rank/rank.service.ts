import { Inject, Injectable, Logger } from '@nestjs/common';
import { Confidence } from '@shortsmith/shared';
import { LlmProvider, ManualInterventionRequired } from '@shortsmith/llm';

import { PrismaService } from '../../prisma/prisma.service';
import { LLM_PROVIDER } from '../../llm/llm.module';
import { buildClusterMessages, buildClusterSystem, ExistingUnit, parseGroups } from './prompts';

/** Minimal fact shape used for confidence scoring. */
interface ScoringFact {
  sourceTier: number;
  sourceUrl: string;
}

/**
 * STAGE 3 — rank. Clusters near-duplicate Facts into canonical FactUnits (via the
 * LLM, conservatively) and computes each unit's confidence from source tier +
 * INDEPENDENT corroboration. New facts can join existing units (corroboration)
 * or form new ones; no fact is lost (unplaced facts become singletons).
 *
 * Confidence rule (docs/sources.md):
 *   CONFIRMED     = any Tier-1 source OR >= 2 independent Tier-2 sources
 *   STRONG_RUMOR  = exactly 1 Tier-2 source
 *   RUMOR         = Tier-3/4 only
 * "Independent" = distinct outlet (sourceKey, else URL host).
 * See docs/architecture.md#3-rank and docs/sources.md.
 */
@Injectable()
export class RankService {
  private readonly logger = new Logger(RankService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  /** Cluster this series' unclustered Facts into FactUnits and (re)compute confidence. */
  async rank(seriesId?: string): Promise<void> {
    const facts = await this.prisma.fact.findMany({
      where: {
        factUnitId: null,
        ...(seriesId ? { sourceDocument: { seriesId } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    if (facts.length === 0) {
      this.logger.log('rank: no unclustered facts');
      return;
    }

    const existing: ExistingUnit[] = await this.prisma.factUnit.findMany({
      where: { flaggedOut: false },
      select: { id: true, canonicalClaim: true },
    });

    // Subject comes from the channel config (ADR-006); fall back to a generic label.
    const subjectName = seriesId
      ? (await this.prisma.series.findUnique({ where: { id: seriesId }, select: { subjectName: true } }))?.subjectName
      : null;

    let groups;
    try {
      const res = await this.llm.complete(
        buildClusterMessages(
          facts.map((f) => f.claim),
          existing,
        ),
        { system: buildClusterSystem(subjectName), temperature: 0, maxTokens: 2048 },
      );
      groups = parseGroups(res.text);
    } catch (err) {
      if (err instanceof ManualInterventionRequired) {
        this.logger.warn('rank: manual LLM step required — leaving facts unclustered');
        return;
      }
      throw err; // capacity-exhausted / genuine errors bubble up for BullMQ retry
    }

    const existingIds = new Set(existing.map((u) => u.id));
    const placed = new Set<number>();
    const touched = new Set<string>();

    for (const group of groups) {
      const members = group.factIndexes
        .filter((i) => i >= 0 && i < facts.length && !placed.has(i))
        .map((i) => {
          placed.add(i);
          return facts[i];
        });
      if (members.length === 0) continue;

      const unitId = await this.resolveUnit(group.existingId, existingIds, group.canonicalClaim, group.category, members[0].claim);
      await this.prisma.fact.updateMany({
        where: { id: { in: members.map((m) => m.id) } },
        data: { factUnitId: unitId },
      });
      touched.add(unitId);
    }

    // Safety net: never drop a fact the model didn't place — make it a singleton unit.
    for (let i = 0; i < facts.length; i++) {
      if (placed.has(i)) continue;
      const fact = facts[i];
      const unit = await this.prisma.factUnit.create({
        data: { canonicalClaim: fact.claim, confidence: Confidence.RUMOR, isRumor: true },
      });
      await this.prisma.fact.update({ where: { id: fact.id }, data: { factUnitId: unit.id } });
      touched.add(unit.id);
    }

    for (const unitId of touched) {
      await this.recomputeConfidence(unitId);
    }

    this.logger.log(
      `rank: clustered ${facts.length} fact(s) into ${touched.size} touched unit(s) (${groups.length} group(s) from LLM)`,
    );
  }

  /** Resolve a group to an existing FactUnit id, or create a new one. */
  private async resolveUnit(
    existingId: string | null,
    existingIds: Set<string>,
    canonicalClaim: string,
    category: string | null,
    fallbackClaim: string,
  ): Promise<string> {
    if (existingId && existingIds.has(existingId)) return existingId;
    const unit = await this.prisma.factUnit.create({
      data: {
        canonicalClaim: canonicalClaim || fallbackClaim,
        category: category ?? undefined,
        confidence: Confidence.RUMOR,
        isRumor: true,
      },
    });
    return unit.id;
  }

  /** Recompute a unit's confidence + corroborationCount from all its member facts. */
  private async recomputeConfidence(unitId: string): Promise<void> {
    const facts = await this.prisma.fact.findMany({
      where: { factUnitId: unitId },
      select: { sourceTier: true, sourceUrl: true },
    });
    const confidence = scoreConfidence(facts);
    const outlets = new Set(facts.map(outletOf));
    await this.prisma.factUnit.update({
      where: { id: unitId },
      data: {
        confidence,
        corroborationCount: Math.max(1, outlets.size),
        isRumor: confidence !== Confidence.CONFIRMED,
      },
    });
  }
}

/** Confidence from tiers + independent corroboration (distinct outlets). */
export function scoreConfidence(facts: ScoringFact[]): Confidence {
  const hasTier1 = facts.some((f) => f.sourceTier === 1);
  const tier2Outlets = new Set(facts.filter((f) => f.sourceTier === 2).map(outletOf));
  if (hasTier1 || tier2Outlets.size >= 2) return Confidence.CONFIRMED;
  if (tier2Outlets.size === 1) return Confidence.STRONG_RUMOR;
  return Confidence.RUMOR;
}

/** Independent-outlet identity: the article URL's host (distinct hosts = independent). */
function outletOf(f: ScoringFact): string {
  try {
    return new URL(f.sourceUrl).host;
  } catch {
    return f.sourceUrl;
  }
}
