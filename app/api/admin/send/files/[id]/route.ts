import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getFile, deleteFileFromDisk, deleteFileRow } from '@/lib/send';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const row = getFile(id);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  deleteFileRow(id);
  deleteFileFromDisk(row.file_path);
  logEvent(AUDIT_EVENTS.SEND_DELETE, req, { id, adminForced: true });
  return NextResponse.json({ ok: true });
}
