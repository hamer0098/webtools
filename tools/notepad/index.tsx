'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateSlug } from '@/lib/utils/slug';
import { Lock, LockOpen, Link as LinkIcon, Check } from 'lucide-react';

type LoadState =
  | { state: 'loading' }
  | { state: 'locked'; hasPassword: true }
  | { state: 'ready'; content: string; hasPassword: boolean; isNew: boolean }
  | { state: 'error'; message: string };

export default function NotepadTool({ noteSlug }: { noteSlug?: string }) {
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>({ state: 'loading' });
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState<{
    kind: 'idle' | 'saving' | 'saved' | 'error';
    message?: string;
  }>({ kind: 'idle' });
  const [showPwd, setShowPwd] = useState(false);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  // 没有 slug：生成一个并跳转
  useEffect(() => {
    if (!noteSlug) {
      const s = generateSlug();
      router.replace(`/notepad/${s}`);
    }
  }, [noteSlug, router]);

  // 加载笔记
  useEffect(() => {
    if (!noteSlug) return;
    let cancelled = false;
    setLoad({ state: 'loading' });
    fetch(`/api/notes/${noteSlug}`, { cache: 'no-store' })
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 401) {
          const data = await r.json().catch(() => ({}));
          if (data.requirePassword) {
            setLoad({ state: 'locked', hasPassword: true });
            return;
          }
        }
        if (!r.ok) {
          setLoad({ state: 'error', message: `加载失败 (${r.status})` });
          return;
        }
        const data = await r.json();
        setContent(data.content || '');
        setLoad({
          state: 'ready',
          content: data.content || '',
          hasPassword: !!data.hasPassword,
          isNew: !data.exists,
        });
      })
      .catch((e) => {
        if (!cancelled) setLoad({ state: 'error', message: e?.message || '加载失败' });
      });
    return () => {
      cancelled = true;
    };
  }, [noteSlug]);

  // 自动保存（debounce 800ms）
  const scheduleSave = useCallback(
    (next: string) => {
      if (!noteSlug || load.state !== 'ready') return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSaveStatus({ kind: 'saving' });
        try {
          const r = await fetch(`/api/notes/${noteSlug}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: next }),
          });
          if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            let message: string;
            if (r.status === 413) message = data.error || '内容过大';
            else if (r.status === 429)
              message = `请求过快，${data.retryAfter ?? ''}秒后再试`;
            else if (r.status === 507) message = data.error || '服务器已满';
            else message = data.error || `保存失败 (${r.status})`;
            setSaveStatus({ kind: 'error', message });
            return;
          }
          setSaveStatus({ kind: 'saved' });
          setTimeout(() => setSaveStatus({ kind: 'idle' }), 1500);
        } catch {
          setSaveStatus({ kind: 'error', message: '网络错误' });
        }
      }, 800);
    },
    [noteSlug, load.state],
  );

  if (!noteSlug || load.state === 'loading') {
    return <div className="p-8 text-sm text-neutral-500">加载中…</div>;
  }

  if (load.state === 'error') {
    return <div className="p-8 text-sm text-red-600">{load.message}</div>;
  }

  if (load.state === 'locked') {
    return (
      <PasswordPrompt
        slug={noteSlug}
        onUnlocked={() => {
          // 解锁后重新触发加载
          setLoad({ state: 'loading' });
          fetch(`/api/notes/${noteSlug}`, { cache: 'no-store' })
            .then((r) => r.json())
            .then((data) => {
              setContent(data.content || '');
              setLoad({
                state: 'ready',
                content: data.content || '',
                hasPassword: true,
                isNew: false,
              });
            });
        }}
      />
    );
  }

  return (
    <div className="flex h-[calc(100dvh-2.75rem)] flex-col md:h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 sm:px-4">
        <div className="flex items-center gap-2">
          <LinkIcon className="h-4 w-4 text-neutral-400" />
          <code className="rounded bg-neutral-100 px-2 py-0.5 font-mono dark:bg-neutral-800">
            /notepad/{noteSlug}
          </code>
          <CopyLink slug={noteSlug} />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPwd(true)}
            className="flex items-center gap-1 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            {load.hasPassword ? (
              <>
                <Lock className="h-4 w-4" /> 已加密
              </>
            ) : (
              <>
                <LockOpen className="h-4 w-4" /> 加密
              </>
            )}
          </button>
          <SaveIndicator status={saveStatus} />
        </div>
      </header>
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          scheduleSave(e.target.value);
        }}
        placeholder="开始输入… 内容会自动保存"
        className="flex-1 resize-none bg-white p-4 font-mono text-base outline-none dark:bg-neutral-950 md:text-sm"
      />
      {showPwd && (
        <PasswordSettings
          slug={noteSlug}
          hasPassword={load.hasPassword}
          content={content}
          onClose={() => setShowPwd(false)}
          onUpdated={(hasPassword) => {
            setLoad((prev) =>
              prev.state === 'ready' ? { ...prev, hasPassword } : prev,
            );
            setShowPwd(false);
          }}
        />
      )}
    </div>
  );
}

function CopyLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const url = `${window.location.origin}/notepad/${slug}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button
      onClick={copy}
      className="text-xs text-blue-600 hover:underline"
      title="复制链接"
    >
      {copied ? '已复制' : '复制链接'}
    </button>
  );
}

function SaveIndicator({
  status,
}: {
  status: { kind: 'idle' | 'saving' | 'saved' | 'error'; message?: string };
}) {
  if (status.kind === 'idle') return null;
  if (status.kind === 'saving')
    return <span className="text-xs text-neutral-500">保存中…</span>;
  if (status.kind === 'saved')
    return (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <Check className="h-3 w-3" /> 已保存
      </span>
    );
  return (
    <span className="text-xs text-red-600" title={status.message}>
      {status.message || '保存失败'}
    </span>
  );
}

function PasswordPrompt({
  slug,
  onUnlocked,
}: {
  slug: string;
  onUnlocked: () => void;
}) {
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch(`/api/notes/${slug}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      if (!r.ok) {
        setError('密码错误');
        return;
      }
      onUnlocked();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center">
      <form onSubmit={submit} className="w-80 space-y-3 rounded border border-neutral-200 p-6 dark:border-neutral-800">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Lock className="h-5 w-5" /> 笔记已加密
        </div>
        <p className="text-sm text-neutral-500">输入密码以查看 /notepad/{slug}</p>
        <input
          autoFocus
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-950 md:text-sm"
          placeholder="密码"
        />
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={submitting || !pwd}
          className="w-full rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? '验证中…' : '解锁'}
        </button>
      </form>
    </div>
  );
}

function PasswordSettings({
  slug,
  hasPassword,
  content,
  onClose,
  onUpdated,
}: {
  slug: string;
  hasPassword: boolean;
  content: string;
  onClose: () => void;
  onUpdated: (hasPassword: boolean) => void;
}) {
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = async () => {
    if (!pwd) {
      setError('请输入密码');
      return;
    }
    setSubmitting(true);
    setError(null);
    const r = await fetch(`/api/notes/${slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, password: pwd }),
    });
    setSubmitting(false);
    if (!r.ok) {
      setError('设置失败');
      return;
    }
    onUpdated(true);
  };

  const clear = async () => {
    if (!confirm('确定移除密码保护？')) return;
    setSubmitting(true);
    const r = await fetch(`/api/notes/${slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, password: null }),
    });
    setSubmitting(false);
    if (!r.ok) {
      setError('清除失败');
      return;
    }
    onUpdated(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-neutral-900">
        <h2 className="mb-3 text-lg font-semibold">{hasPassword ? '修改密码' : '设置密码'}</h2>
        <input
          type="password"
          autoFocus
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder="新密码"
          className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-950 md:text-sm"
        />
        {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          {hasPassword && (
            <button
              onClick={clear}
              disabled={submitting}
              className="rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              移除密码
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            取消
          </button>
          <button
            onClick={set}
            disabled={submitting}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {hasPassword ? '更新' : '设置'}
          </button>
        </div>
      </div>
    </div>
  );
}

