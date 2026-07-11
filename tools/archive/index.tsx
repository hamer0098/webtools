'use client';

/**
 * 收藏箱前台：查看通过 TG bot 收集的文件 / 链接 / 文字片段。
 *
 * 访问需解锁：给收藏 bot 发 /code 拿一次性码，或输入后台 2FA 动态码；
 * 解锁状态写在 iron-session，7 天有效。删除、打包导出在后台（admin）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  Download,
  ExternalLink,
  FileIcon,
  FileText,
  Globe,
  KeyRound,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';

type Item = {
  id: string;
  type: 'file' | 'url' | 'text';
  title: string;
  note: string | null;
  url: string | null;
  text: string | null;
  textTruncated: boolean;
  fileName: string | null;
  fileSize: number | null;
  mime: string | null;
  snapshotStatus: 'pending' | 'ok' | 'failed' | null;
  snapshotError: string | null;
  hasBlob: boolean;
  createdAt: number;
};

const TYPE_TABS = [
  { key: '', label: '全部' },
  { key: 'file', label: '文件' },
  { key: 'url', label: '链接' },
  { key: 'text', label: '文字' },
] as const;

function fmtSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function TypeIcon({ type, className }: { type: Item['type']; className?: string }) {
  if (type === 'file') return <FileIcon className={className} />;
  if (type === 'url') return <Globe className={className} />;
  return <FileText className={className} />;
}

export default function ArchiveTool() {
  const [status, setStatus] = useState<'checking' | 'locked' | 'ready'>('checking');

  useEffect(() => {
    fetch('/api/archive/unlock')
      .then((r) => r.json())
      .then((d) => setStatus(d.unlocked ? 'ready' : 'locked'))
      .catch(() => setStatus('locked'));
  }, []);

  if (status === 'checking') {
    return <div className="p-8 text-sm text-neutral-500">加载中…</div>;
  }
  if (status === 'locked') {
    return <UnlockForm onUnlocked={() => setStatus('ready')} />;
  }
  return <ArchiveList onLocked={() => setStatus('locked')} />;
}

function UnlockForm({ onUnlocked }: { onUnlocked: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/archive/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (r.ok) {
        onUnlocked();
      } else {
        setError((await r.json()).error || '解锁失败');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-8">
      <div className="mb-6 flex items-center gap-2">
        <Archive className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-semibold">收藏箱</h1>
      </div>
      <div className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          这里是私人收藏，需要验证后查看：
        </p>
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-neutral-600 dark:text-neutral-400">
          <li>给你的收藏 bot 发 <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">/code</code>，输入它回复的 6 位码</li>
          <li>或输入后台 2FA 验证器的动态码</li>
        </ul>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            inputMode="numeric"
            placeholder="6 位验证码"
            className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-center font-mono text-lg tracking-[0.3em] dark:border-neutral-700 dark:bg-neutral-950"
          />
          <button
            onClick={submit}
            disabled={busy || code.length !== 6}
            className="flex shrink-0 items-center gap-1 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            解锁
          </button>
        </div>
        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
        <p className="mt-4 text-xs text-neutral-400">解锁后本设备 7 天内免验证</p>
      </div>
    </div>
  );
}

function ArchiveList({ onLocked }: { onLocked: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Item | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(
    async (opts: { type: string; q: string; offset: number; append?: boolean }) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (opts.type) params.set('type', opts.type);
        if (opts.q) params.set('q', opts.q);
        if (opts.offset) params.set('offset', String(opts.offset));
        const r = await fetch(`/api/archive/items?${params}`);
        if (r.status === 401) {
          onLocked();
          return;
        }
        const d = await r.json();
        setItems((prev) => (opts.append ? [...prev, ...d.items] : d.items));
        setTotal(d.total);
      } finally {
        setLoading(false);
      }
    },
    [onLocked],
  );

  useEffect(() => {
    load({ type: '', q: '', offset: 0 });
  }, [load]);

  const applyFilter = (nextType: string, nextQ: string) => {
    setType(nextType);
    setQ(nextQ);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load({ type: nextType, q: nextQ, offset: 0 }), 350);
  };

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Archive className="h-5 w-5 text-blue-600" />
        <h1 className="text-xl font-semibold">收藏箱</h1>
        <span className="text-sm text-neutral-400">{total} 条</span>
        <button
          onClick={() => load({ type, q, offset: 0 })}
          className="ml-auto rounded p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          title="刷新"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded border border-neutral-200 dark:border-neutral-800">
          {TYPE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => applyFilter(t.key, q)}
              className={`px-3 py-1.5 text-sm first:rounded-l last:rounded-r ${
                type === t.key
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={q}
            onChange={(e) => applyFilter(type, e.target.value)}
            placeholder="搜索标题 / 备注 / 内容"
            className="w-full rounded border border-neutral-300 bg-white py-1.5 pl-8 pr-3 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => setActive(item)}
            className="flex w-full items-start gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-left hover:border-blue-400 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-blue-600"
          >
            <TypeIcon type={item.type} className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{item.title}</div>
              {item.note && <div className="mt-0.5 truncate text-sm text-amber-700 dark:text-amber-400">📌 {item.note}</div>}
              {item.type === 'text' && item.text && (
                <div className="mt-0.5 line-clamp-2 text-sm text-neutral-500">{item.text}</div>
              )}
              {item.type === 'url' && (
                <div className="mt-0.5 truncate text-sm text-neutral-500">
                  {item.url}
                  {item.snapshotStatus === 'ok' && <span className="ml-2 text-green-600">已离线</span>}
                  {item.snapshotStatus === 'failed' && <span className="ml-2 text-red-500">快照失败</span>}
                  {item.snapshotStatus === 'pending' && <span className="ml-2 text-blue-500">抓取中…</span>}
                </div>
              )}
              <div className="mt-1 text-xs text-neutral-400">
                {fmtTime(item.createdAt)}
                {item.fileSize != null && ` · ${fmtSize(item.fileSize)}`}
              </div>
            </div>
          </button>
        ))}
        {!loading && items.length === 0 && (
          <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center text-sm text-neutral-500 dark:border-neutral-700">
            {q || type ? '没有匹配的条目' : '还没有收藏。给你的收藏 bot 发文件 / 链接 / 文字试试。'}
          </div>
        )}
      </div>

      {items.length < total && (
        <div className="mt-4 text-center">
          <button
            onClick={() => load({ type, q, offset: items.length, append: true })}
            disabled={loading}
            className="rounded border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {loading ? '加载中…' : `加载更多（${items.length}/${total}）`}
          </button>
        </div>
      )}

      {active && (
        <ItemDetail
          item={active}
          onClose={() => setActive(null)}
          onChanged={(next) => {
            setActive(next);
            setItems((prev) => prev.map((i) => (i.id === next.id ? { ...i, ...next } : i)));
          }}
        />
      )}
    </div>
  );
}

function ItemDetail({
  item,
  onClose,
  onChanged,
}: {
  item: Item;
  onClose: () => void;
  onChanged: (next: Item) => void;
}) {
  const [fullText, setFullText] = useState<string | null>(item.textTruncated ? null : item.text);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(item.note || '');
  const [snapBusy, setSnapBusy] = useState(item.snapshotStatus === 'pending');
  const [snapError, setSnapError] = useState<string | null>(null);

  // 文字片段列表只带预览，打开详情补拉全文
  useEffect(() => {
    if (item.type === 'text' && item.textTruncated && fullText == null) {
      fetch(`/api/archive/items/${item.id}`)
        .then((r) => r.json())
        .then((d) => setFullText(d.item?.text ?? item.text));
    }
  }, [item, fullText]);

  const saveNote = async () => {
    const r = await fetch(`/api/archive/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: noteDraft }),
    });
    if (r.ok) {
      onChanged({ ...item, note: noteDraft.trim() || null });
      setEditingNote(false);
    }
  };

  const triggerSnapshot = async () => {
    setSnapBusy(true);
    setSnapError(null);
    try {
      const r = await fetch(`/api/archive/items/${item.id}/snapshot`, { method: 'POST' });
      const d = await r.json();
      if (d.item) onChanged({ ...item, ...d.item });
      if (!r.ok) setSnapError(d.error || '抓取失败');
    } finally {
      setSnapBusy(false);
    }
  };

  const blobUrl = `/api/archive/items/${item.id}/blob`;
  const isImage = item.mime?.startsWith('image/');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center" onClick={onClose}>
      <div
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl bg-white md:rounded-xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
          <TypeIcon type={item.type} className="mt-1 h-5 w-5 shrink-0 text-neutral-400" />
          <div className="min-w-0 flex-1">
            <div className="break-words font-medium">{item.title}</div>
            <div className="mt-0.5 text-xs text-neutral-400">
              {fmtTime(item.createdAt)}
              {item.fileSize != null && ` · ${fmtSize(item.fileSize)}`}
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {/* 备注 */}
          <div className="mb-4">
            {editingNote ? (
              <div className="space-y-2">
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={2}
                  placeholder="备注…"
                  className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
                />
                <div className="flex gap-2">
                  <button onClick={saveNote} className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700">
                    保存
                  </button>
                  <button
                    onClick={() => {
                      setEditingNote(false);
                      setNoteDraft(item.note || '');
                    }}
                    className="rounded border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingNote(true)}
                className="flex items-center gap-1.5 text-sm text-amber-700 hover:underline dark:text-amber-400"
              >
                <Pencil className="h-3.5 w-3.5" />
                {item.note ? `📌 ${item.note}` : '添加备注'}
              </button>
            )}
          </div>

          {item.type === 'text' && (
            <pre className="whitespace-pre-wrap break-words rounded bg-neutral-50 p-3 text-sm dark:bg-neutral-950">
              {fullText ?? item.text ?? ''}
            </pre>
          )}

          {item.type === 'file' && (
            <div className="space-y-3">
              {isImage && item.hasBlob && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${blobUrl}?inline=1`} alt={item.title} className="max-h-[50dvh] rounded" />
              )}
              {item.hasBlob && (
                <a
                  href={blobUrl}
                  className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                >
                  <Download className="h-4 w-4" />
                  下载 {item.fileName}（{fmtSize(item.fileSize)}）
                </a>
              )}
            </div>
          )}

          {item.type === 'url' && item.url && (
            <div className="space-y-3">
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 break-all text-sm text-blue-600 hover:underline"
              >
                <ExternalLink className="h-4 w-4 shrink-0" />
                {item.url}
              </a>
              {item.snapshotStatus === 'ok' && item.hasBlob ? (
                <>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="text-green-600">✓ 已离线保存（{fmtSize(item.fileSize)}）</span>
                    <a href={blobUrl} className="text-blue-600 hover:underline">
                      下载 HTML
                    </a>
                  </div>
                  <iframe
                    sandbox=""
                    src={`${blobUrl}?inline=1`}
                    className="h-[60dvh] w-full rounded border border-neutral-200 bg-white dark:border-neutral-800"
                    title="离线快照"
                  />
                </>
              ) : (
                <div className="rounded border border-dashed border-neutral-300 p-4 text-sm dark:border-neutral-700">
                  {item.snapshotStatus === 'failed' && (
                    <div className="mb-2 text-red-500">上次抓取失败：{item.snapshotError}</div>
                  )}
                  {snapError && <div className="mb-2 text-red-500">{snapError}</div>}
                  <button
                    onClick={triggerSnapshot}
                    disabled={snapBusy}
                    className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {snapBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {snapBusy ? '抓取中（可能要几十秒）…' : '离线保存全文（含配图）'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
