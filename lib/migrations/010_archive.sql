-- 收藏箱（archive）：通过 TG bot 收集文件 / 网址 / 文字片段，永久保存（无 TTL），
-- 前台 /archive 解锁查看，后台管理与打包导出。文件明文落盘 ./data/archive/。

CREATE TABLE IF NOT EXISTS archive_items (
  -- nanoid(16)
  id TEXT PRIMARY KEY,
  -- 'file' | 'url' | 'text'
  type TEXT NOT NULL,
  -- 展示标题：文件名 / 页面标题 / 文字首行
  title TEXT NOT NULL,
  -- 备注（TG caption / 消息里 URL 之外的文字，前后台都可改）
  note TEXT,
  -- text: 全文；url: 原始 URL
  content TEXT,
  -- file: 落盘路径；url: 离线快照 html 路径（抓取成功后才有）
  file_path TEXT,
  -- 原始文件名（file 类型）
  file_name TEXT,
  -- 落盘字节数（file / url 快照）
  file_size INTEGER,
  mime TEXT,
  -- url 类型的快照状态：NULL=仅存链接未抓取 | 'pending' | 'ok' | 'failed'
  snapshot_status TEXT,
  snapshot_error TEXT,
  -- 来源标识，如 'tgbot:3'
  source TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_archive_items_created ON archive_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_archive_items_type ON archive_items(type, created_at DESC);

-- 前台解锁用的一次性码：给收藏 bot 发 /code 签发，5 分钟有效、用一次作废。
-- 只存 sha256(code)，DB 泄露也拿不到明文码。
CREATE TABLE IF NOT EXISTS archive_otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

-- bot 用途：'send' = 转发文件→匿名文件（原有行为）；'archive' = 收藏箱入口
ALTER TABLE tg_bots ADD COLUMN purpose TEXT NOT NULL DEFAULT 'send';
