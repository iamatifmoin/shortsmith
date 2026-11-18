import { Module } from '@nestjs/common';

import { RenderModule } from '../render/render.module';
import { PublishController } from './publish.controller';
import { PublishService } from './publish.service';
import { TelegramService } from './telegram.service';

/**
 * Phase-4 publishing (ADR-030..034). Depends on RenderModule one way (for
 * Redo/Reject); the DONE->PublishTask step is a DB sweep, not a render callback,
 * so there's no circular dependency. PrismaModule is global; ConfigModule is
 * global (Telegram secrets come from env).
 */
@Module({
  imports: [RenderModule],
  controllers: [PublishController],
  providers: [PublishService, TelegramService],
})
export class PublishModule {}
