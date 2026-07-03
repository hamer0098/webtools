'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Power, PowerOff, Copy, Check, RefreshCw, Search } from 'lucide-react';
import Pagination, { ADMIN_PAGE_SIZE } from './Pagination';

type FileStatusFilter = 'all' | 'pending' | 'downloaded' | 'expired';

type SendCode = {
  id: number;
  code: string;
  kind: 'permanent' | 'onetime';
  note: string | null;
  enabled: number;
  max_uses: number | null;
  used_count: number;
  file_ttl_ms: number | null;
  max_file_bytes: number | null;
  used_at: number | null;
  used_by_ip: string | null;
  created_at: number;
};

/** 单文件上限：留空默认 50MB，硬上限 350MB（与后端 SEND_LIMITS 对应） */
const DEFAULT_MAX_FILE_MB = 50;
const MAX_FILE_MB_CAP = 350;

function fmtMaxSize(bytes: number | null): string {
  if (bytes == null) return `默认 ${DEFAULT_MAX_FILE_MB}MB`;
  return `${Math.round(bytes / 1024 / 1024)}MB`;
}

const TTL_UNITS = {
  minute: { label: '分钟', ms: 60_000 },
  hour: { label: '小时', ms: 60 * 60_000 },
  day: { label: '天', ms: 24 * 60 * 60_000 },
} as const;
type TtlUnit = keyof typeof TTL_UNITS;

function fmtTtl(ms: number | null): string {
  if (ms == null) return '默认 3 天';
  if (ms % TTL_UNITS.day.ms === 0) return `${ms / TTL_UNITS.day.ms} 天`;
  if (ms % TTL_UNITS.hour.ms === 0) return `${ms / TTL_UNITS.hour.ms} 小时`;
  if (ms % TTL_UNITS.minute.ms === 0) return `${ms / TTL_UNITS.minute.ms} 分钟`;
  return `${Math.round(ms / TTL_UNITS.minute.ms)} 分钟`;
}

type SendFile = {
  id: string;
  ciphertext_size: number;
  created_at: number;
  expires_at: number;
  downloaded_at: number | null;
  uploader_code_id: number | null;
  uploader_ip: string | null;
};

