import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const body = (await req.json().catch(() => null)) as null | { enabled?: boolean; note?: string };
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const fields: string[] = [];
  const values: unknown[] = [];
  if (typeof body.enabled === 'boolean') {
    fields.push('enabled = ?');
    values.push(body.enabled ? 1 : 0);
  }
  if (typeof body.note === 'string') {
    fields.push('note = ?');
    values.push(body.note);
  }
  if (fields.length === 0) return NextResponse.json({ ok: true });
  values.push(numId);
  getDb().prepare(`UPDATE send_codes SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  getDb().prepare('DELETE FROM send_codes WHERE id = ?').run(numId);
  logEvent(AUDIT_EVENTS.SEND_CODE_DELETE, req, { id: numId });
  return NextResponse.json({ ok: true });
}
