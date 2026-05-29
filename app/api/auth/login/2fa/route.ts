import { NextResponse } from 'next/server';
import { getAdminUser, verifyTotp } from '@/lib/admin';
import { getSession } from '@/lib/session';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';
import { consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/limits';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = consumeRateLimit(
    `login2fa:${ip}`,
    RATE_LIMITS.LOGIN_2FA.max,
    RATE_LIMITS.LOGIN_2FA.windowMs,
  );
  if (!rl.ok) {
    logEvent(AUDIT_EVENTS.RATE_LIMITED, req, { endpoint: 'login.2fa', retryAfter: rl.retryAfterSec });
    return rateLimitResponse(rl.retryAfterSec);
  }

  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const session = await getSession();

  if (!session.pre2fa) {
    return NextResponse.json({ error: '请先输入账号密码' }, { status: 401 });
  }
  const user = getAdminUser();
  if (!user || !user.totp_secret) {
    return NextResponse.json({ error: '未启用 2FA' }, { status: 400 });
  }
  if (typeof code !== 'string' || code.length < 6) {
    return NextResponse.json({ error: '请输入 6 位验证码' }, { status: 400 });
  }
  if (!verifyTotp(user.totp_secret, code)) {
    logEvent(AUDIT_EVENTS.AUTH_2FA_FAIL, req, { username: user.username });
    return NextResponse.json({ error: '验证码错误' }, { status: 401 });
  }

  session.admin = true;
  session.pre2fa = false;
  await session.save();
  logEvent(AUDIT_EVENTS.AUTH_2FA_OK, req, { username: user.username });
  return NextResponse.json({ ok: true });
}
