import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUES } from '../../constants';
import { RenderController } from './render.controller';
import { RenderService } from './render.service';

/**
 * Ideation-side render wiring (Phase 3, ADR-021). Registers the `render` queue
 * (so approving a Script can enqueue onto it) and exposes the RenderJob API +
 * worker callbacks. The actual rendering lives in the standalone apps/render.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.RENDER })],
  controllers: [RenderController],
  providers: [RenderService],
  exports: [RenderService],
})
export class RenderModule {}
