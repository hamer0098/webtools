import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';
import {
  getBot,
  deleteBot,
  serializeBot,
  tgSetWebhook,
  tgDeleteWebhook,
  markWebhookSet,
  getBaseUrl,
} from '@/lib/tgbot';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const numId = Number(id);
  const bot = Number.isInteger(numId) ? getBot(numId) : undefined;
  if (!bot) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as null | {
    name?: string;
    enabled?: boolean;
    allowedUserIds?: string;
    /** 'setWebhook' → 重新向 Telegram 注册 webhook */
    action?: string;
  };
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  if (body.action === 'setWebhook') {
    try {
      await tgSetWebhook(bot, getBaseUrl(req));
      markWebhookSet(bot.id, true);
      logEvent(AUDIT_EVENTS.TGBOT_UPDATE, req, { id: bot.id, action: 'setWebhook' });
      return NextResponse.json({ bot: serializeBot(getBot(bot.id)!) });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'setWebhook 失败' },
        { status: 502 },
      );
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  if (typeof body.name === 'string' && body.name.trim()) {
    fields.push('name = ?');
    values.push(body.name.trim());
  }
  if (typeof body.enabled === 'boolean') {
    fields.push('enabled = ?');
    values.push(body.enabled ? 1 : 0);
  }
  if (typeof body.allowedUserIds === 'string') {
    const cleaned = body.allowedUserIds
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s))
      .join(',');
    fields.push('allowed_user_ids = ?');
    values.push(cleaned || null);
  }
  if (fields.length > 0) {
    values.push(numId);
    getDb().prepare(`UPDATE tg_bots SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    logEvent(AUDIT_EVENTS.TGBOT_UPDATE, req, { id: numId, fields: fields.map((f) => f.split(' ')[0]) });
  }
  return NextResponse.json({ bot: serializeBot(getBot(numId)!) });
}

export async function DELETE(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const numId = Number(id);
  const bot = Number.isInteger(numId) ? getBot(numId) : undefined;
  if (!bot) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // 尽量把 TG 侧 webhook 摘掉；失败（token 已撤销等）不阻塞删除
  await tgDeleteWebhook(bot.token).catch(() => {});
  deleteBot(numId);
  logEvent(AUDIT_EVENTS.TGBOT_DELETE, req, { id: numId, name: bot.name });
  return NextResponse.json({ ok: true });
}
