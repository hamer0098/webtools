'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ShieldCheck, AlertCircle } from 'lucide-react';

type Stage = { kind: 'credentials' } | { kind: '2fa' };

export default function LoginForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: 'credentials' });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.error || '登录失败');
        return;
      }
      if (data.require2fa) {
        setStage({ kind: '2fa' });
        return;
      }
      router.push('/admin');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const submit2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch('/api/auth/login/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.error || '验证失败');
        return;
      }
      router.push('/admin');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-6 flex items-center gap-2">
        {stage.kind === 'credentials' ? (
          <Lock className="h-5 w-5 text-blue-600" />
        ) : (
          <ShieldCheck className="h-5 w-5 text-blue-600" />
        )}
        <h1 className="text-lg font-semibold">
          {stage.kind === 'credentials' ? '管理后台登录' : '两步验证'}
        </h1>
      </div>

      {stage.kind === 'credentials' ? (
        <form onSubmit={submitCredentials} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-400">账号</span>
            <input
              type="text"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base md:text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-400">密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base md:text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <ErrorBox error={error} />
          <button
            type="submit"
            disabled={submitting || !username || !password}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>
      ) : (
        <form onSubmit={submit2fa} className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            输入 Authenticator App 上的 6 位动态码
          </p>
          <input
            type="text"
            autoFocus
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-center font-mono text-2xl tracking-[0.4em] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950"
            placeholder="••••••"
          />
          <ErrorBox error={error} />
          <button
            type="submit"
            disabled={submitting || code.length !== 6}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? '验证中…' : '验证'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStage({ kind: 'credentials' });
              setCode('');
              setError(null);
            }}
            className="block w-full text-center text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            ← 重新输入账号密码
          </button>
        </form>
      )}
    </div>
  );
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="flex items-center gap-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {error}
    </div>
  );
}
