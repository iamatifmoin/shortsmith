import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PublishTaskView } from '@shortsmith/shared';

import { PublishService } from './publish.service';

/**
 * Publish-queue API for Human Gate 2 (Phase 4, ADR-032). The dashboard lists
 * clips awaiting scheduling and triggers the per-clip actions; confirming a clip
 * can also happen via the Telegram `Scheduled` reply (ADR-033).
 */
@Controller('publish')
export class PublishController {
  constructor(private readonly publish: PublishService) {}

  /** GET /publish/tasks — clips awaiting / past Gate 2 (slot order). */
  @Get('tasks')
  tasks(@Query('limit') limit?: string): Promise<PublishTaskView[]> {
    return this.publish.listTasks(limit ? Number(limit) : undefined);
  }

  /** POST /publish/tasks/:id/scheduled — confirm a clip was scheduled (dashboard). */
  @Post('tasks/:id/scheduled')
  scheduled(@Param('id') id: string): Promise<void> {
    return this.publish.markScheduled(id, 'dashboard');
  }

  /** POST /publish/tasks/:id/redo — re-render the same script (new take, cached VO). */
  @Post('tasks/:id/redo')
  redo(@Param('id') id: string): Promise<void> {
    return this.publish.redo(id);
  }

  /** POST /publish/tasks/:id/reject — drop this clip, free its slot, reject the script. */
  @Post('tasks/:id/reject')
  reject(@Param('id') id: string): Promise<void> {
    return this.publish.rejectClip(id);
  }
}
