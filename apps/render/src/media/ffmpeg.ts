import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

/**
 * ffmpeg binary. Uses `ffmpeg` on PATH by default (the dev machine has a full
 * build), overridable via FFMPEG_PATH. We don't bundle a binary — one less
 * large download and the system build is current.
 */
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

/** Run ffmpeg; reject with its stderr tail on a non-zero exit. */
export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${tail(stderr)}`)),
    );
  });
}

/**
 * Duration of a media file in seconds. Uses ffmpeg itself (not ffprobe) so we
 * only depend on ffmpeg-static: `ffmpeg -i <file>` prints "Duration:" to stderr
 * and exits non-zero (no output specified), which we parse.
 */
export function probeDurationSec(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, ['-i', file]);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return reject(new Error(`could not read duration of ${file}: ${tail(stderr)}`));
      resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    });
  });
}

/**
 * Concatenate audio segments into one mp3, inserting `gapSec` of silence between
 * consecutive segments. Every input is normalized to mono 44.1kHz first, so the
 * concat is clean regardless of each input's exact format.
 */
export function concatAudioWithSilence(
  segments: string[],
  gapSec: number,
  outPath: string,
): Promise<void> {
  if (segments.length === 0) throw new Error('concatAudioWithSilence: no segments');
  const inputs = segments.flatMap((s) => ['-i', s]);
  const n = segments.length;
  const prep: string[] = [];
  const labels: string[] = [];
  segments.forEach((_, i) => {
    const pad = i < n - 1 ? `,apad=pad_dur=${gapSec}` : '';
    prep.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=mono${pad}[a${i}]`);
    labels.push(`[a${i}]`);
  });
  const filter = `${prep.join(';')};${labels.join('')}concat=n=${n}:v=0:a=1[out]`;
  return runFfmpeg([
    '-y',
    ...inputs,
    '-filter_complex',
    filter,
    '-map',
    '[out]',
    '-c:a',
    'libmp3lame',
    '-q:a',
    '4',
    outPath,
  ]);
}

/** Basic probe of a video: pixel dimensions + duration (parsed from ffmpeg -i). */
export function probeVideo(file: string): Promise<{ width: number; height: number; durationSec: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, ['-i', file]);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', () => {
      const dim = stderr.match(/,\s*(\d{2,5})x(\d{2,5})/);
      const dur = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!dim || !dur) return reject(new Error(`could not probe ${file}: ${tail(stderr)}`));
      resolve({
        width: Number(dim[1]),
        height: Number(dim[2]),
        durationSec: Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]),
      });
    });
  });
}

/**
 * Crop + slice a source video into muted, vertical (1080x1920 @30fps) clips of
 * ~clipSeconds each, written to outDir as `<prefix>-NNN.mp4` (ADR-024). Landscape
 * sources get a centered 9:16 crop; already-vertical sources are just scaled to
 * frame. Audio is always stripped. Returns the produced clip paths.
 */
export async function sliceToVerticalClips(
  input: string,
  outDir: string,
  prefix: string,
  clipSeconds: number,
): Promise<string[]> {
  await fs.mkdir(outDir, { recursive: true });
  const { width, height, durationSec } = await probeVideo(input);

  // Center-crop wider-than-9:16 sources to a vertical slice, then normalize to
  // 1080x1920. trunc(..*../2)*2 keeps the crop width even for yuv420p.
  const vf =
    width / height > 9 / 16 + 1e-3
      ? 'crop=trunc(ih*9/16/2)*2:ih,scale=1080:1920,setsar=1,fps=30'
      : 'scale=1080:1920,setsar=1,fps=30';

  // Trim into fixed-length clips (predictable, unlike the segment muxer which
  // cuts at encoder keyframes). A trailing remainder under 5s is dropped.
  const full = Math.floor(durationSec / clipSeconds);
  const remainder = durationSec - full * clipSeconds;
  const count = Math.max(1, full + (full === 0 || remainder >= 5 ? 1 : 0));

  const clips: string[] = [];
  for (let i = 0; i < count; i++) {
    const out = join(outDir, `${prefix}-${String(i).padStart(3, '0')}.mp4`);
    await runFfmpeg([
      '-y',
      '-ss', String(i * clipSeconds), // fast seek (before -i)
      '-i', input,
      '-t', String(clipSeconds),
      '-vf', vf,
      '-an', // strip audio (muted background, ADR-024)
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      out,
    ]);
    clips.push(out);
  }
  return clips;
}

function tail(s: string, lines = 6): string {
  return s.trim().split('\n').slice(-lines).join('\n');
}
