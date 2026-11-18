import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import { ImageHit, ImageProvider } from './image.interface';

/**
 * Fetches + caches stock images for b-roll (ADR-027). `get(query)` returns a
 * local file path (downloading + caching on a miss), so the render can stage the
 * image into its public dir. Cached by provider + query, so concepts reused
 * across videos cost nothing after the first fetch.
 */
export class ImageService {
  constructor(
    private readonly provider: ImageProvider,
    private readonly cacheDir: string,
  ) {}

  /** Local path to an image for the query, or null if none found. Never throws. */
  async get(query: string): Promise<string | null> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      const key = createHash('sha256')
        .update(`${this.provider.name}:${query.toLowerCase().trim()}`)
        .digest('hex')
        .slice(0, 24);

      const cached = await this.findCached(key);
      if (cached) return cached;

      const hit = await this.provider.search(query);
      if (!hit) return null;
      return await this.download(hit, key);
    } catch {
      return null; // b-roll is best-effort; a miss falls back to graphics.
    }
  }

  private async download(hit: ImageHit, key: string): Promise<string | null> {
    const res = await fetch(hit.url, { headers: { 'user-agent': 'content-pipeline/1.0' } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = extFromType(res.headers.get('content-type')) ?? extFromUrl(hit.url) ?? 'jpg';
    const path = join(this.cacheDir, `${key}.${ext}`);
    await fs.writeFile(path, buf);
    return path;
  }

  private async findCached(key: string): Promise<string | null> {
    try {
      const f = (await fs.readdir(this.cacheDir)).find((n) => n.startsWith(`${key}.`));
      return f ? join(this.cacheDir, f) : null;
    } catch {
      return null;
    }
  }
}

function extFromType(ct: string | null): string | null {
  if (!ct) return null;
  if (ct.includes('jpeg')) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  return null;
}

function extFromUrl(url: string): string | null {
  const m = url.toLowerCase().match(/\.(jpg|jpeg|png|webp)(?:\?|$)/);
  return m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : null;
}
