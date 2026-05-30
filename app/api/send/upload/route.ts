import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { nanoid } from 'nanoid';
import { getSession } from '@/lib/session';
import {
  insertFile,
  isCodeUsable,
  incrementCodeUse,
  maybeCleanup,
  getUploadsDir,
  deleteFileFromDisk,
  resolveCodeLimits,
  type SendCodeRow,
} from '@/lib/send';
import { getClientIp, consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { RATE_LIMITS, SEND_LIMITS } from '@/lib/limits';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
// 流式上传需要 Node runtime；禁用静态/缓存
export const runtime = 'nodejs';

/**
 * 协议：
 *   PUT /api/send/upload
 *   Header:
 *     x-send-metadata: base64url 加密的元数据 blob（含 iv + 文件名/大小/MIME）
 *     content-length:  密文字节数（必填，用于早期拒绝过大文件）
 *   Body:
 *     原始密文流（AES-GCM 输出：iv || ciphertext || tag），由客户端拼好后直接 PUT
 */
export async function PUT(req: Request) {
  maybeCleanup();

  // 1. 鉴权：sendAuth 优先（这样 admin 同时登录时也会按 code 的 TTL 计算）；
  //    没有 sendAuth 时 admin 仍可直接上传（用全局默认 TTL）。
  const session = await getSession();
  let codeId: number | null = null;
  let kind: 'permanent' | 'onetime' | 'admin' = 'admin';
  // admin 直传无 code → resolveCodeLimits(undefined) 给全局最大上限 + 默认 TTL
  let { maxBytes, ttlMs } = resolveCodeLimits(undefined);

  const auth = session.sendAuth;
  const hasSendAuth = !!(auth && auth.expiresAt > Date.now());

  if (hasSendAuth) {
    // 二次校验 code 仍可用（防止已被吊销或额度耗尽）
    const codeRow = getDb()
      .prepare('SELECT * FROM send_codes WHERE id = ?')
      .get(auth!.codeId) as SendCodeRow | undefined;
    if (!codeRow || !isCodeUsable(codeRow)) {
      session.sendAuth = undefined;
      await session.save();
      return NextResponse.json({ error: '授权已失效，请重新输入' }, { status: 401 });
    }
    codeId = codeRow.id;
    kind = codeRow.kind;
    ({ maxBytes, ttlMs } = resolveCodeLimits(codeRow));
  } else if (!session.admin) {
    return NextResponse.json({ error: '请先输入密码或邀请码' }, { status: 401 });
  }

  // 服务端按密文长度兜底校验：明文上限 + 余量（覆盖分块加密开销）
  const sizeLimit = maxBytes + SEND_LIMITS.CIPHERTEXT_MARGIN_BYTES;

  // 2. 速率限制（admin 也限，防止误操作）
  const ip = getClientIp(req);
  const rl = consumeRateLimit(`sendupload:${ip}`, RATE_LIMITS.SEND_UPLOAD.max, RATE_LIMITS.SEND_UPLOAD.windowMs);
  if (!rl.ok) {
    logEvent(AUDIT_EVENTS.RATE_LIMITED, req, { endpoint: 'send.upload', retryAfter: rl.retryAfterSec });
    return rateLimitResponse(rl.retryAfterSec);
  }

  // 3. 头校验
  const meta = req.headers.get('x-send-metadata');
  if (!meta || meta.length > 8 * 1024) {
    return NextResponse.json({ error: '缺失或非法元数据头' }, { status: 400 });
  }
  const declaredLenStr = req.headers.get('content-length');
  const declaredLen = declaredLenStr ? Number(declaredLenStr) : 0;
  if (!declaredLen || Number.isNaN(declaredLen) || declaredLen <= 0) {
    return NextResponse.json({ error: '缺失 Content-Length' }, { status: 411 });
  }
  if (declaredLen > sizeLimit) {
    return NextResponse.json(
      { error: `文件超过上限 ${Math.round(maxBytes / 1024 / 1024)}MB` },
      { status: 413 },
    );
  }
  if (!req.body) {
    return NextResponse.json({ error: '空请求体' }, { status: 400 });
  }

  // 4. 流式写盘 + 强制大小上限
  const id = nanoid(16);
  const uploadsDir = getUploadsDir();
  const filePath = path.join(uploadsDir, `${id}.bin`);

  let written = 0;
  const limit = sizeLimit;
  let aborted = false;

  const nodeReadable = Readable.fromWeb(req.body as unknown as import('node:stream/web').ReadableStream);
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      written += chunk.length;
      if (written > limit) {
        aborted = true;
        cb(new Error('size_exceeded'));
        return;
      }
      cb(null, chunk);
    },
  });
  const out = fs.createWriteStream(filePath);

  try {
    await pipeline(nodeReadable, limiter, out);
  } catch (e: unknown) {
    deleteFileFromDisk(filePath);
    if (aborted) {
      return NextResponse.json({ error: '文件超过上限' }, { status: 413 });
    }
    console.error('[send] upload pipeline failed', e);
    return NextResponse.json({ error: '上传失败' }, { status: 500 });
  }

  // 5. 写 DB（按 code 自定义 TTL，没设置则用全局默认）
  const expiresAt = Date.now() + ttlMs;
  try {
    insertFile({
      id,
      file_path: filePath,
      encrypted_metadata: meta,
      ciphertext_size: written,
      expires_at: expiresAt,
      uploader_code_id: codeId,
      uploader_ip: ip,
    });
  } catch (e) {
    deleteFileFromDisk(filePath);
    console.error('[send] insert failed', e);
    return NextResponse.json({ error: '上传失败' }, { status: 500 });
  }

  // 6. 累加 code 使用次数；onetime 用尽后清掉 session 强制重输
  if (codeId) {
    const newCount = incrementCodeUse(codeId, ip);
    if (kind === 'onetime') {
      const fresh = getDb()
        .prepare('SELECT max_uses FROM send_codes WHERE id = ?')
        .get(codeId) as { max_uses: number | null } | undefined;
      const max = fresh?.max_uses ?? 1;
      if (newCount >= max) {
        session.sendAuth = undefined;
        await session.save();
      }
    }
  }

  logEvent(AUDIT_EVENTS.SEND_UPLOAD, req, { id, size: written, codeId, kind });
  return NextResponse.json({ id, expiresAt });
}
