import Parser from 'rss-parser';

/** One item from an RSS/Atom feed, reduced to what harvest needs. */
export interface FeedItem {
  title?: string;
  link?: string;
  isoDate?: string;
  /** Feed-provided summary/content (used as a fallback when the article page can't be read). */
  summary?: string;
}

export interface FeedOptions {
  timeoutMs?: number;
  userAgent?: string;
}

const DEFAULT_UA = 'Mozilla/5.0 (compatible; content-pipeline/0.1)';

/** Fetch and parse an RSS/Atom feed into items (most-recent first, as the feed orders them). */
export async function fetchFeedItems(rssUrl: string, opts: FeedOptions = {}): Promise<FeedItem[]> {
  const parser = new Parser({
    timeout: opts.timeoutMs ?? 15_000,
    headers: { 'user-agent': opts.userAgent ?? DEFAULT_UA },
  });
  const feed = await parser.parseURL(rssUrl);
  return (feed.items ?? []).map((item) => {
    const summary = (
      item.contentSnippet ||
      item.content ||
      (item as { summary?: string }).summary ||
      ''
    ).trim();
    return {
      title: item.title,
      link: item.link,
      isoDate: item.isoDate,
      summary: summary || undefined,
    };
  });
}
