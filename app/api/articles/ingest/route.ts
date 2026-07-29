// app/api/articles/ingest/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { articles } from '@/lib/schema';
import { fetchArticleTextWithFallback, countWords } from '@/lib/fetcher';
import { extractDocumentFeatures } from '@/lib/analyzer';
import { NewArticle } from '@/types';

export async function POST(req: Request) {
  try {
    const { authorId, items }: { authorId: number; items: NewArticle[] } = await req.json();

    if (!authorId || !items?.length) {
      return NextResponse.json({ error: 'authorId and items required' }, { status: 400 });
    }

    const results = [];

    for (const item of items) {
      try {
        // 1. Fetch article text (falls back to feed-carried body if blocked)
        const rawText = await fetchArticleTextWithFallback(item);
        const wordCount = countWords(rawText);

        // 2. Extract cognitive features via LLM
        const extractedFeatures = await extractDocumentFeatures(
          item.title,
          rawText,
          item.url,
          item.publishedAt
        );

        // 3. Store in DB
        const [article] = await db
          .insert(articles)
          .values({
            authorId,
            title: item.title,
            url: item.url,
            guid: item.guid,
            publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
            wordCount,
            rawText,
            extractedFeatures,
          })
          .returning();

        results.push({ success: true, title: item.title, id: article.id, wordCount });
      } catch (err) {
        results.push({ success: false, title: item.title, error: String(err) });
      }
    }

    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
