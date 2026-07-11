import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';
import {
  listBots,
  createBot,
  serializeBot,
  tgGetMe,
  tgSetWebhook,
  markWebhookSet,
  getBaseUrl,
  type TgBotRow,
} from '@/lib/tgbot';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ bots: listBots().map(serializeBot) });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as null | {
    name?: string;
    token?: string;
    /** 逗号分隔的 TG 用户 ID */
    allowedUserIds?: string;
    /** 文件保留时长（毫秒）；null/undefined → 全局默认 */
    fileTtlMs?: number | null;
    /** 'send'（默认）= 转发文件→匿名文件；'archive' = 收藏箱入口 */
    purpose?: string;
  };
  const name = body?.name?.trim();
  const token = body?.token?.trim();
  if (!name || !token) {
    return NextResponse.json({ error: '名称和 token 必填' }, { status: 400 });
  }
  if (!/^\d+:[\w-]{20,}$/.test(token)) {
    return NextResponse.json({ error: 'token 格式不对（应形如 123456:ABC-DEF...）' }, { status: 400 });
  }

  const allowedUserIds =
    body?.allowedUserIds
      ?.split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s))
      .join(',') || null;

  let fileTtlMs: number | null = null;
  if (body?.fileTtlMs != null && Number.isFinite(body.fileTtlMs)) {
    const v = Math.floor(body.fileTtlMs);
    if (v < 60_000 || v > 90 * 24 * 60 * 60_000) {
      return NextResponse.json({ error: '文件保留时长需在 1 分钟 ~ 90 天之间' }, { status: 400 });
    }
    fileTtlMs = v;
  }

  // 先 getMe 验证 token 有效，顺便拿 username 展示
  let username: string | null = null;
  try {
    const me = await tgGetMe(token);
    username = me.username || null;
  } catch {
    return NextResponse.json({ error: 'token 无效（getMe 失败），请检查是否复制完整' }, { status: 400 });
  }

  const purpose = body?.purpose === 'archive' ? ('archive' as const) : ('send' as const);

  let bot: TgBotRow;
  try {
    bot = createBot({ name, token, username, allowed_user_ids: allowedUserIds, file_ttl_ms: fileTtlMs, purpose });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return NextResponse.json({ error: '该 token 已绑定过' }, { status: 409 });
    }
    throw e;
  }

  // 注册 webhook；失败不回滚（本地开发没有公网 HTTPS 时必然失败），页面上可重试
  let webhookError: string | null = null;
  try {
    await tgSetWebhook(bot, getBaseUrl(req));
    markWebhookSet(bot.id, true);
    bot.webhook_set_at = Date.now();
  } catch (e) {
    webhookError = e instanceof Error ? e.message : 'setWebhook 失败';
  }

  logEvent(AUDIT_EVENTS.TGBOT_CREATE, req, { id: bot.id, name, username, purpose, webhookOk: !webhookError });
  return NextResponse.json({ bot: serializeBot(bot), webhookError });
}
