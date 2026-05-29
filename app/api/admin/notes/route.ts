import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const rows = getDb()
    .prepare(
      `SELECT slug, password_hash IS NOT NULL AS has_password,
              size_bytes, updated_at, last_viewed_at, created_at
       FROM notes
       ORDER BY updated_at DESC
       LIMIT 500`,
    )
    .all();
  return NextResponse.json({ notes: rows });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as null | {
    slugs?: string[];
    olderThanDays?: number;
  };
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const db = getDb();
  let deleted = 0;
  if (Array.isArray(body.slugs) && body.slugs.length > 0) {
    const placeholders = body.slugs.map(() => '?').join(',');
    const r = db
      .prepare(`DELETE FROM notes WHERE slug IN (${placeholders})`)
      .run(...body.slugs);
    deleted = r.changes;
    logEvent(AUDIT_EVENTS.NOTE_DELETE_BATCH, req, { slugs: body.slugs, deleted });
  } else if (typeof body.olderThanDays === 'number' && body.olderThanDays > 0) {
    const cutoff = Date.now() - body.olderThanDays * 86400_000;
    const r = db
      .prepare('DELETE FROM notes WHERE last_viewed_at < ?')
      .run(cutoff);
    deleted = r.changes;
    logEvent(AUDIT_EVENTS.NOTE_CLEANUP, req, { days: body.olderThanDays, deleted });
  }
  return NextResponse.json({ ok: true, deleted });
}
