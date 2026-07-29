// lib/tracker.ts
// Auto-tracking pipeline: check an author's feed, ingest and analyze every
// new article without manual selection. Used by the cron entry point and the
// one-click "Auto-import" button on the author page.
import { db } from '@/lib/db';
import { authors, articles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { fetchFeedItems, fetchArticleTextWithFallback, countWords } from '@/lib/fetcher';
import { extractDocumentFeatures } from '@/lib/analyzer';

// Caps keep a single run inside Vercel's 60s function timeout.
export const MAX_ARTICLES_PER_AUTHOR = 5;
export const MAX_ARTICLES_PER_CRON_RUN = 8;

export interface TrackItemResult {
  title: string;
  url: string;
  success: boolean;
  error?: string;
}

export interface TrackAuthorResult {
  authorId: number;
  authorName: string;
  newFound: number;
  ingested: TrackItemResult[];
  skipped: number; // found but over the per-run cap; picked up next run
  undatedExcluded: number; // items dropped from a date-range import because the feed has no date for them
  error?: string;  // feed-level failure
}

export interface TrackOptions {
  maxArticles?: number;
  /** Only import items published on/after this date (YYYY-MM-DD or ISO). */
  since?: string | null;
  /** Only import items published on/before this date (inclusive). */
  until?: string | null;
}

export async function trackAuthor(
  author: { id: number; name: string; feedUrl: string },
  opts: TrackOptions = {},
): Promise<TrackAuthorResult> {
  const maxArticles = opts.maxArticles ?? MAX_ARTICLES_PER_AUTHOR;
  const result: TrackAuthorResult = {
    authorId: author.id,
    authorName: author.name,
    newFound: 0,
    ingested: [],
    skipped: 0,
    undatedExcluded: 0,
  };

  let feedItems;
  try {
    feedItems = await fetchFeedItems(author.feedUrl);
  } catch (e) {
    result.error = String(e);
    return result;
  }

  const existing = await db
    .select({ url: articles.url, guid: articles.guid })
    .from(articles)
    .where(eq(articles.authorId, author.id));

  const existingUrls = new Set(existing.map(e => e.url));
  const existingGuids = new Set(existing.map(e => e.guid).filter(Boolean));

  let newItems = feedItems.filter(
    item => !existingUrls.has(item.url) && !existingGuids.has(item.guid)
  );

  // Optional date-range filter. Items the feed gives no date for cannot be
  // matched against a range — they are excluded and counted, not silently kept.
  if (opts.since || opts.until) {
    const sinceT = opts.since ? Date.parse(opts.since) : -Infinity;
    // +1 day - 1ms so "until 2026-07-28" includes the whole of that day.
    const untilT = opts.until ? Date.parse(opts.until) + 86_399_999 : Infinity;

    newItems = newItems.filter(item => {
      if (!item.publishedAt) {
        result.undatedExcluded++;
        return false;
      }
      const t = Date.parse(item.publishedAt);
      return t >= sinceT && t <= untilT;
    });
  }

  result.newFound = newItems.length;
  const toIngest = newItems.slice(0, maxArticles);
  result.skipped = newItems.length - toIngest.length;

  for (const item of toIngest) {
    try {
      const rawText = await fetchArticleTextWithFallback(item);
      const wordCount = countWords(rawText);
      const extractedFeatures = await extractDocumentFeatures(
        item.title,
        rawText,
        item.url,
        item.publishedAt
      );

      await db.insert(articles).values({
        authorId: author.id,
        title: item.title,
        url: item.url,
        guid: item.guid,
        publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
        wordCount,
        rawText,
        extractedFeatures,
      });

      result.ingested.push({ title: item.title, url: item.url, success: true });
    } catch (err) {
      result.ingested.push({
        title: item.title,
        url: item.url,
        success: false,
        error: String(err),
      });
    }
  }

  await db.update(authors).set({ lastChecked: new Date() }).where(eq(authors.id, author.id));

  return result;
}

export async function trackAllAuthors(): Promise<TrackAuthorResult[]> {
  const allAuthors = await db
    .select({ id: authors.id, name: authors.name, feedUrl: authors.feedUrl })
    .from(authors)
    .orderBy(authors.lastChecked);

  const results: TrackAuthorResult[] = [];
  let ingestedTotal = 0;

  for (const author of allAuthors) {
    const remaining = MAX_ARTICLES_PER_CRON_RUN - ingestedTotal;
    if (remaining <= 0) break;

    const r = await trackAuthor(author, {
      maxArticles: Math.min(MAX_ARTICLES_PER_AUTHOR, remaining),
    });
    ingestedTotal += r.ingested.length;
    results.push(r);
  }

  return results;
}
