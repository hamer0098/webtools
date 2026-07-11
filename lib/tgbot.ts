/**
 * TG 机器人 → 匿名文件桥接。
 *
 * 流程：给绑定的 bot 发/转发文件 → Telegram 推 webhook →
 *   服务端 getFile 拉取文件 → 用与浏览器端相同的 v2 分块格式加密 →
 *   走 lib/send.ts 入库（一次性下载 + TTL 照旧）→ 回复 /anonfile/d/{id}#{key} 链接。
 *
 * 注意：这条链路里明文经过服务器（TG 本来就把文件给了服务器），
 * 不是浏览器直传那种零知识；但落盘仍是密文、key 只出现在回给用户的链接 fragment 里，
 * 存储格式与网页上传完全一致，下载页无感。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { getDb } from './db';
import { insertFile, getUploadsDir, deleteFileFromDisk } from './send';
import { ARCHIVE_LIMITS, SEND_LIMITS, TGBOT_LIMITS } from './limits';
import {
  createFileItem,
  createTextItem,
  createUrlItem,
  deleteItem as deleteArchiveItem,
  findItemByTgRef,
  getItem as getArchiveItem,
  issueOtp,
  setItemTgRef,
  snapshotUrl,
  updateItem as updateArchiveItem,
} from './archive';

const subtle = crypto.webcrypto.subtle;

export type TgBotRow = {
  id: number;
  name: string;
  token: string;
  username: string | null;
  enabled: number;
  /** 逗号分隔的 TG 用户 ID 白名单；空/NULL = 拒绝所有 */
  allowed_user_ids: string | null;
  webhook_secret: string;
  /** 该 bot 上传文件的保留时长（毫秒）；NULL → 全局默认。仅 purpose='send' 用 */
  file_ttl_ms: number | null;
  /** 'send' = 转发文件→匿名文件；'archive' = 收藏箱入口 */
  purpose: 'send' | 'archive';
  webhook_set_at: number | null;
  last_used_at: number | null;
  created_at: number;
};

// ---------- CRUD ----------

export function listBots(): TgBotRow[] {
  return getDb().prepare('SELECT * FROM tg_bots ORDER BY created_at DESC').all() as TgBotRow[];
}

export function getBot(id: number): TgBotRow | undefined {
  return getDb().prepare('SELECT * FROM tg_bots WHERE id = ?').get(id) as TgBotRow | undefined;
}

