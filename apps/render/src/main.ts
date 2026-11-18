import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

/**
 * Bootstraps the render service (Phase 3, ADR-021). It is primarily a BullMQ
 * worker consuming the `render` queue; the HTTP listener just exposes a health
 * surface and keeps the Nest process alive. Rendering logic lives in
 * src/render/. In this scaffold the pipeline is wired but not yet implemented
 * (TODO(phase-3)) — see docs/phase-3-render.md.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3002);
  await app.listen(port);

  Logger.log(`render service listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
