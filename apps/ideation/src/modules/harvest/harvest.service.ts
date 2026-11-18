import { Injectable, Logger } from '@nestjs/common';

import type { SourceDef, SourceTier } from '@shortsmith/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { contentHash, fetchReadable } from './fetch';
import { FeedItem, fetchFeedItems } from './rss';
import { searchOpenWeb } from './open-web';

/** A new-or-changed page the harvest stage hands to extract. */
export interface HarvestedPage {
  sourceDocumentId: string;
  sourceKey?: string;
  sourceTier: number;
  url: string;
  title?: string;
  /** Readable fetched text. */
  content: string;
  fetchedAt: Date;
}

const MAX_ITEMS_PER_FEED = 12;
const MIN_ARTICLE_CHARS = 120;

/**
 * Build a per-niche relevance predicate from the channel's topic terms, so a
 * site-wide feed doesn't flood the pipeline with unrelated news. Terms come from
 * Series.topicTerms, falling back to the subject name + its aliases. With no
 * terms configured we keep everything (the operator curates sources instead).
 */
function buildTopicMatcher(terms: string[]): (text: string) => boolean {
  const cleaned = terms.map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (cleaned.length === 0) return () => true;
  return (text: string) => {
    const hay = text.toLowerCase();
    return cleaned.some((t) => hay.includes(t));
  };
}

/**
 * STAGE 1 — harvest. For each source the series is allowed to use, prefer its
 * RSS feed (static, reliable); keep topic-relevant items, fetch each article to
 * readable text (falling back to the feed summary when a page is JS-rendered),
 * and persist as a SourceDocument. Dedup is per (series, url) via contentHash,
 * and identical content within a run is skipped (e.g. JS-SPA shells), so extract
 * never re-chews the same text.
 * See docs/architecture.md#1-harvest, docs/sources.md, ADR-005/014.
 */
@Injectable()
export class HarvestService {
  private readonly logger = new Logger(HarvestService.name);
  private readonly fetchDelayMs = Number(process.env.HARVEST_FETCH_DELAY_MS ?? 1000);
  private readonly fetchTimeoutMs = Number(process.env.HARVEST_FETCH_TIMEOUT_MS ?? 15_000);

  constructor(private readonly prisma: PrismaService) {}

  /** Harvest every allowed source for a series; return only new/changed pages. */
  async harvest(seriesId: string): Promise<HarvestedPage[]> {
    const series = await this.prisma.series.findUniqueOrThrow({ where: { id: seriesId } });
    const tiers = series.allowedTiers;

    // Sources are per-channel DATA now (prisma Source rows), not a code whitelist.
    const rows = await this.prisma.source.findMany({
      where: { seriesId, active: true, tier: { in: tiers } },
      orderBy: { tier: 'asc' },
    });
    const sources: SourceDef[] = rows.map((s) => ({
      key: s.key,
      name: s.name,
      tier: s.tier as SourceTier,
      url: s.url,
      rssUrl: s.rssUrl,
      rumorOnly: s.rumorOnly,
    }));

    // Per-niche relevance terms: explicit topicTerms, else the subject + aliases.
    const topicTerms =
      series.topicTerms.length > 0
        ? series.topicTerms
        : [series.subjectName ?? '', ...series.subjectAliases].filter(Boolean);
    const matchesTopic = buildTopicMatcher(topicTerms);

    this.logger.log(
      `harvest(${series.key}): ${sources.length} source(s), tiers [${tiers.join(', ')}], ${topicTerms.length} topic term(s)`,
    );

    const seen = new Set<string>(); // content hashes seen this run (collapses SPA shells / syndications)
    const fresh: HarvestedPage[] = [];
    for (const source of sources) {
      try {
        const pages = source.rssUrl
          ? await this.harvestFeed(seriesId, source, seen, matchesTopic)
          : await this.harvestPage(seriesId, source, seen);
        fresh.push(...pages);
      } catch (err) {
        this.logger.warn(`harvest: source ${source.key} failed: ${(err as Error).message}`);
      }
    }

    if (tiers.includes(4)) {
      fresh.push(...(await this.harvestOpenWeb(seriesId, topicTerms, matchesTopic, seen)));
    }

    this.logger.log(`harvest(${series.key}): ${fresh.length} new/changed document(s)`);
    return fresh;
  }

  /** RSS-first: pull recent feed items, keep niche-relevant ones, fetch each article. */
  private async harvestFeed(
    seriesId: string,
    source: SourceDef,
    seen: Set<string>,
    matchesTopic: (text: string) => boolean,
  ): Promise<HarvestedPage[]> {
    const items = await fetchFeedItems(source.rssUrl as string, { timeoutMs: this.fetchTimeoutMs });
    const relevant = items
      .filter((it) => Boolean(it.link) && matchesTopic(`${it.title ?? ''} ${it.summary ?? ''}`))
      .slice(0, MAX_ITEMS_PER_FEED);
    this.logger.debug(`harvest ${source.key}: ${relevant.length}/${items.length} item(s) match topic`);

    const out: HarvestedPage[] = [];
    for (const item of relevant) {
      const page = await this.harvestArticle(seriesId, source, item, seen);
      if (page) out.push(page);
      await sleep(this.fetchDelayMs); // be polite between requests
    }
    return out;
  }

