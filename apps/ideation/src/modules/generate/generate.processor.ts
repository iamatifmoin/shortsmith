import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUES } from '../../constants';
import { GenerateService } from './generate.service';

/** Payload enqueued onto the generate queue. */
export interface GenerateJobData {
  seriesId: string;
}

/**
 * BullMQ worker for STAGE 4 — generate. Writes DRAFT scripts for the series'
 * novel eligible facts; they then await Gate 1 via the review API.
 * See docs/architecture.md#4-generate.
 */
// concurrency 1 + rate limit so we stay under the Gemini free-tier per-minute cap.
@Processor(QUEUES.GENERATE, { concurrency: 1, limiter: { max: 10, duration: 60_000 } })
export class GenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerateProcessor.name);

  constructor(private readonly generate: GenerateService) {
    super();
  }

  async process(job: Job<GenerateJobData>): Promise<void> {
    this.logger.debug(`process generate job ${job.id} (series ${job.data.seriesId})`);
    await this.generate.generateForSeries(job.data.seriesId);
  }
}
