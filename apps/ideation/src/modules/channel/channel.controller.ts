import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';

import {
  ChannelConfigInput,
  ChannelConfigResponse,
  ChannelService,
  ConnectionsStatus,
  SourceInput,
  SourceRow,
} from './channel.service';

/**
 * Channel config API consumed by the setup wizard (apps/web). Exposes the single
 * ACTIVE channel's config + its sources. See docs/architecture.md (onboarding).
 */
@Controller('channel')
export class ChannelController {
  constructor(private readonly channel: ChannelService) {}

  /** GET /channel — the active channel config (+ sources), or null if unset. */
  @Get()
  get(): Promise<ChannelConfigResponse | null> {
    return this.channel.getActive();
  }

  /** PUT /channel — create the channel (first run) or update the active one. */
  @Put()
  upsert(@Body() dto: ChannelConfigInput): Promise<ChannelConfigResponse> {
    return this.channel.upsert(dto);
  }

  /** GET /channel/connections — which integrations are configured (booleans only). */
  @Get('connections')
  connections(): ConnectionsStatus {
    return this.channel.connections();
  }

  /** GET /channel/sources — sources for the active channel. */
  @Get('sources')
  listSources(): Promise<SourceRow[]> {
    return this.channel.listSources();
  }

  /** POST /channel/sources — add or update (by key) a source. */
  @Post('sources')
  addSource(@Body() dto: SourceInput): Promise<SourceRow> {
    return this.channel.addSource(dto);
  }

  /** DELETE /channel/sources/:id — remove a source. */
  @Delete('sources/:id')
  deleteSource(@Param('id') id: string): Promise<void> {
    return this.channel.deleteSource(id);
  }
}
