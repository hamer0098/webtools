-- 每个 code 可以单独配置该 code 上传的文件销毁时间。
-- file_ttl_ms = NULL → 沿用全局默认（SEND_LIMITS.DEFAULT_TTL_MS = 3 天）

ALTER TABLE send_codes ADD COLUMN file_ttl_ms INTEGER;
