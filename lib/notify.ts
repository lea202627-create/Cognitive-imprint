// lib/notify.ts
// Email notification for auto-tracking runs, sent via the Resend API
// (plain fetch, no SDK — same policy as the OpenRouter transport).
//
// Configured entirely by env:
//   RESEND_API_KEY — from https://resend.com/api-keys. Unset → notifications off.
//   NOTIFY_EMAIL   — recipient. Unset → notifications off.
// With Resend's sandbox sender (onboarding@resend.dev) mails can only be
// delivered to the address that owns the Resend account — fine for this
// single-user tool.
import { TrackAuthorResult } from './tracker';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type NotifyOutcome = 'sent' | 'skipped-unconfigured' | 'skipped-no-updates' | 'failed';

export async function sendUpdateEmail(results: TrackAuthorResult[]): Promise<NotifyOutcome> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!apiKey || !to) return 'skipped-unconfigured';

  const updated = results.filter(r => r.ingested.some(i => i.success));
  if (updated.length === 0) return 'skipped-no-updates';

  const siteUrl = process.env.OPENROUTER_SITE_URL ?? '';
  const sections = updated
    .map(r => {
      const ok = r.ingested.filter(i => i.success);
      const items = ok.map(i => `<li>${escapeHtml(i.title)}</li>`).join('');
      const backlog =
        r.skipped > 0
          ? `<p style="color:#666">另有 ${r.skipped} 篇本轮未导入（每轮限量），下轮自动补上；也可在作者页手动导入。</p>`
          : '';
      return `<h3>${escapeHtml(r.authorName)} — 新增 ${ok.length} 篇</h3><ul>${items}</ul>${backlog}`;
    })
    .join('');

  const html =
    `<p>本轮自动跟踪发现你关注的作者发布了新文章，已抓取并完成认知特征分析：</p>` +
    sections +
    (siteUrl ? `<p><a href="${siteUrl}">打开 Cognitive Imprint 查看</a></p>` : '');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Cognitive Imprint <onboarding@resend.dev>',
        to: [to],
        subject: '“Cognitive Imprint”查询到你关注的作者有更新',
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[notify] Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return 'failed';
    }
    return 'sent';
  } catch (e) {
    // Never let a notification failure break the tracking run itself.
    console.error(`[notify] ${String(e).slice(0, 200)}`);
    return 'failed';
  }
}