export function createBot(row: {
  name: string;
  token: string;
  username: string | null;
  allowed_user_ids: string | null;
  file_ttl_ms: number | null;
  purpose: 'send' | 'archive';
}): TgBotRow {
  const r = getDb()
    .prepare(
      `INSERT INTO tg_bots (name, token, username, allowed_user_ids, webhook_secret, file_ttl_ms, purpose, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.name,
      row.token,
      row.username,
      row.allowed_user_ids,
      nanoid(32),
      row.file_ttl_ms,
      row.purpose,
      Date.now(),
    );
  return getBot(Number(r.lastInsertRowid))!;
}

export function deleteBot(id: number) {
  getDb().prepare('DELETE FROM tg_bots WHERE id = ?').run(id);
}

export function markWebhookSet(id: number, ok: boolean) {
  getDb()
    .prepare('UPDATE tg_bots SET webhook_set_at = ? WHERE id = ?')
    .run(ok ? Date.now() : null, id);
}

function touchBotUsed(id: number) {
  getDb().prepare('UPDATE tg_bots SET last_used_at = ? WHERE id = ?').run(Date.now(), id);
}

/** token 打码用于展示：只留 bot id 前缀和末 4 位 */
export function maskToken(token: string): string {
  const colon = token.indexOf(':');
  const prefix = colon > 0 ? token.slice(0, colon + 1) : token.slice(0, 4);
  return `${prefix}···${token.slice(-4)}`;
}

/** 给后台接口的序列化：token 不出后台，只给打码版 */
export function serializeBot(b: TgBotRow) {
  return {
    id: b.id,
    name: b.name,
    tokenMasked: maskToken(b.token),
    username: b.username,
    enabled: !!b.enabled,
    purpose: b.purpose,
    allowedUserIds: b.allowed_user_ids || '',
    fileTtlMs: b.file_ttl_ms,
    webhookSetAt: b.webhook_set_at,
    lastUsedAt: b.last_used_at,
    createdAt: b.created_at,
  };
}

export type TgBotDto = ReturnType<typeof serializeBot>;

// ---------- 站点 base URL ----------

/** 优先 env PUBLIC_BASE_URL，否则从请求头推导（Caddy 反代会带正确的 host/proto） */
export function getBaseUrl(req: Request): string {
  const env = process.env.PUBLIC_BASE_URL?.trim();
  if (env) return env.replace(/\/+$/, '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
  const proto =
    req.headers.get('x-forwarded-proto') ||
    (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}

// ---------- Telegram Bot API ----------

async function tgApi<T>(token: string, method: string, payload?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const json = (await res.json().catch(() => null)) as
    | { ok: boolean; result?: T; description?: string }
    | null;
  if (!json?.ok) throw new Error(`tg ${method} failed: ${json?.description || res.status}`);
  return json.result as T;
}

export async function tgGetMe(token: string): Promise<{ id: number; username?: string; first_name?: string }> {
  return tgApi(token, 'getMe');
}

export async function tgSetWebhook(bot: TgBotRow, baseUrl: string): Promise<void> {
  await tgApi(bot.token, 'setWebhook', {
    url: `${baseUrl}/api/tgbot/webhook/${bot.id}`,
    secret_token: bot.webhook_secret,
    // callback_query：收藏 bot 的「离线保存全文」内联按钮回调；send bot 用不到但无害
    allowed_updates: ['message', 'callback_query'],
  });
}

export async function tgDeleteWebhook(token: string): Promise<void> {
  await tgApi(token, 'deleteWebhook');
}

type TgInlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };

async function tgSendMessage(
  token: string,
  chatId: number,
  text: string,
  replyTo?: number,
  replyMarkup?: TgInlineKeyboard,
): Promise<{ message_id: number }> {
  return tgApi(token, 'sendMessage', {
    chat_id: chatId,
    text,
    // 回复里常带下载/查看链接，关掉链接预览卡片省屏幕
    link_preview_options: { is_disabled: true },
    // 引用触发消息，多文件连发时能对上号；被引用消息删了也不失败
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

/** 应答内联按钮点击（消掉客户端的加载态；text 会以 toast 显示） */
async function tgAnswerCallbackQuery(token: string, callbackQueryId: string, text?: string) {
  await tgApi(token, 'answerCallbackQuery', { callback_query_id: callbackQueryId, ...(text ? { text } : {}) }).catch(
    (e) => console.error('[tgbot] answerCallbackQuery failed', e),
  );
}

async function tgDownloadFile(token: string, fileId: string): Promise<Buffer> {
  const info = await tgApi<{ file_path?: string; file_size?: number }>(token, 'getFile', {
    file_id: fileId,
  });
  if (!info.file_path) throw new Error('getFile: no file_path');
  if (info.file_size && info.file_size > TGBOT_LIMITS.MAX_TG_FILE_BYTES) {
    throw new Error('file too big');
  }
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${info.file_path}`);
  if (!res.ok) throw new Error(`file download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ---------- 服务端加密入库（与 tools/send/crypto.ts 的 v2 分块格式逐字节兼容） ----------

const FILE_CHUNK_SIZE = 4 * 1024 * 1024;
const IV_LEN = 12;

async function deriveSubKey(master: Uint8Array, label: string): Promise<CryptoKey> {
  const baseKey = await subtle.importKey('raw', master, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(label) },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * 加密并写入匿名文件存储。返回文件 id 与 base64url 的 master key
 * （拼下载链接用：/anonfile/d/{id}#{key}）。
 */
export async function encryptAndStoreSendFile(opts: {
  data: Buffer;
  name: string;
  mime: string;
  ttlMs: number;
  uploaderIp: string | null;
}): Promise<{ id: string; key: string; expiresAt: number }> {
  const master = new Uint8Array(crypto.randomBytes(32));
  const fileKey = await deriveSubKey(master, 'send/file/v1');
  const metaKey = await deriveSubKey(master, 'send/meta/v1');

  // 分块加密：每块 iv(12) || ciphertext(明文 + 16 tag)；do/while 保证空文件也有一块
  const parts: Buffer[] = [];
  const total = opts.data.length;
  let offset = 0;
  do {
    const end = Math.min(offset + FILE_CHUNK_SIZE, total);
    const iv = crypto.randomBytes(IV_LEN);
    const ct = Buffer.from(
      await subtle.encrypt({ name: 'AES-GCM', iv }, fileKey, opts.data.subarray(offset, end)),
    );
    parts.push(Buffer.concat([iv, ct]));
    offset = end;
  } while (offset < total);
  const ciphertext = Buffer.concat(parts);

  const meta = { name: opts.name, size: total, type: opts.mime, v: 2, chunkSize: FILE_CHUNK_SIZE };
  const metaIv = crypto.randomBytes(IV_LEN);
  const metaCt = Buffer.from(
    await subtle.encrypt({ name: 'AES-GCM', iv: metaIv }, metaKey, Buffer.from(JSON.stringify(meta))),
  );
  const encryptedMetadata = Buffer.concat([metaIv, metaCt]).toString('base64url');

  const id = nanoid(16);
  const filePath = path.join(getUploadsDir(), `${id}.bin`);
  fs.writeFileSync(filePath, ciphertext);
  const expiresAt = Date.now() + opts.ttlMs;
  try {
    insertFile({
      id,
      file_path: filePath,
      encrypted_metadata: encryptedMetadata,
      ciphertext_size: ciphertext.length,
      expires_at: expiresAt,
      uploader_code_id: null,
      uploader_ip: opts.uploaderIp,
    });
  } catch (e) {
    deleteFileFromDisk(filePath);
    throw e;
  }
  return { id, key: Buffer.from(master).toString('base64url'), expiresAt };
}

// ---------- update 处理 ----------

type TgMessage = {
  message_id: number;
  from?: { id: number; username?: string; first_name?: string };
  chat?: { id: number; type: string };
  text?: string;
  /** 媒体消息附带的文字说明（收藏 bot 用它当备注） */
  caption?: string;
  /** 被回复的消息；收藏 bot 用「回复确认消息」给对应条目设备注 */
  reply_to_message?: { message_id: number };
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  photo?: Array<{ file_id: string; file_size?: number }>;
  video?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  animation?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  audio?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  voice?: { file_id: string; mime_type?: string; file_size?: number };
  video_note?: { file_id: string; file_size?: number };
  sticker?: { file_id: string; file_size?: number; is_animated?: boolean; is_video?: boolean };
};

type TgCallbackQuery = {
  id: string;
  from?: { id: number };
  message?: { message_id: number; chat?: { id: number } };
  data?: string;
};

export type TgUpdate = { update_id?: number; message?: TgMessage; callback_query?: TgCallbackQuery };

type IncomingFile = { fileId: string; size: number | null; name: string; mime: string };

/** 从消息里挑出可下载的文件；photo 取最大尺寸那张 */
function extractIncomingFile(msg: TgMessage): IncomingFile | null {
  const mid = msg.message_id;
  if (msg.document) {
    return {
      fileId: msg.document.file_id,
      size: msg.document.file_size ?? null,
      name: msg.document.file_name || `file_${mid}`,
      mime: msg.document.mime_type || 'application/octet-stream',
    };
  }
  if (msg.photo?.length) {
    const largest = msg.photo[msg.photo.length - 1];
    return { fileId: largest.file_id, size: largest.file_size ?? null, name: `photo_${mid}.jpg`, mime: 'image/jpeg' };
  }
  if (msg.video) {
    return {
      fileId: msg.video.file_id,
      size: msg.video.file_size ?? null,
      name: msg.video.file_name || `video_${mid}.mp4`,
      mime: msg.video.mime_type || 'video/mp4',
    };
  }
  if (msg.animation) {
    return {
      fileId: msg.animation.file_id,
      size: msg.animation.file_size ?? null,
      name: msg.animation.file_name || `animation_${mid}.mp4`,
      mime: msg.animation.mime_type || 'video/mp4',
    };
  }
  if (msg.audio) {
    return {
      fileId: msg.audio.file_id,
      size: msg.audio.file_size ?? null,
      name: msg.audio.file_name || `audio_${mid}.mp3`,
      mime: msg.audio.mime_type || 'audio/mpeg',
    };
  }
  if (msg.voice) {
    return {
      fileId: msg.voice.file_id,
      size: msg.voice.file_size ?? null,
      name: `voice_${mid}.ogg`,
      mime: msg.voice.mime_type || 'audio/ogg',
    };
  }
  if (msg.video_note) {
    return { fileId: msg.video_note.file_id, size: msg.video_note.file_size ?? null, name: `video_note_${mid}.mp4`, mime: 'video/mp4' };
  }
  return null;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function fmtExpire(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export type TgHandleResult =
  | { action: 'ignored' | 'no_file' }
  | { action: 'reject_user'; fromId: number | null }
  | { action: 'too_big'; size: number }
  | { action: 'error'; reason: string }
  | { action: 'uploaded'; id: string; size: number; name: string }
  | { action: 'archived'; itemId: string; itemType: string; title: string }
  | { action: 'otp_issued' }
  | { action: 'snapshot_requested'; itemId: string };

/** 白名单校验：不在名单返回 false */
function isAllowedUser(bot: TgBotRow, fromId: number | null): boolean {
  const allowed = (bot.allowed_user_ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return fromId != null && allowed.includes(String(fromId));
}

/**
 * 处理一条 webhook update，按 bot 用途分发（send=匿名文件桥 / archive=收藏箱）。
 * 所有分支都会给用户回消息（能回的话），返回值只用于审计日志；
 * 不抛错（内部兜底），调用方始终回 TG 200。
 */
export async function handleTgUpdate(
  bot: TgBotRow,
  update: TgUpdate,
  baseUrl: string,
): Promise<TgHandleResult> {
  if (bot.purpose === 'archive') return handleArchiveUpdate(bot, update, baseUrl);
  return handleSendUpdate(bot, update, baseUrl);
}

async function handleSendUpdate(
  bot: TgBotRow,
  update: TgUpdate,
  baseUrl: string,
): Promise<TgHandleResult> {
  const msg = update.message;
  if (!msg?.chat) return { action: 'ignored' };
  const chatId = msg.chat.id;
  const reply = (text: string) =>
    tgSendMessage(bot.token, chatId, text, msg.message_id).catch((e) =>
      console.error('[tgbot] reply failed', e),
    );

  // 白名单：不在名单里就把对方的用户 ID 报出来，方便去后台加白
  const fromId = msg.from?.id ?? null;
  if (!isAllowedUser(bot, fromId)) {
    await reply(
      `⛔ 未授权使用。\n你的 Telegram 用户 ID：${fromId ?? '未知'}\n请在后台「TG 机器人」把这个 ID 加进白名单后重试。`,
    );
    return { action: 'reject_user', fromId };
  }

  const file = extractIncomingFile(msg);
  if (!file) {
    if (msg.text) {
      await reply('把文件直接发给我（或转发含文件的消息），我会上传到匿名文件并回你下载链接。');
    }
    return { action: 'no_file' };
  }

  if (file.size && file.size > TGBOT_LIMITS.MAX_TG_FILE_BYTES) {
    await reply(
      `⚠️ 文件太大（${fmtSize(file.size)}）。Telegram 只允许机器人下载 ≤20MB 的文件，更大的请走网页上传。`,
    );
    return { action: 'too_big', size: file.size };
  }

  try {
    const data = await tgDownloadFile(bot.token, file.fileId);
    const ttlMs = bot.file_ttl_ms && bot.file_ttl_ms > 0 ? bot.file_ttl_ms : SEND_LIMITS.DEFAULT_TTL_MS;
    const { id, key, expiresAt } = await encryptAndStoreSendFile({
      data,
      name: file.name,
      mime: file.mime,
      ttlMs,
      uploaderIp: `tgbot:${bot.id}`,
    });
    touchBotUsed(bot.id);
    const link = `${baseUrl}/anonfile/d/${id}#${key}`;
    await reply(
      `✅ ${file.name}（${fmtSize(data.length)}）已上传\n\n${link}\n\n⚠️ 链接仅能完整下载一次，未下载则 ${fmtExpire(expiresAt)} 过期`,
    );
    return { action: 'uploaded', id, size: data.length, name: file.name };
  } catch (e) {
    console.error('[tgbot] handle file failed', e);
    await reply('⚠️ 处理失败，请稍后重试。');
    return { action: 'error', reason: e instanceof Error ? e.message : 'unknown' };
  }
}

