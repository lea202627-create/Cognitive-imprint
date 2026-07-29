// lib/fetcher.ts
import { NewArticle } from '@/types';

export async function fetchFeedItems(feedUrl: string): Promise<NewArticle[]> {
  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'CognitiveImprint/1.0' },
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`Failed to fetch feed: ${res.status}`);

  const xml = await res.text();
  return parseFeed(xml);
}

// Handles RSS 2.0 / RSS 1.0 (RDF) <item> and Atom <entry>.
export function parseFeed(xml: string): NewArticle[] {
  const rssItems = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
  if (rssItems.length > 0) {
    return rssItems.map(m => parseRssItem(m[1])).filter(Boolean) as NewArticle[];
  }

  const atomEntries = [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)];
  if (atomEntries.length > 0) {
    return atomEntries.map(m => parseAtomEntry(m[1])).filter(Boolean) as NewArticle[];
  }

  // Fail loudly rather than reporting "no new articles" for a non-feed URL.
  throw new Error(
    'No RSS <item> or Atom <entry> elements found. Is this a valid feed URL?'
  );
}

function parseRssItem(block: string): NewArticle | null {
  const title = extractTag(block, 'title') ?? 'Untitled';
  const link = extractTag(block, 'link') ?? '';
  const guid = extractTag(block, 'guid') ?? link;
  const pubDate =
    extractTag(block, 'pubDate') ??
    extractTag(block, 'dc:date') ??      // RSS 1.0 / Dublin Core
    extractTag(block, 'date');

  if (!link) return null;

  const body =
    extractTag(block, 'content:encoded') ?? extractTag(block, 'description');

  return {
    title: decodeEntities(stripCdata(title)),
    url: decodeEntities(link.trim()),
    guid: decodeEntities(guid.trim()),
    publishedAt: parseDate(pubDate),
    feedContent: feedBodyToText(body),
  };
}

// Feed-carried bodies arrive as escaped/CDATA-wrapped HTML; reduce to plain text.
function feedBodyToText(raw: string | null): string | null {
  if (!raw) return null;
  const text = extractReadableText(decodeEntities(stripCdata(raw)));
  return text.length > 0 ? text : null;
}

function parseAtomEntry(block: string): NewArticle | null {
  const title = extractTag(block, 'title') ?? 'Untitled';
  const link = extractAtomLink(block);
  const id = extractTag(block, 'id') ?? link;
  // <published> is the original date; <updated> is the fallback (always present).
  const date = extractTag(block, 'published') ?? extractTag(block, 'updated');

  if (!link) return null;

  const body = extractTag(block, 'content') ?? extractTag(block, 'summary');

  return {
    title: decodeEntities(stripCdata(title)),
    url: decodeEntities(link.trim()),
    guid: decodeEntities((id ?? link).trim()),
    publishedAt: parseDate(date),
    feedContent: feedBodyToText(body),
  };
}

// Atom links carry the URL in an href attribute, not as text content:
//   <link rel="alternate" type="text/html" href="https://..."/>
// Prefer rel="alternate" (the human-readable page); never rel="self"/"edit"/"replies".
function extractAtomLink(block: string): string | null {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map(m => m[1]);

  const attrsOf = (raw: string) => ({
    href: raw.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? null,
    rel: raw.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? null,
    type: raw.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? null,
  });

  const parsed = links.map(attrsOf).filter(a => a.href);

  return (
    parsed.find(a => a.rel === 'alternate' && a.type === 'text/html')?.href ??
    parsed.find(a => a.rel === 'alternate')?.href ??
    parsed.find(a => a.rel === null)?.href ??
    null
  );
}

function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// ─── Feed discovery ────────────────────────────────────────────────────────
// Most people know a writer's site, not their feed URL. Given either one,
// work out the feed: try the input directly, then <link rel="alternate">
// in the page head, then the conventional paths.

const COMMON_FEED_PATHS = [
  '/feed',
  '/rss',
  '/atom.xml',
  '/feed.xml',
  '/rss.xml',
  '/index.xml',
  '/feed/',
  '/blog/feed',
];

