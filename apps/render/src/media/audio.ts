import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import { runFfmpeg } from './ffmpeg';
import { SfxPick } from './sfx.config';

/**
 * SFX (ADR-027): real, free, commercially-usable sound effects pinned to exact
 * Creative-Commons sources (see sfx.config.ts) and mixed low under the voiceover
 * at the beat changes — a whoosh on the first visual swap, a riser on the FOLLOW.
 * Each role is downloaded once, trimmed/normalized, and cached as `<role>.wav`, so
 * renders stay reproducible. If the download fails we fall back to a synthesized
 * tone so a render never breaks.
 */
export interface SfxResult {
  /** Local path to the normalized wav. */
  path: string;
  /** Credit string for the video description (empty for CC0 / synth). */
  credit: string;
}

/**
 * Resolve one SFX role to a local, normalized wav: use the cached clip if present,
 * else fetch the pinned source and trim/normalize it, else fall back to the synth.
 * Returns the path plus a credit string (empty when none owed).
 */
export async function getSfx(
  role: string,
  pick: SfxPick,
  dir: string,
  synth: (out: string) => Promise<void>,
): Promise<SfxResult> {
  await fs.mkdir(dir, { recursive: true });
  const out = join(dir, `${role}.wav`);
  const creditFile = join(dir, `${role}.credit.txt`);
  if (await exists(out)) {
    return { path: out, credit: (await readMaybe(creditFile)) ?? '' };
  }

  try {
    const res = await fetch(pick.url, { headers: { 'user-agent': 'content-pipeline/1.0' } });
    if (res.ok) {
      const tmp = join(dir, `${role}.src`);
      await fs.writeFile(tmp, Buffer.from(await res.arrayBuffer()));
      await processSfx(tmp, out);
      await fs.rm(tmp, { force: true });
      const credit = pick.attribution ? `${pick.title} — ${pick.attribution}` : '';
      await fs.writeFile(creditFile, credit);
      return { path: out, credit };
    }
  } catch {
    // fall through to the synth
  }

  await synth(out);
  await fs.writeFile(creditFile, '');
  return { path: out, credit: '' };
}

/** Trim a downloaded clip to a stinger: strip leading silence, cap length, normalize, stereo 44.1k. */
async function processSfx(src: string, out: string): Promise<void> {
  await runFfmpeg([
    '-y', '-i', src,
    '-t', '3',
    '-af',
    'silenceremove=start_periods=1:start_threshold=-50dB,' +
      'dynaudnorm=p=0.9:m=10,afade=t=out:st=2.7:d=0.3,alimiter=limit=0.95',
    '-ar', '44100', '-ac', '2',
    out,
  ]);
}

// --- Synth fallbacks (used only when nothing can be sourced) ---

/** A short band-limited pink-noise swell -> a soft "whoosh". */
export async function synthWhoosh(out: string): Promise<void> {
  await runFfmpeg([
    '-y', '-f', 'lavfi', '-i', 'anoisesrc=d=0.5:c=pink:a=0.9',
    '-af', 'highpass=f=450,lowpass=f=5000,afade=t=in:d=0.15,afade=t=out:st=0.22:d=0.28',
    '-ar', '44100', '-ac', '2', out,
  ]);
}

/** A low body + a band-limited noise transient -> a punchy "impact". */
export async function synthImpact(out: string): Promise<void> {
  await runFfmpeg([
    '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=170:duration=0.4',
    '-f', 'lavfi', '-i', 'anoisesrc=d=0.15:c=pink:a=0.9',
    '-filter_complex',
    '[0]afade=t=out:st=0.06:d=0.34[low];' +
      '[1]highpass=f=350,lowpass=f=2600,afade=t=out:st=0.02:d=0.13[hi];' +
      '[low][hi]amix=inputs=2:normalize=0:duration=longest,volume=2.2[out]',
    '-map', '[out]',
    '-ar', '44100', '-ac', '2', out,
  ]);
}

export interface SfxEvent {
  path: string;
  atSec: number;
  gain: number;
}

/**
 * Mix SFX events onto the voiceover at their times, keeping the voiceover's length.
 * With no events, the voiceover is copied through unchanged.
 */
export async function mixSfx(voiceover: string, events: SfxEvent[], outPath: string): Promise<void> {
  if (events.length === 0) {
    await fs.copyFile(voiceover, outPath);
    return;
  }
  const inputs = ['-i', voiceover, ...events.flatMap((e) => ['-i', e.path])];
  const filters = events.map((e, i) => {
    const ms = Math.max(0, Math.round(e.atSec * 1000));
    return `[${i + 1}]adelay=${ms}|${ms},volume=${e.gain}[s${i}]`;
  });
  const mix = `[0]${events.map((_, i) => `[s${i}]`).join('')}amix=inputs=${events.length + 1}:normalize=0:duration=first[a]`;
  await runFfmpeg([
    ...inputs,
    '-filter_complex', `${filters.join(';')};${mix}`,
    '-map', '[a]',
    '-ar', '44100',
    outPath,
  ]);
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readMaybe(p: string): Promise<string | null> {
  try {
    return (await fs.readFile(p, 'utf8')).trim();
  } catch {
    return null;
  }
}
