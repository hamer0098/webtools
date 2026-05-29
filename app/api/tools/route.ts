import { NextResponse } from 'next/server';
import { getDb, type ToolRow } from '@/lib/db';
import { seedToolsIfNeeded } from '@/lib/tools-seed';

export const dynamic = 'force-dynamic';

export async function GET() {
  seedToolsIfNeeded();
  const db = getDb();
  const tools = db
    .prepare(
      `SELECT slug, name, icon, group_name, sort_order
       FROM tools
       WHERE enabled = 1
       ORDER BY group_name ASC, sort_order ASC, name ASC`,
    )
    .all() as Pick<ToolRow, 'slug' | 'name' | 'icon' | 'group_name' | 'sort_order'>[];

  return NextResponse.json({ tools });
}
