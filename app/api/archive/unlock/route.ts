/**
 * 收藏箱前台解锁：接受 TG 一次性码（给收藏 bot 发 /code 签发）或
 * admin 的 TOTP 动态码（已启用 2FA 时）。通过后在 iron-session 写入
 * archiveUnlockedUntil，7 天内免验证。
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { consumeOtp } from '@/lib/archive';
import { getAdminUser, verifyTotp } from '@/lib/admin';
import { ARCHIVE_LIMITS, RATE_LIMITS } from '@/lib/limits';
import { consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  const unlocked =
    !!session.admin ||
    !!(session.archiveUnlockedUntil && session.archiveUnlockedUntil > Date.now());
  return NextResponse.json({
    unlocked,
    totpAvailable: !!getAdminUser()?.totp_secret,
  });
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = consumeRateLimit(
    `archive:unlock:${ip}`,
    RATE_LIMITS.ARCHIVE_UNLOCK.max,
    RATE_LIMITS.ARCHIVE_UNLOCK.windowMs,
  );
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  const body = (await req.json().catch(() => null)) as null | { code?: string };
  const code = body?.code?.trim();
  if (!code) return NextResponse.json({ error: '请输入验证码' }, { status: 400 });

  // 先试 TG 一次性码，再试 admin TOTP（同一个输入框两种码都收）
  let via: 'otp' | 'totp' | null = null;
  if (consumeOtp(code)) {
    via = 'otp';
  } else {
    const admin = getAdminUser();
    if (admin?.totp_secret && verifyTotp(admin.totp_secret, code)) via = 'totp';
  }

  if (!via) {
    logEvent(AUDIT_EVENTS.ARCHIVE_UNLOCK_FAIL, req);
    return NextResponse.json({ error: '验证码无效或已过期' }, { status: 401 });
  }

  const session = await getSession();
  session.archiveUnlockedUntil = Date.now() + ARCHIVE_LIMITS.UNLOCK_TTL_MS;
  await session.save();
  logEvent(AUDIT_EVENTS.ARCHIVE_UNLOCK_OK, req, { via });
  return NextResponse.json({ ok: true });
}
