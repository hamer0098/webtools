import { NextResponse } from 'next/server';
import {
  getMailbox,
  createMailbox,
  updateMailboxAddress,
  touchMailbox,
  composeAddress,
  isValidLocalPart,
  newDefaultLocalPart,
  getTempmailDomain,
  maybeCleanup,
} from '@/lib/tempmail';
import { isValidSlug } from '@/lib/utils/slug';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';
import { consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/limits';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/** GET：取邮箱信息；若不存在则 lazy create（随机 local-part）。 */
export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 });
  }

  const domain = getTempmailDomain();
  if (!domain) {
    return NextResponse.json(
      { error: 'TEMPMAIL_DOMAIN 未配置', notConfigured: true },
      { status: 503 },
    );
  }

  let mailbox = getMailbox(slug);
  if (!mailbox) {
    mailbox = createMailbox(slug, composeAddress(newDefaultLocalPart(), domain));
  } else {
    touchMailbox(slug);
  }
  maybeCleanup();
  return NextResponse.json({
    slug: mailbox.slug,
    address: mailbox.address,
    expires_at: mailbox.expires_at,
    domain,
  });
}

/** PATCH：改邮箱前缀。不存在则顺带创建。 */
export async function PATCH(req: Request, { params }: Params) {
  const { slug } = await params;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 });
  }

  const ip = getClientIp(req);
  const rl = consumeRateLimit(
    `tempmail:create:${ip}`,
    RATE_LIMITS.TEMPMAIL_CREATE.max,
    RATE_LIMITS.TEMPMAIL_CREATE.windowMs,
  );
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  const domain = getTempmailDomain();
  if (!domain) {
    return NextResponse.json({ error: 'TEMPMAIL_DOMAIN 未配置' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { localPart?: string } | null;
  if (!body || typeof body.localPart !== 'string') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const local = body.localPart.trim().toLowerCase();
  if (!isValidLocalPart(local)) {
    return NextResponse.json(
      { error: '邮箱前缀只支持字母/数字/._-，1-64 位，且必须以字母数字开头' },
      { status: 400 },
    );
  }

  const address = composeAddress(local, domain);

  let mailbox = getMailbox(slug);
  if (!mailbox) {
    mailbox = createMailbox(slug, address);
    logEvent(AUDIT_EVENTS.TEMPMAIL_CREATE, req, { slug, address });
  } else {
    mailbox = updateMailboxAddress(slug, address)!;
    logEvent(AUDIT_EVENTS.TEMPMAIL_UPDATE, req, { slug, address });
  }

  return NextResponse.json({
    slug: mailbox.slug,
    address: mailbox.address,
    expires_at: mailbox.expires_at,
    domain,
  });
}
