import { ImageHit, ImageProvider } from './image.interface';

interface UnsplashPhoto {
  urls?: { regular?: string; full?: string };
  links?: { html?: string; download_location?: string };
  user?: { name?: string };
  alt_description?: string;
  description?: string;
}

/**
 * Unsplash image search (keyed). Pro-quality photos. Per Unsplash's API
 * guidelines we trigger the download endpoint when a photo is used and capture a
 * "Photo by X on Unsplash" attribution for the video description.
 */
export class UnsplashProvider implements ImageProvider {
  readonly name = 'unsplash';

  constructor(private readonly accessKey: string) {}

  async search(query: string): Promise<ImageHit | null> {
    if (!this.accessKey) throw new Error('Unsplash: UNSPLASH_ACCESS_KEY is not set');
    const url =
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}` +
      `&per_page=6&orientation=landscape&content_filter=high`;
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${this.accessKey}`, 'Accept-Version': 'v1' },
    });
    if (!res.ok) throw new Error(`Unsplash ${res.status}: ${(await res.text()).slice(0, 150)}`);
    const data = (await res.json()) as { results?: UnsplashPhoto[] };
    const photo = pickBest(data.results ?? [], query);
    const src = photo?.urls?.regular ?? photo?.urls?.full;
    if (!src) return null;

    // Required by the Unsplash API guidelines when a photo is used (best-effort).
    if (photo?.links?.download_location) {
      void fetch(photo.links.download_location, {
        headers: { Authorization: `Client-ID ${this.accessKey}` },
      }).catch(() => undefined);
    }

    return {
      url: src,
      sourceUrl: photo?.links?.html ?? src,
      license: 'Unsplash License',
      attribution: `Photo by ${photo?.user?.name ?? 'Unknown'} on Unsplash`,
      provider: this.name,
    };
  }
}

/** Prefer the result whose description best matches the query terms. */
function pickBest(results: UnsplashPhoto[], query: string): UnsplashPhoto | null {
  if (!results.length) return null;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  let best = results[0];
  let bestScore = -1;
  for (const r of results) {
    const text = `${r.alt_description ?? ''} ${r.description ?? ''}`.toLowerCase();
    const score = terms.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}