// ---------- 收藏箱分支（purpose='archive'） ----------

const URL_RE = /https?:\/\/[^\s<>"'）)】\]]+/g;

/**
 * 「转发 + 文字描述」配对：TG 的转发附言是独立的文字消息，与被转发的文件
 * 先后到达（顺序不保证）。用短时间窗把同一聊天里相邻的 文字↔文件 配成
 * 「文件 + 备注」，而不是各存一条。进程内存即可（单容器 + 窗口只有几十秒）。
 */
type PendingText = { itemId: string | null; text: string; at: number };
type RecentFiles = { itemIds: string[]; at: number };
const pendingTextByChat = new Map<string, PendingText>();
const recentFilesByChat = new Map<string, RecentFiles>();
/** 文字先到、文件随后（转发带附言的自动流，几乎同时到达） */
const TEXT_BEFORE_FILE_MS = 10_000;
/** 文件先到、文字随后（转发后手动补一句描述，给足打字时间） */
const TEXT_AFTER_FILE_MS = 60_000;

/**
 * 收藏 bot：文件→存档（caption 当备注）、含链接的文字→存链接并给「离线保存全文」
 * 按钮、纯文字→存片段、/code→签发前台一次性解锁码。
 */
async function handleArchiveUpdate(
  bot: TgBotRow,
  update: TgUpdate,
  baseUrl: string,
): Promise<TgHandleResult> {
  // 内联按钮回调：触发 URL 全文快照
  const cb = update.callback_query;
  if (cb) {
    const cbFromId = cb.from?.id ?? null;
    if (!isAllowedUser(bot, cbFromId)) {
      await tgAnswerCallbackQuery(bot.token, cb.id, '未授权');
      return { action: 'reject_user', fromId: cbFromId };
    }
    const itemId = cb.data?.match(/^snap:(.+)$/)?.[1];
    const cbChatId = cb.message?.chat?.id;
    if (!itemId || !cbChatId) {
      await tgAnswerCallbackQuery(bot.token, cb.id);
      return { action: 'ignored' };
    }
    if (!getArchiveItem(itemId)) {
      await tgAnswerCallbackQuery(bot.token, cb.id, '条目不存在（可能已被删除）');
      return { action: 'ignored' };
    }
    await tgAnswerCallbackQuery(bot.token, cb.id, '开始抓取…');
    // 抓取可能要几十秒（逐图下载内联），不阻塞 webhook 响应；跑完再发结果消息。
    // 常驻 node 进程（Docker standalone），fire-and-forget 安全
    void snapshotUrl(itemId)
      .then((r) =>
        tgSendMessage(
          bot.token,
          cbChatId,
          r.ok
            ? `📥 已离线保存全文：${getArchiveItem(itemId)?.title || ''}\n查看：${baseUrl}/archive`
            : `⚠️ 全文抓取失败：${r.error}\n可回到原消息再点一次按钮重试。`,
          cb.message?.message_id,
        ),
      )
      .catch((e) => console.error('[tgbot] snapshot task failed', e));
    touchBotUsed(bot.id);
    return { action: 'snapshot_requested', itemId };
  }

  const msg = update.message;
  if (!msg?.chat) return { action: 'ignored' };
  const chatId = msg.chat.id;
  // 返回已发出消息的 message_id（发送失败返回 null）—— 存进条目 tg_ref，
  // 之后用户「回复」这条确认消息即可设置备注
  const reply = (text: string, markup?: TgInlineKeyboard) =>
    tgSendMessage(bot.token, chatId, text, msg.message_id, markup)
      .then((m) => m.message_id)
      .catch((e) => {
        console.error('[tgbot] reply failed', e);
        return null;
      });

  const fromId = msg.from?.id ?? null;
  if (!isAllowedUser(bot, fromId)) {
    await reply(
      `⛔ 未授权使用。\n你的 Telegram 用户 ID：${fromId ?? '未知'}\n请在后台「TG 机器人」把这个 ID 加进白名单后重试。`,
    );
    return { action: 'reject_user', fromId };
  }

  const source = `tgbot:${bot.id}`;
  const text = msg.text?.trim();

  // 回复某条「✅ 已收藏」确认消息 → 把回复内容设为该条目的备注
  if (msg.reply_to_message && text && !text.startsWith('/')) {
    const target = findItemByTgRef(`${chatId}:${msg.reply_to_message.message_id}`);
    if (target) {
      updateArchiveItem(target.id, { note: text });
      await reply(`📌 已更新备注：${text}`);
      return { action: 'archived', itemId: target.id, itemType: 'note', title: target.title };
    }
    // 回复的不是确认消息（比如引用别的消息发链接）→ 按普通消息继续处理
  }

  if (text === '/code') {
    const { code } = issueOtp();
    await reply(`🔑 一次性解锁码：${code}\n\n5 分钟内在 ${baseUrl}/archive 输入即可解锁（用一次作废，解锁后 7 天有效）。`);
    return { action: 'otp_issued' };
  }
  if (text === '/start' || text === '/help') {
    await reply(
      '这是你的收藏箱 bot：\n\n' +
        '📄 发/转发文件（≤20MB）→ 永久存档；转发时带的文字（或 1 分钟内补发的文字）自动当备注\n' +
        '🔗 发链接 → 收藏网址，可一键离线保存全文（含配图）；链接旁的文字自动当备注\n' +
        '📝 发文字 → 收藏文字片段\n' +
        '📌 回复任意一条「已收藏」确认消息 → 给那条收藏加/改备注\n\n' +
        `查看：${baseUrl}/archive\n/code 获取网页解锁码`,
    );
    return { action: 'ignored' };
  }

  // 文件（转发的文档/图片/视频等）
  const file = extractIncomingFile(msg);
  if (file) {
    if (file.size && file.size > TGBOT_LIMITS.MAX_TG_FILE_BYTES) {
      await reply(`⚠️ 文件太大（${fmtSize(file.size)}）。Telegram 只允许机器人下载 ≤20MB 的文件。`);
      return { action: 'too_big', size: file.size };
    }
    try {
      const data = await tgDownloadFile(bot.token, file.fileId);
      let note = msg.caption?.trim() || null;
      const chatKey = `${bot.id}:${chatId}`;
      // 刚发过一段文字（转发附言先到）→ 挪来当备注，撤销刚建的文字条目
      const pt = pendingTextByChat.get(chatKey);
      if (!note && pt && Date.now() - pt.at < TEXT_BEFORE_FILE_MS) {
        note = pt.text;
        if (pt.itemId) {
          deleteArchiveItem(pt.itemId);
          pt.itemId = null; // 同批转发多个文件共享附言，条目只删一次
        }
      }
      const item = createFileItem({ data, name: file.name, mime: file.mime, note, source });
      // 记录到「最近文件」，之后 60 秒内发的纯文字会自动当这批文件的备注
      const rf = recentFilesByChat.get(chatKey);
      if (rf && Date.now() - rf.at < TEXT_AFTER_FILE_MS) {
        rf.itemIds.push(item.id);
        rf.at = Date.now();
      } else {
        recentFilesByChat.set(chatKey, { itemIds: [item.id], at: Date.now() });
      }
      touchBotUsed(bot.id);
      const mid = await reply(
        `✅ 已收藏文件：${file.name}（${fmtSize(data.length)}）${note ? `\n备注：${note}` : ''}\n\n回复本条消息可加备注 · 查看：${baseUrl}/archive`,
      );
      if (mid) setItemTgRef(item.id, `${chatId}:${mid}`);
      return { action: 'archived', itemId: item.id, itemType: 'file', title: item.title };
    } catch (e) {
      console.error('[tgbot] archive file failed', e);
      await reply('⚠️ 收藏失败，请稍后重试。');
      return { action: 'error', reason: e instanceof Error ? e.message : 'unknown' };
    }
  }

  if (text) {
    if (Buffer.byteLength(text, 'utf8') > ARCHIVE_LIMITS.MAX_TEXT_BYTES) {
      await reply('⚠️ 文字太长（超过 256KB），请拆分或转成文件发送。');
      return { action: 'error', reason: 'text too long' };
    }
    const urls = [...new Set(text.match(URL_RE) || [])];
    if (urls.length) {
      // URL 之外的文字自动当备注；多条链接共享同一备注
      const note = text.replace(URL_RE, '').replace(/\s+/g, ' ').trim() || null;
      const picked = urls.slice(0, ARCHIVE_LIMITS.MAX_URLS_PER_MESSAGE);
      let last: { id: string; title: string } | null = null;
      for (const url of picked) {
        const item = createUrlItem({ url, note, source });
        last = item;
        const mid = await reply(`🔗 已存链接${note ? `（备注：${note}）` : ''}\n${url}\n\n怕原文被删就点下面离线保存：`, {
          inline_keyboard: [[{ text: '📥 离线保存全文（含配图）', callback_data: `snap:${item.id}` }]],
        });
        if (mid) setItemTgRef(item.id, `${chatId}:${mid}`);
      }
      if (urls.length > picked.length) {
        await reply(`⚠️ 一条消息最多收 ${ARCHIVE_LIMITS.MAX_URLS_PER_MESSAGE} 个链接，多出的 ${urls.length - picked.length} 个已忽略。`);
      }
      touchBotUsed(bot.id);
      return { action: 'archived', itemId: last!.id, itemType: 'url', title: last!.title };
    }
    // 刚收藏过文件（转发后补一句描述）→ 这段文字当那批文件的备注，不单独建条目
    const chatKey = `${bot.id}:${chatId}`;
    const rf = recentFilesByChat.get(chatKey);
    if (rf && Date.now() - rf.at < TEXT_AFTER_FILE_MS) {
      const targets = rf.itemIds
        .map((id) => getArchiveItem(id))
        .filter((i): i is NonNullable<typeof i> => !!i && !i.note); // 有 caption 备注的不覆盖
      if (targets.length) {
        for (const t of targets) updateArchiveItem(t.id, { note: text });
        recentFilesByChat.delete(chatKey);
        await reply(
          targets.length > 1
            ? `📌 已把这段文字作为备注加到刚收藏的 ${targets.length} 个文件`
            : `📌 已作为「${targets[0].title}」的备注`,
        );
        return { action: 'archived', itemId: targets[0].id, itemType: 'note', title: targets[0].title };
      }
    }

    const item = createTextItem({ text, source });
    // 记录待配对文字：10 秒内若有文件到达（转发附言先于文件推送），转为其备注
    pendingTextByChat.set(chatKey, { itemId: item.id, text, at: Date.now() });
    touchBotUsed(bot.id);
    const mid = await reply(`📝 已收藏文字片段：${item.title}\n\n回复本条消息可加备注 · 查看：${baseUrl}/archive`);
    if (mid) setItemTgRef(item.id, `${chatId}:${mid}`);
    return { action: 'archived', itemId: item.id, itemType: 'text', title: item.title };
  }

  await reply('发我文件 / 链接 / 文字即可收藏；/code 获取网页解锁码。');
  return { action: 'no_file' };
}
