import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getDb, type ToolRow } from '@/lib/db';
import { TOOLS_META } from '@/lib/tools-registry';
import { seedToolsIfNeeded } from '@/lib/tools-seed';
import ToolsTable from '@/components/admin/ToolsTable';

export const dynamic = 'force-dynamic';

export default async function AdminToolsPage() {
  const session = await getSession();
  if (!session.admin) redirect('/admin/login');

  seedToolsIfNeeded();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT slug, name, icon, group_name, sort_order, enabled
       FROM tools
       ORDER BY group_name ASC, sort_order ASC`,
    )
    .all() as Array<Pick<ToolRow, 'slug' | 'name' | 'icon' | 'group_name' | 'sort_order' | 'enabled'>>;

  const registrySlugs = new Set(Object.keys(TOOLS_META));
  const tools = rows.map((r) => ({ ...r, missing: !registrySlugs.has(r.slug) }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">工具管理</h1>
      <p className="mb-6 text-sm text-slate-500">
        新增工具需在代码侧的 <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">lib/tools-registry.ts</code> 注册并部署。
        本页控制运行时启用状态、显示名、分组与排序。
      </p>
      <ToolsTable initialTools={tools} />
    </div>
  );
}
