// app/api/analyze/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authors, articles, imprintReports } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';
import { generateImprintReport } from '@/lib/analyzer';

export async function POST(req: Request) {
  try {
    const { authorId } = await req.json();
    if (!authorId) return NextResponse.json({ error: 'authorId required' }, { status: 400 });

    const [author] = await db.select().from(authors).where(eq(authors.id, authorId));
    if (!author) return NextResponse.json({ error: 'Author not found' }, { status: 404 });

    const articleRows = await db
      .select()
      .from(articles)
      .where(eq(articles.authorId, authorId))
      .orderBy(desc(articles.publishedAt));

    if (articleRows.length === 0) {
      return NextResponse.json({ error: 'No articles found for this author' }, { status: 400 });
    }

    const articlesForAnalysis = articleRows.map(a => ({
      ...a,
      publishedAt: a.publishedAt?.toISOString() ?? null,
      fetchedAt: a.fetchedAt.toISOString(),
      extractedFeatures: a.extractedFeatures as any,
    }));

    const reportData = await generateImprintReport(author.name, articlesForAnalysis);

    const [savedReport] = await db
      .insert(imprintReports)
      .values({
        authorId,
        documentCount: reportData.documentCount,
        totalWordCount: reportData.totalWordCount,
        reportData,
      })
      .returning();

    return NextResponse.json({
      id: savedReport.id,
      authorId,
      generatedAt: savedReport.generatedAt.toISOString(),
      ...reportData,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const authorId = searchParams.get('authorId');
    if (!authorId) return NextResponse.json({ error: 'authorId required' }, { status: 400 });

    const reports = await db
      .select({
        id: imprintReports.id,
        authorId: imprintReports.authorId,
        generatedAt: imprintReports.generatedAt,
        documentCount: imprintReports.documentCount,
        totalWordCount: imprintReports.totalWordCount,
        reportData: imprintReports.reportData,
      })
      .from(imprintReports)
      .where(eq(imprintReports.authorId, Number(authorId)))
      .orderBy(desc(imprintReports.generatedAt));

    return NextResponse.json(
      reports.map(r => ({
        id: r.id,
        authorId: r.authorId,
        generatedAt: r.generatedAt.toISOString(),
        documentCount: r.documentCount,
        totalWordCount: r.totalWordCount,
        ...(r.reportData as object),
      }))
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
