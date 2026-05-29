'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileLock2, Download, AlertCircle, ShieldCheck } from 'lucide-react';
import { b64urlDecode, decryptMetadata, decryptFile, type FileMetadata } from '@/tools/send/crypto';

type State =
  | { state: 'loading' }
  | { state: 'no-key' }
  | { state: 'ready'; meta: FileMetadata; size: number; expiresAt: number; key: Uint8Array }
  | { state: 'downloading'; progress: number; meta: FileMetadata; key: Uint8Array; size: number }
  | { state: 'decrypting'; meta: FileMetadata }
  | { state: 'done'; meta: FileMetadata }
  | { state: 'error'; message: string };

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export default function DownloadClient({ id }: { id: string }) {
  const [state, setState] = useState<State>({ state: 'loading' });

  useEffect(() => {
    const frag = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    if (!frag) {
      setState({ state: 'no-key' });
      return;
    }
    let key: Uint8Array;
    try {
      key = b64urlDecode(frag);
    } catch {
      setState({ state: 'error', message: '密钥格式不正确' });
      return;
    }

    (async () => {
      try {
        const r = await fetch(`/api/send/${id}/meta`, { cache: 'no-store' });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setState({ state: 'error', message: d.error || `加载失败 (${r.status})` });
          return;
        }
        const data = (await r.json()) as {
          encryptedMetadata: string;
          size: number;
          expiresAt: number;
        };
        const meta = await decryptMetadata(data.encryptedMetadata, key);
        setState({ state: 'ready', meta, size: data.size, expiresAt: data.expiresAt, key });
      } catch (e) {
        setState({
          state: 'error',
          message: e instanceof Error ? e.message : '解密失败 (密钥与文件不匹配？)',
        });
      }
    })();
  }, [id]);

  const download = useCallback(async (meta: FileMetadata, key: Uint8Array, size: number) => {
    setState({ state: 'downloading', progress: 0, meta, key, size });
    try {
      const r = await fetch(`/api/send/${id}/blob`);
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        setState({ state: 'error', message: d.error || `下载失败 (${r.status})` });
        return;
      }

      const reader = r.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        setState({ state: 'downloading', progress: received / size, meta, key, size });
      }

      setState({ state: 'decrypting', meta });
      const cipher = new Uint8Array(received);
      let off = 0;
      for (const c of chunks) {
        cipher.set(c, off);
        off += c.length;
      }
      const plain = await decryptFile(cipher, key);
      const blob = new Blob([plain], { type: meta.type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = meta.name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setState({ state: 'done', meta });
    } catch (e) {
      setState({
        state: 'error',
        message: e instanceof Error ? e.message : '下载/解密失败',
      });
    }
  }, [id]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-lg px-4 py-12">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-4 flex items-center gap-2">
            <FileLock2 className="h-5 w-5 text-blue-600" />
            <h1 className="text-lg font-semibold">匿名文件</h1>
            <span className="ml-auto inline-flex items-center gap-1 rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-950 dark:text-green-300">
              <ShieldCheck className="h-3 w-3" /> 端到端加密
            </span>
          </div>

          {state.state === 'loading' && <Info text="正在读取元数据…" />}
          {state.state === 'no-key' && (
            <Err message="链接缺少密钥（fragment）。请使用完整链接打开。" />
          )}
          {state.state === 'error' && <Err message={state.message} />}

          {state.state === 'ready' && (
            <div className="space-y-4">
              <FileInfo name={state.meta.name} size={state.meta.size} />
              <p className="text-sm text-neutral-500">
                链接为一次性，下载后立即失效。
                {state.expiresAt > 0 && (
                  <>
                    {' '}
                    未下载将在 {new Date(state.expiresAt).toLocaleString()} 自动删除。
                  </>
                )}
              </p>
              <button
                onClick={() => download(state.meta, state.key, state.size)}
                className="flex w-full items-center justify-center gap-2 rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Download className="h-4 w-4" /> 下载并解密
              </button>
            </div>
          )}

          {state.state === 'downloading' && (
            <div className="space-y-3">
              <FileInfo name={state.meta.name} size={state.meta.size} />
              <div>
                <div className="mb-1 flex justify-between text-xs text-neutral-500">
                  <span>下载中</span>
                  <span>{Math.round(state.progress * 100)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${state.progress * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {state.state === 'decrypting' && (
            <div className="space-y-3">
              <FileInfo name={state.meta.name} size={state.meta.size} />
              <Info text="解密中…" />
            </div>
          )}

          {state.state === 'done' && (
            <div className="space-y-2 text-center">
              <div className="text-green-600">下载完成</div>
              <div className="text-sm text-neutral-500">{state.meta.name}</div>
              <p className="mt-3 text-xs text-neutral-500">该链接已失效。</p>
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-neutral-500">
          解密在你的浏览器本地完成，服务器无法读取文件内容。
        </p>
      </div>
    </div>
  );
}

function FileInfo({ name, size }: { name: string; size: number }) {
  return (
    <div className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="truncate font-medium">{name}</div>
      <div className="text-xs text-neutral-500">{fmtSize(size)}</div>
    </div>
  );
}
function Info({ text }: { text: string }) {
  return <div className="py-6 text-center text-sm text-neutral-500">{text}</div>;
}
function Err({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{message}</div>
    </div>
  );
}
