/**
 * 浏览器侧极简 ZIP 打包（STORE / 不压缩，零依赖）。
 *
 * 设计目标：低内存。File 对象作为 Blob part 直接塞进结果 Blob（惰性引用，
 * 不在这里读进堆）—— 真正的字节读取发生在后续 `encryptFileToBlob` 的
 * `file.slice()` 分块加密阶段，故打包本身堆峰值 ~1 个 CRC 分块。
 *
 * 为什么不压缩：内容随后会被 AES-GCM 加密，加密前压缩对二进制/已压缩文件
 * 几乎无收益，STORE 让内存与耗时可预测，且无需流式 deflate。
 *
 * 限制：不支持 ZIP64，单文件与总量都受 send 的 350MB 硬上限约束（< 4GB），
 * 故 32 位 size/offset 字段够用。
 */

// CRC32 查表（IEEE 多项式 0xEDB88320）
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** 增量 CRC32：crc 初值传 0xffffffff，结束后 `(crc ^ 0xffffffff) >>> 0` 取最终值 */
function crc32(crc: number, data: Uint8Array): number {
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
  }
  return crc >>> 0;
}

const DOS_DATE = 0x21; // 1980-01-01，固定值（不依赖运行时时钟）

function localHeader(nameBytes: Uint8Array, crc: number, size: number): Uint8Array {
  const buf = new Uint8Array(30 + nameBytes.length);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, 0x04034b50, true); // local file header signature
  dv.setUint16(4, 20, true); // version needed
  dv.setUint16(6, 0x0800, true); // flags: bit 11 = UTF-8 文件名
  dv.setUint16(8, 0, true); // method: 0 = store
  dv.setUint16(10, 0, true); // mod time
  dv.setUint16(12, DOS_DATE, true); // mod date
  dv.setUint32(14, crc, true);
  dv.setUint32(18, size, true); // compressed size
  dv.setUint32(22, size, true); // uncompressed size
  dv.setUint16(26, nameBytes.length, true);
  dv.setUint16(28, 0, true); // extra len
  buf.set(nameBytes, 30);
  return buf;
}

function centralRecord(
  nameBytes: Uint8Array,
  crc: number,
  size: number,
  offset: number,
): Uint8Array {
  const buf = new Uint8Array(46 + nameBytes.length);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, 0x02014b50, true); // central dir header signature
  dv.setUint16(4, 20, true); // version made by
  dv.setUint16(6, 20, true); // version needed
  dv.setUint16(8, 0x0800, true); // flags: UTF-8
  dv.setUint16(10, 0, true); // method: store
  dv.setUint16(12, 0, true); // mod time
  dv.setUint16(14, DOS_DATE, true); // mod date
  dv.setUint32(16, crc, true);
  dv.setUint32(20, size, true); // compressed size
  dv.setUint32(24, size, true); // uncompressed size
  dv.setUint16(28, nameBytes.length, true);
  dv.setUint16(30, 0, true); // extra len
  dv.setUint16(32, 0, true); // comment len
  dv.setUint16(34, 0, true); // disk number start
  dv.setUint16(36, 0, true); // internal attrs
  dv.setUint32(38, 0, true); // external attrs
  dv.setUint32(42, offset, true); // local header offset
  buf.set(nameBytes, 46);
  return buf;
}

function endOfCentralDir(count: number, centralSize: number, centralOffset: number): Uint8Array {
  const buf = new Uint8Array(22);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, 0x06054b50, true); // EOCD signature
  dv.setUint16(4, 0, true); // disk number
  dv.setUint16(6, 0, true); // disk with central dir
  dv.setUint16(8, count, true); // entries on this disk
  dv.setUint16(10, count, true); // total entries
  dv.setUint32(12, centralSize, true);
  dv.setUint32(16, centralOffset, true);
  dv.setUint16(20, 0, true); // comment len
  return buf;
}

/** zip 内同名文件去重：collide.txt → collide (2).txt */
function dedupeNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    if (n === 0) return name;
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    return `${base} (${n + 1})${ext}`;
  });
}

/**
 * 预测最终 zip 字节数（不读文件，仅按已知大小+头部开销算）。
 * 用于上传前的大小上限校验与界面显示，避免先打包再发现超限。
 */
export function predictZipSize(files: File[]): number {
  const enc = new TextEncoder();
  const names = dedupeNames(files.map((f) => f.name));
  let total = 22; // EOCD
  for (let i = 0; i < files.length; i++) {
    const nameLen = enc.encode(names[i]).length;
    total += 30 + nameLen + files[i].size; // local header + data
    total += 46 + nameLen; // central directory record
  }
  return total;
}

/**
 * 打包多个文件为一个 STORE zip，返回惰性 File（数据未进堆）。
 * onProgress 报告 CRC32 扫描进度（0..1），这是打包阶段唯一的全量读盘。
 */
export async function buildZip(
  files: File[],
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
): Promise<File> {
  const enc = new TextEncoder();
  const names = dedupeNames(files.map((f) => f.name));
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  const CHUNK = 4 * 1024 * 1024;

  const parts: BlobPart[] = [];
  const central: BlobPart[] = [];
  let offset = 0;
  let centralSize = 0;
  let processed = 0;

  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const file = files[i];
    const nameBytes = enc.encode(names[i]);

    // 流式计算 CRC32（zip local header 需要前置 CRC，无法用 data descriptor 省略）
    let crc = 0xffffffff;
    let off = 0;
    while (off < file.size) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      const end = Math.min(off + CHUNK, file.size);
      const buf = new Uint8Array(await file.slice(off, end).arrayBuffer());
      crc = crc32(crc, buf);
      off = end;
      processed += buf.length;
      onProgress?.(totalBytes === 0 ? 1 : processed / totalBytes);
    }
    const finalCrc = (crc ^ 0xffffffff) >>> 0;

    const header = localHeader(nameBytes, finalCrc, file.size);
    parts.push(header);
    parts.push(file); // 惰性引用，读盘发生在后续加密的 slice
    central.push(centralRecord(nameBytes, finalCrc, file.size, offset));
    centralSize += 46 + nameBytes.length;
    offset += header.length + file.size;
  }

  const eocd = endOfCentralDir(files.length, centralSize, offset);
  const blob = new Blob([...parts, ...central, eocd], { type: 'application/zip' });
  return new File([blob], `打包_${files.length}个文件.zip`, { type: 'application/zip' });
}
