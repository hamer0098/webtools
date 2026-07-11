import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { hasArchiveAccess } from '@/lib/archive-auth';
import { getItem, updateItem, deleteItem, serializeItem } from '@/lib/archive';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  if (!(await hasArchiveAccess())) return NextResponse.json({ error: 'locked' }, { status: 401 });
  const { id } = await params;
  const item = getItem(id);
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ item: serializeItem(item, { full: true }) });
}

export async function PATCH(req: Request, { params }: Params) {
  if (!(await hasArchiveAccess())) return NextResponse.json({ error: 'locked' }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as null | { title?: string; note?: string | null };
  if (!body) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  if (!updateItem(id, { title: body.title, note: body.note })) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  logEvent(AUDIT_EVENTS.ARCHIVE_UPDATE, req, { id });
  return NextResponse.json({ item: serializeItem(getItem(id)!, { full: true }) });
}

/** 删除是破坏性操作，仅限 admin（解锁码泄露也删不了东西） */
export async function DELETE(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  if (!deleteItem(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  logEvent(AUDIT_EVENTS.ARCHIVE_DELETE, req, { id });
  return NextResponse.json({ ok: true });
}
