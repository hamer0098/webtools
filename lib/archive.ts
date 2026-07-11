/**
 * 收藏箱（archive）业务层。
 *
 * 与匿名文件（send）相反的存储模型：永久保存、无 TTL、明文落盘 —— 这是
 * 只有本人（admin 或持解锁码者）能访问的私人知识库，不做零知识加密，
 * 换取后台可预览、可打包导出。
 *
 * 三类条目：
 *  - file：TG 转发的文件，明文存 ./data/archive/{id}.bin
 *  - url ：链接收藏；可选抓取「离线快照」（图片 base64 内联的单文件 HTML）
 *  - text：文字片段，直接进 DB
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { getDb } from './db';
import { ARCHIVE_LIMITS } from './limits';

export type ArchiveItemRow = {
  id: string;
  type: 'file' | 'url' | 'text';
  title: string;
  note: string | null;
  content: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime: string | null;
  snapshot_status: 'pending' | 'ok' | 'failed' | null;
  snapshot_error: string | null;
  source: string | null;
  created_at: number;
  updated_at: number;
};

export function getArchiveDir(): string {
  const dir = process.env.ARCHIVE_DIR || path.join(process.cwd(), 'data', 'archive');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------- CRUD ----------

export function getItem(id: string): ArchiveItemRow | undefined {
  return getDb().prepare('SELECT * FROM archive_items WHERE id = ?').get(id) as
    | ArchiveItemRow
    | undefined;
}

export function listItems(opts: {
  q?: string;
  type?: string;
  offset?: number;
  limit?: number;
}): { items: ArchiveItemRow[]; total: number } {
  const wheres: string[] = [];
  const params: unknown[] = [];
  if (opts.type && ['file', 'url', 'text'].includes(opts.type)) {
    wheres.push('type = ?');
    params.push(opts.type);
  }
  if (opts.q?.trim()) {
    wheres.push('(title LIKE ? OR note LIKE ? OR content LIKE ?)');
    const like = `%${opts.q.trim()}%`;
    params.push(like, like, like);
  }
  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
  const db = getDb();
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM archive_items ${where}`).get(...params) as { c: number }
  ).c;
  const limit = Math.min(Math.max(opts.limit ?? ARCHIVE_LIMITS.PAGE_SIZE, 1), 200);
  const items = db
    .prepare(`SELECT * FROM archive_items ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, Math.max(opts.offset ?? 0, 0)) as ArchiveItemRow[];
  return { items, total };
}

export function updateItem(id: string, patch: { title?: string; note?: string | null }): boolean {
  const item = getItem(id);
  if (!item) return false;
  getDb()
    .prepare('UPDATE archive_items SET title = ?, note = ?, updated_at = ? WHERE id = ?')
    .run(
      patch.title?.trim() || item.title,
      patch.note !== undefined ? patch.note?.trim() || null : item.note,
      Date.now(),
      id,
    );
  return true;
}

export function deleteItem(id: string): boolean {
  const item = getItem(id);
  if (!item) return false;
  if (item.file_path) {
    try {
      fs.unlinkSync(item.file_path);
    } catch {
      /* 文件可能已不存在 */
    }
  }
  getDb().prepare('DELETE FROM archive_items WHERE id = ?').run(id);
  return true;
}

/** 文字首行做标题，过长截断 */
function textTitle(text: string): string {
  const first = text.trim().split('\n')[0].trim();
  return first.length > 60 ? `${first.slice(0, 60)}…` : first || '文字片段';
}

