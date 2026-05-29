import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { deleteMailbox } from '@/lib/tempmail';
import { isValidSlug } from '@/lib/utils/slug';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { slug } = await params;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 });
  }
  const changes = deleteMailbox(slug);
  logEvent(AUDIT_EVENTS.TEMPMAIL_DELETE, req, { slug, changes });
  return NextResponse.json({ ok: true, deleted: changes });
}
