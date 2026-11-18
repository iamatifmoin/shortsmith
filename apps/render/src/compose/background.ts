import { promises as fs } from 'node:fs';
import { join } from 'node:path';

/**
 * Pick a random background clip from the pool for a game (ADR-024). Clips are the
 * muted vertical outputs of `ingest`. Throws if the pool is empty.
 */
export async function pickRandomClip(assetsDir: string, game: string): Promise<string> {
  const dir = join(assetsDir, 'backgrounds', game);
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.mp4'));
  } catch {
    throw new Error(`no background folder ${dir} — run \`ingest\` first`);
  }
  if (files.length === 0) throw new Error(`no background clips in ${dir} — run \`ingest\` first`);
  return join(dir, files[Math.floor(Math.random() * files.length)]);
}

/**
 * Pick `count` clips for quick cuts (ADR-027). Shuffles the pool and cycles if the
 * pool is smaller than count. Distinct where possible so cuts feel varied.
 */
export async function pickClips(assetsDir: string, game: string, count: number): Promise<string[]> {
  const dir = join(assetsDir, 'backgrounds', game);
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.mp4'));
  } catch {
    throw new Error(`no background folder ${dir} — run \`ingest\` first`);
  }
  if (files.length === 0) throw new Error(`no background clips in ${dir} — run \`ingest\` first`);
  const shuffled = [...files].sort(() => Math.random() - 0.5);
  return Array.from({ length: Math.max(1, count) }, (_, i) => join(dir, shuffled[i % shuffled.length]));
}
