import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Confidence } from '@shortsmith/shared';

import { PrismaService } from '../../prisma/prisma.service';

/** One source as sent/returned by the config API. */
export interface SourceRow {
  id: string;
  key: string;
  name: string;
  tier: number;
  url: string;
  rssUrl: string | null;
  rumorOnly: boolean;
  active: boolean;
}

/** A source create/update from the wizard. */
export interface SourceInput {
  key?: string;
  name: string;
  tier: number;
  url: string;
  rssUrl?: string | null;
  rumorOnly?: boolean;
  active?: boolean;
}

/** The channel config the wizard reads/writes (all fields optional on write). */
export interface ChannelConfigInput {
  key?: string;
  name?: string;
  description?: string | null;
  displayName?: string | null;
  logoPath?: string | null;
  subjectName?: string | null;
  subjectAliases?: string[];
  topicTerms?: string[];
  comparisonLabel?: string | null;
  personality?: string | null;
  links?: Record<string, string> | null;
  voiceTone?: string | null;
  formatRules?: unknown;
  publishDefaults?: unknown;
  publishConfig?: unknown;
  minConfidence?: string;
  allowedTiers?: number[];
  active?: boolean;
}

/** The channel config returned to the dashboard. */
export interface ChannelConfigResponse extends ChannelConfigInput {
  id: string;
  key: string;
  name: string;
  sources: SourceRow[];
}

/**
 * Which integrations this instance can see configured, as booleans only — never
 * the secret values. Reported to the setup wizard's "Connections & keys" card so
 * a new operator can tell what still needs an env key. Only covers what the
 * ideation process can verify from its own env (the LLM key + Telegram); the
 * render worker's ElevenLabs/image keys live in apps/render/.env, a separate
 * process, so the wizard documents those statically.
 */
export interface ConnectionsStatus {
  llm: { provider: string; keyConfigured: boolean };
  telegram: { botConfigured: boolean; chatConfigured: boolean };
}

const sourceOrder: Prisma.SourceOrderByWithRelationInput[] = [{ tier: 'asc' }, { name: 'asc' }];

/**
 * Channel config API (ADR-006). Everything niche-specific is per-channel DATA on
 * the Series row + its Source rows; the setup wizard reads/writes it here instead
 * of editing the seed. One local instance = one channel, so these operate on the
 * single ACTIVE series.
 */
@Injectable()
export class ChannelService {
  constructor(private readonly prisma: PrismaService) {}

  /** The active channel's config (+ sources), or null when none is set up yet. */
  async getActive(): Promise<ChannelConfigResponse | null> {
    const series = await this.prisma.series.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
      include: { sources: { orderBy: sourceOrder } },
    });
    return series ? toResponse(series) : null;
  }

  /** Create the channel (first run) or update the active one. */
  async upsert(input: ChannelConfigInput): Promise<ChannelConfigResponse> {
    const existing = await this.prisma.series.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
    });
    const data = buildData(input);

    const series = existing
      ? await this.prisma.series.update({
          where: { id: existing.id },
          data: {
            ...data,
            ...(input.key ? { key: slugify(input.key) } : {}),
          } as Prisma.SeriesUncheckedUpdateInput,
          include: { sources: { orderBy: sourceOrder } },
        })
      : await this.prisma.series.create({
          data: {
            key: slugify(input.key ?? input.name ?? 'channel') || 'channel',
            name: (input.name ?? '').trim() || 'My Channel',
            active: true,
            ...data,
          } as Prisma.SeriesUncheckedCreateInput,
          include: { sources: { orderBy: sourceOrder } },
        });

    return toResponse(series);
  }

  /**
   * Report which integrations are configured (booleans only, no secret values),
   * so the setup wizard can show live status for the keys this process owns.
   */
  connections(): ConnectionsStatus {
    const provider = (process.env.LLM_PROVIDER ?? 'gemini').trim().toLowerCase();
    const keyEnv =
      provider === 'anthropic'
        ? 'ANTHROPIC_API_KEY'
        : provider === 'openai'
          ? 'OPENAI_API_KEY'
          : 'GEMINI_API_KEY';
    // "manual" needs no key (completions are pasted by hand).
    const keyConfigured = provider === 'manual' || Boolean(process.env[keyEnv]?.trim());
    return {
      llm: { provider, keyConfigured },
      telegram: {
        botConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
        chatConfigured: Boolean(process.env.TELEGRAM_CHAT_ID?.trim()),
      },
    };
  }

  /** Sources for the active channel. */
  async listSources(): Promise<SourceRow[]> {
    const series = await this.requireActive();
    const rows = await this.prisma.source.findMany({ where: { seriesId: series.id }, orderBy: sourceOrder });
    return rows.map(toSourceRow);
  }

  /** Add or update (by key) a source on the active channel. */
  async addSource(input: SourceInput): Promise<SourceRow> {
    const series = await this.requireActive();
    const name = (input.name ?? '').trim();
    const url = (input.url ?? '').trim();
    if (!name || !url) throw new BadRequestException('Source name and url are required');
    const tier = Number(input.tier);
    if (![1, 2, 3, 4].includes(tier)) throw new BadRequestException('tier must be 1, 2, 3 or 4');
    const key = slugify(input.key ?? name) || `src-${Date.now()}`;

    const row = await this.prisma.source.upsert({
      where: { seriesId_key: { seriesId: series.id, key } },
      update: {
        name,
        tier,
        url,
        rssUrl: input.rssUrl?.trim() || null,
        rumorOnly: input.rumorOnly ?? tier >= 3,
        active: input.active ?? true,
      },
      create: {
        seriesId: series.id,
        key,
        name,
        tier,
        url,
        rssUrl: input.rssUrl?.trim() || null,
        rumorOnly: input.rumorOnly ?? tier >= 3,
        active: input.active ?? true,
      },
    });
    return toSourceRow(row);
  }

  /** Remove a source from the active channel. */
  async deleteSource(id: string): Promise<void> {
    const existing = await this.prisma.source.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`No source ${id}`);
    await this.prisma.source.delete({ where: { id } });
  }

  private async requireActive() {
    const series = await this.prisma.series.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' } });
    if (!series) throw new BadRequestException('No channel configured yet — set up the channel first');
    return series;
  }
}

