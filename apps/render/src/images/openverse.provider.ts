import { ImageHit, ImageProvider } from './image.interface';

interface OpenverseResult {
  url?: string;
  title?: string;
  foreign_landing_url?: string;
  license?: string;
  license_version?: string;
  attribution?: string;
}

/**
 * Openverse image search (keyless). Filtered to `license_type=commercial` so
 * results are commercially usable (CC0/PDM need no credit; CC-BY etc. do — we
 * capture the ready-made attribution string for the video description). Anonymous
 * use is rate-limited (~1 req/s), fine for our volume.
 */
export class OpenverseProvider implements ImageProvider {
  readonly name = 'openverse';

  async search(query: string): Promise<ImageHit | null> {
    const url =
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}` +
      `&license_type=commercial&page_size=10&mature=false&orientation=landscape`;
    const res = await fetch(url, {
      headers: { 'user-agent': 'content-pipeline/1.0 (render pipeline)', accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Openverse ${res.status}: ${(await res.text()).slice(0, 150)}`);
    const data = (await res.json()) as { results?: OpenverseResult[] };
    const hit = pickBest((data.results ?? []).filter((r) => r.url), query);
    if (!hit?.url) return null;
    const license = `${hit.license ?? ''} ${hit.license_version ?? ''}`.trim();
    // CC0 / public domain need no attribution; everything else gets a credit.
    const needsCredit = !/^(cc0|pdm)\b/i.test(license);
    return {
      url: hit.url,
      sourceUrl: hit.foreign_landing_url ?? hit.url,
      license: license || 'unknown',
      attribution: needsCredit ? (hit.attribution ?? '').replace(/\s+/g, ' ').trim() : '',
      provider: this.name,
    };
  }
}

/** Prefer the result whose title best matches the query terms (else the first). */
function pickBest(results: OpenverseResult[], query: string): OpenverseResult | null {
  if (!results.length) return null;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  let best = results[0];
  let bestScore = -1;
  for (const r of results) {
    const text = (r.title ?? '').toLowerCase();
    const score = terms.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}
