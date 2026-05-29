import { NextResponse } from 'next/server';
import { translate } from '@/lib/translate';
import { consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/limits';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = consumeRateLimit(
    `translate:${ip}`,
    RATE_LIMITS.TRANSLATE.max,
    RATE_LIMITS.TRANSLATE.windowMs,
  );
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  const body = (await req.json().catch(() => null)) as
    | { text?: string; from?: string; to?: string }
    | null;
  if (!body || typeof body.text !== 'string') {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });
  }

  const result = await translate({
    text: body.text,
    from: body.from || 'auto',
    to: body.to || 'en',
  });
  return NextResponse.json(result);
}
