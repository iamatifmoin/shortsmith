import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { PerformanceInsights } from '@shortsmith/shared';

import { CreatePostDto, MetricsService, UpdatePostDto } from './metrics.service';
import { PerformanceService } from './performance.service';

/**
 * REST API for the manual-learning metrics loop (ADR-020). The apps/web
 * dashboard consumes these JSON endpoints. See docs/operations.md.
 */
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly performance: PerformanceService,
  ) {}

  /** GET /metrics/scripts — approved scripts + their recorded posts. */
  @Get('scripts')
  scripts(): Promise<unknown[]> {
    return this.metrics.listScripts();
  }

  /** GET /metrics/posts — all recorded posts, newest first. */
  @Get('posts')
  posts(): Promise<unknown[]> {
    return this.metrics.listPosts();
  }

  /** GET /metrics/insights — aggregated performance by angle / hook / confidence. */
  @Get('insights')
  insights(): Promise<PerformanceInsights> {
    return this.performance.getInsights();
  }

  /** POST /metrics/posts — record that an approved script was posted somewhere. */
  @Post('posts')
  create(@Body() dto: CreatePostDto) {
    return this.metrics.createPost(dto);
  }

  /** PATCH /metrics/posts/:id — update a post's performance numbers. */
  @Patch('posts/:id')
  update(@Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.metrics.updatePost(id, dto);
  }

  /** DELETE /metrics/posts/:id — remove a recorded post. */
  @Delete('posts/:id')
  remove(@Param('id') id: string): Promise<void> {
    return this.metrics.deletePost(id);
  }
}
