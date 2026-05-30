import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { findCode, isCodeUsable, getCodeById, resolveCodeLimits } from '@/lib/send';
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

  const limits = resolveCodeLimits(row);
  logEvent(AUDIT_EVENTS.SEND_AUTH_OK, req, { codeId: row.id, kind: row.kind });
  return NextResponse.json({
    ok: true,
    kind: row.kind,
    expiresAt: session.sendAuth.expiresAt,
    maxBytes: limits.maxBytes,
    ttlMs: limits.ttlMs,
  });
}

export async function GET() {
  const session = await getSession();
  const auth = session.sendAuth;
  const valid = auth && auth.expiresAt > Date.now();
  // 按当前授权的 code 解析出 per-code 的大小上限 / 保留时长；未授权回退全局默认
  const limits = valid
    ? resolveCodeLimits(getCodeById(auth!.codeId))
    : { maxBytes: SEND_LIMITS.DEFAULT_MAX_FILE_BYTES, ttlMs: SEND_LIMITS.DEFAULT_TTL_MS };
  return NextResponse.json({
    authed: !!valid,
    kind: valid ? auth!.kind : null,
    expiresAt: valid ? auth!.expiresAt : null,
    maxBytes: limits.maxBytes,
    ttlMs: limits.ttlMs,
  });
}
