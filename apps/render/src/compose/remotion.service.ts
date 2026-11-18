import { existsSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

import { Confidence, VisualSpec } from '@shortsmith/shared';

import { SectionWord } from '../tts/tts.interface';

export interface ComposeOptions {
  /** Absolute paths to background clips to cut between (muted, vertical). */
  backgroundClips: string[];
  /** Seconds each background clip shows before cutting to the next. */
  cutSeconds: number;
  /** Absolute path to the voiceover audio. */
  audioPath: string;
  /** Word-by-word caption timings (from the TTS). */
  words: SectionWord[];
  /** Voiceover length — drives the composition duration. */
  durationSec: number;
  /** Top-half subject graphic (ADR-027/028). */
  visual: VisualSpec;
  /** On-screen source citation. */
  source: string;
  /** Confidence badge (ADR-005/015). */
  confidence: Confidence;
  /** Launch countdown; <= 0 hides it. */
  daysUntilLaunch: number;
  /** B-roll images (+ optional emoji) and when each appears (seconds). */
  imageBeats: { localPath: string; startSec: number; emojiLocalPath?: string }[];
  /** Thumbnail overlay text (from the publish package). */
  thumbnailText: string;
  /** Absolute output path for the video (.mp4). */
  outputVideo: string;
  /** Absolute output path for the thumbnail (.jpg). */
  outputThumb: string;
  /** Brand icon + wordmark (absolute paths) stamped on the thumbnail. */
  logoPath?: string;
  wordmarkPath?: string;
  captionColor?: string;
  accentColor?: string;
  /** System Chrome path; if unset, Remotion downloads its own headless browser. */
  browserExecutable?: string;
}

/**
 * Renders the Remotion compositions (ADR-021/023/025). Per render we stage the
 * chosen clip + voiceover into a temp public dir, bundle the Remotion project
 * against it, then render the Short (video) and the Thumbnail (still). Rendering
 * is serial (2-3 clips/day), so a per-render bundle is fine.
 */
@Injectable()
export class RemotionService {
  // dist/compose -> ../../remotion/index.ts = apps/render/remotion/index.ts (TS source).
  private readonly entryPoint = resolve(__dirname, '..', '..', 'remotion', 'index.ts');

  async compose(opts: ComposeOptions): Promise<{ video: string; thumbnail: string }> {
    const publicDir = await fs.mkdtemp(join(tmpdir(), 'render-remotion-'));
    try {
      await Promise.all(
        opts.backgroundClips.map((clip, i) => fs.copyFile(clip, join(publicDir, `bg${i}.mp4`))),
      );
      await fs.copyFile(opts.audioPath, join(publicDir, 'vo.mp3'));
      // Stage the brand icon + wordmark for the thumbnail (optional — skipped if absent).
      let logoSrc: string | undefined;
      let wordmarkSrc: string | undefined;
      if (opts.logoPath && existsSync(opts.logoPath)) {
        await fs.copyFile(opts.logoPath, join(publicDir, 'logo.png'));
        logoSrc = 'logo.png';
      }
      if (opts.wordmarkPath && existsSync(opts.wordmarkPath)) {
        await fs.copyFile(opts.wordmarkPath, join(publicDir, 'wordmark.png'));
        wordmarkSrc = 'wordmark.png';
      }
      const imageBeats = await Promise.all(
        opts.imageBeats.map(async (b, i) => {
          const name = `img${i}${extname(b.localPath) || '.jpg'}`;
          await fs.copyFile(b.localPath, join(publicDir, name));
          let emoji: string | undefined;
          if (b.emojiLocalPath) {
            emoji = `emoji${i}.svg`;
            await fs.copyFile(b.emojiLocalPath, join(publicDir, emoji));
          }
          return { src: name, startSec: b.startSec, emoji };
        }),
      );

      console.error('[render] bundling Remotion project…');
      const serveUrl = await bundle({ entryPoint: this.entryPoint, publicDir });
      console.error('[render] bundle ok → launching Chrome + rendering…');
      // Use a configured or installed Chrome. Without one Remotion downloads its
      // own headless Chromium on first run — a GitHub fetch the dev sandbox blocks,
      // which hangs the render forever. Falling back to the installed browser keeps
      // rendering offline-safe (null only if truly none is found → Remotion's download).
      const browserExecutable = opts.browserExecutable || findSystemChrome() || null;

      const shortProps = {
        backgroundSrcs: opts.backgroundClips.map((_, i) => `bg${i}.mp4`),
        cutSeconds: opts.cutSeconds,
        audioSrc: 'vo.mp3',
        words: opts.words,
        durationSec: opts.durationSec,
        captionColor: opts.captionColor ?? '#ffffff',
        accentColor: opts.accentColor ?? '#ff1e9c',
        visual: opts.visual,
        kicker: opts.thumbnailText,
        source: opts.source,
        confidence: opts.confidence,
        daysUntilLaunch: opts.daysUntilLaunch,
        imageBeats,
      };
      const short = await selectComposition({ serveUrl, id: 'Short', inputProps: shortProps });
      await renderMedia({
        composition: short,
        serveUrl,
        codec: 'h264',
        // Remotion's default CRF (18) produces very large files — a ~40s Short came
        // out at 52 MB, over Telegram's 50 MB bot-upload cap. CRF 24 is visually
        // fine for a mobile Short and keeps clips comfortably under the limit.
        crf: 24,
        outputLocation: opts.outputVideo,
        inputProps: shortProps,
        browserExecutable,
        // Optional throttle for a loaded laptop; unset = Remotion's default (fast).
        ...(process.env.REMOTION_CONCURRENCY
          ? { concurrency: Number(process.env.REMOTION_CONCURRENCY) || 1 }
          : {}),
        onProgress: ({ renderedFrames, encodedFrames }) => {
          if (renderedFrames % 30 === 0) {
            process.stdout.write(`  frames ${renderedFrames} rendered / ${encodedFrames} encoded\r`);
          }
        },
      });

      const thumbProps = {
        backgroundSrc: 'bg0.mp4',
        text: opts.thumbnailText,
        accentColor: opts.accentColor ?? '#ff1e9c',
        confidence: opts.confidence,
        daysUntilLaunch: opts.daysUntilLaunch,
        logoSrc,
        wordmarkSrc,
      };
      const thumb = await selectComposition({ serveUrl, id: 'Thumbnail', inputProps: thumbProps });
      await renderStill({
        composition: thumb,
        serveUrl,
        output: opts.outputThumb,
        inputProps: thumbProps,
        imageFormat: 'jpeg',
        jpegQuality: 90,
        // A frame a bit into the clip (more dynamic than the first frame).
        frame: Math.min(30, Math.max(0, thumb.durationInFrames - 1)),
        browserExecutable,
      });

      return { video: opts.outputVideo, thumbnail: opts.outputThumb };
    } finally {
      await fs.rm(publicDir, { recursive: true, force: true });
    }
  }
}

/**
 * First installed Chrome/Edge found at a well-known path for the platform, or
 * null. Lets Remotion render with a browser that's already on disk instead of
 * downloading its own (which the dev sandbox blocks). Override with REMOTION_CHROME.
 */
export function findSystemChrome(): string | null {
  const candidates =
    process.platform === 'win32'
      ? [
          `${process.env['PROGRAMFILES'] ?? 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env['LOCALAPPDATA'] ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`,
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/microsoft-edge'];
  return candidates.find((p) => p && existsSync(p)) ?? null;
}
