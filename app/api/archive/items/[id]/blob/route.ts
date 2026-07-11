/**
 * 收藏条目的文件内容：file 类型的原始文件 / url 类型的离线快照 HTML。
 * ?inline=1 时浏览器内联展示（图片预览、快照 iframe），否则按附件下载。
 * 快照 HTML 带 CSP sandbox 兜底（前端本来就用 <iframe sandbox> 渲染）。
 */

import fs from 'node:fs';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { hasArchiveAccess } from '@/lib/archive-auth';
import { getItem } from '@/lib/archive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  if (!(await hasArchiveAccess())) return NextResponse.json({ error: 'locked' }, { status: 401 });
  const { id } = await params;
  const item = getItem(id);
  if (!item?.file_path || !fs.existsSync(item.file_path)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const inline = new URL(req.url).searchParams.get('inline') === '1';
  const size = fs.statSync(item.file_path).size;
  const mime = item.mime || 'application/octet-stream';
  const name = item.type === 'url' ? `${item.title}.html` : item.file_name || item.title;

  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Content-Length': String(size),
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Cache-Control': 'private, no-store',
  };
  if (mime.startsWith('text/html')) headers['Content-Security-Policy'] = 'sandbox';

  const stream = Readable.toWeb(fs.createReadStream(item.file_path)) as ReadableStream;
  return new Response(stream, { headers });
}