type SeriesWithSources = Prisma.SeriesGetPayload<{ include: { sources: true } }>;

function toResponse(series: SeriesWithSources): ChannelConfigResponse {
  return {
    id: series.id,
    key: series.key,
    name: series.name,
    description: series.description,
    displayName: series.displayName,
    logoPath: series.logoPath,
    subjectName: series.subjectName,
    subjectAliases: series.subjectAliases,
    topicTerms: series.topicTerms,
    comparisonLabel: series.comparisonLabel,
    personality: series.personality,
    links: (series.links as Record<string, string> | null) ?? null,
    voiceTone: series.voiceTone,
    formatRules: series.formatRules ?? null,
    publishDefaults: series.publishDefaults ?? null,
    publishConfig: series.publishConfig ?? null,
    minConfidence: series.minConfidence,
    allowedTiers: series.allowedTiers,
    active: series.active,
    sources: series.sources.map(toSourceRow),
  };
}

function toSourceRow(s: {
  id: string;
  key: string;
  name: string;
  tier: number;
  url: string;
  rssUrl: string | null;
  rumorOnly: boolean;
  active: boolean;
}): SourceRow {
  return {
    id: s.id,
    key: s.key,
    name: s.name,
    tier: s.tier,
    url: s.url,
    rssUrl: s.rssUrl,
    rumorOnly: s.rumorOnly,
    active: s.active,
  };
}

/** Build a partial Series write, touching only the fields the wizard sent. */
function buildData(input: ChannelConfigInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const strFields = [
    'name',
    'description',
    'displayName',
    'logoPath',
    'subjectName',
    'comparisonLabel',
    'personality',
    'voiceTone',
  ] as const;
  for (const f of strFields) {
    if (input[f] !== undefined) data[f] = input[f];
  }
  if (input.subjectAliases !== undefined) data.subjectAliases = cleanList(input.subjectAliases);
  if (input.topicTerms !== undefined) data.topicTerms = cleanList(input.topicTerms);
  if (input.allowedTiers !== undefined) {
    data.allowedTiers = input.allowedTiers.map(Number).filter((n) => [1, 2, 3, 4].includes(n));
  }
  if (input.active !== undefined) data.active = input.active;
  if (input.minConfidence !== undefined) {
    const mc = input.minConfidence as Confidence;
    if (!Object.values(Confidence).includes(mc)) throw new BadRequestException('invalid minConfidence');
    data.minConfidence = mc;
  }
  for (const f of ['links', 'formatRules', 'publishDefaults', 'publishConfig'] as const) {
    if (input[f] !== undefined) {
      data[f] = input[f] === null ? Prisma.DbNull : (input[f] as Prisma.InputJsonValue);
    }
  }
  return data;
}

function cleanList(items: string[]): string[] {
  return (items ?? []).map((s) => (s ?? '').trim()).filter(Boolean);
}

function slugify(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
