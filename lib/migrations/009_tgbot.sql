-- Telegram 机器人绑定：给 bot 发/转发文件 → 服务端下载并加密后存入匿名文件，回复下载链接。
-- 支持绑定多个 bot，每个 bot 独立 token / 白名单 / webhook secret / 文件 TTL。

CREATE TABLE IF NOT EXISTS tg_bots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  -- getMe 拿到的 bot username（展示用，不含 @）
  username TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  -- 逗号分隔的 Telegram 用户 ID 白名单；空/NULL = 拒绝所有人（bot 会回复来信者的 ID 方便加白）
  allowed_user_ids TEXT,
  -- setWebhook 时传给 TG 的 secret_token，webhook 请求靠 X-Telegram-Bot-Api-Secret-Token 校验
  webhook_secret TEXT NOT NULL,
  -- 该 bot 上传文件的保留时长（毫秒）；NULL → 全局默认
  file_ttl_ms INTEGER,
  -- 最近一次 setWebhook 成功时间；NULL = webhook 未设置成功
  webhook_set_at INTEGER,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL
);