export function createFileItem(opts: {
  data: Buffer;
  name: string;
  mime: string;
  note: string | null;
  source: string;
}): ArchiveItemRow {
  const id = nanoid(16);
  const filePath = path.join(getArchiveDir(), `${id}.bin`);
  fs.writeFileSync(filePath, opts.data);
  const now = Date.now();
  try {
    getDb()
      .prepare(
        `INSERT INTO archive_items (id, type, title, note, file_path, file_name, file_size, mime, source, created_at, updated_at)
         VALUES (?, 'file', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, opts.name, opts.note, filePath, opts.name, opts.data.length, opts.mime, opts.source, now, now);
  } catch (e) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
    throw e;
  }
  return getItem(id)!;
}

export function createTextItem(opts: { text: string; source: string }): ArchiveItemRow {
  const id = nanoid(16);
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO archive_items (id, type, title, content, source, created_at, updated_at)
       VALUES (?, 'text', ?, ?, ?, ?, ?)`,
    )
    .run(id, textTitle(opts.text), opts.text, opts.source, now, now);
  return getItem(id)!;
}

export function createUrlItem(opts: { url: string; note: string | null; source: string }): ArchiveItemRow {
  const id = nanoid(16);
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO archive_items (id, type, title, note, content, source, created_at, updated_at)
       VALUES (?, 'url', ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, opts.url, opts.note, opts.url, opts.source, now, now);
  return getItem(id)!;
}

/** 给前后台接口的序列化；full=false 时 text 只给预览（全文走详情接口） */
export function serializeItem(i: ArchiveItemRow, opts?: { full?: boolean }) {
  const preview = i.type === 'text' && i.content ? i.content.slice(0, 200) : null;
  return {
    id: i.id,
    type: i.type,
    title: i.title,
    note: i.note,
    url: i.type === 'url' ? i.content : null,
    text: i.type === 'text' ? (opts?.full ? i.content : preview) : null,
    textTruncated: i.type === 'text' && !opts?.full && (i.content?.length ?? 0) > 200,
    fileName: i.file_name,
    fileSize: i.file_size,
    mime: i.mime,
    snapshotStatus: i.snapshot_status,
    snapshotError: i.snapshot_error,
    hasBlob: !!i.file_path,
    source: i.source,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
  };
}

export type ArchiveItemDto = ReturnType<typeof serializeItem>;

// ---------- 一次性解锁码（TG /code 签发） ----------

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/** 签发 6 位一次性解锁码；顺手清掉过期/已用的旧码 */
export function issueOtp(): { code: string; expiresAt: number } {
  const db = getDb();
  db.prepare('DELETE FROM archive_otps WHERE expires_at < ? OR used_at IS NOT NULL').run(Date.now());
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const expiresAt = Date.now() + ARCHIVE_LIMITS.OTP_TTL_MS;
  db.prepare('INSERT INTO archive_otps (code_hash, expires_at, created_at) VALUES (?, ?, ?)').run(
    hashCode(code),
    expiresAt,
    Date.now(),
  );
  return { code, expiresAt };
}

/** 校验并消费一次性码：成功即标记 used */
export function consumeOtp(code: string): boolean {
  const normalized = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const db = getDb();
  const row = db
    .prepare('SELECT id FROM archive_otps WHERE code_hash = ? AND used_at IS NULL AND expires_at >= ?')
    .get(hashCode(normalized), Date.now()) as { id: number } | undefined;
  if (!row) return false;
  db.prepare('UPDATE archive_otps SET used_at = ? WHERE id = ?').run(Date.now(), row.id);
  return true;
}

// ---------- URL 离线快照 ----------

/** 进行中的快照任务（防同一条目并发重复抓取） */
const snapshotting = new Set<string>();

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchWithTimeout(url: string, accept: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ARCHIVE_LIMITS.SNAPSHOT_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { 'user-agent': BROWSER_UA, accept },
      redirect: 'follow',
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** 按 content-type / meta 标签探测字符集解码 HTML（公众号是 utf-8，但兼容 gbk 老站） */
function decodeHtml(buf: Buffer, contentType: string | null): string {
  let charset =
    contentType?.match(/charset=([\w-]+)/i)?.[1] ||
    buf
      .subarray(0, 4096)
      .toString('latin1')
      .match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ||
    'utf-8';
  try {
    return new TextDecoder(charset.toLowerCase()).decode(buf);
  } catch {
    return buf.toString('utf8');
  }
}

/** 把 HTML 里的 img src 解析出来（懒加载优先 data-src，公众号全是这个） */
function pickImgSrc(tag: string): string | null {
  const dataSrc = tag.match(/\bdata-src\s*=\s*["']([^"']+)["']/i)?.[1];
  const src = tag.match(/\ssrc\s*=\s*["']([^"']+)["']/i)?.[1];
  const val = dataSrc || src;
  if (!val || val.startsWith('data:')) return null;
  return val;
}

function resolveUrl(base: string, ref: string): string | null {
  try {
    return new URL(ref, base).href;
  } catch {
    return null;
  }
}

/**
 * 抓取 URL 条目的离线快照：拉 HTML → 去脚本 → 懒加载图转正 →
 * 图片下载后 base64 内联 → 外链 CSS 内联为 <style> → 单文件 HTML 落盘。
 *
 * 服务端渲染的页面（公众号等）效果好；重 JS 的 SPA 抓不到正文，属预期。
 * 失败会把原因写进 snapshot_error，可重试。
 */
export async function snapshotUrl(itemId: string): Promise<{ ok: boolean; error?: string }> {
  const item = getItem(itemId);
  if (!item || item.type !== 'url' || !item.content) return { ok: false, error: '条目不存在' };
  if (snapshotting.has(itemId)) return { ok: false, error: '正在抓取中' };
  snapshotting.add(itemId);
  const db = getDb();
  db.prepare("UPDATE archive_items SET snapshot_status = 'pending', snapshot_error = NULL, updated_at = ? WHERE id = ?").run(
    Date.now(),
    itemId,
  );

  try {
    const res = await fetchWithTimeout(item.content, 'text/html,application/xhtml+xml,*/*');
    if (!res.ok) throw new Error(`页面返回 ${res.status}`);
    const htmlBuf = Buffer.from(await res.arrayBuffer());
    if (htmlBuf.length > ARCHIVE_LIMITS.SNAPSHOT_MAX_HTML_BYTES) {
      throw new Error(`页面 HTML 过大（${(htmlBuf.length / 1024 / 1024).toFixed(1)}MB）`);
    }
    // 跟随重定向后的最终 URL 作为相对路径基准
    const baseUrl = res.url || item.content;
    let html = decodeHtml(htmlBuf, res.headers.get('content-type'));

    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || null;

    // 去脚本：sandbox iframe 本来就不执行，但导出后本地打开也不该跑
    html = html.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/<script\b[^>]*\/>/gi, '');

    let budget = ARCHIVE_LIMITS.SNAPSHOT_MAX_TOTAL_BYTES;

    // 外链样式内联成 <style>（公众号排版靠它）；失败/超预算就保留原 <link>
    const linkTags = [...html.matchAll(/<link\b[^>]*>/gi)]
      .map((m) => m[0])
      .filter((t) => /rel\s*=\s*["']?stylesheet/i.test(t));
    for (const tag of linkTags) {
      const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
      const abs = href && resolveUrl(baseUrl, href);
      if (!abs) continue;
      try {
        const cssRes = await fetchWithTimeout(abs, 'text/css,*/*');
        if (!cssRes.ok) continue;
        const css = Buffer.from(await cssRes.arrayBuffer());
        if (css.length > budget) continue;
        budget -= css.length;
        html = html.replace(tag, `<style>\n${css.toString('utf8')}\n</style>`);
      } catch {
        /* 保留原 link */
      }
    }

    // 图片内联：逐个 <img> 下载转 data URL；单图超限/下载失败保留远程地址
    const imgTags = [...new Set([...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]))];
    let inlined = 0;
    for (const tag of imgTags) {
      if (inlined >= ARCHIVE_LIMITS.SNAPSHOT_MAX_IMAGES || budget <= 0) break;
      const src = pickImgSrc(tag);
      const abs = src && resolveUrl(baseUrl, src);
      if (!abs) continue;
      let dataUrl: string | null = null;
      try {
        const imgRes = await fetchWithTimeout(abs, 'image/*,*/*');
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          if (buf.length <= ARCHIVE_LIMITS.SNAPSHOT_MAX_IMAGE_BYTES && buf.length <= budget) {
            const mime = imgRes.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
            dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
            budget -= buf.length;
            inlined++;
          }
        }
      } catch {
        /* 保留远程地址 */
      }
      // 无论内联成败都把懒加载的 data-src 转成可用的 src / 移除 srcset
      let newTag = tag
        .replace(/\ssrcset\s*=\s*["'][^"']*["']/gi, '')
        .replace(/\sdata-src\s*=\s*["'][^"']*["']/gi, '');
      const finalSrc = dataUrl || abs;
      if (/\ssrc\s*=\s*["'][^"']*["']/i.test(newTag)) {
        newTag = newTag.replace(/\ssrc\s*=\s*["'][^"']*["']/i, ` src="${finalSrc}"`);
      } else {
        newTag = newTag.replace(/^<img/i, `<img src="${finalSrc}"`);
      }
      html = html.split(tag).join(newTag);
    }

    // 相对链接（<a href>）在离线文件里也能点：补 <base>；已有就不动
    if (!/<base\b/i.test(html)) {
      html = html.replace(/<head(\b[^>]*)?>/i, (m) => `${m}\n<base href="${baseUrl}" target="_blank">`);
    }

    const filePath = path.join(getArchiveDir(), `${itemId}.html`);
    fs.writeFileSync(filePath, html, 'utf8');
    const size = fs.statSync(filePath).size;
    db.prepare(
      `UPDATE archive_items SET snapshot_status = 'ok', snapshot_error = NULL, file_path = ?, file_size = ?,
       mime = 'text/html', title = ?, updated_at = ? WHERE id = ?`,
    ).run(filePath, size, title || item.title, Date.now(), itemId);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? '请求超时' : e.message) : '未知错误';
    db.prepare(
      "UPDATE archive_items SET snapshot_status = 'failed', snapshot_error = ?, updated_at = ? WHERE id = ?",
    ).run(msg.slice(0, 500), Date.now(), itemId);
    return { ok: false, error: msg };
  } finally {
    snapshotting.delete(itemId);
  }
}

