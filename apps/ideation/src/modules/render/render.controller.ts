import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { RenderJobView, RenderStatusUpdate } from '@shortsmith/shared';

import { RenderService } from './render.service';

/**
 * Render job API (Phase 3, ADR-021). The operator uses it to list / cancel
 * renders; the separate apps/render worker uses the status + cancellation
 * endpoints as its callback into ideation (which owns the RenderJob rows).
 */
@Controller('render')
export class RenderController {
  constructor(private readonly render: RenderService) {}

  /** GET /render/jobs — recent render jobs, newest first. */
  @Get('jobs')
  listJobs(): Promise<RenderJobView[]> {
    return this.render.listJobs();
  }

  /** GET /render/jobs/:id — one render job (the worker polls this for cancellation). */
  @Get('jobs/:id')
  async getJob(@Param('id') id: string): Promise<RenderJobView> {
    const job = await this.render.getJob(id);
    if (!job) throw new NotFoundException(`No render job ${id}`);
    return job;
  }

  /** POST /render/:scriptId/cancel — cancel the active render for a script. */
  @Post(':scriptId/cancel')
  cancel(@Param('scriptId') scriptId: string): Promise<void> {
    return this.render.cancel(scriptId);
  }

  /** POST /render/jobs/:id/status — status callback from the render worker. */
  @Post('jobs/:id/status')
  applyStatus(@Param('id') id: string, @Body() body: RenderStatusUpdate): Promise<void> {
    return this.render.applyStatus(id, body);
  }
}
