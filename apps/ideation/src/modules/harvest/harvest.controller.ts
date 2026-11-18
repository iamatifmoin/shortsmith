import { InjectQueue } from '@nestjs/bullmq';
import { Body, Controller, Get, NotFoundException, Post } from '@nestjs/common';
import { Queue } from 'bullmq';

import { QUEUES } from '../../constants';
import { PrismaService } from '../../prisma/prisma.service';
import { HarvestJobData } from './harvest.processor';

interface RunHarvestDto {
  seriesKey?: string;
}

/** In-progress BullMQ job states across a pipeline stage (not completed/failed). */
const PENDING_STATES = [
  'active',
  'waiting',
  'delayed',
  'paused',
  'prioritized',
  'waiting-children',
] as const;

/**
 * On-demand trigger for a pipeline run (ADR-016: on-demand now, scheduled host
 * later). `POST /harvest/run { seriesKey }` enqueues a harvest job for that
 * series; the rest of the pipeline flows from there via the queues.
 */
@Controller('harvest')
export class HarvestController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.HARVEST) private readonly harvestQueue: Queue,
    @InjectQueue(QUEUES.EXTRACT) private readonly extractQueue: Queue,
    @InjectQueue(QUEUES.RANK) private readonly rankQueue: Queue,
    @InjectQueue(QUEUES.GENERATE) private readonly generateQueue: Queue,
  ) {}

  /**
   * Pipeline busy state, for the dashboard's "Fetching…" loader. Sums the
   * in-progress jobs across every pre-review stage (harvest -> generate). The UI
   * polls this after a run and keeps the Review tab locked until it reports idle.
   */
  @Get('status')
  async status(): Promise<{ busy: boolean; pending: number; byStage: Record<string, number> }> {
    const stages: Array<[string, Queue]> = [
      ['harvest', this.harvestQueue],
      ['extract', this.extractQueue],
      ['rank', this.rankQueue],
      ['generate', this.generateQueue],
    ];
    const byStage: Record<string, number> = {};
    let pending = 0;
    for (const [name, q] of stages) {
      const counts = await q.getJobCounts(...PENDING_STATES);
      const n = PENDING_STATES.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
      byStage[name] = n;
      pending += n;
    }
    return { busy: pending > 0, pending, byStage };
  }

  @Post('run')
  async run(
    @Body() dto: RunHarvestDto,
  ): Promise<{ enqueued: boolean; seriesKey: string; jobId?: string }> {
    // Default to the active channel so callers needn't know the key (one instance
    // = one channel). An explicit seriesKey still wins when provided.
    const key = dto?.seriesKey?.trim();
    const series = key
      ? await this.prisma.series.findUnique({ where: { key } })
      : await this.prisma.series.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' } });
    if (!series) {
      throw new NotFoundException(key ? `No series with key "${key}"` : 'No active channel configured');
    }

    const job = await this.harvestQueue.add(
      'harvest',
      { seriesId: series.id } satisfies HarvestJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );

    return { enqueued: true, seriesKey: series.key, jobId: job.id };
  }
}
