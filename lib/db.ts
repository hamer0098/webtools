import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

let dbInstance: Database.Database | null = null;

/**
 * 文件命名格式：`NNN_*.sql`（前缀数字是 migration 版本号，递增）。
 * 用 SQLite 自带的 `PRAGMA user_version` 记录已应用到哪一版，跳过已应用过的。
 * 旧库（user_version=0）会重跑早期 migration，但它们都是 `CREATE TABLE IF NOT EXISTS`
 * + 条件 UPDATE，幂等无副作用。
 */
function migrate(db: Database.Database) {
  const dir = path.join(process.cwd(), 'lib/migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();

  const current = db.pragma('user_version', { simple: true }) as number;
  let applied = current;

  for (const f of files) {
    const m = f.match(/^(\d+)_/);
    if (!m) continue;
    const version = parseInt(m[1], 10);
    if (version <= current) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    db.exec(sql);
    applied = version;
  }

  if (applied !== current) {
    db.pragma(`user_version = ${applied}`);
  }
}

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbPath = process.env.DATABASE_PATH || './data/webtools.db';
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  migrate(db);

  dbInstance = db;
  return db;
}

export type ToolRow = {
  slug: string;
  name: string;
  icon: string | null;
  group_name: string | null;
  sort_order: number;
  enabled: number;
  created_at: number;
  updated_at: number;
};

export type NoteRow = {
  slug: string;
  content: string;
  password_hash: string | null;
  created_at: number;
  updated_at: number;
  last_viewed_at: number;
  size_bytes: number;
};

export type AdminUserRow = {
  id: number;
  username: string;
  password_hash: string;
  totp_secret: string | null;
  totp_pending: string | null;
  created_at: number;
  updated_at: number;
};

export type AuditLogRow = {
  id: number;
  event: string;
  detail: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: number;
};
