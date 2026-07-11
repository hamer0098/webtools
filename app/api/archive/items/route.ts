import { NextResponse } from 'next/server';
import { hasArchiveAccess } from '@/lib/archive-auth';
import { listItems, serializeItem } from '@/lib/archive';
import { RATE_LIMITS } from '@/lib/limits';
import { consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const ip = getClientIp(req);
  const rl = consumeRateLimit(
    `archive:list:${ip}`,
    RATE_LIMITS.ARCHIVE_LIST.max,
    RATE_LIMITS.ARCHIVE_LIST.windowMs,
  );
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  if (!(await hasArchiveAccess())) {
    return NextResponse.json({ error: 'locked' }, { status: 401 });
  }

  const url = new URL(req.url);
  const { items, total } = listItems({
    q: url.searchParams.get('q') || undefined,
    type: url.searchParams.get('type') || undefined,
    offset: Number(url.searchParams.get('offset')) || 0,
  });
  return NextResponse.json({ items: items.map((i) => serializeItem(i)), total });
}
