import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUES } from '../../constants';
import { HarvestService } from './harvest.service';
import { HarvestProcessor } from './harvest.processor';
import { HarvestController } from './harvest.controller';

@Module({
  // HARVEST for the worker + the on-demand trigger; EXTRACT so the processor can
  // enqueue the next stage; RANK + GENERATE are read-only here for GET
  // /harvest/status (the fetch-progress loader), which counts jobs per stage.
  imports: [
    BullModule.registerQueue(
      { name: QUEUES.HARVEST },
      { name: QUEUES.EXTRACT },
      { name: QUEUES.RANK },
      { name: QUEUES.GENERATE },
    ),
  ],
  controllers: [HarvestController],
  providers: [HarvestService, HarvestProcessor],
  exports: [HarvestService, BullModule],
})
export class HarvestModule {}
