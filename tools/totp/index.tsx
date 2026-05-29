'use client';

import { useEffect, useMemo, useState } from 'react';
import { TOTP, URI, Secret } from 'otpauth';
import { Copy, Plus, Trash2, X, KeyRound, FlaskConical } from 'lucide-react';
import clsx from 'clsx';

type Entry = {
  id: string;
  label: string;
  issuer?: string;
  secret: string;
  period: number;
  digits: number;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
};

const STORAGE_KEY = 'webtools.totp.entries.v1';

function loadEntries(): Entry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Entry[]) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: Entry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

type Tab = 'accounts' | 'tester';

export default function TotpTool() {
  const [tab, setTab] = useState<Tab>('tester');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setEntries(loadEntries());
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const updateEntries = (next: Entry[]) => {
    setEntries(next);
    saveEntries(next);
  };

  const remove = (id: string) => {
    if (!confirm('删除这个条目？')) return;
    updateEntries(entries.filter((e) => e.id !== id));
  };

  return (
    <div className="p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">TOTP / 2FA</h1>
          <p className="text-sm text-neutral-500">
            {tab === 'accounts'
              ? '数据仅保存在浏览器本地（localStorage）'
              : '即时测试一个 secret，不会保存'}
          </p>
        </div>
        {tab === 'accounts' && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            添加
          </button>
        )}
      </header>

      <div className="mb-5 inline-flex rounded-lg border border-neutral-200 bg-neutral-100 p-1 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        <TabButton active={tab === 'tester'} onClick={() => setTab('tester')} icon={<FlaskConical className="h-3.5 w-3.5" />}>
          测试 / 调试
        </TabButton>
        <TabButton active={tab === 'accounts'} onClick={() => setTab('accounts')} icon={<KeyRound className="h-3.5 w-3.5" />}>
          我的账号
        </TabButton>
      </div>

      {tab === 'accounts' ? (
        entries.length === 0 ? (
          <EmptyState onAdd={() => setShowAdd(true)} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {entries.map((e) => (
              <EntryCard key={e.id} entry={e} now={now} onRemove={() => remove(e.id)} />
            ))}
          </ul>
        )
      ) : (
        <TotpTester now={now} />
      )}

      {showAdd && (
        <AddDialog
          onClose={() => setShowAdd(false)}
          onAdd={(entry) => {
            updateEntries([...entries, entry]);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors',
        active
          ? 'bg-white shadow-sm dark:bg-neutral-800'
          : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function TotpTester({ now }: { now: number }) {
  const [secret, setSecret] = useState('JBSWY3DPEHPK3PXP');
  const [digits, setDigits] = useState(6);
  const [period, setPeriod] = useState(30);
  const [algorithm, setAlgorithm] = useState<'SHA1' | 'SHA256' | 'SHA512'>('SHA1');
  const [copied, setCopiedCode] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const { code, remaining, progress, error } = useMemo(() => {
    const cleaned = secret.replace(/\s+/g, '').toUpperCase();
    if (!cleaned) {
      return { code: '', remaining: 0, progress: 0, error: '请输入 secret' };
    }
    try {
      const totp = new TOTP({
        secret: Secret.fromBase32(cleaned),
        digits,
        period,
        algorithm,
      });
      const ts = now;
      const generated = totp.generate({ timestamp: ts });
      const elapsed = Math.floor(ts / 1000) % period;
      const left = period - elapsed;
      return {
        code: generated,
        remaining: left,
        progress: (left / period) * 100,
        error: null as string | null,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '无效的 secret';
      return { code: '', remaining: 0, progress: 0, error: msg };
    }
  }, [secret, digits, period, algorithm, now]);

  const formatted = code
    ? code.length >= 6
      ? code.slice(0, Math.ceil(code.length / 2)) + ' ' + code.slice(Math.ceil(code.length / 2))
      : code
    : '------';

  const lowTime = !error && remaining <= 5;

  const copyCode = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1200);
  };
  const copySecret = async () => {
    const cleaned = secret.replace(/\s+/g, '').toUpperCase();
    if (!cleaned) return;
    await navigator.clipboard.writeText(cleaned);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 1200);
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-2">
        <label className="block text-sm font-medium">你的 Secret（Base32）</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="JBSWY3DPEHPK3PXP"
            className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <button
            onClick={copySecret}
            disabled={!secret}
            title="复制 secret"
            className="flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
          >
            <Copy className="h-3.5 w-3.5" />
            {copiedSecret ? '已复制' : '复制'}
          </button>
        </div>
        <p className="text-xs text-neutral-500">支持空格分隔，自动转大写</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium">位数</label>
          <select
            value={digits}
            onChange={(e) => setDigits(Number(e.target.value))}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value={6}>6（默认）</option>
            <option value={7}>7</option>
            <option value={8}>8</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">周期（秒）</label>
          <select
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value))}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value={30}>30（默认）</option>
            <option value={60}>60</option>
            <option value={15}>15</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">算法</label>
          <select
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as 'SHA1' | 'SHA256' | 'SHA512')}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="SHA1">SHA1（默认）</option>
            <option value="SHA256">SHA256</option>
            <option value="SHA512">SHA512</option>
          </select>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
          <span>{error ? '解析错误' : `${remaining} 秒内更新`}</span>
          <span>{period} s</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className={clsx(
              'h-full transition-all duration-500',
              lowTime ? 'bg-red-500' : 'bg-blue-500',
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <button
        onClick={copyCode}
        disabled={!!error || !code}
        className={clsx(
          'flex w-full items-center justify-center gap-3 rounded-xl border bg-white px-6 py-8 transition hover:shadow-md disabled:opacity-50 disabled:hover:shadow-none dark:bg-neutral-900',
          error
            ? 'border-red-200 dark:border-red-900'
            : 'border-neutral-200 dark:border-neutral-800',
        )}
      >
        {error ? (
          <span className="text-base text-red-600">{error}</span>
        ) : (
          <>
            <span
              className={clsx(
                'font-mono text-5xl font-semibold tracking-[0.15em] tabular-nums',
                lowTime ? 'text-red-600' : 'text-emerald-600',
              )}
            >
              {formatted}
            </span>
            <Copy className="h-5 w-5 text-neutral-400" />
          </>
        )}
      </button>
      {copied && (
        <div className="text-center text-xs text-emerald-600">已复制到剪贴板</div>
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
      <p className="text-neutral-500">还没有 2FA 条目</p>
      <button
        onClick={onAdd}
        className="mt-3 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
      >
        添加第一个
      </button>
    </div>
  );
}

function EntryCard({
  entry,
  now,
  onRemove,
}: {
  entry: Entry;
  now: number;
  onRemove: () => void;
}) {
  const { code, remaining, progress } = useMemo(() => {
    try {
      const totp = new TOTP({
        secret: Secret.fromBase32(entry.secret.replace(/\s+/g, '').toUpperCase()),
        period: entry.period,
        digits: entry.digits,
        algorithm: entry.algorithm,
        issuer: entry.issuer,
        label: entry.label,
      });
      const timestamp = now;
      const code = totp.generate({ timestamp });
      const period = entry.period;
      const elapsed = Math.floor(timestamp / 1000) % period;
      const remaining = period - elapsed;
      return { code, remaining, progress: (remaining / period) * 100 };
    } catch (e) {
      return { code: '------', remaining: 0, progress: 0 };
    }
  }, [entry, now]);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
  };

  const formatted = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
  const lowTime = remaining <= 5;

  return (
    <li className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          {entry.issuer && (
            <div className="truncate text-xs text-neutral-500">{entry.issuer}</div>
          )}
          <div className="truncate text-sm font-medium">{entry.label}</div>
        </div>
        <button
          onClick={onRemove}
          className="text-neutral-400 hover:text-red-500"
          aria-label="删除"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <button
        onClick={copy}
        className="mt-3 flex w-full items-center justify-between rounded bg-neutral-100 px-3 py-3 text-left hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
      >
        <span
          className={`font-mono text-2xl tracking-wider ${
            lowTime ? 'text-red-600' : ''
          }`}
        >
          {formatted}
        </span>
        <Copy className="h-4 w-4 text-neutral-400" />
      </button>

      <div className="mt-2 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
          <div
            className={`h-full transition-all ${lowTime ? 'bg-red-500' : 'bg-blue-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="w-8 text-right font-mono text-xs text-neutral-500">{remaining}s</span>
      </div>
    </li>
  );
}

function AddDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (entry: Entry) => void;
}) {
  const [mode, setMode] = useState<'uri' | 'manual'>('uri');
  const [uri, setUri] = useState('');
  const [label, setLabel] = useState('');
  const [issuer, setIssuer] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    try {
      if (mode === 'uri') {
        const totp = URI.parse(uri.trim()) as TOTP;
        if (!(totp instanceof TOTP)) throw new Error('仅支持 TOTP（不支持 HOTP）');
        onAdd({
          id: randomId(),
          label: totp.label || '未命名',
          issuer: totp.issuer || undefined,
          secret: totp.secret.base32,
          period: totp.period,
          digits: totp.digits,
          algorithm: totp.algorithm as Entry['algorithm'],
        });
      } else {
        const cleaned = secret.replace(/\s+/g, '').toUpperCase();
        if (!cleaned) throw new Error('请输入 secret');
        Secret.fromBase32(cleaned);
        if (!label.trim()) throw new Error('请输入标签');
        onAdd({
          id: randomId(),
          label: label.trim(),
          issuer: issuer.trim() || undefined,
          secret: cleaned,
          period: 30,
          digits: 6,
          algorithm: 'SHA1',
        });
      }
    } catch (e: any) {
      setError(e?.message || '解析失败');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-neutral-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">添加 2FA 条目</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex gap-2 text-sm">
          <button
            className={`flex-1 rounded px-3 py-1.5 ${
              mode === 'uri'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-100 dark:bg-neutral-800'
            }`}
            onClick={() => setMode('uri')}
          >
            otpauth:// URI
          </button>
          <button
            className={`flex-1 rounded px-3 py-1.5 ${
              mode === 'manual'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-100 dark:bg-neutral-800'
            }`}
            onClick={() => setMode('manual')}
          >
            手动输入
          </button>
        </div>

        {mode === 'uri' ? (
          <div className="space-y-3">
            <textarea
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              placeholder="otpauth://totp/Issuer:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Issuer"
              rows={3}
              className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="标签（必填）" value={label} onChange={setLabel} placeholder="user@example.com" />
            <Field label="发行方（可选）" value={issuer} onChange={setIssuer} placeholder="Google" />
            <Field
              label="Secret（Base32）"
              value={secret}
              onChange={setSecret}
              placeholder="JBSWY3DPEHPK3PXP"
              mono
            />
          </div>
        )}

        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            取消
          </button>
          <button
            onClick={submit}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-neutral-600 dark:text-neutral-400">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 ${
          mono ? 'font-mono' : ''
        }`}
      />
    </label>
  );
}
