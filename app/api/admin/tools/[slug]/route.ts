import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session.admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { slug } = await params;
  const body = (await req.json().catch(() => null)) as null | {
    name?: string;
    icon?: string | null;
    group_name?: string | null;
    sort_order?: number;
    enabled?: boolean;
  };
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const db = getDb();
  const exists = db.prepare('SELECT slug FROM tools WHERE slug = ?').get(slug);
  if (!exists) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const fields: string[] = [];
  const values: unknown[] = [];
  if (typeof body.name === 'string') {
    fields.push('name = ?');
    values.push(body.name);
  }
  if (body.icon !== undefined) {
    fields.push('icon = ?');
    values.push(body.icon || null);
  }
  if (body.group_name !== undefined) {
    fields.push('group_name = ?');
    values.push(body.group_name || null);
  }
  if (typeof body.sort_order === 'number') {
    fields.push('sort_order = ?');
    values.push(body.sort_order);
  }
  if (typeof body.enabled === 'boolean') {
    fields.push('enabled = ?');
    values.push(body.enabled ? 1 : 0);
  }
  if (fields.length === 0) return NextResponse.json({ ok: true });

  fields.push('updated_at = ?');
  values.push(Date.now());

  db.prepare(`UPDATE tools SET ${fields.join(', ')} WHERE slug = ?`).run(...values, slug);
  logEvent(AUDIT_EVENTS.TOOL_UPDATE, req, { slug, changes: body });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session.admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { slug } = await params;
  getDb().prepare('DELETE FROM tools WHERE slug = ?').run(slug);
  logEvent(AUDIT_EVENTS.TOOL_DELETE, req, { slug });
  return NextResponse.json({ ok: true });
}
