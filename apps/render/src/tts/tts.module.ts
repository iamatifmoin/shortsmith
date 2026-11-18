import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ElevenLabsProvider } from './elevenlabs.provider';
import { ManualTtsProvider } from './manual.provider';
import { TtsService } from './tts.service';
import { TTS_PROVIDER, TtsProvider } from './tts.interface';

/**
 * Wires the selected TTS provider (via TTS_PROVIDER) and the TtsService for Nest
 * DI (ADR-022). The render worker imports this in a later step.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: TTS_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): TtsProvider => {
        const name = (config.get<string>('TTS_PROVIDER') ?? 'elevenlabs').toLowerCase();
        if (name === 'manual') return new ManualTtsProvider();
        return new ElevenLabsProvider({
          apiKey: config.get<string>('ELEVENLABS_API_KEY') ?? '',
          voiceId: config.get<string>('ELEVENLABS_VOICE_ID') ?? 'WZlYpi1yf6zJhNWXih74',
          modelId: config.get<string>('ELEVENLABS_MODEL_ID') ?? 'eleven_turbo_v2_5',
        });
      },
    },
    {
      provide: TtsService,
      inject: [TTS_PROVIDER, ConfigService],
      useFactory: (provider: TtsProvider, config: ConfigService) =>
        new TtsService(provider, {
          cacheDir:
            config.get<string>('TTS_CACHE_DIR') ??
            join(config.get<string>('OUTPUT_DIR') ?? './out', '.tts-cache'),
        }),
    },
  ],
  exports: [TtsService],
})
export class TtsModule {}
