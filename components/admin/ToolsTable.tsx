'use client';

import { useState } from 'react';
import { Save, Check, AlertTriangle } from 'lucide-react';

type Tool = {
  slug: string;
  name: string;
  icon: string | null;
  group_name: string | null;
  sort_order: number;
  enabled: number;
  missing: boolean;
};

export default function ToolsTable({ initialTools }: { initialTools: Tool[] }) {
  const [tools, setTools] = useState(initialTools);
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);

  const update = (slug: string, patch: Partial<Tool>) => {
    setTools((prev) => prev.map((t) => (t.slug === slug ? { ...t, ...patch } : t)));
  };

  const save = async (slug: string) => {
    const t = tools.find((x) => x.slug === slug);
    if (!t) return;
    setSavingSlug(slug);
    const r = await fetch(`/api/admin/tools/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: t.name,
        icon: t.icon || null,
        group_name: t.group_name || null,
        sort_order: t.sort_order,
        enabled: !!t.enabled,
      }),
    });
    setSavingSlug(null);
    if (r.ok) {
      setSavedSlug(slug);
      setTimeout(() => setSavedSlug(null), 1500);
    } else {
      alert('保存失败');
    }
  };

  return (
    <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-100 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-800">
          <tr>
            <th className="px-3 py-2">Slug</th>
            <th className="px-3 py-2">显示名</th>
            <th className="px-3 py-2">图标</th>
            <th className="px-3 py-2">分组</th>
            <th className="px-3 py-2">排序</th>
            <th className="px-3 py-2">启用</th>
            <th className="px-3 py-2">状态</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {tools.map((t) => (
            <tr
              key={t.slug}
              className="border-t border-neutral-200 dark:border-neutral-800"
            >
              <td className="px-3 py-2 font-mono text-xs">{t.slug}</td>
              <td className="px-3 py-2">
                <input
                  value={t.name}
                  onChange={(e) => update(t.slug, { name: e.target.value })}
                  className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  value={t.icon || ''}
                  placeholder="shield-check"
                  onChange={(e) => update(t.slug, { icon: e.target.value })}
                  className="w-32 rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-base md:text-xs dark:border-neutral-700 dark:bg-neutral-950"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  value={t.group_name || ''}
                  onChange={(e) => update(t.slug, { group_name: e.target.value })}
                  className="w-24 rounded border border-neutral-300 bg-white px-2 py-1 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  value={t.sort_order}
                  onChange={(e) =>
                    update(t.slug, { sort_order: Number(e.target.value) || 0 })
                  }
                  className="w-16 rounded border border-neutral-300 bg-white px-2 py-1 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={!!t.enabled}
                  onChange={(e) => update(t.slug, { enabled: e.target.checked ? 1 : 0 })}
                />
              </td>
              <td className="px-3 py-2">
                {t.missing ? (
                  <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                    <AlertTriangle className="h-3 w-3" /> 组件缺失
                  </span>
                ) : t.enabled ? (
                  <span className="text-xs text-green-600">已启用</span>
                ) : (
                  <span className="text-xs text-neutral-500">未启用</span>
                )}
              </td>
              <td className="px-3 py-2">
                <button
                  onClick={() => save(t.slug)}
                  disabled={savingSlug === t.slug}
                  className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {savedSlug === t.slug ? (
                    <>
                      <Check className="h-3 w-3" /> 已保存
                    </>
                  ) : (
                    <>
                      <Save className="h-3 w-3" /> 保存
                    </>
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
