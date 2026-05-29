/**
 * 临时邮箱业务逻辑。
 *
 * 模型：
 *   - tempmail_mailbox：URL slug → 当前邮箱地址（可改、可重复，多个 slug 可绑同一地址）。
 *   - tempmail_message：邮件按收件地址存储；持有指向同一 address 的 slug 的人共享收件箱。
 *
 * 邮件由 CF Email Worker 解析后通过 POST /api/tempmail/inbound 推入。
 * 服务端无消息推送通道，前端 30s 轮询。
 */

import { customAlphabet } from 'nanoid';
import { getDb } from './db';
import { TEMPMAIL_LIMITS } from './limits';

const localPartGen = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);
const messageIdGen = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
  16,
);

// 邮箱前缀：字母数字 + . _ -，首位字母数字，长度 1-64
const LOCAL_PART_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

export type TempmailMailboxRow = {
  slug: string;
  address: string;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
};

export type TempmailMessageRow = {
  id: string;
  address: string;
  from_addr: string | null;
  from_name: string | null;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  verification_code: string | null;
  received_at: number;
  expires_at: number;
  size_bytes: number;
};

export function getTempmailDomain(): string | null {
  const d = process.env.TEMPMAIL_DOMAIN?.trim();
  return d ? d.toLowerCase() : null;
}

export function isValidLocalPart(local: string): boolean {
  return LOCAL_PART_RE.test(local);
}

export function composeAddress(localPart: string, domain: string): string {
  return `${localPart.toLowerCase()}@${domain.toLowerCase()}`;
}

export function parseAddress(addr: string): { local: string; domain: string } | null {
  const m = addr.toLowerCase().match(/^([^@\s]+)@([^@\s]+)$/);
  if (!m) return null;
  return { local: m[1], domain: m[2] };
}

export function newDefaultLocalPart(): string {
  return localPartGen();
}

export function newMessageId(): string {
  return messageIdGen();
}

export function getMailbox(slug: string): TempmailMailboxRow | undefined {
  return getDb()
    .prepare('SELECT * FROM tempmail_mailbox WHERE slug = ?')
    .get(slug) as TempmailMailboxRow | undefined;
}

export function createMailbox(slug: string, address: string): TempmailMailboxRow {
  const now = Date.now();
  const expires = now + TEMPMAIL_LIMITS.MAILBOX_TTL_MS;
  getDb()
    .prepare(
      `INSERT INTO tempmail_mailbox (slug, address, created_at, last_seen_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(slug, address, now, now, expires);
  return { slug, address, created_at: now, last_seen_at: now, expires_at: expires };
}

export function updateMailboxAddress(
  slug: string,
  address: string,
): TempmailMailboxRow | null {
  const now = Date.now();
  const expires = now + TEMPMAIL_LIMITS.MAILBOX_TTL_MS;
  const r = getDb()
    .prepare(
      `UPDATE tempmail_mailbox
          SET address = ?, last_seen_at = ?, expires_at = ?
        WHERE slug = ?`,
    )
    .run(address, now, expires, slug);
  if (r.changes === 0) return null;
  return getMailbox(slug) ?? null;
}

/** 仅刷新 last_seen / expires，不改地址。每次访问触发，实现"活跃即续期"。 */
export function touchMailbox(slug: string): void {
  const now = Date.now();
  const expires = now + TEMPMAIL_LIMITS.MAILBOX_TTL_MS;
  getDb()
    .prepare(
      `UPDATE tempmail_mailbox
          SET last_seen_at = ?, expires_at = ?
        WHERE slug = ?`,
    )
    .run(now, expires, slug);
}

export function deleteMailbox(slug: string): number {
  return getDb().prepare('DELETE FROM tempmail_mailbox WHERE slug = ?').run(slug).changes;
}

export function listMessagesForAddress(
  address: string,
  limit = TEMPMAIL_LIMITS.MAX_MESSAGES_PER_LIST,
): TempmailMessageRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM tempmail_message
        WHERE address = ?
        ORDER BY received_at DESC
        LIMIT ?`,
    )
    .all(address.toLowerCase(), limit) as TempmailMessageRow[];
}

export function getMessage(id: string): TempmailMessageRow | undefined {
  return getDb()
    .prepare('SELECT * FROM tempmail_message WHERE id = ?')
    .get(id) as TempmailMessageRow | undefined;
}

export function deleteMessage(id: string): number {
  return getDb().prepare('DELETE FROM tempmail_message WHERE id = ?').run(id).changes;
}

export function saveMessage(input: {
  id: string;
  address: string;
  from_addr: string | null;
  from_name: string | null;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
}): TempmailMessageRow {
  const now = Date.now();
  const expires = now + TEMPMAIL_LIMITS.MESSAGE_TTL_MS;
  const code = extractVerificationCode(input.text_body, input.subject, input.html_body);
  const size = (input.text_body?.length ?? 0) + (input.html_body?.length ?? 0);
  const address = input.address.toLowerCase();
  getDb()
    .prepare(
      `INSERT INTO tempmail_message
        (id, address, from_addr, from_name, subject, text_body, html_body,
         verification_code, received_at, expires_at, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      address,
      input.from_addr,
      input.from_name,
      input.subject,
      input.text_body,
      input.html_body,
      code,
      now,
      expires,
      size,
    );
  return {
    id: input.id,
    address,
    from_addr: input.from_addr,
    from_name: input.from_name,
    subject: input.subject,
    text_body: input.text_body,
    html_body: input.html_body,
    verification_code: code,
    received_at: now,
    expires_at: expires,
    size_bytes: size,
  };
}

/**
 * 提取常见验证码：优先匹配带上下文的（verify/code/验证码/OTP 等关键词附近的字母数字串），
 * 退化为独立 4-8 位纯数字串。命中即返回，匹配不到返回 null。
 */
export function extractVerificationCode(
  text: string | null,
  subject: string | null,
  html: string | null,
): string | null {
  const sources = [subject, text, html].filter((s): s is string => !!s);
  if (sources.length === 0) return null;

  const contextRe =
    /(?:verification|verify|code|otp|pin|passcode|one[- ]?time|验证码|校验码|动态码|确认码)\D{0,30}([A-Z0-9]{4,8})/i;
  for (const s of sources) {
    const m = s.match(contextRe);
    if (m) return m[1].toUpperCase();
  }

  for (const s of sources) {
    const m = s.match(/(?<!\d)(\d{4,8})(?!\d)/);
    if (m) return m[1];
  }
  return null;
}

export function cleanupExpired(): { mailboxes: number; messages: number } {
  const db = getDb();
  const now = Date.now();
  const m = db.prepare('DELETE FROM tempmail_message WHERE expires_at < ?').run(now);
  const b = db.prepare('DELETE FROM tempmail_mailbox WHERE expires_at < ?').run(now);
  return { messages: m.changes, mailboxes: b.changes };
}

let lastCleanupAt = 0;
/** 节流懒清理：每 5 分钟最多跑一次，挂在每次 API 请求上。 */
export function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanupAt < 5 * 60_000) return;
  lastCleanupAt = now;
  try {
    cleanupExpired();
  } catch (e) {
    console.error('[tempmail] cleanup failed', e);
  }
}
