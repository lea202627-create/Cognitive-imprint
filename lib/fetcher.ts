// lib/fetcher.ts
import { NewArticle } from '@/types';

export async function fetchFeedItems(feedUrl: string): Promise<NewArticle[]> {
  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'CognitiveImprint/1.0' },
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`Failed to fetch feed: ${res.status}`);

  const xml = await res.text();
  const items = parseRSS(xml);
  return items;
}

function parseRSS(xml: string): NewArticle[] {
  const items: NewArticle[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

  for (const match of itemMatches) {
    const block = match[1];

    const title = extractTag(block, 'title') ?? 'Untitled';
    const link  = extractTag(block, 'link') ?? '';
    const guid  = extractTag(block, 'guid') ?? link;
    const pubDate = extractTag(block, 'pubDate');

    if (!link) continue;

    items.push({
      title: stripCdata(title),
      url: link.trim(),
      guid: guid.trim(),
      publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
    });
  }

  return items;
}

function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
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
