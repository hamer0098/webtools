import { NextResponse } from 'next/server';
import { customAlphabet } from 'nanoid';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const codeGen = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 12);

export async function GET() {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const rows = getDb()
    .prepare(
      `SELECT id, code, kind, note, enabled, max_uses, used_count, file_ttl_ms,
              used_at, used_by_ip, created_at
       FROM send_codes
       ORDER BY created_at DESC`,
    )
    .all();
  return NextResponse.json({ codes: rows });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as null | {
    kind?: 'permanent' | 'onetime';
    code?: string;
    note?: string;
    maxUses?: number;
    /** 文件销毁时间（毫秒）；null/undefined 表示沿用全局默认 3 天 */
    fileTtlMs?: number | null;
  };
  if (!body || (body.kind !== 'permanent' && body.kind !== 'onetime')) {
    return NextResponse.json({ error: 'invalid kind' }, { status: 400 });
  }

  let code = (body.code || '').trim();
  if (!code) code = codeGen();
  if (code.length < 4 || code.length > 64 || !/^[A-Za-z0-9_-]+$/.test(code)) {
    return NextResponse.json({ error: 'code 必须是 4-64 位字母数字' }, { status: 400 });
  }

  let maxUses: number | null = null;
  if (body.kind === 'onetime') {
    maxUses = Number.isFinite(body.maxUses) ? Math.floor(body.maxUses as number) : 1;
    if (maxUses < 1 || maxUses > 9999) {
      return NextResponse.json({ error: '使用次数需在 1-9999 之间' }, { status: 400 });
    }
  }

  // 文件 TTL：允许 1 分钟 ~ 90 天；不填 / null → 用全局默认
  const MIN_TTL = 60_000;
  const MAX_TTL = 90 * 24 * 60 * 60_000;
  let fileTtlMs: number | null = null;
  if (body.fileTtlMs != null && Number.isFinite(body.fileTtlMs)) {
    const v = Math.floor(body.fileTtlMs);
    if (v < MIN_TTL || v > MAX_TTL) {
      return NextResponse.json(
        { error: '文件销毁时间需在 1 分钟 ~ 90 天之间' },
        { status: 400 },
      );
    }
    fileTtlMs = v;
  }

  try {
    const r = getDb()
      .prepare(
        `INSERT INTO send_codes (code, kind, note, max_uses, file_ttl_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(code, body.kind, body.note || null, maxUses, fileTtlMs, Date.now());
    logEvent(AUDIT_EVENTS.SEND_CODE_CREATE, req, {
      id: r.lastInsertRowid,
      kind: body.kind,
      maxUses,
      fileTtlMs,
    });
    return NextResponse.json({ id: r.lastInsertRowid, code, maxUses, fileTtlMs });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return NextResponse.json({ error: '该 code 已存在' }, { status: 409 });
    }
    throw e;
  }
}
