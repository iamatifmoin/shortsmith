import { Module } from '@nestjs/common';

import { RenderModule } from '../render/render.module';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  // RenderModule so approving a script can auto-enqueue a render (ADR-021).
  imports: [RenderModule],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
