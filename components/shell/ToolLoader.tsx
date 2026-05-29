'use client';

import { TOOLS_COMPONENTS } from '@/lib/tools-components';
import { isToolSlug } from '@/lib/tools-registry';

export default function ToolLoader({
  slug,
  noteSlug,
}: {
  slug: string;
  noteSlug?: string;
}) {
  if (!isToolSlug(slug)) {
    return (
      <div className="p-8 text-sm text-neutral-500">
        未知工具 <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">{slug}</code>
      </div>
    );
  }
  const Tool = TOOLS_COMPONENTS[slug];
  return <Tool noteSlug={noteSlug} />;
}
