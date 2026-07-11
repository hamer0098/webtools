'use client';

import { useState } from 'react';
import { Trash2, Plus, RefreshCw, Power } from 'lucide-react';
import type { TgBotDto } from '@/lib/tgbot';

function fmtTime(ms: number | null) {
  if (!ms) return '-';
  const d = new Date(ms);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function TgbotAdminClient({ initialBots }: { initialBots: TgBotDto[] }) {
  const [bots, setBots] = useState(initialBots);
  const [showForm, setShowForm] = useState(initialBots.length === 0);
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [allowedIds, setAllowedIds] = useState('');
  const [ttlDays, setTtlDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patchBot = (id: number, next: TgBotDto) =>
    setBots((prev) => prev.map((b) => (b.id === id ? next : b)));

  const createBot = async () => {
    setError(null);
    setBusy(true);
    try {
      const fileTtlMs = ttlDays.trim() ? Math.floor(Number(ttlDays) * 24 * 60 * 60_000) : null;
      const r = await fetch('/api/admin/tgbot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, token, allowedUserIds: allowedIds, fileTtlMs }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || '创建失败');
        return;
      }
      setBots((prev) => [data.bot, ...prev]);
      setName('');
      setToken('');
      setAllowedIds('');
      setTtlDays('');
      setShowForm(false);
      if (data.webhookError) {
        alert(`bot 已保存，但 webhook 注册失败：${data.webhookError}\n\n本地开发环境（无公网 HTTPS）会失败，部署后在列表里点「重设 webhook」即可。`);
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (bot: TgBotDto) => {
    const r = await fetch(`/api/admin/tgbot/${bot.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !bot.enabled }),
    });
    if (r.ok) patchBot(bot.id, (await r.json()).bot);
  };

  const saveAllowedIds = async (bot: TgBotDto) => {
    const input = prompt(
      '白名单：允许使用该 bot 的 Telegram 用户 ID（逗号分隔）。\n不知道自己的 ID？给 bot 随便发条消息，它会回复你的 ID。',
      bot.allowedUserIds,
    );
    if (input == null) return;
    const r = await fetch(`/api/admin/tgbot/${bot.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ allowedUserIds: input }),
    });
    if (r.ok) patchBot(bot.id, (await r.json()).bot);
  };

  const resetWebhook = async (bot: TgBotDto) => {
    const r = await fetch(`/api/admin/tgbot/${bot.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'setWebhook' }),
    });
    const data = await r.json();
    if (r.ok) {
      patchBot(bot.id, data.bot);
      alert('webhook 已重新注册');
    } else {
      alert(`失败：${data.error}`);
    }
  };

  const removeBot = async (bot: TgBotDto) => {
    if (!confirm(`删除 bot「${bot.name}」？\n会同时向 Telegram 注销 webhook，已上传的文件不受影响。`)) return;
    const r = await fetch(`/api/admin/tgbot/${bot.id}`, { method: 'DELETE' });
    if (r.ok) setBots((prev) => prev.filter((b) => b.id !== bot.id));
  };

  return (
    <div>
      <div className="mb-3">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <Plus className="h-3.5 w-3.5" />
          绑定新机器人
        </button>
      </div>

      {showForm && (
        <div className="mb-4 space-y-3 rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-500">名称（备注用）</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：我的传文件 bot"
                className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-500">Bot Token（找 @BotFather 创建）</span>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:AAxxxxxxxx..."
                className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 font-mono text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-500">
                白名单用户 ID（逗号分隔；留空=谁都不能用）
              </span>
              <input
                value={allowedIds}
                onChange={(e) => setAllowedIds(e.target.value)}
                placeholder="如：123456789（不知道就留空，给 bot 发消息它会告诉你）"
                className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 font-mono text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-500">文件保留天数（留空=默认 3 天）</span>
              <input
                value={ttlDays}
                onChange={(e) => setTtlDays(e.target.value)}
                type="number"
                min={1}
                max={90}
                placeholder="3"
                className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-base md:text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button
            onClick={createBot}
            disabled={busy || !name.trim() || !token.trim()}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? '验证 token 中…' : '绑定并注册 webhook'}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-100 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-800">
            <tr>
              <th className="px-3 py-2">名称</th>
              <th className="px-3 py-2">Bot</th>
              <th className="px-3 py-2">白名单</th>
              <th className="px-3 py-2">Webhook</th>
              <th className="px-3 py-2">最近使用</th>
              <th className="px-3 py-2 text-center">状态</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {bots.map((bot) => (
              <tr key={bot.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="px-3 py-2">{bot.name}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {bot.username ? (
                    <a
                      href={`https://t.me/${bot.username}`}
                      target="_blank"
                      className="text-blue-600 hover:underline"
                    >
                      @{bot.username}
                    </a>
                  ) : (
                    bot.tokenMasked
                  )}
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => saveAllowedIds(bot)}
                    className="font-mono text-xs hover:underline"
                    title="点击编辑白名单"
                  >
                    {bot.allowedUserIds || <span className="text-amber-600">未设置（拒绝所有）</span>}
                  </button>
                </td>
                <td className="px-3 py-2 text-xs">
                  {bot.webhookSetAt ? (
                    <span className="text-green-600">✓ {fmtTime(bot.webhookSetAt)}</span>
                  ) : (
                    <span className="text-amber-600">未注册</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-500">{fmtTime(bot.lastUsedAt)}</td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={
                      bot.enabled
                        ? 'rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-950 dark:text-green-300'
                        : 'rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800'
                    }
                  >
                    {bot.enabled ? '启用' : '停用'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => toggleEnabled(bot)}
                    className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    title={bot.enabled ? '停用' : '启用'}
                  >
                    <Power className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => resetWebhook(bot)}
                    className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    title="重设 webhook（换域名/首次部署后用）"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeBot(bot)}
                    className="rounded p-1 text-neutral-500 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950"
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {bots.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-neutral-500">
                  还没绑定机器人。去 Telegram 找 @BotFather 发 /newbot 拿到 token，回来点上面「绑定新机器人」。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
