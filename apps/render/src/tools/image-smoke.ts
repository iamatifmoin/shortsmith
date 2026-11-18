/**
 * Image sourcing smoke test — fetch a few concept images and print their local
 * paths. Uses Pixabay when PIXABAY_API_KEY is set, else keyless Openverse.
 *
 *   pnpm --filter @shortsmith/render build
 *   pnpm --filter @shortsmith/render image:smoke
 *   pnpm --filter @shortsmith/render image:smoke -- "miami skyline neon" "florida map"
 */
import { join, resolve } from 'node:path';

import { ImageService } from '../images/image.service';
import { createImageProvider } from '../images/provider.factory';

async function main(): Promise<void> {
  const outDir = resolve(process.env.OUTPUT_DIR ?? './out');
  const provider = createImageProvider();
  const svc = new ImageService(provider, join(outDir, '.image-cache'));

  const args = process.argv.slice(2).filter((a) => a !== '--');
  const queries = args.length
    ? args
    : ['miami skyline neon night', 'florida state map', 'rural countryside aerial road', 'stack of cash money'];

  console.log(`provider: ${provider.name}\n`);
  for (const q of queries) {
    const p = await svc.get(q);
    console.log(`"${q}" -> ${p ?? 'NONE'}`);
  }
}

main().catch((err) => {
  console.error('image smoke failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
