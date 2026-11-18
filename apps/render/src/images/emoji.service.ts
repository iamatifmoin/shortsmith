import { promises as fs } from 'node:fs';
import { join } from 'node:path';

/**
 * Fetches + caches Twemoji SVGs for a given emoji (ADR-027). We use Twemoji (not
 * a system emoji font) because headless Chrome can't be trusted to render color
 * emoji. On-demand + cached, so any emoji the generation picks just works.
 */
export class EmojiService {
  constructor(private readonly cacheDir: string) {}

  /** Local path to the emoji's SVG, or null. Never throws. */
  async get(emoji: string): Promise<string | null> {
    try {
      const code = toCodepoints(emoji);
      if (!code) return null;
      await fs.mkdir(this.cacheDir, { recursive: true });
      const path = join(this.cacheDir, `${code}.svg`);
      try {
        await fs.access(path);
        return path;
      } catch {
        /* not cached */
      }
      const res = await fetch(`https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${code}.svg`);
      if (!res.ok) return null;
      await fs.writeFile(path, Buffer.from(await res.arrayBuffer()));
      return path;
    } catch {
      return null;
    }
  }
}

/** Twemoji filename: hex codepoints joined by '-', with the FE0F selector dropped. */
function toCodepoints(str: string): string | null {
  const cps = Array.from(str)
    .map((c) => c.codePointAt(0) ?? 0)
    .filter((cp) => cp && cp !== 0xfe0f);
  return cps.length ? cps.map((cp) => cp.toString(16)).join('-') : null;
}
