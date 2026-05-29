import { NextResponse } from 'next/server';
import {
  getMailbox,
  listMessagesForAddress,
  touchMailbox,
  maybeCleanup,
} from '@/lib/tempmail';
import { isValidSlug } from '@/lib/utils/slug';
import { consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { RATE_LIMITS, TEMPMAIL_LIMITS } from '@/lib/limits';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/** GET：列出当前 slug 绑定地址下的所有邮件（不含 html_body 全文）。 */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 });
  }

  const ip = getClientIp(req);
  const rl = consumeRateLimit(
    `tempmail:list:${ip}`,
    RATE_LIMITS.TEMPMAIL_LIST.max,
    RATE_LIMITS.TEMPMAIL_LIST.windowMs,
  );
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  const mailbox = getMailbox(slug);
  if (!mailbox) {
    return NextResponse.json({ address: null, messages: [] });
  }
  touchMailbox(slug);
  maybeCleanup();

  const rows = listMessagesForAddress(mailbox.address, TEMPMAIL_LIMITS.MAX_MESSAGES_PER_LIST);
  return NextResponse.json({
    address: mailbox.address,
    messages: rows.map((m) => ({
      id: m.id,
      from_addr: m.from_addr,
      from_name: m.from_name,
      subject: m.subject,
      verification_code: m.verification_code,
      received_at: m.received_at,
      size_bytes: m.size_bytes,
      preview: m.text_body?.slice(0, 200) ?? null,
    })),
  });
}
