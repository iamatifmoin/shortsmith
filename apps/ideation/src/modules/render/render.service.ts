import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RenderStatus as DbRenderStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import {
  RenderJobData,
  RenderJobView,
  RenderStatus,
  RenderStatusUpdate,
} from '@shortsmith/shared';

import { QUEUES } from '../../constants';
import { PrismaService } from '../../prisma/prisma.service';

/** Statuses that count as an in-flight render for a script. */
const ACTIVE: DbRenderStatus[] = ['QUEUED', 'RENDERING'];

/**
 * Owns the RenderJob lifecycle on the ideation side (ADR-021). Approving a
 * Script enqueues a render here; the separate apps/render worker consumes the
 * BullMQ job and reports status back through {@link applyStatus} (the callback),
 * so this Postgres stays the single source of truth. This service never renders
 * anything — it only tracks jobs and drives the queue.
 */
@Injectable()
export class RenderService {
  private readonly logger = new Logger(RenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.RENDER) private readonly queue: Queue<RenderJobData>,
  ) {}

  /**
   * Create a QUEUED RenderJob for an APPROVED script and enqueue it. Idempotent
   * (ADR-034): if a render is already in flight it returns that job, and unless
   * `force` is set it also skips a script that already has a finished (DONE)
   * render — so re-clicking Render never re-spends the (paid) render. `force` is
   * the Redo path: it enqueues a fresh take even past a DONE render (the worker
   * reuses the version-keyed cached voiceover, so no new paid call unless the
   * script text changed).
   */
  async enqueue(scriptId: string, opts: { force?: boolean } = {}): Promise<string> {
    const existing = await this.prisma.renderJob.findFirst({
      where: { scriptId, status: { in: ACTIVE } },
    });
    if (existing) {
      this.logger.warn(`render already in flight for script ${scriptId} (job ${existing.id})`);
      return existing.id;
    }
    if (!opts.force) {
      const done = await this.prisma.renderJob.findFirst({
        where: { scriptId, status: 'DONE' },
      });
      if (done) {
        this.logger.warn(`script ${scriptId} already rendered (job ${done.id}); skipping (use force to Redo)`);
        return done.id;
      }
    }
    const job = await this.prisma.renderJob.create({ data: { scriptId } });
    // jobId must not contain ':' — BullMQ treats it specially (see commit 55504d0).
    await this.queue.add(
      'render',
      { scriptId, renderJobId: job.id },
      { jobId: `render-${job.id}`, removeOnComplete: true, removeOnFail: false },
    );
    this.logger.log(`enqueue render for script ${scriptId} (job ${job.id})`);
    return job.id;
  }

  /**
   * Cancel the active render for a script: drop the queued BullMQ job if it hasn't
   * started, and mark the RenderJob CANCELLED. A job already RENDERING can't be
   * pulled from the worker, so it's flagged CANCELLED and the worker aborts when
   * it next polls (mid-render cancellation is best-effort).
   */
  async cancel(scriptId: string): Promise<void> {
    const job = await this.prisma.renderJob.findFirst({
      where: { scriptId, status: { in: ACTIVE } },
      orderBy: { createdAt: 'desc' },
    });
    if (!job) throw new NotFoundException(`No active render for script ${scriptId}`);

    const bull = await this.queue.getJob(`render-${job.id}`);
    if (bull) {
      try {
        await bull.remove();
      } catch {
        // Active jobs can't be removed; the worker sees CANCELLED and aborts.
      }
    }
    await this.prisma.renderJob.update({
      where: { id: job.id },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });
    this.logger.log(`cancel render for script ${scriptId} (job ${job.id})`);
  }

  /** Apply a status update reported by the render worker (ADR-021 callback). */
  async applyStatus(renderJobId: string, update: RenderStatusUpdate): Promise<void> {
    const job = await this.prisma.renderJob.findUnique({ where: { id: renderJobId } });
    if (!job) throw new NotFoundException(`No render job ${renderJobId}`);
    if (job.status === 'CANCELLED') {
      // The operator cancelled; don't resurrect the job with a late worker update.
      this.logger.warn(`ignoring ${update.status} for cancelled job ${renderJobId}`);
      return;
    }

    const now = new Date();
    const terminal = update.status === RenderStatus.DONE || update.status === RenderStatus.FAILED;
    await this.prisma.renderJob.update({
      where: { id: renderJobId },
      data: {
        status: update.status as unknown as DbRenderStatus,
        videoPath: update.videoPath ?? undefined,
        thumbnailPath: update.thumbnailPath ?? undefined,
        durationSec: update.durationSec ?? undefined,
        audioDurationSec: update.audioDurationSec ?? undefined,
        voiceId: update.voiceId ?? undefined,
        backgroundClips: update.backgroundClips ?? undefined,
        musicTrack: update.musicTrack ?? undefined,
        error: update.error ?? undefined,
        startedAt: update.status === RenderStatus.RENDERING ? now : undefined,
        finishedAt: terminal ? now : undefined,
      },
    });
    this.logger.log(`render job ${renderJobId} -> ${update.status}`);
  }

  /** One render job (for the worker's cancellation poll + UX). */
  async getJob(renderJobId: string): Promise<RenderJobView | null> {
    const j = await this.prisma.renderJob.findUnique({ where: { id: renderJobId } });
    return j ? toView(j) : null;
  }

  /** Recent render jobs, newest first. */
  async listJobs(limit = 50): Promise<RenderJobView[]> {
    const jobs = await this.prisma.renderJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return jobs.map(toView);
  }
}

/** Prisma RenderJob row -> wire-safe view. */
function toView(j: {
  id: string;
  scriptId: string;
  status: DbRenderStatus;
  videoPath: string | null;
  thumbnailPath: string | null;
  durationSec: number | null;
  error: string | null;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}): RenderJobView {
  return {
    id: j.id,
    scriptId: j.scriptId,
    status: j.status as unknown as RenderStatus,
    videoPath: j.videoPath,
    thumbnailPath: j.thumbnailPath,
    durationSec: j.durationSec,
    error: j.error,
    queuedAt: j.queuedAt.toISOString(),
    startedAt: j.startedAt?.toISOString() ?? null,
    finishedAt: j.finishedAt?.toISOString() ?? null,
  };
}
