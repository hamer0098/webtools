-- 邀请码支持配置使用次数。
-- permanent: max_uses 始终为 NULL（不限）；onetime: max_uses 表示最多可用几次，used_count 实时累加。
-- 兼容老数据：已有的 onetime 行没有 max_uses → 视为 1 次（CASE WHEN COALESCE）。

ALTER TABLE send_codes ADD COLUMN max_uses    INTEGER;
ALTER TABLE send_codes ADD COLUMN used_count  INTEGER NOT NULL DEFAULT 0;

-- 老 onetime 数据：如果有 used_at 说明已经用过 → used_count = 1；max_uses 设为 1 保持原语义
UPDATE send_codes
   SET used_count = 1, max_uses = 1
 WHERE kind = 'onetime' AND used_at IS NOT NULL AND used_count = 0;

UPDATE send_codes
   SET max_uses = 1
 WHERE kind = 'onetime' AND max_uses IS NULL;