function fmtTime(ms: number | null) {
  if (!ms) return '-';
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function SendAdminClient({
  initialCodes,
  initialFiles,
}: {
  initialCodes: SendCode[];
  initialFiles: SendFile[];
}) {
  const [codes, setCodes] = useState(initialCodes);
  const [files, setFiles] = useState(initialFiles);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [fileQuery, setFileQuery] = useState('');
  const [fileStatus, setFileStatus] = useState<FileStatusFilter>('all');
  const [filePage, setFilePage] = useState(1);
  const [newKind, setNewKind] = useState<'permanent' | 'onetime'>('permanent');
  const [newCode, setNewCode] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newMaxUses, setNewMaxUses] = useState(1);
  const [newTtlValue, setNewTtlValue] = useState<string>('');
  const [newTtlUnit, setNewTtlUnit] = useState<TtlUnit>('day');
  const [newMaxFileMb, setNewMaxFileMb] = useState<string>('');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const createCode = async () => {
    const trimmed = newTtlValue.trim();
    let fileTtlMs: number | null = null;
    if (trimmed) {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n <= 0) {
        alert('文件销毁时间需为正数');
        return;
      }
      fileTtlMs = Math.floor(n * TTL_UNITS[newTtlUnit].ms);
    }

    const mbTrimmed = newMaxFileMb.trim();
    let maxFileMb: number | null = null;
    let maxFileBytes: number | null = null;
    if (mbTrimmed) {
      const mb = Math.floor(Number(mbTrimmed));
      if (!Number.isFinite(mb) || mb < 1 || mb > MAX_FILE_MB_CAP) {
        alert(`单文件大小上限需在 1 ~ ${MAX_FILE_MB_CAP}MB 之间`);
        return;
      }
      maxFileMb = mb;
      maxFileBytes = mb * 1024 * 1024;
    }

    const r = await fetch('/api/admin/send/codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: newKind,
        code: newCode || undefined,
        note: newNote || undefined,
        maxUses: newKind === 'onetime' ? newMaxUses : undefined,
        fileTtlMs,
        maxFileMb,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      alert(d.error || '创建失败');
      return;
    }
    setCodes((prev) => [
      {
        id: d.id,
        code: d.code,
        kind: newKind,
        note: newNote || null,
        enabled: 1,
        max_uses: newKind === 'onetime' ? newMaxUses : null,
        used_count: 0,
        file_ttl_ms: fileTtlMs,
        max_file_bytes: maxFileBytes,
        used_at: null,
        used_by_ip: null,
        created_at: Date.now(),
      },
      ...prev,
    ]);
    setNewCode('');
    setNewNote('');
    setNewMaxUses(1);
    setNewTtlValue('');
    setNewTtlUnit('day');
    setNewMaxFileMb('');
    setCreating(false);
  };

  const toggleCode = async (id: number, enabled: number) => {
    const next = enabled ? 0 : 1;
    const r = await fetch(`/api/admin/send/codes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !!next }),
    });
    if (r.ok) setCodes((prev) => prev.map((c) => (c.id === id ? { ...c, enabled: next } : c)));
  };

  const deleteCode = async (id: number) => {
    if (!confirm('删除此 code？')) return;
    const r = await fetch(`/api/admin/send/codes/${id}`, { method: 'DELETE' });
    if (r.ok) setCodes((prev) => prev.filter((c) => c.id !== id));
  };

  const copyCode = async (id: number, code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1200);
  };

  const deleteFile = async (id: string) => {
    if (!confirm('强制删除此文件？')) return;
    const r = await fetch(`/api/admin/send/files/${id}`, { method: 'DELETE' });
    if (r.ok) {
      setFiles((prev) => prev.filter((f) => f.id !== id));
      setSelectedFiles((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  };

  const toggleFile = (id: string) => {
    setSelectedFiles((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  // 筛选 + 分页：状态/搜索变化时回到第 1 页
  useEffect(() => {
    setFilePage(1);
  }, [fileQuery, fileStatus]);

  const filteredFiles = useMemo(() => {
    const q = fileQuery.trim().toLowerCase();
    const now = Date.now();
    return files.filter((f) => {
      if (q && !f.id.toLowerCase().includes(q) && !(f.uploader_ip || '').toLowerCase().includes(q))
        return false;
      const downloaded = !!f.downloaded_at;
      const expired = !downloaded && f.expires_at < now;
      if (fileStatus === 'downloaded' && !downloaded) return false;
      if (fileStatus === 'expired' && !expired) return false;
      if (fileStatus === 'pending' && (downloaded || expired)) return false;
      return true;
    });
  }, [files, fileQuery, fileStatus]);

  const fileTotalPages = Math.max(1, Math.ceil(filteredFiles.length / ADMIN_PAGE_SIZE));
  const fileSafePage = Math.min(filePage, fileTotalPages);
  const filePageRows = useMemo(
    () =>
      filteredFiles.slice(
        (fileSafePage - 1) * ADMIN_PAGE_SIZE,
        fileSafePage * ADMIN_PAGE_SIZE,
      ),
    [filteredFiles, fileSafePage],
  );

  // "全选"语义改为"全选当前页"，避免误删别页
  const pageFileIds = useMemo(() => filePageRows.map((r) => r.id), [filePageRows]);
  const pageFilesSelected = pageFileIds.filter((id) => selectedFiles.has(id)).length;
  const allFilesChecked = filePageRows.length > 0 && pageFilesSelected === filePageRows.length;
  const someFilesChecked = pageFilesSelected > 0 && pageFilesSelected < filePageRows.length;
  const toggleAllFiles = () => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (allFilesChecked) {
        for (const id of pageFileIds) next.delete(id);
      } else {
        for (const id of pageFileIds) next.add(id);
      }
      return next;
    });
  };

  const deleteSelectedFiles = async () => {
    if (selectedFiles.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedFiles.size} 个文件？`)) return;
    const ids = Array.from(selectedFiles);
    const r = await fetch('/api/admin/send/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (r.ok) {
      const set = new Set(ids);
      setFiles((prev) => prev.filter((f) => !set.has(f.id)));
      setSelectedFiles(new Set());
    } else {
      alert('删除失败');
    }
  };

  const cleanup = async () => {
    const r = await fetch('/api/admin/send/files?action=cleanup', { method: 'POST' });
    const d = await r.json();
    if (r.ok) {
      alert(`已清理 ${d.deleted} 条`);
      // 重新拉一次列表
      const lr = await fetch('/api/admin/send/files');
      if (lr.ok) {
        const ld = await lr.json();
        setFiles(ld.files);
      }
    }
  };

  return (
    <div className="space-y-8">
      {/* 邀请码 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">密码 / 邀请码</h2>
          <button
            onClick={() => setCreating((s) => !s)}
            className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> 新建
          </button>
        </div>
        {creating && (
          <div className="mb-3 space-y-2 rounded border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
            <div className="flex items-center gap-3">
              <label className="text-sm">
                <input
                  type="radio"
                  checked={newKind === 'permanent'}
                  onChange={() => setNewKind('permanent')}
                /> 永久密码（长期使用）
              </label>
              <label className="text-sm">
                <input
                  type="radio"
                  checked={newKind === 'onetime'}
                  onChange={() => setNewKind('onetime')}
                /> 限次邀请码（用满次数后作废）
              </label>
            </div>
            <input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="留空自动生成；或自定义 4-64 位字母数字"
              className="w-full rounded border border-neutral-300 bg-white px-3 py-1.5 font-mono text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
            {newKind === 'onetime' && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">允许使用次数</span>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={newMaxUses}
                  onChange={(e) => setNewMaxUses(Math.max(1, Number(e.target.value) || 1))}
                  className="w-24 rounded border border-neutral-300 bg-white px-2 py-1 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
                />
                <span className="text-xs text-neutral-500">次</span>
              </label>
            )}
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-neutral-600 dark:text-neutral-400">文件销毁时间</span>
              <input
                type="number"
                min={1}
                value={newTtlValue}
                onChange={(e) => setNewTtlValue(e.target.value)}
                placeholder="留空默认 3 天"
                className="w-32 rounded border border-neutral-300 bg-white px-2 py-1 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
              <select
                value={newTtlUnit}
                onChange={(e) => setNewTtlUnit(e.target.value as TtlUnit)}
                className="rounded border border-neutral-300 bg-white px-2 py-1 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
              >
                {(Object.keys(TTL_UNITS) as TtlUnit[]).map((u) => (
                  <option key={u} value={u}>
                    {TTL_UNITS[u].label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-neutral-500">未下载时自动清理</span>
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-neutral-600 dark:text-neutral-400">单文件大小上限</span>
              <input
                type="number"
                min={1}
                max={MAX_FILE_MB_CAP}
                value={newMaxFileMb}
                onChange={(e) => setNewMaxFileMb(e.target.value)}
                placeholder={`留空默认 ${DEFAULT_MAX_FILE_MB}MB`}
                className="w-32 rounded border border-neutral-300 bg-white px-2 py-1 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
              <span className="text-xs text-neutral-500">MB（最大 {MAX_FILE_MB_CAP}）</span>
            </label>
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="备注（可选，例如给谁用的）"
              className="w-full rounded border border-neutral-300 bg-white px-3 py-1.5 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCreating(false)}
                className="rounded px-3 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                取消
              </button>
              <button
                onClick={createCode}
                className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
              >
                创建
              </button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-800">
              <tr>
                <th className="px-3 py-2">类型</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">备注</th>
                <th className="px-3 py-2">用量</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">最近使用</th>
                <th className="px-3 py-2">创建</th>
                <th className="px-3 py-2">销毁时间</th>
                <th className="px-3 py-2">单文件上限</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {codes.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-neutral-500">
                    暂无密码或邀请码，新建一个开放给前台使用
                  </td>
                </tr>
              ) : (
                codes.map((c) => {
                  const exhausted = c.kind === 'onetime' && c.used_count >= (c.max_uses ?? 1);
                  return (
                    <tr key={c.id} className="border-t border-neutral-200 dark:border-neutral-800">
                      <td className="px-3 py-2">
                        {c.kind === 'permanent' ? (
                          <span className="inline-flex items-center rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            永久密码
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            限次
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        <button
                          onClick={() => copyCode(c.id, c.code)}
                          className="inline-flex items-center gap-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          title="复制"
                        >
                          <span>{c.code}</span>
                          {copiedId === c.id ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <Copy className="h-3 w-3 text-neutral-400" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-neutral-500">{c.note || '-'}</td>
                      <td className="px-3 py-2 text-xs">
                        {c.kind === 'permanent' ? (
                          <span className="text-neutral-500">{c.used_count} 次（不限）</span>
                        ) : (
                          <span className={exhausted ? 'text-red-500' : 'text-neutral-600 dark:text-neutral-300'}>
                            {c.used_count} / {c.max_uses}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {exhausted ? (
                          <span className="text-xs text-neutral-400">已用尽</span>
                        ) : c.enabled ? (
                          <span className="text-xs text-green-600">启用中</span>
                        ) : (
                          <span className="text-xs text-neutral-400">已禁用</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-500">
                        {c.used_at ? `${fmtTime(c.used_at)} (${c.used_by_ip || '-'})` : '-'}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-500">{fmtTime(c.created_at)}</td>
                      <td className="px-3 py-2 text-xs text-neutral-500">{fmtTtl(c.file_ttl_ms)}</td>
                      <td className="px-3 py-2 text-xs text-neutral-500">{fmtMaxSize(c.max_file_bytes)}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          {!exhausted && (
                            <button
                              onClick={() => toggleCode(c.id, c.enabled)}
                              className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                              title={c.enabled ? '禁用' : '启用'}
                            >
                              {c.enabled ? (
                                <PowerOff className="h-3.5 w-3.5" />
                              ) : (
                                <Power className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => deleteCode(c.id)}
                            className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                            title="删除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 文件列表 */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">已上传文件</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <input
                value={fileQuery}
                onChange={(e) => setFileQuery(e.target.value)}
                placeholder="搜索 ID 或 IP"
                className="w-48 rounded border border-neutral-300 bg-white py-1 pl-7 pr-2 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
            </div>
            <select
              value={fileStatus}
              onChange={(e) => setFileStatus(e.target.value as FileStatusFilter)}
              className="rounded border border-neutral-300 bg-white px-2 py-1 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
            >
              <option value="all">全部状态</option>
              <option value="pending">待下载</option>
              <option value="downloaded">已下载</option>
              <option value="expired">已过期</option>
            </select>
            <button
              onClick={deleteSelectedFiles}
              disabled={selectedFiles.size === 0}
              className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:hover:bg-red-950"
            >
              删除选中（{selectedFiles.size}）
            </button>
            <button
              onClick={cleanup}
              className="flex items-center gap-1 rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <RefreshCw className="h-3.5 w-3.5" /> 立即清理已过期 / 已下载
            </button>
          </div>
        </div>
        <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-800">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allFilesChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someFilesChecked;
                    }}
                    onChange={toggleAllFiles}
                    aria-label="全选本页"
                  />
                </th>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">大小（密文）</th>
                <th className="px-3 py-2">上传时间</th>
                <th className="px-3 py-2">过期</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">来源 IP</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filePageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-neutral-500">
                    {files.length === 0 ? '暂无文件' : '没有匹配的文件'}
                  </td>
                </tr>
              ) : (
                filePageRows.map((f) => {
                  const downloaded = !!f.downloaded_at;
                  const expired = !downloaded && f.expires_at < Date.now();
                  return (
                    <tr key={f.id} className="border-t border-neutral-200 dark:border-neutral-800">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(f.id)}
                          onChange={() => toggleFile(f.id)}
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{f.id}</td>
                      <td className="px-3 py-2">{fmtSize(f.ciphertext_size)}</td>
                      <td className="px-3 py-2 text-xs text-neutral-500">{fmtTime(f.created_at)}</td>
                      <td className="px-3 py-2 text-xs text-neutral-500">{fmtTime(f.expires_at)}</td>
                      <td className="px-3 py-2">
                        {downloaded ? (
                          <span className="text-xs text-neutral-400">已下载</span>
                        ) : expired ? (
                          <span className="text-xs text-red-500">已过期</span>
                        ) : (
                          <span className="text-xs text-green-600">待下载</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-500">{f.uploader_ip || '-'}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => deleteFile(f.id)}
                          className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                          title="强制删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={fileSafePage}
          totalItems={filteredFiles.length}
          pageSize={ADMIN_PAGE_SIZE}
          onChange={setFilePage}
        />
      </section>
    </div>
  );
}
