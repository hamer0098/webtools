'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mail, Copy, Check, RefreshCw, Pencil, Trash2,
  Inbox, ArrowLeft, ShieldAlert, Sparkles,
} from 'lucide-react';
import { generateSlug, isValidSlug } from '@/lib/utils/slug';

const SLUG_STORAGE_KEY = 'webtools:tempmail:slug';

type MailboxInfo = {
  slug: string;
  address: string;
  expires_at: number;
  domain: string;
};

type MessageBrief = {
  id: string;
  from_addr: string | null;
  from_name: string | null;
  subject: string | null;
  verification_code: string | null;
  received_at: number;
  size_bytes: number;
  preview: string | null;
};

type MessageDetail = {
  id: string;
  from_addr: string | null;
  from_name: string | null;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  verification_code: string | null;
  received_at: number;
  expires_at: number;
};

const POLL_INTERVAL_MS = 30_000;

// noteSlug 在这个工具里语义是 mailbox 的 slug，本地解构改个名以避免误解
export default function TempmailTool({ noteSlug: slug }: { noteSlug?: string }) {
  const router = useRouter();

  // bootstrap：无 slug 时优先复用 localStorage 里上次的 slug，
  // 没有 / 不合法才生成新的 —— 避免每次切换 tab 都换邮箱
  useEffect(() => {
    if (slug) return;
    let next: string | null = null;
    try {
      const saved = localStorage.getItem(SLUG_STORAGE_KEY);
      if (saved && isValidSlug(saved)) next = saved;
    } catch {
      // SSR / 隐私模式：localStorage 不可用，忽略
    }
    if (!next) next = generateSlug();
    try {
      localStorage.setItem(SLUG_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    router.replace(`/tempmail/${next}`);
  }, [slug, router]);

  // 有 slug 时同步写回 localStorage，保证下次无 slug 进入能回到这个邮箱
  useEffect(() => {
    if (!slug) return;
    try {
      localStorage.setItem(SLUG_STORAGE_KEY, slug);
    } catch {
      // ignore
    }
  }, [slug]);

  const regenerate = () => {
    if (
      !confirm('生成一个全新的邮箱？当前邮箱地址和邮件不会被删除，但要再访问需要保留当前 URL。')
    ) {
      return;
    }
    const next = generateSlug();
    try {
      localStorage.setItem(SLUG_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    router.replace(`/tempmail/${next}`);
  };

  const [mailbox, setMailbox] = useState<MailboxInfo | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [messages, setMessages] = useState<MessageBrief[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openMsgId, setOpenMsgId] = useState<string | null>(null);
  const [openMsg, setOpenMsg] = useState<MessageDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftLocal, setDraftLocal] = useState('');
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // 拉邮箱信息
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setNotConfigured(false);
    setError(null);
    fetch(`/api/tempmail/${slug}`, { cache: 'no-store' })
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 503) {
          const data = await r.json().catch(() => ({}));
          if (data.notConfigured) {
            setNotConfigured(true);
            return;
          }
        }
        if (!r.ok) {
          setError(`加载邮箱失败 (${r.status})`);
          return;
        }
        const data = (await r.json()) as MailboxInfo;
        setMailbox(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || '加载邮箱失败');
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const refreshMessages = useCallback(async () => {
    if (!slug || !mailbox) return;
    setLoadingMessages(true);
    try {
      const r = await fetch(`/api/tempmail/${slug}/messages`, { cache: 'no-store' });
      if (!r.ok) return;
      const data = (await r.json()) as { messages: MessageBrief[]; address: string };
      setMessages(data.messages);
    } finally {
      setLoadingMessages(false);
    }
  }, [slug, mailbox]);

  // 邮箱拿到 → 立即拉一次
  useEffect(() => {
    if (mailbox) refreshMessages();
  }, [mailbox, refreshMessages]);

  // 30s 自动轮询
  useEffect(() => {
    if (!mailbox) return;
    const id = setInterval(refreshMessages, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [mailbox, refreshMessages]);

  // 打开邮件详情
  useEffect(() => {
    if (!openMsgId || !slug) {
      setOpenMsg(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/tempmail/${slug}/messages/${openMsgId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setOpenMsg(data);
      });
    return () => {
      cancelled = true;
    };
  }, [openMsgId, slug]);

  const startEdit = () => {
    if (!mailbox) return;
    setSaveErr(null);
    setDraftLocal(mailbox.address.split('@')[0]);
    setEditing(true);
  };

  const saveAddress = async () => {
    if (!slug) return;
    setSaveErr(null);
    const r = await fetch(`/api/tempmail/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ localPart: draftLocal.trim() }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setSaveErr(data.error || `保存失败 (${r.status})`);
      return;
    }
    setMailbox(data);
    setEditing(false);
    setMessages([]); // 切了地址，旧邮件不再属于此 slug
    setOpenMsgId(null);
    // refreshMessages 会在 mailbox effect 里自动触发
  };

  const deleteCurrentMessage = async () => {
    if (!openMsgId || !slug) return;
    if (!confirm('确定删除这封邮件？')) return;
    const r = await fetch(`/api/tempmail/${slug}/messages/${openMsgId}`, {
      method: 'DELETE',
    });
    if (r.ok) {
      setMessages((prev) => prev.filter((m) => m.id !== openMsgId));
      setOpenMsgId(null);
    }
  };

  if (!slug) {
    return <div className="p-8 text-sm text-neutral-500">初始化中…</div>;
  }

  if (notConfigured) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <ShieldAlert className="h-4 w-4" /> 临时邮箱未配置
          </div>
          <p className="text-amber-800 dark:text-amber-200">
            需要设置 <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">TEMPMAIL_DOMAIN</code>{' '}
            和{' '}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">TEMPMAIL_WEBHOOK_SECRET</code>{' '}
            环境变量，并在 Cloudflare 上为该域名启用 Email Routing + 部署 Email Worker。
            详见 <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">cf-worker/README.md</code>。
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-sm text-red-600">{error}</div>;
  }

  if (!mailbox) {
    return <div className="p-8 text-sm text-neutral-500">加载中…</div>;
  }

  return (
    <div className="flex h-[calc(100dvh-2.75rem)] flex-col md:h-dvh">
      <header className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-3 py-3 dark:border-neutral-800 dark:bg-neutral-950 sm:px-4">
        <Mail className="h-5 w-5 shrink-0 text-blue-600" />
        {editing ? (
          <div className="flex flex-wrap items-center gap-1">
            <input
              autoFocus
              value={draftLocal}
              onChange={(e) => setDraftLocal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveAddress();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="w-44 rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <span className="font-mono text-sm text-neutral-500">@{mailbox.domain}</span>
            <button
              onClick={saveAddress}
              className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
            >
              保存
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              取消
            </button>
            {saveErr && (
              <span className="w-full text-xs text-red-600 sm:w-auto">{saveErr}</span>
            )}
          </div>
        ) : (
          <>
            <code className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-sm dark:bg-neutral-800">
              {mailbox.address}
            </code>
            <CopyButton text={mailbox.address} />
            <button
              onClick={startEdit}
              title="改前缀"
              className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={regenerate}
              title="换一个全新邮箱（旧邮箱保留，只是切换到新 URL）"
              className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-blue-600 dark:hover:bg-neutral-800"
            >
              <Sparkles className="h-4 w-4" />
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-neutral-500 sm:inline">
            30s 自动刷新 · 24h 后失效
          </span>
          <button
            onClick={refreshMessages}
            disabled={loadingMessages}
            className="flex items-center gap-1 rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            <RefreshCw className={`h-3 w-3 ${loadingMessages ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside
          className={`w-full overflow-y-auto border-r border-neutral-200 dark:border-neutral-800 md:w-96 md:max-w-md ${
            openMsgId ? 'hidden md:block' : 'block'
          }`}
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-neutral-500">
              <Inbox className="h-8 w-8 text-neutral-300" />
              <div>暂无邮件</div>
              <div className="text-xs">
                把上方地址用于注册，新邮件将在 30 秒内出现
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {messages.map((m) => (
                <li
                  key={m.id}
                  onClick={() => setOpenMsgId(m.id)}
                  className={`cursor-pointer p-3 hover:bg-neutral-100 dark:hover:bg-neutral-900 ${
                    openMsgId === m.id ? 'bg-blue-50 dark:bg-blue-950/40' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-medium">
                      {m.from_name || m.from_addr || '未知发件人'}
                    </div>
                    <div className="shrink-0 text-xs text-neutral-500">
                      {fmtRelative(m.received_at)}
                    </div>
                  </div>
                  <div className="mt-0.5 truncate text-sm text-neutral-700 dark:text-neutral-300">
                    {m.subject || '(无主题)'}
                  </div>
                  {m.verification_code ? (
                    <div className="mt-1 inline-block rounded bg-green-100 px-2 py-0.5 font-mono text-xs font-semibold text-green-800 dark:bg-green-950 dark:text-green-300">
                      验证码：{m.verification_code}
                    </div>
                  ) : (
                    m.preview && (
                      <div className="mt-1 truncate text-xs text-neutral-500">
                        {m.preview}
                      </div>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main
          className={`min-w-0 flex-1 overflow-hidden ${
            openMsgId ? 'block' : 'hidden md:block'
          }`}
        >
          {openMsgId && openMsg ? (
            <MessageView
              msg={openMsg}
              onBack={() => setOpenMsgId(null)}
              onDelete={deleteCurrentMessage}
            />
          ) : openMsgId ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-400">
              加载中…
            </div>
          ) : (
            <div className="hidden h-full items-center justify-center text-sm text-neutral-400 md:flex">
              选择左侧邮件查看详情
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function MessageView({
  msg,
  onBack,
  onDelete,
}: {
  msg: MessageDetail;
  onBack: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-2 border-b border-neutral-200 p-3 dark:border-neutral-800">
        <button
          onClick={onBack}
          className="rounded p-1 text-neutral-500 hover:bg-neutral-100 md:hidden dark:hover:bg-neutral-800"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">
            {msg.subject || '(无主题)'}
          </h2>
          <div className="mt-0.5 truncate text-xs text-neutral-500">
            来自{' '}
            <span className="font-mono">
              {msg.from_name ? `${msg.from_name} <${msg.from_addr}>` : msg.from_addr}
            </span>
            {' · '}
            {new Date(msg.received_at).toLocaleString()}
          </div>
          {msg.verification_code && (
            <div className="mt-2 inline-flex items-center gap-2 rounded bg-green-100 px-3 py-1 font-mono text-sm font-semibold text-green-800 dark:bg-green-950 dark:text-green-300">
              验证码：{msg.verification_code}
              <CopyButton text={msg.verification_code} />
            </div>
          )}
        </div>
        <button
          onClick={onDelete}
          className="rounded p-1 text-neutral-500 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950"
          title="删除邮件"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto bg-white dark:bg-neutral-950">
        {msg.html_body ? (
          // sandbox="" 完全隔离：不跑脚本、不发请求、不提交表单，避免 XSS / tracking pixel
          <iframe
            sandbox=""
            srcDoc={msg.html_body}
            className="h-full w-full border-0 bg-white"
            title="邮件正文"
          />
        ) : (
          <pre className="whitespace-pre-wrap break-words p-4 font-sans text-sm">
            {msg.text_body || '(空)'}
          </pre>
        )}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      title="复制"
      className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-blue-600 dark:hover:bg-neutral-800"
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );
}

function fmtRelative(ms: number) {
  const diff = Date.now() - ms;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return new Date(ms).toLocaleDateString();
}
