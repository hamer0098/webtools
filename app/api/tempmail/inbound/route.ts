/**
 * CF Email Worker → 这里。
 *
 * Worker 解析完邮件后 POST 这个 endpoint，body 是 JSON：
 *   { to, from, fromName?, subject?, text?, html? }
 *
 * 鉴权：必须带 header `X-Webhook-Secret`，匹配 env TEMPMAIL_WEBHOOK_SECRET。
 * 收件地址的域名必须等于 TEMPMAIL_DOMAIN，否则拒收（防止 Worker 被串改后乱发）。
 */

import { NextResponse } from 'next/server';
import {
  newMessageId,
  saveMessage,
  parseAddress,
  getTempmailDomain,
  maybeCleanup,
} from '@/lib/tempmail';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';
import { TEMPMAIL_LIMITS, RATE_LIMITS } from '@/lib/limits';
import { consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = consumeRateLimit(
    `tempmail:inbound:${ip}`,
    RATE_LIMITS.TEMPMAIL_INBOUND.max,
    RATE_LIMITS.TEMPMAIL_INBOUND.windowMs,
  );
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  const secret = process.env.TEMPMAIL_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'webhook not configured' }, { status: 503 });
  }
  if (req.headers.get('x-webhook-secret') !== secret) {
    logEvent(AUDIT_EVENTS.TEMPMAIL_INBOUND_REJECT, req, { reason: 'bad_secret' });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        to?: string;
        from?: string;
        fromName?: string;
        subject?: string;
        text?: string;
        html?: string;
      }
    | null;
  if (!body || typeof body.to !== 'string') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const domain = getTempmailDomain();
  const parsed = parseAddress(body.to);
  if (!parsed || (domain && parsed.domain !== domain)) {
    logEvent(AUDIT_EVENTS.TEMPMAIL_INBOUND_REJECT, req, {
      reason: 'domain_mismatch',
      to: body.to,
    });
    return NextResponse.json({ error: 'address rejected' }, { status: 400 });
  }

  // 超大邮件截断（按比例保留 text/html），而不是拒收 —— 不丢邮件
  let text = body.text ?? null;
  let html = body.html ?? null;
  const totalSize = (text?.length ?? 0) + (html?.length ?? 0);
  if (totalSize > TEMPMAIL_LIMITS.MAX_MESSAGE_BYTES) {
    const ratio = TEMPMAIL_LIMITS.MAX_MESSAGE_BYTES / totalSize;
    if (text) text = text.slice(0, Math.floor(text.length * ratio));
    if (html) html = html.slice(0, Math.floor(html.length * ratio));
  }

  const id = newMessageId();
  saveMessage({
    id,
    address: body.to,
    from_addr: body.from ?? null,
    from_name: body.fromName ?? null,
    subject: body.subject ?? null,
    text_body: text,
    html_body: html,
  });

  logEvent(AUDIT_EVENTS.TEMPMAIL_INBOUND, req, {
    to: body.to,
    from: body.from,
    subject: body.subject,
    size: totalSize,
  });

  maybeCleanup();

  return NextResponse.json({ ok: true, id });
}
