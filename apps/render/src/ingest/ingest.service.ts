import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';

import { probeVideo, sliceToVerticalClips } from '../media/ffmpeg';
import { checkYouTubeLicense, YouTubeLicense } from './youtube';

export interface IngestOptions {
  /** Path to the source video (muted landscape, per ADR-024). */
  file: string;
  /** YouTube URL recorded as provenance + license-checked (NOT downloaded). */
  sourceUrl?: string;
  /** Background game / pool, becomes the subfolder, e.g. "minecraft". */
  game: string;
  /** Target clip length in seconds (~25–40). */
  clipSeconds: number;
  /** assets/ root (backgrounds/<game>/ live under here). */
  assetsDir: string;
  /** Delete the big source file after slicing (opt-in; disk-friendly). */
  deleteSource: boolean;
}

export interface IngestResult {
  clips: string[];
  outDir: string;
  source: { file: string; width: number; height: number; durationSec: number };
  license: YouTubeLicense | null;
}

/**
 * Footage ingestion (ADR-024): take one long landscape source, crop to 9:16,
 * strip audio, slice it into a pool of short vertical clips, and log provenance.
 * We never download from YouTube — any URL is only read for its license.
 */
export class IngestService {
  async ingest(opts: IngestOptions): Promise<IngestResult> {
    await fs.access(opts.file).catch(() => {
      throw new Error(`source file not found: ${opts.file}`);
    });

    const info = await probeVideo(opts.file);
    const license = opts.sourceUrl ? await checkYouTubeLicense(opts.sourceUrl) : null;

    const outDir = join(opts.assetsDir, 'backgrounds', opts.game);
    const prefix = `${opts.game}-${shortId(opts.file, info.durationSec)}`;
    const clips = await sliceToVerticalClips(opts.file, outDir, prefix, opts.clipSeconds);

    await this.appendProvenance(opts, info, clips.length, license);

    if (opts.deleteSource) await fs.rm(opts.file, { force: true });

    return { clips, outDir, source: { file: opts.file, ...info }, license };
  }

  /** Append a row to assets/backgrounds/LICENSES.md (creating the log section once). */
  private async appendProvenance(
    opts: IngestOptions,
    info: { width: number; height: number; durationSec: number },
    clipCount: number,
    license: YouTubeLicense | null,
  ): Promise<void> {
    const licensesPath = join(opts.assetsDir, 'backgrounds', 'LICENSES.md');
    const date = new Date().toISOString().slice(0, 10);
    const lic = license ? license.label : 'operator-provided (no URL) — confirm rights';
    const row = `| ${opts.game} | ${basename(opts.file)} (${info.width}x${info.height}) | ${
      opts.sourceUrl ?? '—'
    } | ${lic} | ${clipCount} | ${date} |`;

    let existing = '';
    try {
      existing = await fs.readFile(licensesPath, 'utf8');
    } catch {
      /* file may not exist yet */
    }
    const header =
      '\n## Ingest log (auto-appended)\n\n' +
      '| game | source (file + src res) | url | license (advisory) | clips | date |\n' +
      '|------|-------------------------|-----|--------------------|-------|------|\n';
    const block = existing.includes('## Ingest log') ? `${row}\n` : `${header}${row}\n`;
    await fs.mkdir(join(opts.assetsDir, 'backgrounds'), { recursive: true });
    await fs.appendFile(licensesPath, block);
  }
}

/** Short stable id from the source path + duration, for clip filenames. */
function shortId(file: string, durationSec: number): string {
  return createHash('sha256')
    .update(`${basename(file)}:${Math.round(durationSec)}`)
    .digest('hex')
    .slice(0, 8);
}
