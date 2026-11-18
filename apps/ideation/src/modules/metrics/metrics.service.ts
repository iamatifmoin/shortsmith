import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { classifyHookOpener, HOOK_OPENER_LABELS, Platform, PublishPackage } from '@shortsmith/shared';

import { PrismaService } from '../../prisma/prisma.service';

/** Create a post record for an approved script on one platform. */
export interface CreatePostDto {
  scriptId: string;
  platform: Platform;
  externalUrl?: string;
  postedAt?: string; // ISO; defaults to now
}

/** Update the hand-entered performance numbers (and link/time) of a post. */
export interface UpdatePostDto {
  externalUrl?: string;
  postedAt?: string;
  views?: number;
  avgViewDurationSec?: number | null;
  retentionPct?: number | null;
  likes?: number;
  comments?: number;
  shares?: number;
  subscribersGained?: number;
}

const PLATFORMS = Object.values(Platform) as string[];

/**
 * Backend for the manual-learning metrics loop (ADR-020, docs/operations.md).
 * Records which approved scripts were posted where, and their performance, which
 * PerformanceService turns into the feedback the generator reads. Hook type /
 * angle / fact / background are derived from the script, never re-entered.
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** APPROVED scripts with their derived dimensions and any recorded posts. */
  async listScripts(): Promise<unknown[]> {
    const scripts = await this.prisma.script.findMany({
      where: { status: 'APPROVED' },
      orderBy: { approvedAt: 'desc' },
      include: {
        angle: { include: { primaryFactUnit: { select: { canonicalClaim: true, confidence: true } } } },
        posts: { orderBy: { platform: 'asc' } },
      },
    });

    return scripts.map((s) => {
      const pub = (s.publishPackage as unknown as PublishPackage) ?? null;
      const opener = classifyHookOpener(s.hook);
      return {
        id: s.id,
        hook: s.hook,
        title: pub?.title ?? null,
        angleType: s.angle.angleType,
        confidence: s.angle.primaryFactUnit.confidence,
        primaryFact: s.angle.primaryFactUnit.canonicalClaim,
        hookOpener: opener,
        hookOpenerLabel: HOOK_OPENER_LABELS[opener],
        background: pub?.backgroundSuggestion ?? null,
        approvedAt: s.approvedAt,
        posts: s.posts,
      };
    });
  }

  /** Every recorded post, newest first, with a short script summary. */
  async listPosts(): Promise<unknown[]> {
    const posts = await this.prisma.post.findMany({
      orderBy: { postedAt: 'desc' },
      include: { script: { include: { angle: { select: { angleType: true } } } } },
    });
    return posts.map((p) => ({
      ...p,
      hook: p.script.hook,
      angleType: p.script.angle.angleType,
    }));
  }

  async createPost(dto: CreatePostDto) {
    if (!dto.scriptId) throw new BadRequestException('scriptId is required');
    if (!PLATFORMS.includes(dto.platform)) throw new BadRequestException(`Unknown platform ${dto.platform}`);

    const script = await this.prisma.script.findUnique({ where: { id: dto.scriptId } });
    if (!script) throw new NotFoundException(`No script ${dto.scriptId}`);
    if (script.status !== 'APPROVED') {
      throw new BadRequestException('Only approved scripts can be recorded as posted');
    }

    try {
      const post = await this.prisma.post.create({
        data: {
          scriptId: dto.scriptId,
          platform: dto.platform as Platform,
          externalUrl: dto.externalUrl?.trim() || null,
          postedAt: dto.postedAt ? new Date(dto.postedAt) : new Date(),
        },
      });
      this.logger.log(`createPost(${post.id}) ${dto.platform} for script ${dto.scriptId}`);
      return post;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('This script is already recorded on that platform');
      }
      throw err;
    }
  }

  async updatePost(id: string, dto: UpdatePostDto) {
    const existing = await this.prisma.post.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`No post ${id}`);

    const touchesMetrics =
      dto.views != null ||
      dto.avgViewDurationSec !== undefined ||
      dto.retentionPct !== undefined ||
      dto.likes != null ||
      dto.comments != null ||
      dto.shares != null ||
      dto.subscribersGained != null;

    const post = await this.prisma.post.update({
      where: { id },
      data: {
        externalUrl: dto.externalUrl !== undefined ? dto.externalUrl.trim() || null : undefined,
        postedAt: dto.postedAt ? new Date(dto.postedAt) : undefined,
        views: dto.views ?? undefined,
        avgViewDurationSec: dto.avgViewDurationSec !== undefined ? dto.avgViewDurationSec : undefined,
        retentionPct: dto.retentionPct !== undefined ? dto.retentionPct : undefined,
        likes: dto.likes ?? undefined,
        comments: dto.comments ?? undefined,
        shares: dto.shares ?? undefined,
        subscribersGained: dto.subscribersGained ?? undefined,
        metricsUpdatedAt: touchesMetrics ? new Date() : undefined,
      },
    });
    this.logger.log(`updatePost(${id})`);
    return post;
  }

  async deletePost(id: string): Promise<void> {
    const existing = await this.prisma.post.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`No post ${id}`);
    await this.prisma.post.delete({ where: { id } });
    this.logger.log(`deletePost(${id})`);
  }
}
