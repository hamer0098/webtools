'use client';

import { useMemo, useState } from 'react';
import { ArrowLeftRight, Copy, Check, Code2 } from 'lucide-react';
import clsx from 'clsx';

type TabId = 'base64' | 'unicode' | 'url' | 'timestamp';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'base64', label: 'Base64' },
  { id: 'unicode', label: 'Unicode' },
  { id: 'url', label: 'URL' },
  { id: 'timestamp', label: '时间戳' },
];

export default function EncodeTool() {
  const [tab, setTab] = useState<TabId>('base64');

  return (
    <div className="min-h-[calc(100dvh-2.75rem)] bg-neutral-50 p-4 dark:bg-neutral-950 md:min-h-screen md:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-2">
          <Code2 className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-semibold">编码工具</h1>
        </div>

        <div className="mb-4 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'border-b-2 px-3 py-2 text-sm transition-colors',
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'base64' && <Base64Panel />}
        {tab === 'unicode' && <UnicodePanel />}
        {tab === 'url' && <UrlPanel />}
        {tab === 'timestamp' && <TimestampPanel />}
      </div>
    </div>
  );
}

/* ---------- 通用：双向输入输出框 ---------- */

function BiDirPanel({
  inputLabel,
  outputLabel,
  encode,
  decode,
  swapLabel = '切换方向',
}: {
  inputLabel: string;
  outputLabel: string;
  encode: (s: string) => string;
  decode: (s: string) => string;
  swapLabel?: string;
}) {
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');
  const [input, setInput] = useState('');

  const output = useMemo(() => {
    if (!input) return '';
    try {
      return mode === 'encode' ? encode(input) : decode(input);
    } catch (e) {
      return `[错误] ${(e as Error).message || '处理失败'}`;
    }
  }, [input, mode, encode, decode]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMode((m) => (m === 'encode' ? 'decode' : 'encode'))}
          className="flex items-center gap-1.5 rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" /> {swapLabel}
        </button>
        <span className="text-sm text-neutral-500">
          当前：{mode === 'encode' ? `${inputLabel} → ${outputLabel}` : `${outputLabel} → ${inputLabel}`}
        </span>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
          {mode === 'encode' ? inputLabel : outputLabel}
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={6}
          placeholder="输入内容…"
          className="w-full resize-none rounded border border-neutral-300 bg-white p-3 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            {mode === 'encode' ? outputLabel : inputLabel}
          </label>
          <CopyOutput text={output} />
        </div>
        <pre className="min-h-32 whitespace-pre-wrap break-words rounded border border-neutral-200 bg-neutral-100 p-3 font-mono text-sm dark:border-neutral-800 dark:bg-neutral-900">
          {output || <span className="text-neutral-400">输出会显示在这里</span>}
        </pre>
      </div>
    </div>
  );
}

function CopyOutput({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text || text.startsWith('[错误]')) return null;
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-blue-600 dark:hover:bg-neutral-800"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-green-600" /> 已复制
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" /> 复制
        </>
      )}
    </button>
  );
}

/* ---------- Base64 ---------- */

function Base64Panel() {
  return (
    <BiDirPanel
      inputLabel="原文"
      outputLabel="Base64"
      encode={(s) => {
        // 用 TextEncoder 处理 UTF-8（避免 btoa 对中文报 InvalidCharacterError）
        const bytes = new TextEncoder().encode(s);
        let bin = '';
        for (const b of bytes) bin += String.fromCharCode(b);
        return btoa(bin);
      }}
      decode={(s) => {
        const bin = atob(s.trim());
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      }}
    />
  );
}

/* ---------- Unicode（\u 转义） ---------- */

function UnicodePanel() {
  return (
    <BiDirPanel
      inputLabel="原文"
      outputLabel='\\u 转义'
      encode={(s) =>
        Array.from(s)
          .map((c) => {
            const code = c.codePointAt(0)!;
            if (code <= 0x7f) return c; // ASCII 保留可读
            if (code <= 0xffff) return '\\u' + code.toString(16).padStart(4, '0');
            // 超出 BMP 的字符用代理对
            return Array.from(c)
              .map((u) => '\\u' + u.charCodeAt(0).toString(16).padStart(4, '0'))
              .join('');
          })
          .join('')
      }
      decode={(s) =>
        s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16)),
        )
      }
    />
  );
}

/* ---------- URL ---------- */

function UrlPanel() {
  return (
    <BiDirPanel
      inputLabel="原文"
      outputLabel="URL 编码"
      encode={(s) => encodeURIComponent(s)}
      decode={(s) => decodeURIComponent(s.trim())}
    />
  );
}

/* ---------- 时间戳 ---------- */

function TimestampPanel() {
  const [input, setInput] = useState('');
  const now = Date.now();

  const parsed = useMemo(() => {
    const s = input.trim();
    if (!s) return null;

    // 1. 纯数字：根据长度判断是秒 / 毫秒
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      const ms = s.length <= 10 ? n * 1000 : n;
      const d = new Date(ms);
      if (isNaN(d.getTime())) return { error: '无效时间戳' };
      return {
        kind: 'ts' as const,
        ms,
        seconds: Math.floor(ms / 1000),
        iso: d.toISOString(),
        local: d.toLocaleString(),
        utc: d.toUTCString(),
      };
    }

    // 2. 日期字符串
    const d = new Date(s);
    if (isNaN(d.getTime())) return { error: '无法解析为日期' };
    return {
      kind: 'date' as const,
      ms: d.getTime(),
      seconds: Math.floor(d.getTime() / 1000),
      iso: d.toISOString(),
      local: d.toLocaleString(),
      utc: d.toUTCString(),
    };
  }, [input]);

  return (
    <div className="space-y-4">
      <div className="rounded border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-1 text-xs text-neutral-500">当前时间</div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs">
          <span>毫秒 <code className="text-blue-600">{now}</code></span>
          <span>秒 <code className="text-blue-600">{Math.floor(now / 1000)}</code></span>
          <span>本地 <code className="text-neutral-700 dark:text-neutral-300">{new Date(now).toLocaleString()}</code></span>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
          输入（10/13 位数字时间戳 或 日期字符串如 2025-12-31 18:00）
        </label>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="例：1735660800 或 2025-12-31T18:00:00Z"
          className="w-full rounded border border-neutral-300 bg-white px-3 py-2 font-mono text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      {parsed && 'error' in parsed && (
        <div className="text-sm text-red-600">{parsed.error}</div>
      )}

      {parsed && !('error' in parsed) && (
        <div className="space-y-2 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900/50">
          <ResultRow label="毫秒时间戳" value={String(parsed.ms)} />
          <ResultRow label="秒时间戳" value={String(parsed.seconds)} />
          <ResultRow label="ISO 8601 (UTC)" value={parsed.iso} />
          <ResultRow label="本地时间" value={parsed.local} />
          <ResultRow label="UTC 字符串" value={parsed.utc} />
        </div>
      )}
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 text-xs text-neutral-500">{label}</span>
      <code className="flex-1 truncate font-mono text-xs">{value}</code>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-blue-600 dark:hover:bg-neutral-800"
      >
        {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}
