import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUES } from '../../constants';
import { GenerateService } from './generate.service';
import { GenerateProcessor } from './generate.processor';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.GENERATE }), MetricsModule],
  providers: [GenerateService, GenerateProcessor],
  exports: [GenerateService, BullModule],
})
export class GenerateModule {}
