/**
 * Thumbnail preview CLI — render ONE Thumbnail still for a given background clip
 * and headline, with the full brand treatment (icon + wordmark + trust pill +
 * countdown). Used to iterate on the thumbnail design without a full video render.
 *
 *   pnpm --filter @shortsmith/render build
 *   pnpm --filter @shortsmith/render thumb:preview -- \
 *     --video assets/backgrounds/minecraft/minecraft-xxxx-000.mp4 \
 *     --text "Meet Jason & Lucia" --out out/thumb-1.png --days 10 --confidence CONFIRMED
 */
import { existsSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

import { findSystemChrome } from '../compose/remotion.service';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const video = arg('video');
  const text = arg('text');
  const out = arg('out');
  if (!video || !text || !out) {
    console.error(
      'usage: thumb:preview --video <clip.mp4> --text "Headline" --out <file.png> ' +
        '[--days 10] [--confidence CONFIRMED|STRONG_RUMOR|RUMOR] [--accent #ff1e9c]',
    );
    process.exit(1);
    return;
  }
  const days = Number(arg('days') ?? '0');
  const confidence = arg('confidence') ?? 'CONFIRMED';
  const accent = arg('accent') ?? '#ff1e9c';

  const assetsDir = resolve(process.env.ASSETS_DIR ?? join(__dirname, '..', '..', 'assets'));
  const logo = join(assetsDir, 'brand', 'icon.png');
  const wordmark = join(assetsDir, 'brand', 'wordmark.png');
  const entryPoint = resolve(__dirname, '..', '..', 'remotion', 'index.ts');

  const publicDir = await fs.mkdtemp(join(tmpdir(), 'render-thumb-'));
  try {
    await fs.copyFile(resolve(video), join(publicDir, 'bg0.mp4'));
    let logoSrc: string | undefined;
    let wordmarkSrc: string | undefined;
    if (existsSync(logo)) {
      await fs.copyFile(logo, join(publicDir, 'logo.png'));
      logoSrc = 'logo.png';
    }
    if (existsSync(wordmark)) {
      await fs.copyFile(wordmark, join(publicDir, 'wordmark.png'));
      wordmarkSrc = 'wordmark.png';
    }

    console.error('[thumb] bundling…');
    const serveUrl = await bundle({ entryPoint, publicDir });
    const browserExecutable = process.env.REMOTION_CHROME || findSystemChrome() || undefined;

    const inputProps = {
      backgroundSrc: 'bg0.mp4',
      text: text.toUpperCase(),
      accentColor: accent,
      confidence,
      daysUntilLaunch: days,
      logoSrc,
      wordmarkSrc,
    };
    const comp = await selectComposition({ serveUrl, id: 'Thumbnail', inputProps });
    await fs.mkdir(resolve(out, '..'), { recursive: true });
    await renderStill({
      composition: comp,
      serveUrl,
      output: resolve(out),
      inputProps,
      imageFormat: 'png',
      frame: Math.min(30, Math.max(0, comp.durationInFrames - 1)),
      browserExecutable,
    });
    console.log(`wrote ${resolve(out)}`);
  } finally {
    await fs.rm(publicDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('thumb preview failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
