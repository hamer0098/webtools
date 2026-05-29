import { notFound } from 'next/navigation';
import ToolLoader from '@/components/shell/ToolLoader';
import { isValidSlug } from '@/lib/utils/slug';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function NotePage({
  params,
}: {
  params: Promise<{ noteSlug: string }>;
}) {
  const { noteSlug } = await params;
  if (!isValidSlug(noteSlug)) notFound();

  const db = getDb();
  const row = db
    .prepare('SELECT enabled FROM tools WHERE slug = ?')
    .get('notepad') as { enabled: number } | undefined;
  if (!row || row.enabled !== 1) notFound();

  return <ToolLoader slug="notepad" noteSlug={noteSlug} />;
}
