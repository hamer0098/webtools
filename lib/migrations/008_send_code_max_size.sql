-- 每个 code 可以单独配置该 code 允许上传的单文件最大大小（明文字节）。
-- max_file_bytes = NULL → 沿用全局默认（SEND_LIMITS.DEFAULT_MAX_FILE_BYTES = 50MB）
-- 上限不超过 SEND_LIMITS.MAX_FILE_BYTES（350MB），在创建 API 处校验。

ALTER TABLE send_codes ADD COLUMN max_file_bytes INTEGER;
