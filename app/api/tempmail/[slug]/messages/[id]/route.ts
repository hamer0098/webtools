import { NextResponse } from 'next/server';
import { getMailbox, getMessage, deleteMessage } from '@/lib/tempmail';
import { isValidSlug } from '@/lib/utils/slug';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string; id: string }> };

/** 安全：仅当当前 slug 绑定的 address 等于邮件的 address 才允许读/删。 */
function checkAccess(slug: string, id: string) {
  if (!isValidSlug(slug)) return null;
  const mailbox = getMailbox(slug);
  const msg = getMessage(id);
  if (!mailbox || !msg) return null;
  if (mailbox.address !== msg.address) return null;
  return { mailbox, msg };
}

export async function GET(_req: Request, { params }: Params) {
  const { slug, id } = await params;
  const ctx = checkAccess(slug, id);
  if (!ctx) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { msg } = ctx;
  return NextResponse.json({
    id: msg.id,
    from_addr: msg.from_addr,
    from_name: msg.from_name,
    subject: msg.subject,
    text_body: msg.text_body,
    html_body: msg.html_body,
    verification_code: msg.verification_code,
    received_at: msg.received_at,
    expires_at: msg.expires_at,
  });
}

export async function DELETE(req: Request, { params }: Params) {
  const { slug, id } = await params;
  const ctx = checkAccess(slug, id);
  if (!ctx) return NextResponse.json({ error: 'not found' }, { status: 404 });
  deleteMessage(id);
  logEvent(AUDIT_EVENTS.TEMPMAIL_MESSAGE_DELETE, req, { slug, id });
  return NextResponse.json({ ok: true });
}
