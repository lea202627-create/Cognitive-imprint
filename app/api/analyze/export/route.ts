// app/api/analyze/export/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authors, imprintReports } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';
import { reportToMarkdown } from '@/lib/export';
import { ImprintReport, Author } from '@/types';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const reportId = searchParams.get('reportId');
    if (!reportId) return NextResponse.json({ error: 'reportId required' }, { status: 400 });

    const [report] = await db
      .select()
      .from(imprintReports)
      .where(eq(imprintReports.id, Number(reportId)));

    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

    const [author] = await db.select().from(authors).where(eq(authors.id, report.authorId));

    const fullReport: ImprintReport = {
      id: report.id,
      authorId: report.authorId,
      generatedAt: report.generatedAt.toISOString(),
      documentCount: report.documentCount,
      totalWordCount: report.totalWordCount,
      ...(report.reportData as object),
    } as ImprintReport;

    const authorForExport: Author = {
      ...author,
      createdAt: author.createdAt.toISOString(),
      lastChecked: author.lastChecked?.toISOString() ?? null,
    };

    const markdown = reportToMarkdown(fullReport, authorForExport);

    return new NextResponse(markdown, {
      headers: {
        'Content-Type': 'text/markdown',
        'Content-Disposition': `attachment; filename="cognitive-imprint-${author.name.toLowerCase().replace(/\s+/g, '-')}.md"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
