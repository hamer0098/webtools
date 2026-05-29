CREATE TABLE IF NOT EXISTS tools (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  icon         TEXT,
  group_name   TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  enabled      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  slug           TEXT PRIMARY KEY,
  content        TEXT NOT NULL DEFAULT '',
  password_hash  TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  last_viewed_at INTEGER NOT NULL,
  size_bytes     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tools_enabled_sort ON tools(enabled, group_name, sort_order);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
