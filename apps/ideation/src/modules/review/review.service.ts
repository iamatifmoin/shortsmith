import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  Confidence,
  PublishPackage,
  ReviewCapacity,
  ReviewSelection,
  ScriptClaim,
  ScriptExport,
} from '@shortsmith/shared';

import { publishConfigFor } from '../../config/publishing';
import { PrismaService } from '../../prisma/prisma.service';
import { RenderService } from '../render/render.service';

/** Body for editing a script at the review gate. */
export interface EditScriptDto {
  editedBody?: string;
  hook?: string;
  cta?: string;
  /** Operator edits to the Gate-1 upload metadata (replaces the stored package). */
  publishPackage?: PublishPackage;
}

/** Body for rejecting a script; may flag the underlying fact out of rotation. */
export interface RejectScriptDto {
  reason?: string;
  /** When true, set FactUnit.flaggedOut on the script's primary fact. */
  flagFactUnit?: boolean;
}

/**
 * Backend for HUMAN GATE 1 — script review (docs/architecture.md#5-review).
 * Lists the DRAFT queue (best hook first) with each claim's receipts +
 * non-blocking review flags (ADR-015), and handles approve / edit / reject.
 * Approving exposes a script via the export contract (packages/shared).
 */
@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly render: RenderService,
  ) {}

  /** DRAFT review queue, sorted by hookScore desc, with receipts + flags. */
  async listQueue(): Promise<unknown[]> {
    const scripts = await this.prisma.script.findMany({
      where: { status: 'DRAFT' },
      orderBy: { hookScore: 'desc' },
      include: { angle: { include: { primaryFactUnit: true } }, series: true },
    });

    const items: unknown[] = [];
    for (const s of scripts) {
      const claims = (s.claims as unknown as ScriptClaim[]) ?? [];
      const facts = await this.prisma.fact.findMany({
        where: { id: { in: claims.map((c) => c.factId) } },
        include: { factUnit: true, sourceDocument: true },
      });
      const byId = new Map(facts.map((f) => [f.id, f]));

      const enriched = claims.map((c) => {
        const f = byId.get(c.factId);
        return {
          factId: c.factId,
          sourceUrl: c.sourceUrl,
          snippet: c.snippet,
          sourceTier: f?.sourceTier ?? null,
          confidence: f?.factUnit?.confidence ?? null,
          snippetVerified: f?.snippetVerified ?? null,
          publishedAt: f?.sourceDocument?.publishedAt ?? null,
          fetchedAt: f?.sourceDocument?.fetchedAt ?? null,
        };
      });

      const staleDays = Number(
        (s.series.formatRules as { staleFlagDays?: number } | null)?.staleFlagDays ?? 45,
      );

      const unit = s.angle.primaryFactUnit;
      items.push({
        id: s.id,
        seriesKey: s.series.key,
        angleType: s.angle.angleType,
        status: s.status,
        reviewSelection: s.reviewSelection,
        hook: s.hook,
        body: s.editedBody ?? s.body,
        cta: s.cta,
        hookScore: s.hookScore,
        wordCount: s.wordCount,
        estDurationSec: s.estDurationSec,
        publish: (s.publishPackage as unknown as PublishPackage) ?? null,
        primaryFact: {
          canonicalClaim: unit.canonicalClaim,
          confidence: unit.confidence,
          corroborationCount: unit.corroborationCount,
        },
        claims: enriched,
        flags: computeFlags(unit.confidence, unit.corroborationCount, enriched, staleDays),
      });
    }
    return items;
  }

  /** Approve a script: APPROVED + approvedAt, and mark its Angle PRODUCED. */
  async approve(scriptId: string): Promise<void> {
    const script = await this.prisma.script.findUnique({ where: { id: scriptId } });
    if (!script) throw new NotFoundException(`No script ${scriptId}`);
    await this.prisma.$transaction([
      this.prisma.script.update({
        where: { id: scriptId },
        data: { status: 'APPROVED', approvedAt: new Date() },
      }),
      this.prisma.angle.update({ where: { id: script.angleId }, data: { status: 'PRODUCED' } }),
    ]);
    // Hand off to the render pipeline (ADR-021). Enqueue failures (e.g. Redis
    // down) must not fail the approval — the operator can re-trigger a render.
    try {
      await this.render.enqueue(scriptId);
    } catch (err) {
      this.logger.error(`approve(${scriptId}): render enqueue failed: ${String(err)}`);
    }
    this.logger.log(`approve(${scriptId})`);
  }

  /** Edit a script in place at the gate (operator tweaks before approving). */
  async edit(scriptId: string, dto: EditScriptDto): Promise<void> {
    const script = await this.prisma.script.findUnique({ where: { id: scriptId } });
    if (!script) throw new NotFoundException(`No script ${scriptId}`);
    await this.prisma.script.update({
      where: { id: scriptId },
      data: {
        editedBody: dto.editedBody ?? undefined,
        hook: dto.hook ?? undefined,
        cta: dto.cta ?? undefined,
        publishPackage: dto.publishPackage
          ? (dto.publishPackage as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });
    this.logger.log(`edit(${scriptId})`);
  }

  /** Reject a script; optionally flag its primary FactUnit out of rotation (ADR-005). */
  async reject(scriptId: string, dto: RejectScriptDto): Promise<void> {
    const script = await this.prisma.script.findUnique({
      where: { id: scriptId },
      include: { angle: true },
    });
    if (!script) throw new NotFoundException(`No script ${scriptId}`);

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.script.update({ where: { id: scriptId }, data: { status: 'REJECTED' } }),
      this.prisma.angle.update({ where: { id: script.angleId }, data: { status: 'REJECTED' } }),
    ];
    if (dto.flagFactUnit) {
      ops.push(
        this.prisma.factUnit.update({
          where: { id: script.angle.primaryFactUnitId },
          data: { flaggedOut: true },
        }),
      );
    }
    await this.prisma.$transaction(ops);
    this.logger.log(`reject(${scriptId})${dto.flagFactUnit ? ' + flagged fact out' : ''}`);
  }

  // --- Staged review (ADR-031): pending choices, committed by one Render -----

  /**
   * Stage a pending Gate-1 choice on a DRAFT script without changing its status
   * (ADR-031). `null` clears the choice. Staging APPROVE is capped at the series'
   * daily clip count minus what's already in flight (so no more than `dailyClips`
   * clips move toward a slot at once); rejecting/scheduling a clip frees capacity.
   */
  async select(scriptId: string, selection: ReviewSelection | null): Promise<void> {
    const script = await this.prisma.script.findUnique({
      where: { id: scriptId },
      include: { series: { select: { key: true } } },
    });
    if (!script) throw new NotFoundException(`No script ${scriptId}`);
    if (script.status !== 'DRAFT') throw new BadRequestException('Only DRAFT scripts can be staged');

    if (selection === ReviewSelection.APPROVE && script.reviewSelection !== 'APPROVE') {
      const cap = await this.capacityFor(script.seriesId, script.series.key);
      if (cap.remaining <= 0) {
        throw new BadRequestException(
          `Daily cap reached (${cap.dailyClips}/day). Reject or schedule a clip to free a slot.`,
        );
      }
    }
    await this.prisma.script.update({
      where: { id: scriptId },
      data: { reviewSelection: selection ?? null },
    });
    this.logger.log(`select(${scriptId}) = ${selection ?? 'cleared'}`);
  }

  /**
   * Commit all staged choices at once (the Render button, ADR-031): APPROVE ->
   * APPROVED + enqueue render, REJECT -> REJECTED, clearing the staged flag.
   * Re-checks the daily cap per series before committing.
   */
  async commit(): Promise<{ approved: string[]; rejected: string[] }> {
    const staged = await this.prisma.script.findMany({
      where: { status: 'DRAFT', reviewSelection: { not: null } },
      include: { series: { select: { key: true, publishConfig: true } } },
    });
    const approves = staged.filter((s) => s.reviewSelection === 'APPROVE');
    const rejects = staged.filter((s) => s.reviewSelection === 'REJECT');

    // Re-check the cap per series (raw in-flight + this batch must stay within dailyClips).
    const bySeries = new Map<string, { key: string; publishConfig: unknown; count: number }>();
    for (const s of approves) {
      const e = bySeries.get(s.seriesId) ?? { key: s.series.key, publishConfig: s.series.publishConfig, count: 0 };
      e.count += 1;
      bySeries.set(s.seriesId, e);
    }
    for (const [seriesId, e] of bySeries) {
      const cfg = publishConfigFor(e.publishConfig);
      const inFlight = await this.inFlightFor(seriesId);
      if (inFlight + e.count > cfg.dailyClips) {
        throw new BadRequestException(
          `Commit would exceed the ${cfg.dailyClips}/day cap for "${e.key}" (in flight: ${inFlight}).`,
        );
      }
    }

    const now = new Date();
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const s of approves) {
      ops.push(
        this.prisma.script.update({
          where: { id: s.id },
          data: { status: 'APPROVED', approvedAt: now, reviewSelection: null },
        }),
        this.prisma.angle.update({ where: { id: s.angleId }, data: { status: 'PRODUCED' } }),
      );
    }
    for (const s of rejects) {
      ops.push(
        this.prisma.script.update({
          where: { id: s.id },
          data: { status: 'REJECTED', reviewSelection: null },
        }),
        this.prisma.angle.update({ where: { id: s.angleId }, data: { status: 'REJECTED' } }),
      );
    }
    await this.prisma.$transaction(ops);

    // Enqueue renders after the status flip. Failures mustn't roll back approvals.
    for (const s of approves) {
      try {
        await this.render.enqueue(s.id);
      } catch (err) {
        this.logger.error(`commit: render enqueue failed for ${s.id}: ${String(err)}`);
      }
    }
    this.logger.log(`commit: approved ${approves.length}, rejected ${rejects.length}`);
    return { approved: approves.map((s) => s.id), rejected: rejects.map((s) => s.id) };
  }

  /** Remaining approval capacity per active series (for the dashboard cap UI). */
  async capacities(): Promise<Array<{ seriesKey: string } & ReviewCapacity>> {
    const series = await this.prisma.series.findMany({ where: { active: true } });
    return Promise.all(
      series.map(async (s) => ({ seriesKey: s.key, ...(await this.capacityFor(s.id, s.publishConfig)) })),
    );
  }

  /** Clips already moving toward a slot for a series (rendering + rendered-awaiting). */
  private async inFlightFor(seriesId: string): Promise<number> {
    const [tasks, renders] = await Promise.all([
      this.prisma.publishTask.count({
        where: { status: { in: ['READY', 'NOTIFIED'] }, script: { seriesId } },
      }),
      this.prisma.renderJob.count({
        where: { status: { in: ['QUEUED', 'RENDERING'] }, script: { seriesId } },
      }),
    ]);
    return tasks + renders;
  }

  private async capacityFor(seriesId: string, publishConfig: unknown): Promise<ReviewCapacity> {
    const cfg = publishConfigFor(publishConfig);
    const [inFlight, pendingApprovals] = await Promise.all([
      this.inFlightFor(seriesId),
      this.prisma.script.count({
        where: { seriesId, status: 'DRAFT', reviewSelection: 'APPROVE' },
      }),
    ]);
    const remaining = Math.max(0, cfg.dailyClips - inFlight - pendingApprovals);
    return { dailyClips: cfg.dailyClips, inFlight, pendingApprovals, remaining };
  }

  /** APPROVED scripts serialized to the export contract — the handoff to render/manual production. */
  async approvedExports(): Promise<ScriptExport[]> {
    const scripts = await this.prisma.script.findMany({
      where: { status: 'APPROVED' },
      orderBy: { approvedAt: 'asc' },
      include: EXPORT_INCLUDE,
    });
    return scripts.map(toExport);
  }

  /** One APPROVED script as the export contract — what the render worker fetches. */
  async exportById(scriptId: string): Promise<ScriptExport> {
    const s = await this.prisma.script.findUnique({
      where: { id: scriptId },
      include: EXPORT_INCLUDE,
    });
    if (!s) throw new NotFoundException(`No script ${scriptId}`);
    if (s.status !== 'APPROVED') throw new NotFoundException(`Script ${scriptId} is not APPROVED`);
    return toExport(s);
  }
}

