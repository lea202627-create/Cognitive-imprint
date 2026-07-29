// middleware.ts
// HTTP Basic Auth gate for the whole app.
//
// The app is single-user and has no account system, but every API route can
// spend OpenRouter credits (ingest/analyze) or destroy data (DELETE /api/authors).
// Once deployed to a public URL that has to be closed off.
//
// Behaviour:
//   - BASIC_AUTH_PASSWORD unset  → no gate (local dev stays frictionless)
//   - BASIC_AUTH_PASSWORD set    → every request needs Basic credentials
//   - GET /api/track with a valid `Bearer $CRON_SECRET` bypasses the gate,
//     because Vercel Cron cannot send Basic credentials.
import { NextRequest, NextResponse } from 'next/server';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

// Length-independent comparison, so a wrong password does not leak position
// information through response timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!password) return NextResponse.next();

  const header = req.headers.get('authorization') ?? '';

  const cronSecret = process.env.CRON_SECRET;
  if (
    req.nextUrl.pathname === '/api/track' &&
    cronSecret &&
    safeEqual(header, `Bearer ${cronSecret}`)
  ) {
    return NextResponse.next();
  }

  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(':');
      const user = sep === -1 ? '' : decoded.slice(0, sep);
      const pass = sep === -1 ? '' : decoded.slice(sep + 1);
      const expectedUser = process.env.BASIC_AUTH_USER || 'admin';

      // Both comparisons always run — no early exit on the username.
      const userOk = safeEqual(user, expectedUser);
      const passOk = safeEqual(pass, password);
      if (userOk && passOk) return NextResponse.next();
    } catch {
      // Malformed base64 — fall through to the 401.
    }
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Cognitive Imprint", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}
