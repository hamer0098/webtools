import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getSession } from '@/lib/session';
import {
  cancelPending2fa,
  disable2fa,
  enable2fa,
  generatePending2faSecret,
  getAdminUser,
  verifyAdminPassword,
  verifyTotp,
} from '@/lib/admin';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// 开始 2FA 设置：生成 secret + QR
export async function POST(req: Request) {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const user = getAdminUser();
  if (!user) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (user.totp_secret) {
    return NextResponse.json({ error: '2FA 已启用，请先禁用' }, { status: 400 });
  }

  const action = new URL(req.url).searchParams.get('action');

  if (action === 'enable') {
    const { code } = (await req.json().catch(() => ({}))) as { code?: string };
    if (typeof code !== 'string') {
      return NextResponse.json({ error: 'missing code' }, { status: 400 });
    }
    if (!enable2fa(code)) {
      return NextResponse.json({ error: '验证码错误，请检查时间是否同步' }, { status: 401 });
    }
    logEvent(AUDIT_EVENTS.AUTH_2FA_ENABLED, req);
    return NextResponse.json({ ok: true });
  }

  if (action === 'cancel') {
    cancelPending2fa();
    return NextResponse.json({ ok: true });
  }

  // 默认：生成 pending secret + QR
  const { secret, uri } = generatePending2faSecret(user.username);
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
  return NextResponse.json({ secret, uri, qrDataUrl });
}

// 禁用 2FA：要当前密码 + 当前 2FA 码
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const user = getAdminUser();
  if (!user || !user.totp_secret) {
    return NextResponse.json({ error: '2FA 未启用' }, { status: 400 });
  }
  const { currentPassword, code } = (await req.json().catch(() => ({}))) as {
    currentPassword?: string;
    code?: string;
  };
  if (typeof currentPassword !== 'string' || typeof code !== 'string') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  if (!(await verifyAdminPassword(currentPassword))) {
    return NextResponse.json({ error: '当前密码错误' }, { status: 401 });
  }
  if (!verifyTotp(user.totp_secret, code)) {
    return NextResponse.json({ error: '验证码错误' }, { status: 401 });
  }
  disable2fa();
  logEvent(AUDIT_EVENTS.AUTH_2FA_DISABLED, req);
  return NextResponse.json({ ok: true });
}
