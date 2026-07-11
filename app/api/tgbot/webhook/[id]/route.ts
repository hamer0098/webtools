/**
 * Telegram webhook 入口（每个 bot 一个 URL：/api/tgbot/webhook/{botId}）。
 *
 * 鉴权：Telegram 会带上 setWebhook 时注册的 secret_token
 * （header X-Telegram-Bot-Api-Secret-Token），必须与该 bot 的 webhook_secret 一致。
 *
 * 除鉴权失败外一律回 200 —— Telegram 对非 2xx 会持续重投同一条 update，
 * 处理失败的反馈通过给用户回消息完成，不靠 HTTP 状态码。
 */

import { NextResponse } from 'next/server';
import { getBot, getBaseUrl, handleTgUpdate, type TgUpdate } from '@/lib/tgbot';
import { maybeCleanup } from '@/lib/send';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';
import { consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/limits';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const ip = getClientIp(req);
  const rl = consumeRateLimit(
    `tgbot:webhook:${ip}`,
    RATE_LIMITS.TGBOT_WEBHOOK.max,
    RATE_LIMITS.TGBOT_WEBHOOK.windowMs,
  );
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  const { id } = await params;
  const botId = Number(id);
  const bot = Number.isInteger(botId) ? getBot(botId) : undefined;
  if (!bot || !bot.enabled) {
    return NextResponse.json({ error: 'unknown bot' }, { status: 404 });
  }
  if (req.headers.get('x-telegram-bot-api-secret-token') !== bot.webhook_secret) {
    logEvent(AUDIT_EVENTS.TGBOT_REJECT, req, { botId, reason: 'bad_secret' });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  if (!update) return NextResponse.json({ ok: true });

  const result = await handleTgUpdate(bot, update, getBaseUrl(req));
  if (result.action === 'uploaded') {
    logEvent(AUDIT_EVENTS.TGBOT_UPLOAD, req, {
      botId,
      fileId: result.id,
      size: result.size,
      name: result.name,
    });
  } else if (result.action === 'reject_user') {
    logEvent(AUDIT_EVENTS.TGBOT_REJECT, req, { botId, reason: 'user_not_allowed', fromId: result.fromId });
  } else if (result.action === 'archived') {
    logEvent(AUDIT_EVENTS.ARCHIVE_CREATE, req, {
      botId,
      itemId: result.itemId,
      type: result.itemType,
      title: result.title,
    });
  }

  maybeCleanup();
  return NextResponse.json({ ok: true });
}
