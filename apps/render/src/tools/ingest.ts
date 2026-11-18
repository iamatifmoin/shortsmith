/**
 * Footage ingestion CLI (ADR-024). Crops a long landscape source to 9:16, strips
 * audio, slices it into a pool of short vertical clips, and logs provenance.
 *
 * Usage (from repo root):
 *   pnpm --filter @shortsmith/render build
 *   pnpm --filter @shortsmith/render ingest -- --file "C:\clips\mc.mp4" --source-url "https://youtu.be/..."
 *   pnpm render:ingest --file "..." --game minecraft --clip-seconds 30 [--delete-source]
 *
 * We NEVER download from YouTube — --source-url is recorded + license-checked only.
 */
import { config as loadEnv } from 'dotenv';
import { join, resolve } from 'node:path';

import { IngestService } from '../ingest/ingest.service';

loadEnv();
loadEnv({ path: join(process.cwd(), '../../.env') });

async function main(): Promise<void> {
  const file = arg('file');
  if (!file) {
    console.error(
      'usage: ingest --file <path> [--source-url <youtube>] [--game minecraft] ' +
        '[--clip-seconds 30] [--assets-dir ./assets] [--delete-source]',
    );
    process.exit(1);
    return;
  }

  const opts = {
    file: resolve(file),
    sourceUrl: arg('source-url'),
    game: arg('game') ?? 'minecraft',
    clipSeconds: Number(arg('clip-seconds') ?? '30'),
    assetsDir: resolve(arg('assets-dir') ?? process.env.ASSETS_DIR ?? './assets'),
    deleteSource: flag('delete-source'),
  };

  console.log(`ingesting ${opts.file} -> ${opts.game} (~${opts.clipSeconds}s clips)…`);
  const res = await new IngestService().ingest(opts);

  console.log('\n--- ingest ---');
  console.log(`source : ${res.source.width}x${res.source.height}, ${res.source.durationSec.toFixed(0)}s`);
  if (res.license) {
    console.log(`license: ${res.license.label}`);
    if (res.license.reuseAllowed === false) {
      console.warn('⚠️  Standard YouTube License — only use if this is YOUR OWN capture (ADR-024).');
    }
  }
  console.log(`clips  : ${res.clips.length} in ${res.outDir}`);
  res.clips.slice(0, 5).forEach((c) => console.log(`   ${c}`));
  if (res.clips.length > 5) console.log(`   … and ${res.clips.length - 5} more`);
  if (opts.deleteSource) console.log('source deleted (--delete-source).');
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

main().catch((err) => {
  console.error('ingest failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
