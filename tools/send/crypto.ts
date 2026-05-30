/**
 * 浏览器侧加密：AES-GCM 256 + HKDF 派生 fileKey/metaKey。
 * key 以 32 字节随机数生成，base64url 编码后放进 URL fragment。
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function generateMasterKey(): Promise<Uint8Array> {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  return k;
}

async function deriveSubKey(master: Uint8Array, label: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(label) },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function deriveFileKey(master: Uint8Array): Promise<CryptoKey> {
  return deriveSubKey(master, 'send/file/v1');
}

export async function deriveMetaKey(master: Uint8Array): Promise<CryptoKey> {
  return deriveSubKey(master, 'send/meta/v1');
}

export type FileMetadata = {
  name: string;
  size: number;
  type: string;
  /** 文件密文格式版本：缺省/1 = 旧整块格式；2 = 分块流式 */
  v?: number;
  /** v2 的明文分块大小（字节），解密端据此切分密文流边界 */
  chunkSize?: number;
};

/** 分块流式（v2）参数 */
export const FILE_FORMAT_VERSION = 2;
export const FILE_CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB 明文/块
const IV_LEN = 12;
const TAG_LEN = 16;

/** 加密元数据为 base64url(iv || ciphertext) */
export async function encryptMetadata(meta: FileMetadata, master: Uint8Array): Promise<string> {
  const key = await deriveMetaKey(master);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(meta))),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return b64urlEncode(out);
}

export async function decryptMetadata(blob: string, master: Uint8Array): Promise<FileMetadata> {
  const buf = b64urlDecode(blob);
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12);
  const key = await deriveMetaKey(master);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(dec.decode(pt)) as FileMetadata;
}

/**
 * v2 分块流式加密：明文按 FILE_CHUNK_SIZE 切片，逐块 AES-GCM 加密，
 * 每块格式为 iv(12) || ciphertext(明文长 + 16 tag)，拼成一个 Blob 返回。
 *
 * 内存：用 File.slice 惰性读盘（原文件不整体进堆），加密输出累积在 Blob parts
 * 里（浏览器可落盘），堆峰值 ~1x 而非旧版整块 file.arrayBuffer 的 ~3x；
 * 且把单次大加密拆成 N 个小块，不再长时间阻塞主线程、可逐块报进度。
 */
export async function encryptFileToBlob(
  file: File,
  master: Uint8Array,
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const key = await deriveFileKey(master);
  const parts: BlobPart[] = [];
  const total = file.size;
  let offset = 0;
  // do/while 保证空文件也产出一个块（解密端据此还原 0 字节文件）
  do {
    // 每块开头检查中断点：用户取消时立刻抛 AbortError 退出
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const end = Math.min(offset + FILE_CHUNK_SIZE, total);
    const buf = await file.slice(offset, end).arrayBuffer();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buf));
    const framed = new Uint8Array(IV_LEN + ct.length);
    framed.set(iv, 0);
    framed.set(ct, IV_LEN);
    parts.push(framed);
    offset = end;
    onProgress?.(total === 0 ? 1 : offset / total);
  } while (offset < total);
  return new Blob(parts, { type: 'application/octet-stream' });
}

/**
 * v2 分块流式解密：从下载响应的 reader 边读边解，按完整加密块边界
 * （IV_LEN + chunkSize + TAG_LEN）切分缓冲，逐块解密后写入 Blob parts。
 * 末块（< 整块长度）在流结束时单独解密。返回组装好的明文 Blob。
 */
export async function decryptStreamToBlob(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  master: Uint8Array,
  chunkSize: number,
  mimeType: string,
  onProgress?: (receivedBytes: number) => void,
): Promise<Blob> {
  const key = await deriveFileKey(master);
  const encChunkLen = IV_LEN + chunkSize + TAG_LEN;
  const parts: BlobPart[] = [];
  let buffer = new Uint8Array(0);
  let received = 0;

  const decryptOne = async (enc: Uint8Array) => {
    const iv = enc.subarray(0, IV_LEN);
    const ct = enc.subarray(IV_LEN);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    parts.push(new Uint8Array(pt));
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (value && value.length) {
      received += value.length;
      onProgress?.(received);
      const merged = new Uint8Array(buffer.length + value.length);
      merged.set(buffer, 0);
      merged.set(value, buffer.length);
      buffer = merged;
      // 贪心消费所有完整加密块；剩余不足一块的留待下次/末尾
      let pos = 0;
      while (buffer.length - pos >= encChunkLen) {
        await decryptOne(buffer.subarray(pos, pos + encChunkLen));
        pos += encChunkLen;
      }
      if (pos > 0) buffer = buffer.slice(pos);
    }
    if (done) break;
  }
  if (buffer.length > 0) await decryptOne(buffer);
  return new Blob(parts, { type: mimeType || 'application/octet-stream' });
}

/** v1（旧整块格式）解密：iv(12) || ciphertext。保留用于解密历史文件。 */
export async function decryptFile(ciphertext: Uint8Array, master: Uint8Array): Promise<Uint8Array> {
  const iv = ciphertext.slice(0, 12);
  const ct = ciphertext.slice(12);
  const key = await deriveFileKey(master);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new Uint8Array(pt);
}
