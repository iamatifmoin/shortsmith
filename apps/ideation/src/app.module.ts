import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';
import { LlmModule } from './llm/llm.module';
import { ChannelModule } from './modules/channel/channel.module';
import { HarvestModule } from './modules/harvest/harvest.module';
import { ExtractModule } from './modules/extract/extract.module';
import { RankModule } from './modules/rank/rank.module';
import { GenerateModule } from './modules/generate/generate.module';
import { ReviewModule } from './modules/review/review.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { RenderModule } from './modules/render/render.module';
import { PublishModule } from './modules/publish/publish.module';

/**
 * Root module. Wires config, the BullMQ (Redis) connection, Prisma, and the
 * five pipeline stage modules. Stages are stubs in this scaffold — see
 * docs/architecture.md and CLAUDE.md ("Current status").
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379');
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            username: url.username || undefined,
            password: url.password || undefined,
            // Required for BullMQ workers; keeps the app booting if Redis is down.
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    PrismaModule,
    LlmModule,
    ChannelModule,
    HarvestModule,
    ExtractModule,
    RankModule,
    GenerateModule,
    ReviewModule,
    MetricsModule,
    RenderModule,
    PublishModule,
  ],
})
export class AppModule {}