// ---------- 打包导出（服务端 STORE zip，流式输出） ----------

// CRC32 查表（IEEE 多项式，与 tools/send/zip.ts 同源）
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

const DOS_DATE = 0x21; // 固定 1980-01-01，zip 时间戳不重要

function zipLocalHeader(nameBytes: Buffer, crc: number, size: number): Buffer {
  const buf = Buffer.alloc(30 + nameBytes.length);
  buf.writeUInt32LE(0x04034b50, 0);
  buf.writeUInt16LE(20, 4);
  buf.writeUInt16LE(0x0800, 6); // UTF-8 文件名
  buf.writeUInt16LE(0, 8); // store
  buf.writeUInt16LE(0, 10);
  buf.writeUInt16LE(DOS_DATE, 12);
  buf.writeUInt32LE(crc, 14);
  buf.writeUInt32LE(size, 18);
  buf.writeUInt32LE(size, 22);
  buf.writeUInt16LE(nameBytes.length, 26);
  buf.writeUInt16LE(0, 28);
  nameBytes.copy(buf, 30);
  return buf;
}

function zipCentralRecord(nameBytes: Buffer, crc: number, size: number, offset: number): Buffer {
  const buf = Buffer.alloc(46 + nameBytes.length);
  buf.writeUInt32LE(0x02014b50, 0);
  buf.writeUInt16LE(20, 4);
  buf.writeUInt16LE(20, 6);
  buf.writeUInt16LE(0x0800, 8);
  buf.writeUInt16LE(0, 10);
  buf.writeUInt16LE(0, 12);
  buf.writeUInt16LE(DOS_DATE, 14);
  buf.writeUInt32LE(crc, 16);
  buf.writeUInt32LE(size, 20);
  buf.writeUInt32LE(size, 24);
  buf.writeUInt16LE(nameBytes.length, 28);
  buf.writeUInt32LE(offset, 42);
  nameBytes.copy(buf, 46);
  return buf;
}

