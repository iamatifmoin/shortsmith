import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { RenderModule } from './render/render.module';

/**
 * Root module for the render service. Wires config and the BullMQ (Redis)
 * connection, then the render worker module. Mirrors apps/ideation's setup so
 * the two services share the same Redis conventions (ADR-011/021).
 */
@Module({
  imports: [
    // render/.env first, then the repo-root .env as a fallback (so the
    // ELEVENLABS_API_KEY already in the root .env is picked up). ADR-022.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
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
    RenderModule,
  ],
})
export class AppModule {}
