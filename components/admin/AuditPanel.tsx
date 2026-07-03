'use client';

import { useEffect, useState } from 'react';
import { Trash2, RefreshCw } from 'lucide-react';

type Log = {
  id: number;
  event: string;
  detail: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: number;
};

const EVENT_OPTIONS = [
  { value: '', label: '全部事件' },
  { value: 'auth.login.success', label: '登录成功' },
  { value: 'auth.login.fail', label: '登录失败' },
  { value: 'auth.2fa.success', label: '2FA 成功' },
  { value: 'auth.2fa.fail', label: '2FA 失败' },
  { value: 'auth.logout', label: '登出' },
  { value: 'auth.password.changed', label: '修改密码' },
  { value: 'auth.2fa.enabled', label: '启用 2FA' },
  { value: 'auth.2fa.disabled', label: '禁用 2FA' },
  { value: 'tool.update', label: '工具变更' },
  { value: 'tool.delete', label: '工具删除' },
  { value: 'note.delete', label: '笔记删除' },
  { value: 'note.delete.batch', label: '笔记批量删除' },
  { value: 'note.cleanup', label: '笔记过期清理' },
  { value: 'audit.cleanup', label: '日志清理' },
];

const EVENT_STYLES: Record<string, string> = {
  'auth.login.success': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'auth.2fa.success': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'auth.login.fail': 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  'auth.2fa.fail': 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  'auth.logout': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
const pad = (n: number) => n.toString().padStart(2, '0');

export default function AuditPanel() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [event, setEvent] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const url = event
      ? `/api/admin/audit?event=${encodeURIComponent(event)}&limit=200`
      : '/api/admin/audit?limit=200';
    const r = await fetch(url);
    if (r.ok) {
      const data = await r.json();
      setLogs(data.logs);
      setTotal(data.total);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  const cleanup = async (olderThanDays: number) => {
    if (!confirm(`确定删除 ${olderThanDays} 天之前的日志？`)) return;
    const r = await fetch('/api/admin/audit', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ olderThanDays }),
    });
    if (r.ok) {
      const data = await r.json();
      alert(`已删除 ${data.deleted} 条`);
      load();
    }
  };

  const clearAll = async () => {
    if (!confirm('确定清空所有日志？此操作不可恢复')) return;
    const r = await fetch('/api/admin/audit', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    if (r.ok) load();
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-base md:text-sm dark:border-slate-700 dark:bg-slate-950"
        >
          {EVENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          onClick={load}
          className="flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
        <span className="ml-auto text-sm text-slate-500">共 {total} 条</span>
        <button
          onClick={() => cleanup(30)}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          清理 30 天前
        </button>
        <button
          onClick={() => cleanup(90)}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          清理 90 天前
        </button>
        <button
          onClick={clearAll}
          className="flex items-center gap-1 rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
        >
          <Trash2 className="h-3.5 w-3.5" />
          清空全部
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2">时间</th>
              <th className="px-3 py-2">事件</th>
              <th className="px-3 py-2">详情</th>
              <th className="px-3 py-2">IP</th>
              <th className="px-3 py-2">UA</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-12 text-center text-slate-500">
                  暂无日志
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr
                  key={l.id}
                  className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">
                    {fmtTime(l.created_at)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded px-2 py-0.5 font-mono text-xs ${
                        EVENT_STYLES[l.event] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {l.event}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400" title={l.detail || ''}>
                    {l.detail || '-'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{l.ip || '-'}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-xs text-slate-500" title={l.user_agent || ''}>
                    {l.user_agent || '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
