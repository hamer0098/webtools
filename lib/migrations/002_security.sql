CREATE TABLE IF NOT EXISTS admin_user (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  totp_secret   TEXT,
  totp_pending  TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event       TEXT NOT NULL,
  detail      TEXT,
  ip          TEXT,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event);
