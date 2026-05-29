import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  getAdminUser,
  updateAdminPassword,
  verifyAdminPassword,
} from '@/lib/admin';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const user = getAdminUser();
  if (!user) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({
    username: user.username,
    has2fa: !!user.totp_secret,
    hasPending2fa: !!user.totp_pending,
    updated_at: user.updated_at,
  });
}

// 修改密码
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { currentPassword, newPassword } = (await req.json().catch(() => ({}))) as {
    currentPassword?: string;
    newPassword?: string;
  };
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: '新密码至少 8 位' }, { status: 400 });
  }
  const ok = await verifyAdminPassword(currentPassword);
  if (!ok) {
    return NextResponse.json({ error: '当前密码错误' }, { status: 401 });
  }
  await updateAdminPassword(newPassword);
  logEvent(AUDIT_EVENTS.AUTH_PWD_CHANGED, req);
  return NextResponse.json({ ok: true });
}