  /** Fetch one article's text (fall back to the feed summary) and persist it. */
  private async harvestArticle(
    seriesId: string,
    source: SourceDef,
    item: FeedItem,
    seen: Set<string>,
  ): Promise<HarvestedPage | null> {
    const url = item.link as string;
    let text = '';
    let title = item.title;
    try {
      const page = await fetchReadable(url, { timeoutMs: this.fetchTimeoutMs });
      if (page.text.length >= MIN_ARTICLE_CHARS) {
        text = page.text;
        title = title ?? page.title;
      }
    } catch (err) {
      this.logger.debug(`harvest ${source.key}: article fetch failed (${url}): ${(err as Error).message}`);
    }
    if (!text) text = item.summary ?? ''; // JS-rendered / blocked page -> use the feed summary
    if (!text) return null;
    const parsed = item.isoDate ? new Date(item.isoDate) : undefined;
    const publishedAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
    return this.persist(seriesId, source, url, title, text, seen, publishedAt);
  }

  /** Single-page fetch for sources without a feed (e.g. a first-party SPA page). */
  private async harvestPage(
    seriesId: string,
    source: SourceDef,
    seen: Set<string>,
  ): Promise<HarvestedPage[]> {
    try {
      const page = await fetchReadable(source.url, { timeoutMs: this.fetchTimeoutMs });
      if (!page.text) {
        this.logger.warn(`harvest: empty text from ${source.key} (${source.url})`);
        return [];
      }
      const persisted = await this.persist(seriesId, source, source.url, page.title, page.text, seen);
      return persisted ? [persisted] : [];
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn(`harvest: failed ${source.key} (${source.url}): ${message}`);
      await this.prisma.sourceDocument
        .updateMany({ where: { seriesId, url: source.url }, data: { error: message } })
        .catch(() => undefined);
      return [];
    } finally {
      await sleep(this.fetchDelayMs);
    }
  }

  /** Upsert a SourceDocument; return a HarvestedPage only when it is new or changed (dedup). */
  private async persist(
    seriesId: string,
    source: SourceDef,
    url: string,
    title: string | undefined,
    text: string,
    seen: Set<string>,
    publishedAt?: Date,
  ): Promise<HarvestedPage | null> {
    const hash = contentHash(text);
    if (seen.has(hash)) {
      // Identical content already harvested this run (SPA shell / syndication).
      this.logger.debug(`harvest ${source.key}: duplicate content skipped (${url})`);
      return null;
    }

    const existing = await this.prisma.sourceDocument.findUnique({
      where: { seriesId_url: { seriesId, url } },
    });
    if (existing && existing.contentHash === hash) {
      seen.add(hash);
      return null; // unchanged since last harvest — dedup, skip re-extract
    }

    const doc = await this.prisma.sourceDocument.upsert({
      where: { seriesId_url: { seriesId, url } },
      update: {
        title,
        content: text,
        contentHash: hash,
        sourceKey: source.key,
        sourceTier: source.tier,
        fetchedAt: new Date(),
        publishedAt: publishedAt ?? undefined,
        extractedAt: null, // changed content -> needs re-extract
        error: null,
      },
      create: {
        seriesId,
        sourceKey: source.key,
        sourceTier: source.tier,
        url,
        title,
        content: text,
        contentHash: hash,
        publishedAt: publishedAt ?? undefined,
      },
    });

    seen.add(hash);
    return {
      sourceDocumentId: doc.id,
      sourceKey: source.key,
      sourceTier: source.tier,
      url,
      title,
      content: text,
      fetchedAt: doc.fetchedAt,
    };
  }

  /**
   * STAGE 1b — open web (Tier 4). Runs only for a channel whose allowedTiers
   * include 4 — the zero-config fallback so a niche produces results before a
   * curated whitelist exists. Results are ALWAYS rumor-flagged (ADR-014). The
   * search backend is pluggable (see open-web.ts); the default needs no API key.
   */
  private async harvestOpenWeb(
    seriesId: string,
    topicTerms: string[],
    matchesTopic: (text: string) => boolean,
    seen: Set<string>,
  ): Promise<HarvestedPage[]> {
    if (topicTerms.length === 0) {
      this.logger.debug('harvestOpenWeb: no topic terms configured — skipping');
      return [];
    }
    let results;
    try {
      results = await searchOpenWeb(topicTerms, {
        timeoutMs: this.fetchTimeoutMs,
        limit: MAX_ITEMS_PER_FEED,
      });
    } catch (err) {
      this.logger.warn(`harvestOpenWeb: search failed: ${(err as Error).message}`);
      return [];
    }

    // One synthetic Tier-4 source for everything the open web returns.
    const source: SourceDef = { key: 'open-web', name: 'Open Web', tier: 4, url: 'open-web', rumorOnly: true };
    const out: HarvestedPage[] = [];
    for (const r of results) {
      if (!r.url) continue;
      let text = '';
      let title = r.title;
      try {
        const page = await fetchReadable(r.url, { timeoutMs: this.fetchTimeoutMs });
        if (page.text.length >= MIN_ARTICLE_CHARS) {
          text = page.text;
          title = title ?? page.title;
        }
      } catch (err) {
        this.logger.debug(`harvestOpenWeb: fetch failed (${r.url}): ${(err as Error).message}`);
      }
      if (!text) text = r.summary ?? '';
      if (!text) continue;
      // Keep the open web honest: only persist items that actually match the niche.
      if (!matchesTopic(`${title ?? ''} ${text}`)) continue;
      const page = await this.persist(seriesId, { ...source, url: r.url }, r.url, title, text, seen, r.publishedAt);
      if (page) out.push(page);
      await sleep(this.fetchDelayMs);
    }
    this.logger.log(`harvestOpenWeb: ${out.length} new/changed open-web document(s)`);
    return out;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
