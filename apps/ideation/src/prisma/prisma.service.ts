import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Thin wrapper exposing the generated Prisma client as an injectable service.
 * Connecting lazily keeps the app bootable without a database up (the scaffold
 * boots; stages fail loudly if they query without a DB). See CLAUDE.md.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (err) {
      // Don't crash boot if the DB isn't up yet — scaffold stage.
      this.logger.warn(`Prisma could not connect at boot: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
