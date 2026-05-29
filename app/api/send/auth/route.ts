import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { findCode, isCodeUsable } from '@/lib/send';
import { consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { RATE_LIMITS, SEND_LIMITS } from '@/lib/limits';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = consumeRateLimit(`sendauth:${ip}`, RATE_LIMITS.SEND_AUTH.max, RATE_LIMITS.SEND_AUTH.windowMs);
  if (!rl.ok) {
    logEvent(AUDIT_EVENTS.RATE_LIMITED, req, { endpoint: 'send.auth', retryAfter: rl.retryAfterSec });
    return rateLimitResponse(rl.retryAfterSec);
  }

  const body = (await req.json().catch(() => null)) as { code?: string } | null;
  const code = body?.code?.trim();
  if (!code) return NextResponse.json({ error: '请输入密码或邀请码' }, { status: 400 });

  const row = findCode(code);
  if (!row || !isCodeUsable(row)) {
    logEvent(AUDIT_EVENTS.SEND_AUTH_FAIL, req, { codeMasked: code.slice(0, 2) + '***' });
    return NextResponse.json({ error: '密码或邀请码无效' }, { status: 401 });
  }

  const session = await getSession();
  session.sendAuth = {
    codeId: row.id,
    kind: row.kind,
    expiresAt: Date.now() + SEND_LIMITS.AUTH_TTL_MS,
  };
  await session.save();

  logEvent(AUDIT_EVENTS.SEND_AUTH_OK, req, { codeId: row.id, kind: row.kind });
  return NextResponse.json({
    ok: true,
    kind: row.kind,
    expiresAt: session.sendAuth.expiresAt,
    maxBytes: SEND_LIMITS.MAX_CIPHERTEXT_BYTES,
    ttlMs: SEND_LIMITS.DEFAULT_TTL_MS,
  });
}

export async function GET() {
  const session = await getSession();
  const auth = session.sendAuth;
  const valid = auth && auth.expiresAt > Date.now();
  return NextResponse.json({
    authed: !!valid,
    kind: valid ? auth!.kind : null,
    expiresAt: valid ? auth!.expiresAt : null,
    maxBytes: SEND_LIMITS.MAX_CIPHERTEXT_BYTES,
    ttlMs: SEND_LIMITS.DEFAULT_TTL_MS,
  });
}
