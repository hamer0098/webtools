import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { cleanupExpired } from '@/lib/tempmail';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const r = cleanupExpired();
  logEvent(AUDIT_EVENTS.TEMPMAIL_CLEANUP, req, r);
  return NextResponse.json({ ok: true, ...r });
}
