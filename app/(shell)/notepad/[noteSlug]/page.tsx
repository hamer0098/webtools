import { notFound } from 'next/navigation';
import { isValidSlug } from '@/lib/utils/slug';

// 内容由常驻 ToolHost 渲染；二级 slug 从 pathname 读取。这里只校验 slug 合法性。
export default async function NotePage({
  params,
}: {
  params: Promise<{ noteSlug: string }>;
}) {
  const { noteSlug } = await params;
  if (!isValidSlug(noteSlug)) notFound();
  return null;
}
