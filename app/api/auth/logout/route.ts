import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await getSession();
  const wasAdmin = !!session.admin;
  session.destroy();
  if (wasAdmin) logEvent(AUDIT_EVENTS.AUTH_LOGOUT, req);
  return NextResponse.json({ ok: true });
}
