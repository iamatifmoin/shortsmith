import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';

import { QUEUES } from '../../constants';
import { ExtractService } from './extract.service';
import type { HarvestedPage } from '../harvest/harvest.service';

/** Payload enqueued onto the extract queue: one harvested page + its series. */
export interface ExtractJobData {
  page: HarvestedPage;
  seriesId: string;
}

/**
 * BullMQ worker for STAGE 2 — extract. Extracts claims from one page, then nudges
 * the RANK stage (deduped per series). See docs/architecture.md#2-extract.
 */
// concurrency 1 + rate limit so we stay under the Gemini free-tier per-minute cap.
@Processor(QUEUES.EXTRACT, { concurrency: 1, limiter: { max: 10, duration: 60_000 } })
export class ExtractProcessor extends WorkerHost {
  private readonly logger = new Logger(ExtractProcessor.name);

  constructor(
    private readonly extract: ExtractService,
    @InjectQueue(QUEUES.RANK) private readonly rankQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<ExtractJobData>): Promise<void> {
    this.logger.debug(`process extract job ${job.id} (${job.data.page.url})`);
    await this.extract.extract(job.data.page, job.data.seriesId);
    // One pending rank per series (rank clusters all of a series' facts at once).
    await this.rankQueue.add(
      'rank',
      { seriesId: job.data.seriesId },
      {
        jobId: `rank-${job.data.seriesId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 15_000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
