import { notFound } from 'next/navigation';
import { isToolSlug } from '@/lib/tools-registry';

// 内容由 ShellClient 里常驻的 ToolHost 渲染（保活，避免切换工具时重挂载）。
// 这里只校验 slug 是否为已知工具；启用与否由 ToolHost 客户端判断。
export default async function ToolPage({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool } = await params;
  if (!isToolSlug(tool)) notFound();
  return null;
}
