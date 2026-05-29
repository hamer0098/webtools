-- 匿名文件分享：邀请码 / 永久密码 + 文件元数据

CREATE TABLE IF NOT EXISTS send_codes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,
  kind         TEXT NOT NULL CHECK (kind IN ('permanent', 'onetime')),
  note         TEXT,
  enabled      INTEGER NOT NULL DEFAULT 1,
  used_at      INTEGER,
  used_by_ip   TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS send_files (
  id                  TEXT PRIMARY KEY,
  file_path           TEXT NOT NULL,
  encrypted_metadata  TEXT NOT NULL,
  ciphertext_size     INTEGER NOT NULL,
  created_at          INTEGER NOT NULL,
  expires_at          INTEGER NOT NULL,
  downloaded_at       INTEGER,
  uploader_code_id    INTEGER REFERENCES send_codes(id) ON DELETE SET NULL,
  uploader_ip         TEXT
);

CREATE INDEX IF NOT EXISTS idx_send_files_expires ON send_files(expires_at);
CREATE INDEX IF NOT EXISTS idx_send_codes_code ON send_codes(code);

-- 同步老 seed：把 notepad 的默认分组/名字从"文本/在线笔记"迁到"匿名/匿名笔记"
-- 仅在用户未自定义时（还是老默认值）才覆盖
UPDATE tools SET group_name = '匿名', updated_at = strftime('%s','now') * 1000
  WHERE slug = 'notepad' AND group_name = '文本';
UPDATE tools SET name = '匿名笔记', updated_at = strftime('%s','now') * 1000
  WHERE slug = 'notepad' AND name = '在线笔记';
