import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { listMessagesForAddress } from '@/lib/tempmail';

export const dynamic = 'force-dynamic';

/** Admin 视角：按 address 列出所有邮件（含 text/html 全文，调试用）。 */
export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const address = url.searchParams.get('address');
  if (!address) {
    return NextResponse.json({ error: 'address required' }, { status: 400 });
  }
  const messages = listMessagesForAddress(address, 200);
  return NextResponse.json({ messages });
}
