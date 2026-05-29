'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileLock2, Upload, KeyRound, Link as LinkIcon, Check, AlertCircle, RotateCcw } from 'lucide-react';
import {
  b64urlEncode,
  encryptFile,
  encryptMetadata,
  generateMasterKey,
} from './crypto';

type AuthState =
  | { state: 'loading' }
  | { state: 'unauthed' }
  | { state: 'authed'; kind: 'permanent' | 'onetime'; expiresAt: number; maxBytes: number; ttlMs: number };

type UploadState =
  | { state: 'idle' }
  | { state: 'encrypting'; progress: number }
  | { state: 'uploading'; progress: number }
  | { state: 'done'; url: string; expiresAt: number }
  | { state: 'error'; message: string };

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)} 秒`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)} 分钟`;
  if (ms < 86_400_000) return `${Math.round(ms / 3600_000)} 小时`;
  return `${Math.round(ms / 86_400_000)} 天`;
}

export default function SendTool() {
  const [auth, setAuth] = useState<AuthState>({ state: 'loading' });

  const refresh = useCallback(() => {
    fetch('/api/send/auth', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.authed) {
          setAuth({
            state: 'authed',
            kind: d.kind,
            expiresAt: d.expiresAt,
            maxBytes: d.maxBytes,
            ttlMs: d.ttlMs,
          });
        } else {
          setAuth({ state: 'unauthed' });
        }
      })
      .catch(() => setAuth({ state: 'unauthed' }));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (auth.state === 'loading') {
    return <div className="p-8 text-sm text-neutral-500">加载中…</div>;
  }

  if (auth.state === 'unauthed') {
    return <AuthForm onSuccess={refresh} />;
  }

  return <Uploader auth={auth} onLogout={() => setAuth({ state: 'unauthed' })} />;
}

