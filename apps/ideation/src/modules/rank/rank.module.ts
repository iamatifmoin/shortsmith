import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUES } from '../../constants';
import { RankService } from './rank.service';
import { RankProcessor } from './rank.processor';

@Module({
  // RANK for the worker; GENERATE so the processor can enqueue the next stage.
  imports: [BullModule.registerQueue({ name: QUEUES.RANK }, { name: QUEUES.GENERATE })],
  providers: [RankService, RankProcessor],
  exports: [RankService, BullModule],
})
export class RankModule {}
