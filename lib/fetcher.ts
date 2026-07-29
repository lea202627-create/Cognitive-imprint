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

  return {
    title: decodeEntities(stripCdata(title)),
    url: decodeEntities(link.trim()),
    guid: decodeEntities(guid.trim()),
    publishedAt: parseDate(pubDate),
  };
}

function parseAtomEntry(block: string): NewArticle | null {
  const title = extractTag(block, 'title') ?? 'Untitled';
  const link = extractAtomLink(block);
  const id = extractTag(block, 'id') ?? link;
  // <published> is the original date; <updated> is the fallback (always present).
  const date = extractTag(block, 'published') ?? extractTag(block, 'updated');

  if (!link) return null;

  return {
    title: decodeEntities(stripCdata(title)),
    url: decodeEntities(link.trim()),
    guid: decodeEntities((id ?? link).trim()),
    publishedAt: parseDate(date),
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

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
