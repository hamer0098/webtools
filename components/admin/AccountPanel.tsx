'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, ShieldCheck, ShieldOff, AlertCircle, Check } from 'lucide-react';

export default function AccountPanel({
  username,
  has2fa: initialHas2fa,
}: {
  username: string;
  has2fa: boolean;
}) {
  const [has2fa, setHas2fa] = useState(initialHas2fa);

  return (
    <div className="space-y-6">
      <Section title="账号信息">
        <Row label="用户名">
          <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-sm dark:bg-slate-800">
            {username}
          </code>
        </Row>
        <Row label="两步验证 (2FA)">
          {has2fa ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <ShieldCheck className="h-3 w-3" /> 已启用
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <ShieldOff className="h-3 w-3" /> 未启用
            </span>
          )}
        </Row>
      </Section>

      <Section title="修改密码" icon={<KeyRound className="h-4 w-4" />}>
        <ChangePasswordForm />
      </Section>

      <Section title="两步验证 (2FA)" icon={<ShieldCheck className="h-4 w-4" />}>
        {has2fa ? (
          <Disable2faForm onDisabled={() => setHas2fa(false)} />
        ) : (
          <Enable2faFlow onEnabled={() => setHas2fa(true)} />
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
        {icon}
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-800">
      <span className="text-sm text-slate-500">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'error' | 'ok'; msg?: string }>({
    kind: 'idle',
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ kind: 'idle' });
    if (next.length < 8) {
      setStatus({ kind: 'error', msg: '新密码至少 8 位' });
      return;
    }
    if (next !== confirm) {
      setStatus({ kind: 'error', msg: '两次输入不一致' });
      return;
    }
    setSubmitting(true);
    const r = await fetch('/api/admin/account', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    setSubmitting(false);
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setStatus({ kind: 'error', msg: data.error || '失败' });
      return;
    }
    setStatus({ kind: 'ok', msg: '密码已更新' });
    setCurrent('');
    setNext('');
    setConfirm('');
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Input label="当前密码" type="password" value={current} onChange={setCurrent} autoComplete="current-password" />
      <Input label="新密码（至少 8 位）" type="password" value={next} onChange={setNext} autoComplete="new-password" />
      <Input label="再次输入新密码" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      <Status status={status} />
      <button
        type="submit"
        disabled={submitting || !current || !next || !confirm}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? '更新中…' : '更新密码'}
      </button>
    </form>
  );
}

function Enable2faFlow({ onEnabled }: { onEnabled: () => void }) {
  const [setupData, setSetupData] = useState<{
    secret: string;
    qrDataUrl: string;
  } | null>(null);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'error' | 'ok'; msg?: string }>({
    kind: 'idle',
  });
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    setStatus({ kind: 'idle' });
    const r = await fetch('/api/admin/account/2fa', { method: 'POST' });
    setLoading(false);
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setStatus({ kind: 'error', msg: data.error || '生成失败' });
      return;
    }
    const data = await r.json();
    setSetupData({ secret: data.secret, qrDataUrl: data.qrDataUrl });
  };

  const cancel = async () => {
    await fetch('/api/admin/account/2fa?action=cancel', { method: 'POST' });
    setSetupData(null);
    setCode('');
    setStatus({ kind: 'idle' });
  };

  const confirm = async () => {
    setStatus({ kind: 'idle' });
    setLoading(true);
    const r = await fetch('/api/admin/account/2fa?action=enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    setLoading(false);
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setStatus({ kind: 'error', msg: data.error || '验证失败' });
      return;
    }
    setStatus({ kind: 'ok', msg: '2FA 已启用' });
    setSetupData(null);
    setCode('');
    onEnabled();
  };

  if (!setupData) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          启用后登录需要额外输入手机/桌面 Authenticator App 生成的 6 位动态码。
        </p>
        <button
          onClick={start}
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '生成中…' : '启用 2FA'}
        </button>
        <Status status={status} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        用 Google Authenticator / 1Password / Authy 等扫码：
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <img
          src={setupData.qrDataUrl}
          alt="2FA QR"
          className="rounded border border-slate-200 bg-white p-2 dark:border-slate-700"
          width={200}
          height={200}
        />
        <div className="space-y-2 text-sm">
          <div className="text-slate-500">或手动输入密钥：</div>
          <code className="block break-all rounded bg-slate-100 px-2 py-2 font-mono text-xs dark:bg-slate-800">
            {setupData.secret}
          </code>
        </div>
      </div>
      <div className="space-y-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-400">
            输入 App 生成的 6 位码确认
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-32 rounded border border-slate-300 bg-white px-3 py-2 text-center font-mono text-lg tracking-widest dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
      </div>
      <Status status={status} />
      <div className="flex gap-2">
        <button
          onClick={confirm}
          disabled={loading || code.length !== 6}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '验证中…' : '启用'}
        </button>
        <button
          onClick={cancel}
          className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          取消
        </button>
      </div>
    </div>
  );
}

function Disable2faForm({ onDisabled }: { onDisabled: () => void }) {
  const [pwd, setPwd] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'error' | 'ok'; msg?: string }>({
    kind: 'idle',
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm('确定禁用 2FA？')) return;
    setSubmitting(true);
    const r = await fetch('/api/admin/account/2fa', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: pwd, code }),
    });
    setSubmitting(false);
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setStatus({ kind: 'error', msg: data.error || '失败' });
      return;
    }
    setStatus({ kind: 'ok', msg: '已禁用' });
    setPwd('');
    setCode('');
    onDisabled();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        禁用 2FA 需输入当前密码和当前 6 位码二次确认。
      </p>
      <Input label="当前密码" type="password" value={pwd} onChange={setPwd} />
      <label className="block text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-400">当前 2FA 验证码</span>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="w-32 rounded border border-slate-300 bg-white px-3 py-2 text-center font-mono text-lg tracking-widest dark:border-slate-700 dark:bg-slate-950"
        />
      </label>
      <Status status={status} />
      <button
        type="submit"
        disabled={submitting || !pwd || code.length !== 6}
        className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
      >
        {submitting ? '禁用中…' : '禁用 2FA'}
      </button>
    </form>
  );
}

function Input({
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (s: string) => void;
  autoComplete?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600 dark:text-slate-400">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full max-w-sm rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
      />
    </label>
  );
}

function Status({
  status,
}: {
  status: { kind: 'idle' | 'error' | 'ok'; msg?: string };
}) {
  if (status.kind === 'idle') return null;
  if (status.kind === 'error')
    return (
      <div className="flex items-center gap-1 text-sm text-red-600">
        <AlertCircle className="h-4 w-4" />
        {status.msg}
      </div>
    );
  return (
    <div className="flex items-center gap-1 text-sm text-emerald-600">
      <Check className="h-4 w-4" />
      {status.msg}
    </div>
  );
}
