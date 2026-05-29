'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, Check, Languages, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import * as OpenCC from 'opencc-js';
import { pinyin } from 'pinyin-pro';

type ToneMode = 'symbol' | 'none' | 'num';

const TONE_OPTIONS: Array<{ id: ToneMode; label: string; example: string }> = [
  { id: 'symbol', label: '带声调', example: 'zhōng wén' },
  { id: 'num', label: '数字声调', example: 'zhong1 wen2' },
  { id: 'none', label: '不带声调', example: 'zhong wen' },
];

// Converter 初始化要加载字典，做模块级缓存避免每次输入重建
const converterCache = new Map<string, (s: string) => string>();
function getConverter(from: 'cn' | 'tw', to: 'cn' | 'tw') {
  const key = `${from}->${to}`;
  let c = converterCache.get(key);
  if (!c) {
    c = OpenCC.Converter({ from, to });
    converterCache.set(key, c);
  }
  return c;
}

const PLACEHOLDER =
  '输入中文，下方四栏会同时给出繁体、简体、拼音和英文翻译。\n例：机器学习是人工智能的核心';

const TRANSLATE_DEBOUNCE_MS = 500;

type TranslateState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; text: string }
  | { status: 'error'; error: string };

export default function ChineseTool() {
  const [input, setInput] = useState('');
  const [tone, setTone] = useState<ToneMode>('symbol');
  const [translate, setTranslate] = useState<TranslateState>({ status: 'idle' });

  const { trad, simp, py, localError } = useMemo(() => {
    if (!input) {
      return { trad: '', simp: '', py: '', localError: null as string | null };
    }
    try {
      return {
        trad: getConverter('cn', 'tw')(input),
        simp: getConverter('tw', 'cn')(input),
        py: pinyin(input, {
          toneType: tone,
          type: 'string',
          nonZh: 'consecutive',
        }),
        localError: null as string | null,
      };
    } catch (e) {
      return {
        trad: '',
        simp: '',
        py: '',
        localError: (e as Error).message || '处理失败',
      };
    }
  }, [input, tone]);

  // 翻译：debounce 500ms 后异步调 /api/translate
  useEffect(() => {
    if (!input.trim()) {
      setTranslate({ status: 'idle' });
      return;
    }
    setTranslate({ status: 'loading' });
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: input, from: 'auto', to: 'en' }),
          signal: ctrl.signal,
        });
        const data = (await r.json()) as
          | { ok: true; text: string; provider: string }
          | { ok: false; error: string };
        if (ctrl.signal.aborted) return;
        if (data.ok) {
          setTranslate({ status: 'success', text: data.text });
        } else {
          setTranslate({ status: 'error', error: data.error });
        }
      } catch (e: unknown) {
        if (ctrl.signal.aborted) return;
        setTranslate({ status: 'error', error: (e as Error).message || '请求失败' });
      }
    }, TRANSLATE_DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [input]);

  return (
    <div className="min-h-[calc(100vh-2.75rem)] bg-neutral-50 p-4 dark:bg-neutral-950 md:min-h-screen md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center gap-2">
          <Languages className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-semibold">中文转换</h1>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
            输入
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={5}
            placeholder={PLACEHOLDER}
            className="w-full resize-none rounded border border-neutral-300 bg-white p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <div className="mt-1 text-xs text-neutral-500">{input.length} 字符</div>
        </div>

        {localError && <div className="mb-3 text-sm text-red-600">[错误] {localError}</div>}

        <div className="grid gap-3 md:grid-cols-2">
          <OutputCard title="简 → 繁" value={trad} />
          <OutputCard title="繁 → 简" value={simp} />
          <OutputCard
            title="拼音"
            value={py}
            extra={
              <div className="flex flex-wrap items-center gap-1">
                {TONE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setTone(opt.id)}
                    title={opt.example}
                    className={clsx(
                      'rounded border px-1.5 py-0.5 text-[11px]',
                      tone === opt.id
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            }
          />
          <TranslateCard state={translate} />
        </div>
      </div>
    </div>
  );
}

function OutputCard({
  title,
  value,
  extra,
}: {
  title: string;
  value: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col rounded border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2 dark:border-neutral-800">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {title}
        </span>
        <div className="flex items-center gap-2">
          {extra}
          <CopyButton text={value} />
        </div>
      </div>
      <pre className="flex-1 whitespace-pre-wrap break-words p-3 text-sm">
        {value || <span className="text-neutral-400">等待输入…</span>}
      </pre>
    </div>
  );
}

function TranslateCard({ state }: { state: TranslateState }) {
  const value = state.status === 'success' ? state.text : '';
  return (
    <div className="flex min-h-48 flex-col rounded border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2 dark:border-neutral-800">
        <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          中 → 英 翻译
          {state.status === 'loading' && (
            <Loader2 className="h-3 w-3 animate-spin text-neutral-400" />
          )}
        </span>
        <CopyButton text={value} />
      </div>
      <div className="flex-1 overflow-auto p-3 text-sm">
        {state.status === 'idle' && (
          <span className="text-neutral-400">等待输入…</span>
        )}
        {state.status === 'loading' && (
          <span className="text-neutral-400">翻译中…</span>
        )}
        {state.status === 'success' && (
          <pre className="whitespace-pre-wrap break-words">{state.text}</pre>
        )}
        {state.status === 'error' && (
          <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {state.error}
          </div>
        )}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-blue-600 dark:hover:bg-neutral-800"
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
