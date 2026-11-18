/**
 * TTS smoke test — synthesize a sample hook/body/cta through the real ElevenLabs
 * provider and print the output path, duration, and word timings. Validates the
 * step-3 integration end to end (API -> timestamps -> ffmpeg stitch).
 *
 * Usage (from repo root):
 *   pnpm --filter @shortsmith/render build
 *   pnpm --filter @shortsmith/render tts:smoke
 *   pnpm --filter @shortsmith/render tts:smoke -- "hook text" "body text" "cta text"
 *
 * Spends a small amount of ElevenLabs credit (a few hundred characters on Flash).
 */
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { ScriptExport } from '@shortsmith/shared';

import { ElevenLabsProvider } from '../tts/elevenlabs.provider';
import { TtsService } from '../tts/tts.service';

// render/.env first (cwd), then repo-root .env as a fallback (dotenv does not
// override already-set vars, so render/.env wins).
loadEnv();
loadEnv({ path: join(process.cwd(), '../../.env') });

async function main(): Promise<void> {
  const [hook, body, cta] = sample();

  const provider = new ElevenLabsProvider({
    apiKey: process.env.ELEVENLABS_API_KEY ?? '',
    voiceId: process.env.ELEVENLABS_VOICE_ID ?? 'WZlYpi1yf6zJhNWXih74',
    modelId: process.env.ELEVENLABS_MODEL_ID ?? 'eleven_turbo_v2_5',
  });
  const tts = new TtsService(provider, {
    cacheDir: join(process.cwd(), 'out', '.tts-cache'),
  });

  const script = {
    seriesKey: 'smoke',
    hook,
    body,
    cta,
    claims: [],
    estDurationSec: 0,
  } as ScriptExport;

  console.log('synthesizing (voice %s)…', provider.voiceId);
  const vo = await tts.synthesizeScript(script);

  console.log('\n--- voiceover ---');
  console.log('audio      :', vo.audioPath);
  console.log('duration   :', vo.durationSec.toFixed(2), 's');
  console.log('voiceId    :', vo.voiceId);
  console.log('sections   :', vo.sections.map((s) => `${s.section} ${s.start.toFixed(2)}–${s.end.toFixed(2)}s`).join(' | '));
  console.log('words      :', vo.words.length);
  console.log('first words:');
  for (const w of vo.words.slice(0, 10)) {
    console.log(`  [${w.section}] ${w.start.toFixed(2)}–${w.end.toFixed(2)}  ${w.word}`);
  }
}

/** CLI args after `--`, else a built-in sample. */
function sample(): [string, string, string] {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  if (args.length >= 3) return [args[0], args[1], args[2]];
  return [
    'The map is way bigger than anyone expected.',
    'Leaks point to two cities, a full countryside between them, and interiors you can actually walk into. That is a generational jump for an open world.',
    'Follow for daily updates.',
  ];
}

main().catch((err) => {
  console.error('tts smoke failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
