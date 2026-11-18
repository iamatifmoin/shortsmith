import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';

import { QUEUES } from '../../constants';
import { RankService } from './rank.service';

/** Payload enqueued onto the rank queue. */
export interface RankJobData {
  /** Series whose facts to (re)cluster. */
  seriesId?: string;
  /** Optional: restrict re-ranking to a batch of fact ids. */
  factIds?: string[];
}

/**
 * BullMQ worker for STAGE 3 — rank. Clusters the series' facts into FactUnits
 * with confidence, then nudges the GENERATE stage.
 * See docs/architecture.md#3-rank.
 */
@Processor(QUEUES.RANK, { concurrency: 1 })
export class RankProcessor extends WorkerHost {
  private readonly logger = new Logger(RankProcessor.name);

  constructor(
    private readonly rank: RankService,
    @InjectQueue(QUEUES.GENERATE) private readonly generateQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<RankJobData>): Promise<void> {
    this.logger.debug(`process rank job ${job.id} (series ${job.data.seriesId ?? 'all'})`);
    await this.rank.rank(job.data.seriesId);
    if (job.data.seriesId) {
      // No fixed jobId here. A fixed `generate-<seriesId>` made BullMQ treat
      // .add() as a no-op whenever a prior generate job for the series still
      // lingered (e.g. one left "active"/stalled by a mid-run restart) — silently
      // swallowing the run so new facts never got scripted. The worker is
      // concurrency 1 and generate skips already-scripted facts, so letting each
      // run enqueue its own job is safe (serial, idempotent, at worst redundant).
      await this.generateQueue.add(
        'generate',
        { seriesId: job.data.seriesId },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 15_000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    }
  }
}
