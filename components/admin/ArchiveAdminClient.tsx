'use client';

import { useCallback, useRef, useState } from 'react';
import { Download, ExternalLink, FileIcon, FileText, Globe, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { ArchiveItemDto } from '@/lib/archive';

const TYPE_TABS = [
  { key: '', label: '全部' },
  { key: 'file', label: '文件' },
  { key: 'url', label: '链接' },
  { key: 'text', label: '文字' },
] as const;

const TYPE_LABEL: Record<string, string> = { file: '文件', url: '链接', text: '文字' };

function fmtSize(bytes: number | null): string {
  if (bytes == null) return '-';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function TypeIcon({ type }: { type: string }) {
  const cls = 'h-4 w-4 text-slate-400';
  if (type === 'file') return <FileIcon className={cls} />;
  if (type === 'url') return <Globe className={cls} />;
  return <FileText className={cls} />;
}

export default function ArchiveAdminClient({
  initialItems,
  initialTotal,
}: {
  initialItems: ArchiveItemDto[];
  initialTotal: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async (opts: { type: string; q: string; offset: number; append?: boolean }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (opts.type) params.set('type', opts.type);
      if (opts.q) params.set('q', opts.q);
      if (opts.offset) params.set('offset', String(opts.offset));
      const r = await fetch(`/api/archive/items?${params}`);
      if (!r.ok) return;
      const d = await r.json();
      setItems((prev) => (opts.append ? [...prev, ...d.items] : d.items));
      setTotal(d.total);
    } finally {
      setLoading(false);
    }
  }, []);

  const applyFilter = (nextType: string, nextQ: string) => {
    setType(nextType);
    setQ(nextQ);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load({ type: nextType, q: nextQ, offset: 0 }), 350);
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allChecked = items.length > 0 && items.every((i) => selected.has(i.id));
  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set(items.map((i) => i.id)));

  /** 打包下载：POST 拿 zip blob 再触发浏览器保存 */
  const exportZip = async (ids: string[] | 'all') => {
    setExporting(true);
    try {
      const r = await fetch('/api/admin/archive/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!r.ok) {
        alert((await r.json().catch(() => null))?.error || '导出失败');
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        r.headers.get('content-disposition')?.match(/filename\*=UTF-8''([^;]+)/)?.[1]
          ? decodeURIComponent(r.headers.get('content-disposition')!.match(/filename\*=UTF-8''([^;]+)/)![1])
          : 'archive.zip';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const removeSelected = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`删除选中的 ${ids.length} 条收藏？文件会一并从磁盘删除，不可恢复。`)) return;
    for (const id of ids) {
      await fetch(`/api/archive/items/${id}`, { method: 'DELETE' });
    }
    setSelected(new Set());
    await load({ type, q, offset: 0 });
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded border border-slate-200 dark:border-slate-700">
          {TYPE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => applyFilter(t.key, q)}
              className={`px-3 py-1.5 text-sm first:rounded-l last:rounded-r ${
                type === t.key
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => applyFilter(type, e.target.value)}
            placeholder="搜索标题 / 备注 / 内容"
            className="w-full rounded border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-base md:text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <button
          onClick={() => load({ type, q, offset: 0 })}
          className="rounded border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          title="刷新"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => exportZip([...selected])}
          disabled={exporting || selected.size === 0}
          className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          打包下载选中（{selected.size}）
        </button>
        <button
          onClick={() => exportZip('all')}
          disabled={exporting || total === 0}
          className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <Download className="h-3.5 w-3.5" />
          {exporting ? '打包中…' : `打包全部（${total}）`}
        </button>
        <button
          onClick={removeSelected}
          disabled={selected.size === 0}
          className="ml-auto flex items-center gap-1 rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除选中
        </button>
      </div>

      <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              </th>
              <th className="px-3 py-2">类型</th>
              <th className="px-3 py-2">标题</th>
              <th className="px-3 py-2">备注</th>
              <th className="px-3 py-2">大小</th>
              <th className="px-3 py-2">快照</th>
              <th className="px-3 py-2">收藏时间</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-200 dark:border-slate-800">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <TypeIcon type={item.type} />
                    {TYPE_LABEL[item.type]}
                  </span>
                </td>
                <td className="max-w-64 truncate px-3 py-2" title={item.title}>
                  {item.type === 'url' && item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                      {item.title}
                    </a>
                  ) : (
                    item.title
                  )}
                </td>
                <td className="max-w-48 truncate px-3 py-2 text-slate-500" title={item.note || ''}>
                  {item.note || '-'}
                </td>
                <td className="px-3 py-2 text-xs">{fmtSize(item.fileSize)}</td>
                <td className="px-3 py-2 text-xs">
                  {item.type !== 'url' ? (
                    '-'
                  ) : item.snapshotStatus === 'ok' ? (
                    <span className="text-green-600">✓ 已离线</span>
                  ) : item.snapshotStatus === 'failed' ? (
                    <span className="text-red-500" title={item.snapshotError || ''}>
                      失败
                    </span>
                  ) : item.snapshotStatus === 'pending' ? (
                    <span className="text-blue-500">抓取中</span>
                  ) : (
                    <span className="text-slate-400">仅链接</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{fmtTime(item.createdAt)}</td>
                <td className="px-3 py-2 text-right">
                  {item.hasBlob && (
                    <a
                      href={`/api/archive/items/${item.id}/blob`}
                      className="inline-block rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="下载"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                  <a
                    href="/archive"
                    target="_blank"
                    className="inline-block rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="前台查看"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-slate-500">
                  {q || type ? '没有匹配的条目' : '还没有收藏。去「TG 机器人」绑一个用途为「收藏箱」的 bot，然后给它发东西。'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {items.length < total && (
        <div className="mt-3 text-center">
          <button
            onClick={() => load({ type, q, offset: items.length, append: true })}
            disabled={loading}
            className="rounded border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {loading ? '加载中…' : `加载更多（${items.length}/${total}）`}
          </button>
        </div>
      )}
    </div>
  );
}
