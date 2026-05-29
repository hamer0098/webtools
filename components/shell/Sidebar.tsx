'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import * as Icons from 'lucide-react';
import clsx from 'clsx';

type ToolItem = {
  slug: string;
  name: string;
  icon: string | null;
  group_name: string | null;
};

export default function Sidebar({
  tools,
  onNavigate,
}: {
  tools: ToolItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const activeSlug = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    return m ? m[1] : null;
  }, [pathname]);

  const grouped = useMemo(() => {
    const map = new Map<string, ToolItem[]>();
    for (const t of tools) {
      const key = t.group_name || '其他';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    // 固定分组顺序，未列出的分组排在末尾
    const order = ['安全', '匿名', '生成', '工具'];
    const rank = (g: string) => {
      const i = order.indexOf(g);
      return i === -1 ? 99 : i;
    };
    return Array.from(map.entries()).sort(([a], [b]) => rank(a) - rank(b));
  }, [tools]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 md:h-screen md:w-60 dark:border-neutral-800 dark:bg-neutral-900/50">
      <div className="px-4 py-4">
        <Link href="/" onClick={onNavigate} className="text-lg font-semibold">
          Webtools
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {grouped.map(([group, items]) => (
          <div key={group} className="mb-3">
            <div className="px-2 py-1 text-xs uppercase tracking-wide text-neutral-500">
              {group}
            </div>
            <ul>
              {items.map((t) => {
                const Icon = pickIcon(t.icon);
                const active = activeSlug === t.slug;
                return (
                  <li key={t.slug}>
                    <Link
                      href={`/${t.slug}`}
                      onClick={onNavigate}
                      className={clsx(
                        'flex items-center gap-2 rounded px-2 py-1.5 text-sm',
                        active
                          ? 'bg-blue-600 text-white'
                          : 'text-neutral-700 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{t.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function pickIcon(name: string | null) {
  if (!name) return Icons.Sparkles;
  const key = toPascal(name);
  const Comp = (Icons as Record<string, unknown>)[key] as React.ComponentType<{
    className?: string;
  }>;
  return Comp || Icons.Sparkles;
}

function toPascal(kebab: string): string {
  return kebab
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}
