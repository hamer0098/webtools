import { NextResponse } from 'next/server';
import {
  bootstrapAdminFromEnv,
  getAdminUser,
  verifyAdminPassword,
} from '@/lib/admin';
import { getSession } from '@/lib/session';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';
import { consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/limits';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = consumeRateLimit(`login:${ip}`, RATE_LIMITS.LOGIN.max, RATE_LIMITS.LOGIN.windowMs);
  if (!rl.ok) {
    logEvent(AUDIT_EVENTS.RATE_LIMITED, req, { endpoint: 'login', retryAfter: rl.retryAfterSec });
    return rateLimitResponse(rl.retryAfterSec);
  }

  const { username, password } = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };

  // 首次启动：从 env 引导出管理员
  const boot = bootstrapAdminFromEnv();
  if (boot.error && !getAdminUser()) {
    return NextResponse.json({ error: boot.error }, { status: 500 });
  }

  const user = getAdminUser();
  if (!user) {
    return NextResponse.json({ error: '管理员账号未初始化' }, { status: 500 });
  }

  if (typeof username !== 'string' || typeof password !== 'string' || username !== user.username) {
    logEvent(AUDIT_EVENTS.AUTH_LOGIN_FAIL, req, { reason: 'bad_username', username });
    return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });
  }

  const ok = await verifyAdminPassword(password);
  if (!ok) {
    logEvent(AUDIT_EVENTS.AUTH_LOGIN_FAIL, req, { reason: 'bad_password', username });
    return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });
  }

  const session = await getSession();

  if (user.totp_secret) {
    session.admin = false;
    session.pre2fa = true;
    await session.save();
    return NextResponse.json({ ok: true, require2fa: true });
  }

  session.admin = true;
  session.pre2fa = false;
  await session.save();
  logEvent(AUDIT_EVENTS.AUTH_LOGIN_OK, req, { username });
  return NextResponse.json({ ok: true });
}
