import { NextResponse } from 'next/server';
import { getDb, type NoteRow } from '@/lib/db';
import { isValidSlug } from '@/lib/utils/slug';
import { hashPassword } from '@/lib/utils/password';
import { getSession } from '@/lib/session';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';
import { consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { NOTE_LIMITS, RATE_LIMITS } from '@/lib/limits';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function GET(_: Request, { params }: Params) {
  const { slug } = await params;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 });
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM notes WHERE slug = ?').get(slug) as
    | NoteRow
    | undefined;

  if (!row) {
    return NextResponse.json({ slug, content: '', exists: false });
  }

  if (row.password_hash) {
    const session = await getSession();
    if (!session.unlockedNotes?.includes(slug)) {
      return NextResponse.json({ requirePassword: true }, { status: 401 });
    }
  }

  db.prepare('UPDATE notes SET last_viewed_at = ? WHERE slug = ?').run(Date.now(), slug);

  return NextResponse.json({
    slug: row.slug,
    content: row.content,
    hasPassword: !!row.password_hash,
    updated_at: row.updated_at,
    exists: true,
  });
}

export async function PUT(req: Request, { params }: Params) {
  const { slug } = await params;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 });
  }

  const ip = getClientIp(req);

  // PUT 写入限流
  const rlPut = consumeRateLimit(
    `noteput:${ip}`,
    RATE_LIMITS.NOTE_PUT.max,
    RATE_LIMITS.NOTE_PUT.windowMs,
  );
  if (!rlPut.ok) {
    logEvent(AUDIT_EVENTS.RATE_LIMITED, req, {
      endpoint: 'note.put',
      retryAfter: rlPut.retryAfterSec,
    });
    return rateLimitResponse(rlPut.retryAfterSec);
  }

  const body = (await req.json().catch(() => null)) as {
    content?: string;
    password?: string | null;
  } | null;
  if (!body || typeof body.content !== 'string') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  // 单条大小硬限制
  const size = Buffer.byteLength(body.content, 'utf8');
  if (size > NOTE_LIMITS.MAX_CONTENT_BYTES) {
    logEvent(AUDIT_EVENTS.NOTE_REJECTED, req, {
      slug,
      reason: 'too_large',
      size,
      max: NOTE_LIMITS.MAX_CONTENT_BYTES,
    });
    return NextResponse.json(
      {
        error: `单条笔记最大 ${Math.floor(NOTE_LIMITS.MAX_CONTENT_BYTES / 1024)} KB`,
      },
      { status: 413 },
    );
  }

  const db = getDb();
  const now = Date.now();
  const existing = db.prepare('SELECT * FROM notes WHERE slug = ?').get(slug) as
    | NoteRow
    | undefined;

  // If note has password and caller isn't unlocked, reject write
  if (existing?.password_hash) {
    const session = await getSession();
    if (!session.unlockedNotes?.includes(slug)) {
      return NextResponse.json({ requirePassword: true }, { status: 401 });
    }
  }

  // 新 slug 创建：1) 全局总数上限 2) 每 IP 创建速率
  if (!existing) {
    const totalRow = db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: number };
    if (totalRow.c >= NOTE_LIMITS.MAX_TOTAL_NOTES) {
      logEvent(AUDIT_EVENTS.NOTE_REJECTED, req, {
        slug,
        reason: 'total_full',
        total: totalRow.c,
      });
      return NextResponse.json(
        { error: '笔记数已达上限，请联系管理员清理' },
        { status: 507 },
      );
    }
    const rlCreate = consumeRateLimit(
      `notecreate:${ip}`,
      RATE_LIMITS.NOTE_CREATE.max,
      RATE_LIMITS.NOTE_CREATE.windowMs,
    );
    if (!rlCreate.ok) {
      logEvent(AUDIT_EVENTS.RATE_LIMITED, req, {
        endpoint: 'note.create',
        retryAfter: rlCreate.retryAfterSec,
      });
      return rateLimitResponse(rlCreate.retryAfterSec);
    }
  }

  let nextPasswordHash: string | null | undefined = undefined;
  if (body.password === null) {
    nextPasswordHash = null;
  } else if (typeof body.password === 'string' && body.password.length > 0) {
    nextPasswordHash = await hashPassword(body.password);
  }

  if (existing) {
    db.prepare(
      `UPDATE notes SET content = ?, password_hash = ?, updated_at = ?, last_viewed_at = ?, size_bytes = ?
       WHERE slug = ?`,
    ).run(
      body.content,
      nextPasswordHash === undefined ? existing.password_hash : nextPasswordHash,
      now,
      now,
      size,
      slug,
    );
  } else {
    db.prepare(
      `INSERT INTO notes (slug, content, password_hash, created_at, updated_at, last_viewed_at, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(slug, body.content, nextPasswordHash ?? null, now, now, now, size);

    if (nextPasswordHash) {
      const session = await getSession();
      session.unlockedNotes = Array.from(
        new Set([...(session.unlockedNotes || []), slug]),
      );
      await session.save();
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Params) {
  const { slug } = await params;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 });
  }

  const session = await getSession();
  if (!session.admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  getDb().prepare('DELETE FROM notes WHERE slug = ?').run(slug);
  logEvent(AUDIT_EVENTS.NOTE_DELETE, req, { slug });
  return NextResponse.json({ ok: true });
}
