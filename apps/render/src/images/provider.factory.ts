import { ImageProvider } from './image.interface';
import { OpenverseProvider } from './openverse.provider';
import { PixabayProvider } from './pixabay.provider';
import { UnsplashProvider } from './unsplash.provider';

/**
 * Pick the best available image provider from env (ADR-027): Unsplash (pro quality)
 * if a key is set, else Pixabay, else keyless Openverse. Reads process.env (which
 * @nestjs/config populates from the .env files).
 */
export function createImageProvider(): ImageProvider {
  if (process.env.UNSPLASH_ACCESS_KEY) return new UnsplashProvider(process.env.UNSPLASH_ACCESS_KEY);
  if (process.env.PIXABAY_API_KEY) return new PixabayProvider(process.env.PIXABAY_API_KEY);
  return new OpenverseProvider();
}
