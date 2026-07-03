'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Lock, ExternalLink, Search } from 'lucide-react';
import Pagination, { ADMIN_PAGE_SIZE } from './Pagination';

type Note = {
  slug: string;
  has_password: number;
  size_bytes: number;
  updated_at: number;
  last_viewed_at: number;
  created_at: number;
};

type EncFilter = 'all' | 'encrypted' | 'plain';

function fmtTime(ms: number) {
  if (!ms) return '-';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n: number) {
  return n.toString().padStart(2, '0');
}
function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export default function NotesTable({ initialNotes }: { initialNotes: Note[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [encFilter, setEncFilter] = useState<EncFilter>('all');
  const [page, setPage] = useState(1);

  // 筛选 → 翻页：自动回到第 1 页
  useEffect(() => {
    setPage(1);
  }, [query, encFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter((n) => {
      if (q && !n.slug.toLowerCase().includes(q)) return false;
      if (encFilter === 'encrypted' && !n.has_password) return false;
      if (encFilter === 'plain' && n.has_password) return false;
      return true;
    });
  }, [notes, query, encFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () =>
      filtered.slice((safePage - 1) * ADMIN_PAGE_SIZE, safePage * ADMIN_PAGE_SIZE),
    [filtered, safePage],
  );

  const toggle = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  // "全选"语义改为"全选当前页可见的"，避免误删别页
  const pageSlugs = useMemo(() => pageRows.map((r) => r.slug), [pageRows]);
  const pageSelectedCount = pageSlugs.filter((s) => selected.has(s)).length;
  const allChecked = pageRows.length > 0 && pageSelectedCount === pageRows.length;
  const someChecked = pageSelectedCount > 0 && pageSelectedCount < pageRows.length;
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        for (const s of pageSlugs) next.delete(s);
      } else {
        for (const s of pageSlugs) next.add(s);
      }
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`确定删除 ${selected.size} 条笔记？`)) return;
    const r = await fetch('/api/admin/notes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs: Array.from(selected) }),
    });
    if (r.ok) {
      setNotes(notes.filter((n) => !selected.has(n.slug)));
      setSelected(new Set());
    }
  };

  const cleanupOld = async () => {
    if (!confirm('删除最后访问时间超过 90 天的所有笔记？')) return;
    const r = await fetch('/api/admin/notes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ olderThanDays: 90 }),
    });
    if (r.ok) {
      const data = await r.json();
      alert(`已删除 ${data.deleted} 条`);
      const cutoff = Date.now() - 90 * 86400_000;
      setNotes(notes.filter((n) => n.last_viewed_at >= cutoff));
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索 slug"
            className="w-48 rounded border border-neutral-300 bg-white py-1 pl-7 pr-2 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>
        <select
          value={encFilter}
          onChange={(e) => setEncFilter(e.target.value as EncFilter)}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
        >
          <option value="all">全部</option>
          <option value="encrypted">已加密</option>
          <option value="plain">未加密</option>
        </select>
        <button
          onClick={deleteSelected}
          disabled={selected.size === 0}
          className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:hover:bg-red-950"
        >
          删除选中（{selected.size}）
        </button>
        <button
          onClick={cleanupOld}
          className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          清理 90 天未访问
        </button>
      </div>
      <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-100 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-800">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  onChange={toggleAll}
                  aria-label="全选本页"
                />
              </th>
              <th className="px-3 py-2">Slug</th>
              <th className="px-3 py-2">大小</th>
              <th className="px-3 py-2">加密</th>
              <th className="px-3 py-2">更新时间</th>
              <th className="px-3 py-2">最后访问</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-neutral-500">
                  {notes.length === 0 ? '暂无笔记' : '没有匹配的笔记'}
                </td>
              </tr>
            ) : (
              pageRows.map((n) => (
                <tr
                  key={n.slug}
                  className="border-t border-neutral-200 dark:border-neutral-800"
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(n.slug)}
                      onChange={() => toggle(n.slug)}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{n.slug}</td>
                  <td className="px-3 py-2">{fmtSize(n.size_bytes)}</td>
                  <td className="px-3 py-2">
                    {n.has_password ? <Lock className="h-3.5 w-3.5 text-amber-600" /> : '-'}
                  </td>
                  <td className="px-3 py-2 text-neutral-500">{fmtTime(n.updated_at)}</td>
                  <td className="px-3 py-2 text-neutral-500">{fmtTime(n.last_viewed_at)}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/notepad/${n.slug}`}
                      target="_blank"
                      className="text-blue-600 hover:underline"
                    >
                      <ExternalLink className="inline h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={safePage}
        totalItems={filtered.length}
        pageSize={ADMIN_PAGE_SIZE}
        onChange={setPage}
      />
    </div>
  );
}
