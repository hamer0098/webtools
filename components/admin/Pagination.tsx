'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * 通用分页条。
 * - 显示"共 N 条 · 第 X / Y 页"
 * - 上一页 / 下一页按钮
 * - 中间显示一组临近页码（最多 7 个）
 * - 总页数 ≤ 1 时整个条隐藏
 */
export default function Pagination({
  page,
  totalItems,
  pageSize,
  onChange,
}: {
  page: number;
  totalItems: number;
  pageSize: number;
  onChange: (next: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1) {
    return (
      <div className="mt-3 flex items-center justify-end text-xs text-neutral-500">
        共 {totalItems} 条
      </div>
    );
  }

  const go = (p: number) => onChange(Math.min(totalPages, Math.max(1, p)));

  // 显示当前页前后 ±2 页 + 首尾页，中间用 … 省略
  const pages: (number | '…')[] = [];
  const push = (n: number | '…') => {
    if (pages[pages.length - 1] !== n) pages.push(n);
  };
  push(1);
  if (page - 2 > 2) push('…');
  for (let i = Math.max(2, page - 2); i <= Math.min(totalPages - 1, page + 2); i++) {
    push(i);
  }
  if (page + 2 < totalPages - 1) push('…');
  if (totalPages > 1) push(totalPages);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
      <div className="text-xs text-neutral-500">
        共 {totalItems} 条 · 第 {page} / {totalPages} 页
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          className="flex items-center rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-neutral-400">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => go(p)}
              className={
                p === page
                  ? 'rounded bg-blue-600 px-2 py-1 text-xs text-white'
                  : 'rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800'
              }
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => go(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export const ADMIN_PAGE_SIZE = 15;
