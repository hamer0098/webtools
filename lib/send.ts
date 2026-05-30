/**
 * 匿名文件分享业务逻辑。
 *
 * 加密模型：
 *   - 客户端浏览器侧用 Web Crypto 生成 32 字节随机 key；
 *   - 用 HKDF 派生出 fileKey / metaKey（避免一密多用）；
 *   - AES-GCM 256 加密文件内容与元数据；
 *   - key 以 base64url 形式放进 URL fragment（#），服务器不接触明文密钥；
 *   - 服务器只存密文 + 加密后的元数据 blob，做一次性下载与 TTL 清理。
 */

import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './db';
import { SEND_LIMITS } from './limits';

export type SendCodeRow = {
  id: number;
  code: string;
  kind: 'permanent' | 'onetime';
  note: string | null;
  enabled: number;
  /** permanent 始终为 NULL（不限）；onetime 为允许的最大使用次数 */
  max_uses: number | null;
  /** 已使用次数，permanent 也会累加，仅作统计；onetime 用于判断是否到顶 */
  used_count: number;
  /** 该 code 上传的文件保留时长（毫秒）；NULL 表示沿用全局默认 */
  file_ttl_ms: number | null;
  /** 该 code 允许上传的单文件最大大小（明文字节）；NULL 表示沿用全局默认 50MB */
  max_file_bytes: number | null;
  /** 最近一次使用时间戳 */
  used_at: number | null;
  /** 最近一次使用 IP */
  used_by_ip: string | null;
  created_at: number;
};

export type SendFileRow = {
  id: string;
  file_path: string;
  encrypted_metadata: string;
  ciphertext_size: number;
  created_at: number;
  expires_at: number;
  downloaded_at: number | null;
  uploader_code_id: number | null;
  uploader_ip: string | null;
};

export function getUploadsDir(): string {
  const base = process.env.SEND_UPLOADS_DIR
    || path.join(path.dirname(process.env.DATABASE_PATH || './data/webtools.db'), 'uploads');
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  return base;
}

export function findCode(code: string): SendCodeRow | undefined {
  return getDb()
    .prepare('SELECT * FROM send_codes WHERE code = ? AND enabled = 1')
    .get(code.trim()) as SendCodeRow | undefined;
}

export function getCodeById(id: number): SendCodeRow | undefined {
  return getDb().prepare('SELECT * FROM send_codes WHERE id = ?').get(id) as
    | SendCodeRow
    | undefined;
}

/**
 * 把 code 行上的 per-code 配置解析成实际生效的限制：
 * 单文件大小上限（明文字节）+ 文件保留时长（毫秒）。
 * 列为空 / 非正数时回退全局默认。row 为空（如 admin 直传无 code）时给全局最大上限。
 */
export function resolveCodeLimits(row: SendCodeRow | undefined): {
  maxBytes: number;
  ttlMs: number;
} {
  const maxBytes =
    row && row.max_file_bytes && row.max_file_bytes > 0
      ? row.max_file_bytes
      : row
        ? SEND_LIMITS.DEFAULT_MAX_FILE_BYTES
        : SEND_LIMITS.MAX_FILE_BYTES;
  const ttlMs =
    row && row.file_ttl_ms && row.file_ttl_ms > 0 ? row.file_ttl_ms : SEND_LIMITS.DEFAULT_TTL_MS;
  return { maxBytes, ttlMs };
}

/** 使用一次后累加 used_count + 记录最近 IP/时间。返回更新后的 used_count。 */
export function incrementCodeUse(id: number, ip: string | null): number {
  const db = getDb();
  db.prepare(
    `UPDATE send_codes
        SET used_count = used_count + 1,
            used_at = ?,
            used_by_ip = ?
      WHERE id = ?`,
  ).run(Date.now(), ip, id);
  const row = db.prepare('SELECT used_count FROM send_codes WHERE id = ?').get(id) as
    | { used_count: number }
    | undefined;
  return row?.used_count ?? 0;
}

/** 可用判定：enabled = 1，且 onetime 时 used_count < max_uses */
export function isCodeUsable(row: SendCodeRow): boolean {
  if (!row.enabled) return false;
  if (row.kind === 'onetime') {
    const max = row.max_uses ?? 1;
    if (row.used_count >= max) return false;
  }
  return true;
}

export function insertFile(row: {
  id: string;
  file_path: string;
  encrypted_metadata: string;
  ciphertext_size: number;
  expires_at: number;
  uploader_code_id: number | null;
  uploader_ip: string | null;
}) {
  getDb()
    .prepare(
      `INSERT INTO send_files
        (id, file_path, encrypted_metadata, ciphertext_size, created_at, expires_at, uploader_code_id, uploader_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.file_path,
      row.encrypted_metadata,
      row.ciphertext_size,
      Date.now(),
      row.expires_at,
      row.uploader_code_id,
      row.uploader_ip,
    );
}

export function getFile(id: string): SendFileRow | undefined {
  return getDb().prepare('SELECT * FROM send_files WHERE id = ?').get(id) as SendFileRow | undefined;
}

export function deleteFileRow(id: string) {
  getDb().prepare('DELETE FROM send_files WHERE id = ?').run(id);
}

export function deleteFileFromDisk(filePath: string) {
  try {
    fs.unlinkSync(filePath);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.error('[send] unlink failed', filePath, e);
    }
  }
}

/** 删除已下载完成或过期的文件。返回清理条数。 */
export function cleanupExpiredFiles(): number {
  const db = getDb();
  const now = Date.now();
  const rows = db
    .prepare(
      `SELECT id, file_path FROM send_files
       WHERE expires_at < ? OR downloaded_at IS NOT NULL`,
    )
    .all(now) as Array<{ id: string; file_path: string }>;

  if (rows.length === 0) return 0;

  const del = db.prepare('DELETE FROM send_files WHERE id = ?');
  const tx = db.transaction((items: typeof rows) => {
    for (const r of items) del.run(r.id);
  });
  tx(rows);
  for (const r of rows) deleteFileFromDisk(r.file_path);
  return rows.length;
}

let lastCleanupAt = 0;
/** 节流的懒清理：每次 API 请求触发，但最多每 5 分钟跑一次 */
export function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanupAt < 5 * 60_000) return;
  lastCleanupAt = now;
  try {
    cleanupExpiredFiles();
  } catch (e) {
    console.error('[send] cleanup failed', e);
  }
}
