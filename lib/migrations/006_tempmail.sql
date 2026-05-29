-- 临时邮箱：URL slug (nanoid) 作为凭证；address 是当前绑定的邮箱地址，
-- 可变更、可重复（多个 slug 可绑同一地址 → 共享收件箱）。
-- 邮件按 address 路由，不直接挂在 slug 上，因此改前缀会丢失旧地址下的邮件。

CREATE TABLE IF NOT EXISTS tempmail_mailbox (
  slug          TEXT PRIMARY KEY,
  address       TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,   -- 每次访问刷新，作为 TTL 滚动基准
  expires_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tempmail_mailbox_address ON tempmail_mailbox(address);
CREATE INDEX IF NOT EXISTS idx_tempmail_mailbox_expires ON tempmail_mailbox(expires_at);

CREATE TABLE IF NOT EXISTS tempmail_message (
  id                 TEXT PRIMARY KEY,
  address            TEXT NOT NULL,
  from_addr          TEXT,
  from_name          TEXT,
  subject            TEXT,
  text_body          TEXT,
  html_body          TEXT,
  verification_code  TEXT,
  received_at        INTEGER NOT NULL,
  expires_at         INTEGER NOT NULL,
  size_bytes         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tempmail_message_address_received
  ON tempmail_message(address, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_tempmail_message_expires
  ON tempmail_message(expires_at);
