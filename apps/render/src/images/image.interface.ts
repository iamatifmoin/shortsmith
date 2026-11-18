/**
 * Image provider seam (ADR-027 b-roll). The renderer reaches stock images only
 * through this interface, so Openverse (keyless), Pixabay (keyed), or a future
 * source swap without touching callers — same pattern as packages/llm and TTS.
 */
export interface ImageHit {
  /** Direct URL to the image file to download. */
  url: string;
  /** Source/landing page (provenance). */
  sourceUrl: string;
  /** License label. */
  license: string;
  /** Ready-made attribution string (for CC-BY etc.); empty when none required. */
  attribution: string;
  /** Provider name. */
  provider: string;
}

export interface ImageProvider {
  readonly name: string;
  /** Best image for a query, or null if none found. */
  search(query: string): Promise<ImageHit | null>;
}

export const IMAGE_PROVIDER = Symbol('IMAGE_PROVIDER');
