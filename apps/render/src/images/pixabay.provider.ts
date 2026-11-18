import { ImageHit, ImageProvider } from './image.interface';

interface PixabayHit {
  largeImageURL?: string;
  webformatURL?: string;
  pageURL?: string;
}

/**
 * Pixabay image search (keyed). Pixabay Content License: commercial use, no
 * attribution required. Higher curation than Openverse; needs PIXABAY_API_KEY.
 */
export class PixabayProvider implements ImageProvider {
  readonly name = 'pixabay';

  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<ImageHit | null> {
    if (!this.apiKey) throw new Error('Pixabay: PIXABAY_API_KEY is not set');
    const url =
      `https://pixabay.com/api/?key=${this.apiKey}&q=${encodeURIComponent(query)}` +
      `&image_type=photo&orientation=horizontal&safesearch=true&per_page=3`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Pixabay ${res.status}: ${(await res.text()).slice(0, 150)}`);
    const data = (await res.json()) as { hits?: PixabayHit[] };
    const hit = data.hits?.find((h) => h.largeImageURL || h.webformatURL);
    const src = hit?.largeImageURL ?? hit?.webformatURL;
    if (!src) return null;
    return {
      url: src,
      sourceUrl: hit?.pageURL ?? src,
      license: 'Pixabay Content License',
      attribution: '', // Pixabay requires no attribution.
      provider: this.name,
    };
  }
}
