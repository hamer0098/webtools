import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import {
  getFile,
  claimDownload,
  deleteFileFromDisk,
  deleteFileRow,
  maybeCleanup,
} from '@/lib/send';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/**
 * 一次性下载：原子地 claim（标记 downloaded_at），打开 fd 后从盘流式输出。
 * 流结束/异常 → 删除 DB 行 + 磁盘文件（POSIX unlink 在 fd 仍打开时不影响已打开句柄）。
 * 并发：第二个请求 claimDownload 返回 false → 410。
 */
export async function GET(req: Request, { params }: Params) {
  maybeCleanup();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const row = getFile(id);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (row.expires_at < Date.now()) {
    return NextResponse.json({ error: '链接已过期' }, { status: 410 });
  }

  if (!claimDownload(id)) {
    return NextResponse.json({ error: '文件已被下载' }, { status: 410 });
  }

  if (!fs.existsSync(row.file_path)) {
    deleteFileRow(id);
    return NextResponse.json({ error: '文件已不存在' }, { status: 410 });
  }

  logEvent(AUDIT_EVENTS.SEND_DOWNLOAD, req, { id, size: row.ciphertext_size });

  // 打开 fd 后再 unlink + 删行，stream 仍能读完（仅 Linux/macOS 成立）
  const stream = fs.createReadStream(row.file_path);
  const cleanup = () => {
    deleteFileRow(id);
    deleteFileFromDisk(row.file_path);
  };
  stream.on('close', cleanup);
  stream.on('error', cleanup);

  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(row.ciphertext_size),
      'Cache-Control': 'no-store',
    },
  });
}
