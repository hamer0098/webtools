/**
 * 打包导出（admin）：勾选的条目（或全部）打成 STORE zip 流式返回。
 * 文件原样进包、文字片段转 .md、url 快照放 .html，附 index.md 汇总。
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { buildExportZip } from '@/lib/archive';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as null | { ids?: string[] | 'all' };
  const ids = body?.ids === 'all' ? ('all' as const) : Array.isArray(body?.ids) ? body.ids : null;
  if (!ids || (Array.isArray(ids) && ids.length === 0)) {
    return NextResponse.json({ error: '未选择条目' }, { status: 400 });
  }

  const { stream, count } = buildExportZip(ids);
  logEvent(AUDIT_EVENTS.ARCHIVE_EXPORT, req, { count, all: ids === 'all' });

  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, '0');
  const filename = `archive-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.zip`;
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
