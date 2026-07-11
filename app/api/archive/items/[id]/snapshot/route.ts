/**
 * 手动触发 / 重试 URL 条目的离线快照（前台详情页、后台列表都会调）。
 * 同步等待抓取完成再返回 —— 逐图下载可能要几十秒，前端要给等待态。
 */

import { NextResponse } from 'next/server';
import { hasArchiveAccess } from '@/lib/archive-auth';
import { getItem, serializeItem, snapshotUrl } from '@/lib/archive';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  if (!(await hasArchiveAccess())) return NextResponse.json({ error: 'locked' }, { status: 401 });
  const { id } = await params;
  const item = getItem(id);
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (item.type !== 'url') return NextResponse.json({ error: '仅链接条目可抓取快照' }, { status: 400 });

  const result = await snapshotUrl(id);
  logEvent(result.ok ? AUDIT_EVENTS.ARCHIVE_SNAPSHOT_OK : AUDIT_EVENTS.ARCHIVE_SNAPSHOT_FAIL, req, {
    id,
    ...(result.error ? { error: result.error } : {}),
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, item: serializeItem(getItem(id)!, { full: true }) },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, item: serializeItem(getItem(id)!, { full: true }) });
}
