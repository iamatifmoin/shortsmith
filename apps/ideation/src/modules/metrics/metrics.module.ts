import { Module } from '@nestjs/common';

import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { PerformanceService } from './performance.service';

/**
 * Metrics + performance feedback (ADR-020). Exports PerformanceService so the
 * generate stage can read the learned signal and steer hook scoring.
 */
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, PerformanceService],
  exports: [PerformanceService],
})
export class MetricsModule {}
