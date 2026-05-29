-- 把"工具"分组下三个工具按 registry 期望顺序排好（encode → chinese → qrcode）。
-- 用 100/110/120 避开和其它分组工具的 sort_order 冲突。
-- 注：sort_order 是无条件覆盖；如果用户已经在 /admin/tools 手动改过排序，会被这里覆盖一次。
-- 这 3 个工具是刚加的，用户大概率没改过 —— 一次性同步无碍。

UPDATE tools SET sort_order = 100, updated_at = strftime('%s','now') * 1000
  WHERE slug = 'encode';
UPDATE tools SET sort_order = 110, updated_at = strftime('%s','now') * 1000
  WHERE slug = 'chinese';
UPDATE tools SET sort_order = 120, updated_at = strftime('%s','now') * 1000
  WHERE slug = 'qrcode';

-- 二维码改名：仅当 DB 里还是上一版本默认值"二维码"才覆盖，用户改过的不动
UPDATE tools SET name = '二维码生成', updated_at = strftime('%s','now') * 1000
  WHERE slug = 'qrcode' AND name = '二维码';