function zipEocd(count: number, centralSize: number, centralOffset: number): Buffer {
  const buf = Buffer.alloc(22);
  buf.writeUInt32LE(0x06054b50, 0);
  buf.writeUInt16LE(count, 8);
  buf.writeUInt16LE(count, 10);
  buf.writeUInt32LE(centralSize, 12);
  buf.writeUInt32LE(centralOffset, 16);
  return buf;
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>| -]/g, '_').trim() || 'untitled';
  return cleaned.length > 80 ? cleaned.slice(0, 80) : cleaned;
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

type ZipEntry = { name: string; load: () => Buffer };

/** zip 内同名去重：a.txt → a (2).txt */
function dedupeEntryNames(entries: ZipEntry[]): void {
  const seen = new Map<string, number>();
  for (const e of entries) {
    const n = seen.get(e.name) ?? 0;
    seen.set(e.name, n + 1);
    if (n > 0) {
      const dot = e.name.lastIndexOf('.');
      e.name = dot > 0 ? `${e.name.slice(0, dot)} (${n + 1})${e.name.slice(dot)}` : `${e.name} (${n + 1})`;
    }
  }
}

const TYPE_LABEL: Record<string, string> = { file: '文件', url: '链接', text: '文字' };

/**
 * 把选中条目打包成 zip（STORE 不压缩），返回流式 ReadableStream。
 * 文件原样进包、文字片段转 .md、url 快照放 .html，另附 index.md 汇总
 * （标题 / 类型 / 备注 / 原始链接 / 收藏时间）。
 * 内存峰值 = 单个最大文件（逐条读入→算 CRC→推流→释放）。
 */