export interface ResolvedFeed {
  feedUrl: string;
  siteUrl: string;
  /** false when the input was already a feed */
  discovered: boolean;
}

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withScheme).toString();
}

async function isFeed(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CognitiveImprint/1.0' },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 0 },
    });
    if (!res.ok) return false;
    return parseFeed(await res.text()).length > 0;
  } catch {
    return false;
  }
}

// <link rel="alternate" type="application/rss+xml" href="..."> in the page head.
export function extractFeedLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];

  for (const m of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attrs = m[1];
    const rel = attrs.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const type = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];

    if (!href || !rel?.includes('alternate')) continue;
    if (!type || !/(rss|atom)\+xml|application\/xml|text\/xml/.test(type)) continue;

    try {
      out.push(new URL(href.replace(/&amp;/g, '&'), baseUrl).toString());
    } catch {
      // Skip unparseable hrefs.
    }
  }

  return [...new Set(out)];
}

export async function resolveFeedUrl(input: string): Promise<ResolvedFeed> {
  const url = normalizeUrl(input);

  // 1. Already a feed?
  if (await isFeed(url)) {
    return { feedUrl: url, siteUrl: new URL(url).origin, discovered: false };
  }

  // 2. Declared in the page head.
  let html = '';
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CognitiveImprint/1.0' },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 0 },
    });
    if (res.ok) html = await res.text();
  } catch {
    // Unreachable page — fall through to the conventional paths.
  }

  for (const candidate of extractFeedLinks(html, url).slice(0, 4)) {
    if (await isFeed(candidate)) {
      return { feedUrl: candidate, siteUrl: url, discovered: true };
    }
  }

  // 3. Conventional locations.
  for (const path of COMMON_FEED_PATHS) {
    let candidate: string;
    try {
      candidate = new URL(path, url).toString();
    } catch {
      continue;
    }
    if (await isFeed(candidate)) {
      return { feedUrl: candidate, siteUrl: url, discovered: true };
    }
  }

  throw new Error(
    `Could not find a feed for ${url}. Tried the page's <link rel="alternate"> tags and ` +
      `${COMMON_FEED_PATHS.join(', ')}. If you know the feed address, paste it directly. ` +
      `Platforms like Zhihu or WeChat publish no feeds at all — for those, use a bridge ` +
      `service (e.g. an RSSHub instance) to generate a feed URL and paste that here.`
  );
}

// Fetch the article page; fall back to the feed-carried body when the page is
// unreachable (anti-bot 403s — Zhihu, WeChat) or returns only a thin challenge
// shell while the feed carried something fuller.
export async function fetchArticleTextWithFallback(item: NewArticle): Promise<string> {
  try {
    const pageText = await fetchArticleText(item.url);
    if (
      item.feedContent &&
      countWords(pageText) < 30 &&
      item.feedContent.length > pageText.length
    ) {
      return item.feedContent;
    }
    return pageText;
  } catch (e) {
    if (item.feedContent) return item.feedContent;
    throw e;
  }
}

export async function fetchArticleText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CognitiveImprint/1.0' },
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`Failed to fetch article: ${res.status}`);

  const html = await res.text();
  return extractReadableText(html);
}

function extractReadableText(html: string): string {
  // Remove script, style, nav, header, footer, aside
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '');

  // Try to extract main content area
  const mainMatch = text.match(/<(?:article|main)[^>]*>([\s\S]*?)<\/(?:article|main)>/i);
  if (mainMatch) text = mainMatch[1];

  // Strip remaining tags, decode entities
  text = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();

  return text;
}

// CJK text has no word-separating spaces — a whitespace split undercounts a
// 2000-character Chinese essay as a handful of "words", which wrecks the
// corpus-size confidence thresholds. Count CJK characters individually and
// everything else by whitespace tokens.
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/g;

export function countWords(text: string): number {
  const cjkChars = (text.match(CJK) ?? []).length;
  const nonCjkTokens = text.replace(CJK, ' ').split(/\s+/).filter(Boolean).length;
  return cjkChars + nonCjkTokens;
}
