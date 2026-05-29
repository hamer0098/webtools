import { notFound } from 'next/navigation';
import ToolLoader from '@/components/shell/ToolLoader';
import { isToolSlug } from '@/lib/tools-registry';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ToolPage({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool } = await params;
  if (!isToolSlug(tool)) notFound();

  const db = getDb();
  const row = db
    .prepare('SELECT enabled FROM tools WHERE slug = ?')
    .get(tool) as { enabled: number } | undefined;
  if (!row || row.enabled !== 1) notFound();

  return <ToolLoader slug={tool} />;
}
