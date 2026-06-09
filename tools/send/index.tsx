'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileLock2, Upload, KeyRound, Link as LinkIcon, Check, AlertCircle, RotateCcw, X, FileArchive } from 'lucide-react';
import {
  b64urlEncode,
  encryptFileToBlob,
  encryptMetadata,
  generateMasterKey,
  FILE_FORMAT_VERSION,
  FILE_CHUNK_SIZE,
} from './crypto';
import { buildZip, predictZipSize } from './zip';

type AuthState =
  | { state: 'loading' }
  | { state: 'unauthed' }
  | { state: 'authed'; kind: 'permanent' | 'onetime'; expiresAt: number; maxBytes: number; ttlMs: number };

type UploadState =
  | { state: 'idle' }
  | { state: 'zipping'; progress: number }
  | { state: 'encrypting'; progress: number }
  | { state: 'uploading'; progress: number }
  | { state: 'done'; url: string; expiresAt: number }
  | { state: 'error'; message: string };

/** 选中文件的去重 key（同名同大小同修改时间视为同一个，避免重复添加） */
function fileKey(f: File): string {
  return `${f.name}|${f.size}|${f.lastModified}`;
}

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
  const [files, setFiles] = useState<File[]>([]);
  const [upload, setUpload] = useState<UploadState>({ state: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  // 进行中的上传任务（打包/加密 signal + 上传 xhr），用于「取消上传」
  const taskRef = useRef<{ controller: AbortController; xhr: XMLHttpRequest | null } | null>(null);

  // 多文件会打包成 zip，校验/显示按预测后的 zip 大小；单文件按其本身大小
  const payloadSize = files.length === 0 ? 0 : files.length === 1 ? files[0].size : predictZipSize(files);
  const overLimit = payloadSize > auth.maxBytes;
  const busy = upload.state === 'zipping' || upload.state === 'encrypting' || upload.state === 'uploading';

  const cancel = () => {
    const t = taskRef.current;
    if (!t) return;
    taskRef.current = null;
    t.controller.abort(); // 中断打包/加密循环
    t.xhr?.abort(); // 中断上传请求
    setUpload({ state: 'idle' }); // 保留已选文件，可直接重传
  };

  const addFiles = (incoming: FileList | File[] | null | undefined) => {
    if (!incoming) return;
    const list = Array.from(incoming);
    if (list.length === 0) return;
    setFiles((prev) => {
      const seen = new Set(prev.map(fileKey));
      const merged = [...prev];
      for (const f of list) {
        if (!seen.has(fileKey(f))) {
          seen.add(fileKey(f));
          merged.push(f);
        }
      }
      return merged;
    });
    setUpload({ state: 'idle' });
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (key: string) => {
    setFiles((prev) => prev.filter((f) => fileKey(f) !== key));
    setUpload({ state: 'idle' });
  };

  const reset = () => {
    setFiles([]);
    setUpload({ state: 'idle' });
    if (inputRef.current) inputRef.current.value = '';
  };

  const submit = async () => {
    if (files.length === 0) return;
    if (overLimit) {
      setUpload({ state: 'error', message: `${files.length > 1 ? '打包后' : '文件'}超过上限 ${fmtSize(auth.maxBytes)}` });
      return;
    }
    const controller = new AbortController();
    const task = { controller, xhr: null as XMLHttpRequest | null };
    taskRef.current = task;
    try {
      // 多文件先打包成 zip（惰性 Blob，不进堆），单文件直接用本体
      let payload: File;
      if (files.length === 1) {
        payload = files[0];
      } else {
        setUpload({ state: 'zipping', progress: 0 });
        payload = await buildZip(files, (p) => setUpload({ state: 'zipping', progress: p }), controller.signal);
        if (controller.signal.aborted) return;
      }

      setUpload({ state: 'encrypting', progress: 0 });
      const master = await generateMasterKey();
      const meta = await encryptMetadata(
        {
          name: payload.name,
          size: payload.size,
          type: payload.type || '',
          v: FILE_FORMAT_VERSION,
          chunkSize: FILE_CHUNK_SIZE,
        },
        master,
      );
      // 分块流式加密 → Blob（堆峰值 ~1x，可逐块报进度，不阻塞主线程）
      const ct = await encryptFileToBlob(
        payload,
        master,
        (p) => setUpload({ state: 'encrypting', progress: p }),
        controller.signal,
      );
      if (controller.signal.aborted) return; // 加密刚结束就被取消

      setUpload({ state: 'uploading', progress: 0 });
      const xhr = new XMLHttpRequest();
      task.xhr = xhr;
      xhr.open('PUT', '/api/send/upload');
      xhr.setRequestHeader('x-send-metadata', meta);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUpload({ state: 'uploading', progress: e.loaded / e.total });
        }
      };
      xhr.onabort = () => {}; // 取消由 cancel() 统一处理，这里不改状态
      xhr.onload = () => {
        taskRef.current = null;
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
      xhr.onerror = () => {
        taskRef.current = null;
        setUpload({ state: 'error', message: '网络错误' });
      };
      xhr.send(ct);
    } catch (e) {
      if (controller.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
        return; // 用户主动取消，cancel() 已把状态置回 idle
      }
      console.error(e);
      taskRef.current = null;
      setUpload({ state: 'error', message: e instanceof Error ? e.message : '加密失败' });
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center gap-2">
        <FileLock2 className="h-5 w-5 text-blue-600" />
        <h1 className="text-lg font-semibold">匿名文件分享</h1>
        <span className="ml-auto text-xs text-neutral-500">
          {auth.kind === 'onetime' ? '限次邀请码' : '密码授权'} · 单次 ≤ {fmtSize(auth.maxBytes)} · 保留 {fmtDuration(auth.ttlMs)}
        </span>
      </div>

      {upload.state === 'done' ? (
        <DoneCard url={upload.url} expiresAt={upload.expiresAt} onReset={reset} />
      ) : (
        <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <Dropzone files={files} onAdd={addFiles} onRemove={removeFile} disabled={busy} inputRef={inputRef} />

          {files.length > 0 && (
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>
                已选 {files.length} 个文件 · 共 {fmtSize(payloadSize)}
                {files.length > 1 && <span className="text-neutral-400">（打包为 zip 后大小）</span>}
              </span>
              {overLimit ? (
                <span className="text-red-600">超过上限 {fmtSize(auth.maxBytes)}</span>
              ) : (
                !busy && (
                  <button onClick={reset} className="hover:text-neutral-700 dark:hover:text-neutral-300">
                    清空
                  </button>
                )
              )}
            </div>
          )}

          {upload.state === 'zipping' && <Progress label="打包中" progress={upload.progress} />}
          {upload.state === 'encrypting' && <Progress label="浏览器加密中" progress={upload.progress} />}
          {upload.state === 'uploading' && <Progress label="上传中" progress={upload.progress} />}
          {upload.state === 'error' && (
            <div className="flex items-center gap-1 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" /> {upload.message}
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-500">
              文件会在浏览器加密后上传，服务器看不到内容。
              <br />
              多个文件会自动打包成 zip；生成的链接仅能下载一次。
            </p>
            <div className="flex items-center gap-2">
              {busy && (
                <button
                  onClick={cancel}
                  className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  <X className="h-4 w-4" />
                  取消
                </button>
              )}
              <button
                onClick={submit}
                disabled={files.length === 0 || overLimit || busy}
                className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                加密上传
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Dropzone({
  files,
  onAdd,
  onRemove,
  disabled,
  inputRef,
}: {
  files: File[];
  onAdd: (f: FileList | File[]) => void;
  onRemove: (key: string) => void;
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div className="space-y-3">
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
          onAdd(e.dataTransfer.files);
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
          multiple
          className="hidden"
          onChange={(e) => e.target.files && onAdd(e.target.files)}
          disabled={disabled}
        />
        <Upload className="mb-2 h-7 w-7 text-neutral-400" />
        <div className="text-center text-neutral-500">
          {files.length > 0 ? '继续添加文件，或拖拽到此处' : '点击选择文件，或拖拽到此处'}
          <div className="mt-0.5 text-xs text-neutral-400">支持多选；多个文件会打包成 zip</div>
        </div>
      </label>

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li
              key={fileKey(f)}
              className="flex items-center gap-2 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
            >
              <FileArchive className="h-4 w-4 shrink-0 text-neutral-400" />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-neutral-500">{fmtSize(f.size)}</span>
              {!disabled && (
                <button
                  onClick={() => onRemove(fileKey(f))}
                  className="shrink-0 rounded p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                  aria-label="移除"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Progress({ label, progress }: { label: string; progress: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-neutral-500">
        <span>{label}</span>
        <span>{Math.round(progress * 100)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
        <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

function DoneCard({ url, expiresAt, onReset }: { url: string; expiresAt: number; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then((m) => m.toDataURL(url, { margin: 1, width: 220, errorCorrectionLevel: 'M' }))
      .then((d) => {
        if (alive) setQr(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);

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
        把下面的一次性下载链接发给对方，或让对方扫码下载。链接被打开下载后会立刻失效；
        未下载时将在 {new Date(expiresAt).toLocaleString()} 自动删除。
      </p>
      <div className="flex flex-col items-stretch gap-3 sm:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-stretch gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded border border-neutral-300 bg-white px-3 py-2 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950">
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
          <p className="text-xs text-neutral-500">扫描右侧二维码可在手机上打开同一下载链接。</p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <div className="flex h-[180px] w-[180px] items-center justify-center rounded border border-neutral-300 bg-white p-2 dark:border-neutral-700">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="下载链接二维码" className="h-full w-full" />
            ) : (
              <span className="text-xs text-neutral-400">二维码生成中…</span>
            )}
          </div>
          <span className="text-xs text-neutral-500">扫码下载</span>
        </div>
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
