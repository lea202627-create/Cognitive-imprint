// app/api/track/route.ts
// Auto-tracking entry points.
// GET  — Vercel Cron (see vercel.json): tracks all authors, capped per run.
//        If CRON_SECRET is set, requires Authorization: Bearer <CRON_SECRET>.
// POST — manual one-click trigger from the author page: { authorId }.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authors } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { trackAuthor, trackAllAuthors } from '@/lib/tracker';
import { sendUpdateEmail } from '@/lib/notify';

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Kill switch: set AUTO_TRACK=off to pause scheduled tracking without
  // touching vercel.json. Manual imports from the UI keep working.
  if (process.env.AUTO_TRACK === 'off') {
    return NextResponse.json({ skipped: 'auto-tracking disabled (AUTO_TRACK=off)' });
  }

  try {
    const results = await trackAllAuthors();
    const emailStatus = await sendUpdateEmail(results);
    return NextResponse.json({ ranAt: new Date().toISOString(), email: emailStatus, results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { authorId, since, until } = await req.json();
    if (!authorId) return NextResponse.json({ error: 'authorId required' }, { status: 400 });

    for (const [label, value] of [['since', since], ['until', until]] as const) {
      if (value != null && Number.isNaN(Date.parse(value))) {
        return NextResponse.json({ error: `Invalid ${label} date: ${value}` }, { status: 400 });
      }
    }

    const [author] = await db.select().from(authors).where(eq(authors.id, authorId));
    if (!author) return NextResponse.json({ error: 'Author not found' }, { status: 404 });

    // One call ingests at most one batch (serverless timeout); the client
    // loops for "all" / date-range imports until `skipped` reaches 0.
    const result = await trackAuthor(author, { since, until });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
