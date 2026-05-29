import { NextResponse } from 'next/server';
import { getFile, maybeCleanup } from '@/lib/send';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  maybeCleanup();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const row = getFile(id);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (row.expires_at < Date.now()) {
    return NextResponse.json({ error: '链接已过期' }, { status: 410 });
  }
  if (row.downloaded_at) {
    return NextResponse.json({ error: '文件已被下载' }, { status: 410 });
  }
  return NextResponse.json({
    id: row.id,
    encryptedMetadata: row.encrypted_metadata,
    size: row.ciphertext_size,
    expiresAt: row.expires_at,
  });
}
