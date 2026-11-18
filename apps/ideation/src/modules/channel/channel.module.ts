import { Module } from '@nestjs/common';

import { ChannelController } from './channel.controller';
import { ChannelService } from './channel.service';

/** Channel config API (setup wizard). PrismaModule is global, so nothing to import. */
@Module({
  controllers: [ChannelController],
  providers: [ChannelService],
  exports: [ChannelService],
})
export class ChannelModule {}
