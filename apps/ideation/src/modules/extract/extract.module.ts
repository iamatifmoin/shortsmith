import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUES } from '../../constants';
import { ExtractService } from './extract.service';
import { ExtractProcessor } from './extract.processor';

@Module({
  // EXTRACT for the worker; RANK so the processor can enqueue the next stage.
  imports: [BullModule.registerQueue({ name: QUEUES.EXTRACT }, { name: QUEUES.RANK })],
  providers: [ExtractService, ExtractProcessor],
  exports: [ExtractService, BullModule],
})
export class ExtractModule {}
