import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

/**
 * Bootstraps the ideation service. The HTTP layer serves the review API (Gate 1
 * backend, stubbed) and a health check; the pipeline stages run as BullMQ
 * workers registered by the stage modules. In this scaffold the jobs do nothing.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);

  Logger.log(`ideation service listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
