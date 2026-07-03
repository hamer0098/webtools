'use client';

import { useEffect, useMemo, useState } from 'react';
import { Eye, Trash2, RefreshCw, Search } from 'lucide-react';
import Pagination, { ADMIN_PAGE_SIZE } from './Pagination';

type MessageFilter = 'all' | 'has' | 'none';

type MailboxRow = {
  slug: string;
  address: string;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  message_count: number;
};

type MessageRow = {
  id: string;
  from_addr: string | null;
  from_name: string | null;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  verification_code: string | null;
  received_at: number;
};

function fmtTime(ms: number) {
  if (!ms) return '-';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n: number) {
  return n.toString().padStart(2, '0');
}

export default function TempmailAdminClient({
  initialMailboxes,
}: {
  initialMailboxes: MailboxRow[];
}) {
  const [mailboxes, setMailboxes] = useState(initialMailboxes);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [msgFilter, setMsgFilter] = useState<MessageFilter>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [query, msgFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mailboxes.filter((m) => {
      if (q && !m.slug.toLowerCase().includes(q) && !m.address.toLowerCase().includes(q))
        return false;
      if (msgFilter === 'has' && m.message_count === 0) return false;
      if (msgFilter === 'none' && m.message_count > 0) return false;
      return true;
    });
  }, [mailboxes, query, msgFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * ADMIN_PAGE_SIZE, safePage * ADMIN_PAGE_SIZE),
    [filtered, safePage],
  );

  const openMailbox = async (m: MailboxRow) => {
    if (expanded === m.slug) {
      setExpanded(null);
      return;
    }
    setExpanded(m.slug);
    setMessages([]);
    const r = await fetch(
      `/api/admin/tempmail/messages?address=${encodeURIComponent(m.address)}`,
    );
    if (r.ok) {
      const data = await r.json();
      setMessages(data.messages);
    }
  };

  const deleteMailbox = async (slug: string) => {
    if (!confirm(`删除邮箱 slug=${slug}？\n同地址下的邮件不会被删（可能还有其他 slug 指向）`)) {
      return;
    }
    const r = await fetch(`/api/admin/tempmail/${slug}`, { method: 'DELETE' });
    if (r.ok) {
      setMailboxes((prev) => prev.filter((x) => x.slug !== slug));
      if (expanded === slug) setExpanded(null);
    }
  };

  const runCleanup = async () => {
    if (!confirm('立即清理所有已过期的邮箱与邮件？')) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/tempmail/cleanup', { method: 'POST' });
      if (r.ok) {
        const data = await r.json();
        alert(`已清理：邮箱 ${data.mailboxes} 个、邮件 ${data.messages} 封`);
        location.reload();
      }
    } finally {
      setBusy(false);
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
            placeholder="搜索 slug 或地址"
            className="w-56 rounded border border-neutral-300 bg-white py-1 pl-7 pr-2 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>
        <select
          value={msgFilter}
          onChange={(e) => setMsgFilter(e.target.value as MessageFilter)}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
        >
          <option value="all">全部</option>
          <option value="has">有邮件</option>
          <option value="none">无邮件</option>
        </select>
        <button
          onClick={runCleanup}
          disabled={busy}
          className="flex items-center gap-1 rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} />
          立即清理过期
        </button>
      </div>
      <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-100 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-800">
            <tr>
              <th className="px-3 py-2">Slug</th>
              <th className="px-3 py-2">地址</th>
              <th className="px-3 py-2 text-center">邮件</th>
              <th className="px-3 py-2">创建</th>
              <th className="px-3 py-2">最近活跃</th>
              <th className="px-3 py-2">过期</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((m) => (
              <Row
                key={m.slug}
                mailbox={m}
                expanded={expanded === m.slug}
                messages={expanded === m.slug ? messages : []}
                onToggle={() => openMailbox(m)}
                onDelete={() => deleteMailbox(m.slug)}
              />
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-neutral-500">
                  {mailboxes.length === 0 ? '暂无邮箱' : '没有匹配的邮箱'}
                </td>
              </tr>
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

function Row({
  mailbox,
  expanded,
  messages,
  onToggle,
  onDelete,
}: {
  mailbox: MailboxRow;
  expanded: boolean;
  messages: MessageRow[];
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr className="border-t border-neutral-200 dark:border-neutral-800">
        <td className="px-3 py-2 font-mono text-xs">
          <a href={`/tempmail/${mailbox.slug}`} target="_blank" className="hover:underline">
            {mailbox.slug}
          </a>
        </td>
        <td className="px-3 py-2 font-mono">{mailbox.address}</td>
        <td className="px-3 py-2 text-center">{mailbox.message_count}</td>
        <td className="px-3 py-2 text-xs text-neutral-500">{fmtTime(mailbox.created_at)}</td>
        <td className="px-3 py-2 text-xs text-neutral-500">{fmtTime(mailbox.last_seen_at)}</td>
        <td className="px-3 py-2 text-xs text-neutral-500">{fmtTime(mailbox.expires_at)}</td>
        <td className="px-3 py-2 text-right">
          <button
            onClick={onToggle}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title={expanded ? '收起邮件' : '展开邮件'}
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1 text-neutral-500 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950"
            title="删除邮箱（不删邮件）"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-neutral-50 dark:bg-neutral-900/50">
          <td colSpan={7} className="px-3 py-3">
            {messages.length === 0 ? (
              <div className="text-xs text-neutral-500">该地址下无邮件</div>
            ) : (
              <ul className="space-y-2">
                {messages.map((msg) => (
                  <li
                    key={msg.id}
                    className="rounded border border-neutral-200 bg-white p-2 text-xs dark:border-neutral-700 dark:bg-neutral-950"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono">
                        {msg.from_name ? `${msg.from_name} <${msg.from_addr}>` : msg.from_addr}
                      </span>
                      <span className="text-neutral-400">{fmtTime(msg.received_at)}</span>
                    </div>
                    <div className="mt-1 font-medium">{msg.subject || '(无主题)'}</div>
                    {msg.verification_code && (
                      <div className="mt-1 inline-block rounded bg-green-100 px-2 py-0.5 font-mono text-green-800 dark:bg-green-950 dark:text-green-300">
                        验证码：{msg.verification_code}
                      </div>
                    )}
                    {msg.text_body && (
                      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-neutral-600 dark:text-neutral-400">
                        {msg.text_body.slice(0, 2000)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
