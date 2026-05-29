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
};

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

/** 加密文件 → 返回 iv(12) || ciphertext 的拼接 Uint8Array */
export async function encryptFile(file: File, master: Uint8Array): Promise<Uint8Array> {
  const key = await deriveFileKey(master);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = new Uint8Array(await file.arrayBuffer());
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buf));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out;
}

export async function decryptFile(ciphertext: Uint8Array, master: Uint8Array): Promise<Uint8Array> {
  const iv = ciphertext.slice(0, 12);
  const ct = ciphertext.slice(12);
  const key = await deriveFileKey(master);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new Uint8Array(pt);
}
