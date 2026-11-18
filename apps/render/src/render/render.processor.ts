import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RenderJobData } from '@shortsmith/shared';

import { QUEUES } from '../constants';
import { RenderRunner } from './render.runner';

/**
 * BullMQ worker for the render stage (Phase 3, ADR-021). Concurrency 1 — we only
 * need 2-3 clips/day and local rendering is CPU-bound, so renders run serially.
 */
@Processor(QUEUES.RENDER, { concurrency: 1 })
export class RenderProcessor extends WorkerHost {
  private readonly logger = new Logger(RenderProcessor.name);

  constructor(private readonly runner: RenderRunner) {
    super();
  }

  async process(job: Job<RenderJobData>): Promise<void> {
    this.logger.log(`render job ${job.id} (script ${job.data.scriptId})`);
    await this.runner.run(job.data);
  }
}