/** Prisma include pulling everything the export contract needs (incl. fact confidence). */
const EXPORT_INCLUDE = {
  series: true,
  angle: { include: { primaryFactUnit: true } },
} as const;

/** Minimal shape toExport reads from a Script row loaded with EXPORT_INCLUDE. */
interface ExportRow {
  series: { key: string };
  angle: { primaryFactUnit: { confidence: string } };
  hook: string;
  body: string;
  editedBody: string | null;
  cta: string;
  claims: unknown;
  estDurationSec: number;
  publishPackage: unknown;
}

/** Serialize a Script row to the export contract (ADR-009/028). */
function toExport(s: ExportRow): ScriptExport {
  return {
    seriesKey: s.series.key,
    hook: s.hook,
    body: s.editedBody ?? s.body,
    cta: s.cta,
    claims: (s.claims as unknown as ScriptClaim[]) ?? [],
    estDurationSec: s.estDurationSec,
    confidence: (s.angle.primaryFactUnit.confidence as unknown as Confidence) ?? undefined,
    publish: (s.publishPackage as unknown as PublishPackage) ?? undefined,
  };
}

interface EnrichedClaim {
  sourceTier: number | null;
  snippetVerified: boolean | null;
  publishedAt: Date | null;
}

/** Non-blocking review flags (ADR-015): warn only, never auto-delete. */
function computeFlags(
  confidence: string,
  corroborationCount: number,
  claims: EnrichedClaim[],
  staleDays: number,
): string[] {
  const flags: string[] = [];
  if (claims.some((c) => c.snippetVerified === false)) flags.push('snippet-unverified');
  if (corroborationCount < 2) flags.push('uncorroborated');
  if (confidence !== 'CONFIRMED') flags.push('below-confirmed');
  if (claims.some((c) => (c.sourceTier ?? 0) >= 3)) flags.push('rumor-tier-source');
  // Newest source older than the window — a likely-superseded / outdated fact (ADR-019).
  const newest = claims.reduce((max, c) => {
    const t = c.publishedAt ? new Date(c.publishedAt).getTime() : 0;
    return t > max ? t : max;
  }, 0);
  if (newest > 0 && Date.now() - newest > staleDays * 24 * 60 * 60 * 1000) flags.push('outdated');
  return flags;
}
