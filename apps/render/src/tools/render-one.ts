/**
 * Render one sample Short end to end (voiceover -> background cuts -> Remotion),
 * via the same ClipRenderer the pipeline uses. Validates the render path without
 * the full queue/HTTP loop.
 *
 * Usage (from repo root):
 *   pnpm --filter @shortsmith/render build
 *   pnpm render:one
 *
 * NOTE: the first render downloads a headless Chromium (one-time). Needs clips in
 * the pool (run `ingest` first).
 */
import { config as loadEnv } from 'dotenv';
import { join, resolve } from 'node:path';
import { ScriptExport } from '@shortsmith/shared';

import { ClipRenderer } from '../compose/clip-renderer';
import { RemotionService } from '../compose/remotion.service';
import { EmojiService } from '../images/emoji.service';
import { ImageService } from '../images/image.service';
import { createImageProvider } from '../images/provider.factory';
import { ElevenLabsProvider } from '../tts/elevenlabs.provider';
import { TtsService } from '../tts/tts.service';

loadEnv();
loadEnv({ path: join(process.cwd(), '../../.env') });

async function main(): Promise<void> {
  const assetsDir = resolve(process.env.ASSETS_DIR ?? './assets');
  const outDir = resolve(process.env.OUTPUT_DIR ?? './out');

  // A neutral finalized script + visual spec (shape generation emits), niche-agnostic.
  const script = {
    seriesKey: 'smoke',
    hook: 'This new phone camera is honestly ridiculous.',
    body:
      'The launch event confirmed a 200-megapixel main sensor, double the resolution of the ' +
      'previous model, so every shot keeps way more detail when you crop or zoom in.',
    cta: "Follow along, because I'm breaking down a new fact every single day.",
    claims: [],
    estDurationSec: 0,
    confidence: 'CONFIRMED',
    publish: {
      title: '',
      description: '',
      tags: [],
      hashtags: [],
      igCaption: '',
      thumbnailText: '200MP camera, double the detail',
      visual: {
        kind: 'comparison',
        title: 'Camera',
        a: { label: 'New phone', value: 200 },
        b: { label: 'Old model', value: 100 },
        unit: 'MP',
      },
      source: 'Launch Event',
      broll: [
        { term: 'camera', query: 'smartphone camera closeup', emoji: '📷' },
        { term: 'detail', query: 'city skyline sharp photo', emoji: '🏙️' },
        { term: 'phone', query: 'modern smartphone on desk', emoji: '📱' },
      ],
    },
  } as ScriptExport;

  const provider = new ElevenLabsProvider({
    apiKey: process.env.ELEVENLABS_API_KEY ?? '',
    voiceId: process.env.ELEVENLABS_VOICE_ID ?? 'WZlYpi1yf6zJhNWXih74',
    modelId: process.env.ELEVENLABS_MODEL_ID ?? 'eleven_turbo_v2_5',
  });
  const tts = new TtsService(provider, { cacheDir: join(outDir, '.tts-cache') });
  const images = new ImageService(createImageProvider(), join(assetsDir, 'images'));
  const emoji = new EmojiService(join(assetsDir, 'emoji'));
  const renderer = new ClipRenderer(tts, new RemotionService(), images, emoji, {
    assetsDir,
    outDir,
    cutSeconds: 2.5,
    game: 'minecraft',
    browserExecutable: process.env.REMOTION_CHROME,
  });

  console.log('rendering (first run downloads Chromium)…');
  const out = await renderer.render(script, 'short-sample');

  console.log('\ndone:');
  console.log('  video    :', out.videoPath, `(${out.durationSec.toFixed(1)}s)`);
  console.log('  thumbnail:', out.thumbnailPath);
  console.log('  clips    :', out.backgroundClips.length);
}

main().catch((err) => {
  console.error('render failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
