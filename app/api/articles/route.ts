// app/api/articles/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { articles } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const authorId = searchParams.get('authorId');
    if (!authorId) return NextResponse.json({ error: 'authorId required' }, { status: 400 });

    const withFeatures = searchParams.get('withFeatures') === '1';

    const rows = await db
      .select({
        id: articles.id,
        authorId: articles.authorId,
        title: articles.title,
        url: articles.url,
        publishedAt: articles.publishedAt,
        fetchedAt: articles.fetchedAt,
        wordCount: articles.wordCount,
        extractedFeatures: articles.extractedFeatures,
      })
      .from(articles)
      .where(eq(articles.authorId, Number(authorId)))
      .orderBy(desc(articles.publishedAt));

    return NextResponse.json(
      rows.map(r => ({
        id: r.id,
        authorId: r.authorId,
        title: r.title,
        url: r.url,
        publishedAt: r.publishedAt?.toISOString() ?? null,
        fetchedAt: r.fetchedAt.toISOString(),
        wordCount: r.wordCount,
        hasFeatures: r.extractedFeatures !== null,
        ...(withFeatures ? { extractedFeatures: r.extractedFeatures } : {}),
      }))
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
