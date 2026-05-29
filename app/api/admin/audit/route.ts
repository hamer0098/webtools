import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getDb, type AuditLogRow } from '@/lib/db';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const event = url.searchParams.get('event');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

  const db = getDb();
  const where = event ? 'WHERE event = ?' : '';
  const args = event ? [event, limit, offset] : [limit, offset];
  const rows = db
    .prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...args) as AuditLogRow[];
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM audit_log ${where}`)
      .get(...(event ? [event] : [])) as { c: number }
  ).c;
  return NextResponse.json({ logs: rows, total });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    olderThanDays?: number;
    all?: boolean;
  };
  const db = getDb();
  let deleted = 0;

  if (body.all) {
    const r = db.prepare('DELETE FROM audit_log').run();
    deleted = r.changes;
  } else if (typeof body.olderThanDays === 'number' && body.olderThanDays > 0) {
    const cutoff = Date.now() - body.olderThanDays * 86400_000;
    const r = db.prepare('DELETE FROM audit_log WHERE created_at < ?').run(cutoff);
    deleted = r.changes;
  } else {
    return NextResponse.json({ error: '需要 olderThanDays 或 all' }, { status: 400 });
  }

  logEvent(AUDIT_EVENTS.AUDIT_CLEANUP, req, { deleted, all: !!body.all, days: body.olderThanDays });
  return NextResponse.json({ ok: true, deleted });
}
