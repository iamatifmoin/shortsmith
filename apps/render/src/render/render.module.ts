import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { RemotionService } from '../compose/remotion.service';
import { QUEUES } from '../constants';
import { IdeationClient } from '../ideation/ideation.client';
import { TtsModule } from '../tts/tts.module';
import { RenderProcessor } from './render.processor';
import { RenderRunner } from './render.runner';

/**
 * The render worker module (Phase 3, ADR-021). Registers the `render` queue and
 * wires the worker + orchestrator (RenderRunner -> ClipRenderer -> TTS + Remotion)
 * + the ideation client.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.RENDER }), TtsModule],
  providers: [RenderProcessor, RenderRunner, IdeationClient, RemotionService],
})
export class RenderModule {}
