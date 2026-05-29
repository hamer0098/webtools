import { getDb } from './db';
import { TOOLS_META, type ToolSlug } from './tools-registry';

/**
 * Idempotent：每次请求都跑一遍，只对 DB 缺失的 slug 做插入。
 * 这样 registry 新增工具后，下一次请求就能自动入库（不需要重启 server）。
 * 70 行的查询开销很小。
 */
export function seedToolsIfNeeded() {
  const db = getDb();
  const now = Date.now();

  const select = db.prepare('SELECT slug FROM tools WHERE slug = ?');
  const insert = db.prepare(
    `INSERT INTO tools (slug, name, icon, group_name, sort_order, enabled, created_at, updated_at)
     VALUES (@slug, @name, @icon, @group_name, @sort_order, @enabled, @created_at, @updated_at)`,
  );

  const entries = Object.entries(TOOLS_META) as Array<[ToolSlug, (typeof TOOLS_META)[ToolSlug]]>;
  let sortBase = 0;
  for (const [slug, meta] of entries) {
    const exists = select.get(slug);
    if (!exists) {
      insert.run({
        slug,
        name: meta.defaultName,
        icon: meta.defaultIcon,
        group_name: meta.defaultGroup,
        sort_order: sortBase,
        enabled: 1, // 默认启用
        created_at: now,
        updated_at: now,
      });
    }
    sortBase += 10;
  }
}
