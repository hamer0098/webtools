import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { Readable, Transform } from 'node:stream';
import { getFile, deleteFileFromDisk, deleteFileRow, maybeCleanup } from '@/lib/send';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/**
 * 单容器内存级「正在下载」锁：同一文件并发下载时拒绝第二个请求，
 * 但**不持久化**（不写 downloaded_at），所以下载中断不会把文件标记/销毁。
 */
const downloading = new Set<string>();

/**
 * 一次性下载（消费式）：边读边统计字节，**仅当完整读完**（sent >= 密文大小）
 * 才删除 DB 行 + 磁盘文件。下载中断 / 刷新 → 文件保留，可重新下载。
 *
 * 为什么不在开始就标记 downloaded_at：
 *   - 分块加密下半个文件根本无法解密，中断后必须能整份重下；
 *   - 旧实现一开始 claim + 任意 stream close 即删，刷新→文件被删→/meta 404（本次修复的 bug）；
 *   - 且 maybeCleanup() 会清理 downloaded_at IS NOT NULL 的行，下载途中标记有被半路清掉的风险。
 * 并发保护改用进程内 Set（单容器自用足够），完成才落删除。
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
  if (!fs.existsSync(row.file_path)) {
    deleteFileRow(id);
    return NextResponse.json({ error: '文件已不存在' }, { status: 410 });
  }
  if (downloading.has(id)) {
    return NextResponse.json({ error: '该文件正在下载中，请稍后重试' }, { status: 409 });
  }
  downloading.add(id);

  logEvent(AUDIT_EVENTS.SEND_DOWNLOAD, req, { id, size: row.ciphertext_size });

  const size = row.ciphertext_size;
  let sent = 0;
  let finalized = false;
  const fileStream = fs.createReadStream(row.file_path);
  const finalize = () => {
    if (finalized) return;
    finalized = true;
    downloading.delete(id);
    fileStream.destroy(); // 释放 fd（中断时尤其重要）
    if (sent >= size) {
      // 完整下载完成 → 一次性消费：删行 + 删盘
      deleteFileRow(id);
      deleteFileFromDisk(row.file_path);
    }
    // 否则（中断/刷新）→ 保留文件与 DB 行，等待重新下载
  };

  // 统计实际推给客户端的字节数，作为「是否下载完整」的判据
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      sent += chunk.length;
      cb(null, chunk);
    },
  });
  fileStream.on('error', finalize);
  counter.on('close', finalize);
  counter.on('error', finalize);
  fileStream.pipe(counter);

  return new Response(Readable.toWeb(counter) as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(size),
      'Cache-Control': 'no-store',
    },
  });
}
