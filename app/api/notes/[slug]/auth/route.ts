import { NextResponse } from 'next/server';
import { getDb, type NoteRow } from '@/lib/db';
import { isValidSlug } from '@/lib/utils/slug';
import { verifyPassword } from '@/lib/utils/password';
import { getSession } from '@/lib/session';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';
import { consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/limits';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 });
  }

  const ip = getClientIp(req);
  const rl = consumeRateLimit(
    `noteauth:${ip}:${slug}`,
    RATE_LIMITS.NOTE_AUTH.max,
    RATE_LIMITS.NOTE_AUTH.windowMs,
  );
  if (!rl.ok) {
    logEvent(AUDIT_EVENTS.RATE_LIMITED, req, {
      endpoint: 'note.auth',
      slug,
      retryAfter: rl.retryAfterSec,
    });
    return rateLimitResponse(rl.retryAfterSec);
  }

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (typeof password !== 'string') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const row = getDb()
    .prepare('SELECT password_hash FROM notes WHERE slug = ?')
    .get(slug) as Pick<NoteRow, 'password_hash'> | undefined;
  if (!row || !row.password_hash) {
    return NextResponse.json({ error: 'no password set' }, { status: 400 });
  }

  const ok = await verifyPassword(row.password_hash, password);
  if (!ok) {
    return NextResponse.json({ error: 'wrong password' }, { status: 401 });
  }

  const session = await getSession();
  session.unlockedNotes = Array.from(
    new Set([...(session.unlockedNotes || []), slug]),
  );
  await session.save();

  return NextResponse.json({ ok: true });
}
