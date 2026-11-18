import { Body, Controller, Get, Header, Param, Patch, Post } from '@nestjs/common';
import { ReviewSelection } from '@shortsmith/shared';

import { EditScriptDto, RejectScriptDto, ReviewService } from './review.service';
import { REVIEW_UI_HTML } from './review.ui';

/** Body for staging a pending Gate-1 choice (ADR-031). `selection: null` clears it. */
export interface SelectScriptDto {
  selection: ReviewSelection | null;
}

/**
 * REST API + bare-bones UI for HUMAN GATE 1 — script review. The apps/web
 * dashboard (later) will consume the same JSON endpoints.
 * See docs/architecture.md#5-review--human-gate-1.
 */
@Controller('review')
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  /** GET /review/ui — the bare-bones operator review screen. */
  @Get('ui')
  @Header('Content-Type', 'text/html; charset=utf-8')
  ui(): string {
    return REVIEW_UI_HTML;
  }

  /** GET /review/queue — DRAFT scripts sorted by hook score, with receipts + flags. */
  @Get('queue')
  listQueue(): Promise<unknown[]> {
    return this.review.listQueue();
  }

  /** GET /review/approved — APPROVED scripts as the export contract (handoff). */
  @Get('approved')
  approved() {
    return this.review.approvedExports();
  }

  /** GET /review/capacity — remaining approval capacity per active series (ADR-031). */
  @Get('capacity')
  capacity() {
    return this.review.capacities();
  }

  /** POST /review/:id/select — stage a pending approve/reject choice (ADR-031). */
  @Post(':id/select')
  select(@Param('id') id: string, @Body() dto: SelectScriptDto): Promise<void> {
    return this.review.select(id, dto.selection ?? null);
  }

  /** POST /review/commit — commit all staged choices (the Render button, ADR-031). */
  @Post('commit')
  commit() {
    return this.review.commit();
  }

  /** GET /review/:id/export — one APPROVED script as the export contract (render fetches this). */
  @Get(':id/export')
  exportById(@Param('id') id: string) {
    return this.review.exportById(id);
  }

  /** POST /review/:id/approve — approve a script. */
  @Post(':id/approve')
  approve(@Param('id') id: string): Promise<void> {
    return this.review.approve(id);
  }

  /** PATCH /review/:id — edit a script before approving. */
  @Patch(':id')
  edit(@Param('id') id: string, @Body() dto: EditScriptDto): Promise<void> {
    return this.review.edit(id, dto);
  }

  /** POST /review/:id/reject — reject; may flag the FactUnit out of rotation. */
  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectScriptDto): Promise<void> {
    return this.review.reject(id, dto);
  }
}
