import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import { cleanupExpiredFiles, deleteFileFromDisk, deleteFileRow, getFile } from '@/lib/send';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const rows = getDb()
    .prepare(
      `SELECT id, ciphertext_size, created_at, expires_at, downloaded_at,
              uploader_code_id, uploader_ip
       FROM send_files
       ORDER BY created_at DESC
       LIMIT 500`,
    )
    .all();
  return NextResponse.json({ files: rows });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as null | { ids?: string[] };
  const ids = Array.isArray(body?.ids) ? body!.ids.filter((s) => typeof s === 'string') : [];
  if (ids.length === 0) return NextResponse.json({ error: 'ids required' }, { status: 400 });

  let deleted = 0;
  for (const id of ids) {
    const row = getFile(id);
    if (!row) continue;
    deleteFileRow(id);
    deleteFileFromDisk(row.file_path);
    deleted++;
  }
  logEvent(AUDIT_EVENTS.SEND_DELETE, req, { ids, deleted, adminBatch: true });
  return NextResponse.json({ ok: true, deleted });
}

export async function POST(req: Request) {
  // 触发清理
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const url = new URL(req.url);
  if (url.searchParams.get('action') === 'cleanup') {
    const n = cleanupExpiredFiles();
    logEvent(AUDIT_EVENTS.SEND_CLEANUP, req, { deleted: n });
    return NextResponse.json({ ok: true, deleted: n });
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
