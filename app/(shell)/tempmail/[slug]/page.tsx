import { notFound } from 'next/navigation';
import ToolLoader from '@/components/shell/ToolLoader';
import { isValidSlug } from '@/lib/utils/slug';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function TempmailSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();

  const db = getDb();
  const row = db
    .prepare('SELECT enabled FROM tools WHERE slug = ?')
    .get('tempmail') as { enabled: number } | undefined;
  if (!row || row.enabled !== 1) notFound();

  // 复用 ToolLoader 既有的 noteSlug 通道传递二级 slug
  return <ToolLoader slug="tempmail" noteSlug={slug} />;
}
