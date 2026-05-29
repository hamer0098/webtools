import { NextResponse } from 'next/server';
import { getDb, type ToolRow } from '@/lib/db';
import { TOOLS_META, type ToolSlug } from '@/lib/tools-registry';
import { seedToolsIfNeeded } from '@/lib/tools-seed';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session.admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
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
  const tools = rows.map((r) => ({
    ...r,
    missing: !registrySlugs.has(r.slug),
  }));

  return NextResponse.json({ tools });
}
