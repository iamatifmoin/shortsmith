import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';

import { QUEUES } from '../../constants';
import { HarvestService } from './harvest.service';
import type { ExtractJobData } from '../extract/extract.processor';

/** Payload enqueued onto the harvest queue. */
export interface HarvestJobData {
  seriesId: string;
}

/**
 * BullMQ worker for STAGE 1 — harvest. Runs the harvest and enqueues the EXTRACT
 * stage for each new/changed page. See docs/architecture.md#1-harvest.
 */
@Processor(QUEUES.HARVEST, { concurrency: 1 })
export class HarvestProcessor extends WorkerHost {
  private readonly logger = new Logger(HarvestProcessor.name);

  constructor(
    private readonly harvest: HarvestService,
    @InjectQueue(QUEUES.EXTRACT) private readonly extractQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<HarvestJobData>): Promise<void> {
    this.logger.debug(`process harvest job ${job.id} (series ${job.data.seriesId})`);
    const pages = await this.harvest.harvest(job.data.seriesId);
    for (const page of pages) {
      await this.extractQueue.add(
        'extract',
        { page, seriesId: job.data.seriesId } satisfies ExtractJobData,
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 15_000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    }
    this.logger.log(`harvest job ${job.id}: enqueued ${pages.length} page(s) for extract`);
  }
}
