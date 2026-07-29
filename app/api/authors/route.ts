// app/api/authors/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authors, articles, imprintReports } from '@/lib/schema';
import { eq, count, max } from 'drizzle-orm';
import { resolveFeedUrl } from '@/lib/fetcher';

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await db.delete(imprintReports).where(eq(imprintReports.authorId, id));
    await db.delete(articles).where(eq(articles.authorId, id));
    await db.delete(authors).where(eq(authors.id, id));

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const rows = await db
      .select({
        id: authors.id,
        name: authors.name,
        feedUrl: authors.feedUrl,
        siteUrl: authors.siteUrl,
        description: authors.description,
        createdAt: authors.createdAt,
        lastChecked: authors.lastChecked,
      })
      .from(authors)
      .orderBy(authors.createdAt);

    // Attach article counts
    const withCounts = await Promise.all(
      rows.map(async (a) => {
        const [{ value: articleCount }] = await db
          .select({ value: count() })
          .from(articles)
          .where(eq(articles.authorId, a.id));

        const [{ value: imprintCount }] = await db
          .select({ value: count() })
          .from(imprintReports)
          .where(eq(imprintReports.authorId, a.id));

        return {
          ...a,
          articleCount: Number(articleCount),
          imprintVersion: Number(imprintCount),
          createdAt: a.createdAt.toISOString(),
          lastChecked: a.lastChecked?.toISOString() ?? null,
        };
      })
    );

    return NextResponse.json(withCounts);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, feedUrl, siteUrl, description } = body;

    if (!name || !feedUrl) {
      return NextResponse.json({ error: 'name and a URL are required' }, { status: 400 });
    }

    // The input may be a feed URL or just the site's address — resolve either.
    let resolved;
    try {
      resolved = await resolveFeedUrl(feedUrl);
    } catch (e) {
      return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 400 });
    }

    const [author] = await db
      .insert(authors)
      .values({
        name,
        feedUrl: resolved.feedUrl,
        siteUrl: siteUrl || resolved.siteUrl,
        description,
      })
      .returning();

    return NextResponse.json({
      ...author,
      createdAt: author.createdAt.toISOString(),
      lastChecked: null,
      discoveredFeed: resolved.discovered,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
