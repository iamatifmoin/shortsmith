import { FeedItem, fetchFeedItems } from './rss';

/** One open-web search hit, normalized to what the harvest stage needs. */
export interface OpenWebResult {
  url: string;
  title?: string;
  summary?: string;
  publishedAt?: Date;
}

export interface OpenWebSearchOpts {
  timeoutMs?: number;
  limit?: number;
}

/**
 * Pluggable open-web search for the Tier-4 fallback (ADR-014) — the zero-config
 * way a channel still produces results before a curated whitelist exists. Results
 * are treated as RUMOR by the caller.
 *
 * The DEFAULT provider needs no API key: it queries Google News RSS for the
 * channel's topic terms. Select a different backend with OPENWEB_SEARCH_PROVIDER
 * ("none" to disable). Add a keyed provider (Brave, SerpAPI, Bing, …) by extending
 * the switch below — callers never change.
 */
export async function searchOpenWeb(
  topicTerms: string[],
  opts: OpenWebSearchOpts = {},
): Promise<OpenWebResult[]> {
  const provider = (process.env.OPENWEB_SEARCH_PROVIDER ?? 'google-news').toLowerCase();
  switch (provider) {
    case 'none':
      return [];
    case 'google-news':
    default:
      return googleNewsSearch(topicTerms, opts);
  }
}

/** OR the topic terms into a single news query; quote multi-word terms. */
function buildQuery(topicTerms: string[]): string {
  const terms = topicTerms.map((t) => t.trim()).filter(Boolean).slice(0, 6);
  return terms.map((t) => (t.includes(' ') ? `"${t}"` : t)).join(' OR ');
}

/** No-key default: Google News RSS search for the topic terms. */
async function googleNewsSearch(
  topicTerms: string[],
  opts: OpenWebSearchOpts,
): Promise<OpenWebResult[]> {
  const q = buildQuery(topicTerms);
  if (!q) return [];
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  const items: FeedItem[] = await fetchFeedItems(url, { timeoutMs: opts.timeoutMs ?? 15_000 });
  const limit = opts.limit ?? 12;
  const out: OpenWebResult[] = [];
  for (const it of items) {
    if (!it.link) continue;
    const parsed = it.isoDate ? new Date(it.isoDate) : undefined;
    out.push({
      url: it.link,
      title: it.title,
      summary: it.summary,
      publishedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}
