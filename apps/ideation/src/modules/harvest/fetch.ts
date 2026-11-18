import { createHash } from 'node:crypto';

import * as cheerio from 'cheerio';

/** A fetched page reduced to readable text. */
export interface ReadablePage {
  finalUrl: string;
  title?: string;
  text: string;
}

export interface FetchOptions {
  timeoutMs?: number;
  userAgent?: string;
}

const DEFAULT_UA = 'shortsmith/0.1 harvester';

/**
 * Fetch a URL and reduce it to readable text + title. Strips script/style/nav/
 * chrome. Network-only (no DB), so it is smoke-testable on its own.
 *
 * TODO(harvest): respect robots.txt; discover articles from index pages / RSS
 * rather than scraping the entry page; handle JS-rendered sites. Per ADR-005 we
 * only ever read whitelisted (or operator-judged Tier-4) sources.
 */
export async function fetchReadable(url: string, opts: FetchOptions = {}): Promise<ReadablePage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': opts.userAgent ?? DEFAULT_UA,
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

    const html = await res.text();
    const $ = cheerio.load(html);
    $('script, style, noscript, nav, header, footer, aside, form, svg').remove();

    const title = ($('title').first().text() || $('h1').first().text()).trim() || undefined;
    const body = $('article').text() || $('main').text() || $('body').text();

    return { finalUrl: res.url || url, title, text: normalizeWhitespace(body) };
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