export function buildExportZip(ids: string[] | 'all'): {
  stream: ReadableStream<Uint8Array>;
  count: number;
} {
  const db = getDb();
  const items = (
    ids === 'all'
      ? (db.prepare('SELECT * FROM archive_items ORDER BY created_at ASC').all() as ArchiveItemRow[])
      : ids
          .map((id) => getItem(id))
          .filter((x): x is ArchiveItemRow => !!x)
          .sort((a, b) => a.created_at - b.created_at)
  );

  const entries: ZipEntry[] = [];
  const indexLines: string[] = ['# 收藏箱导出', ''];

  for (const item of items) {
    let entryName: string | null = null;
    if (item.type === 'file' && item.file_path && fs.existsSync(item.file_path)) {
      const p = item.file_path;
      entryName = sanitizeFilename(item.file_name || item.title);
      entries.push({ name: entryName, load: () => fs.readFileSync(p) });
    } else if (item.type === 'url' && item.snapshot_status === 'ok' && item.file_path && fs.existsSync(item.file_path)) {
      const p = item.file_path;
      entryName = `${sanitizeFilename(item.title)}.html`;
      entries.push({ name: entryName, load: () => fs.readFileSync(p) });
    } else if (item.type === 'text' && item.content) {
      const c = item.content;
      entryName = `${sanitizeFilename(item.title)}.md`;
      entries.push({
        name: entryName,
        load: () =>
          Buffer.from(
            `# ${item.title}\n\n${item.note ? `> 备注：${item.note}\n\n` : ''}${c}\n`,
            'utf8',
          ),
      });
    }
    indexLines.push(
      `- **${item.title}**（${TYPE_LABEL[item.type] || item.type}，${fmtDate(item.created_at)}）` +
        (item.note ? `\n  - 备注：${item.note}` : '') +
        (item.type === 'url' && item.content ? `\n  - 原始链接：${item.content}` : '') +
        (entryName ? `\n  - 包内文件：${entryName}` : '\n  - （仅索引记录，无对应文件）'),
    );
  }
  entries.push({ name: 'index.md', load: () => Buffer.from(indexLines.join('\n') + '\n', 'utf8') });
  dedupeEntryNames(entries);

  // 逐条 header+data，最后 central directory + EOCD
  async function* chunks(): AsyncGenerator<Uint8Array> {
    const central: Buffer[] = [];
    let offset = 0;
    for (const entry of entries) {
      let data: Buffer;
      try {
        data = entry.load();
      } catch {
        continue; // 文件在导出期间被删，跳过
      }
      const nameBytes = Buffer.from(entry.name, 'utf8');
      const crc = crc32(data);
      const header = zipLocalHeader(nameBytes, crc, data.length);
      yield header;
      yield data;
      central.push(zipCentralRecord(nameBytes, crc, data.length, offset));
      offset += header.length + data.length;
    }
    let centralSize = 0;
    for (const c of central) {
      yield c;
      centralSize += c.length;
    }
    yield zipEocd(central.length, centralSize, offset);
  }

  const gen = chunks();
  return {
    count: items.length,
    stream: new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { value, done } = await gen.next();
        if (done) controller.close();
        else controller.enqueue(value);
      },
      cancel() {
        void gen.return(undefined);
      },
    }),
  };
}
