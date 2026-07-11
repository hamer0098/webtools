-- 收藏条目关联 bot 确认消息（"{chatId}:{message_id}"）：
-- 在 TG 里回复那条「✅ 已收藏」消息即可给对应条目设置/更新备注。
ALTER TABLE archive_items ADD COLUMN tg_ref TEXT;
CREATE INDEX IF NOT EXISTS idx_archive_items_tg_ref ON archive_items(tg_ref);
