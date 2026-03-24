// app/api/articles/check/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authors, articles } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { fetchFeedItems } from '@/lib/fetcher';

export async function POST(req: Request) {
  try {
    const { authorId } = await req.json();
    if (!authorId) return NextResponse.json({ error: 'authorId required' }, { status: 400 });

    const [author] = await db.select().from(authors).where(eq(authors.id, authorId));
    if (!author) return NextResponse.json({ error: 'Author not found' }, { status: 404 });

    // Fetch RSS
    const feedItems = await fetchFeedItems(author.feedUrl);

    // Get existing URLs and guids
    const existing = await db
      .select({ url: articles.url, guid: articles.guid })
      .from(articles)
      .where(eq(articles.authorId, authorId));

    const existingUrls = new Set(existing.map(e => e.url));
    const existingGuids = new Set(existing.map(e => e.guid).filter(Boolean));

    const newItems = feedItems.filter(
      item => !existingUrls.has(item.url) && !existingGuids.has(item.guid)
    );

    // Update lastChecked
    await db.update(authors).set({ lastChecked: new Date() }).where(eq(authors.id, authorId));

    return NextResponse.json({
      newItems,
      totalInFeed: feedItems.length,
      existingCount: existing.length,
      lastChecked: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