function AuthForm({ onSuccess }: { onSuccess: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch('/api/send/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || '验证失败');
        return;
      }
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-6">
      <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <FileLock2 className="h-5 w-5 text-blue-600" />
          匿名文件
        </div>
        <p className="mb-4 text-sm text-neutral-500">
          受邀使用。请输入管理员发放的密码或一次性邀请码。
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              autoFocus
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="密码 / 邀请码"
              className="w-full rounded border border-neutral-300 bg-white px-3 py-2 pl-9 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
          </div>
          {error && (
            <div className="flex items-center gap-1 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting || !code}
            className="w-full rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? '验证中…' : '验证'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Uploader({
  auth,
  onLogout,
}: {
  auth: Extract<AuthState, { state: 'authed' }>;
  onLogout: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadState>({ state: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File | null | undefined) => {
    if (!f) return;
    if (f.size > auth.maxBytes) {
      setUpload({
        state: 'error',
        message: `文件超过上限 ${fmtSize(auth.maxBytes)}`,
      });
      return;
    }
    setFile(f);
    setUpload({ state: 'idle' });
  };

  const reset = () => {
    setFile(null);
    setUpload({ state: 'idle' });
    if (inputRef.current) inputRef.current.value = '';
  };

  const submit = async () => {
    if (!file) return;
    try {
      setUpload({ state: 'encrypting', progress: 0 });
      const master = await generateMasterKey();
      const meta = await encryptMetadata({ name: file.name, size: file.size, type: file.type || '' }, master);
      const ct = await encryptFile(file, master);
      setUpload({ state: 'uploading', progress: 0 });

      const xhr = new XMLHttpRequest();
      xhr.open('PUT', '/api/send/upload');
      xhr.setRequestHeader('x-send-metadata', meta);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUpload({ state: 'uploading', progress: e.loaded / e.total });
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText) as { id: string; expiresAt: number };
          const url = `${window.location.origin}/anonfile/d/${data.id}#${b64urlEncode(master)}`;
          setUpload({ state: 'done', url, expiresAt: data.expiresAt });
        } else {
          let msg = '上传失败';
          try {
            msg = JSON.parse(xhr.responseText).error || msg;
          } catch {}
          if (xhr.status === 401) onLogout();
          setUpload({ state: 'error', message: msg });
        }
      };
      xhr.onerror = () => setUpload({ state: 'error', message: '网络错误' });
      xhr.send(ct);
    } catch (e) {
      console.error(e);
      setUpload({ state: 'error', message: e instanceof Error ? e.message : '加密失败' });
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center gap-2">
        <FileLock2 className="h-5 w-5 text-blue-600" />
        <h1 className="text-lg font-semibold">匿名文件分享</h1>
        <span className="ml-auto text-xs text-neutral-500">
          {auth.kind === 'onetime' ? '限次邀请码' : '密码授权'} · 单文件 ≤ {fmtSize(auth.maxBytes)} · 保留 {fmtDuration(auth.ttlMs)}
        </span>
      </div>

      {upload.state === 'done' ? (
        <DoneCard url={upload.url} expiresAt={upload.expiresAt} onReset={reset} />
      ) : (
        <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <Dropzone
            file={file}
            onFile={handleFile}
            disabled={upload.state === 'encrypting' || upload.state === 'uploading'}
            inputRef={inputRef}
          />

          {upload.state === 'encrypting' && (
            <div className="text-sm text-neutral-500">浏览器加密中…</div>
          )}
          {upload.state === 'uploading' && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-neutral-500">
                <span>上传中</span>
                <span>{Math.round(upload.progress * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
                <div
                  className="h-full bg-blue-600 transition-all"
                  style={{ width: `${upload.progress * 100}%` }}
                />
              </div>
            </div>
          )}
          {upload.state === 'error' && (
            <div className="flex items-center gap-1 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" /> {upload.message}
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-500">
              文件会在浏览器加密后上传，服务器看不到内容。
              <br />
              生成的链接仅能下载一次。
            </p>
            <button
              onClick={submit}
              disabled={!file || upload.state === 'encrypting' || upload.state === 'uploading'}
              className="flex items-center gap-1 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              加密并上传
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Dropzone({
  file,
  onFile,
  disabled,
  inputRef,
}: {
  file: File | null;
  onFile: (f: File | undefined) => void;
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [hover, setHover] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        if (disabled) return;
        onFile(e.dataTransfer.files?.[0]);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed px-6 py-10 text-sm transition-colors ${
        hover
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
          : 'border-neutral-300 hover:border-neutral-400 dark:border-neutral-700'
      } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
        disabled={disabled}
      />
      <Upload className="mb-2 h-7 w-7 text-neutral-400" />
      {file ? (
        <div className="text-center">
          <div className="font-medium">{file.name}</div>
          <div className="mt-1 text-xs text-neutral-500">{fmtSize(file.size)} · 点击重新选择</div>
        </div>
      ) : (
        <div className="text-center text-neutral-500">
          点击选择文件，或拖拽到此处
        </div>
      )}
    </label>
  );
}

function DoneCard({ url, expiresAt, onReset }: { url: string; expiresAt: number; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-5 dark:border-green-900 dark:bg-green-950/30">
      <div className="flex items-center gap-2 font-semibold text-green-700 dark:text-green-300">
        <Check className="h-5 w-5" /> 上传完成
      </div>
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        把下面的一次性下载链接发给对方。链接被打开下载后会立刻失效；
        未下载时将在 {new Date(expiresAt).toLocaleString()} 自动删除。
      </p>
      <div className="flex items-stretch gap-2">
        <div className="flex flex-1 items-center gap-2 overflow-hidden rounded border border-neutral-300 bg-white px-3 py-2 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950">
          <LinkIcon className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          <span className="truncate">{url}</span>
        </div>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
        >
          {copied ? <Check className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <div className="flex items-center justify-end">
        <button
          onClick={onReset}
          className="flex items-center gap-1 rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <RotateCcw className="h-3.5 w-3.5" /> 再传一个
        </button>
      </div>
    </div>
  );
}
