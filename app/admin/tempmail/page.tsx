import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import TempmailAdminClient from '@/components/admin/TempmailAdminClient';

export const dynamic = 'force-dynamic';

type MailboxRow = {
  slug: string;
  address: string;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  message_count: number;
};

export default async function AdminTempmailPage() {
  const session = await getSession();
  if (!session.admin) redirect('/admin/login');

  const db = getDb();
  const mailboxes = db
    .prepare(
      `SELECT m.slug, m.address, m.created_at, m.last_seen_at, m.expires_at,
              (SELECT COUNT(*) FROM tempmail_message WHERE address = m.address) AS message_count
         FROM tempmail_mailbox m
         ORDER BY m.last_seen_at DESC
         LIMIT 500`,
    )
    .all() as MailboxRow[];

  const stats = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM tempmail_mailbox) AS mailbox_total,
         (SELECT COUNT(*) FROM tempmail_message) AS message_total`,
    )
    .get() as { mailbox_total: number; message_total: number };

  const domain = process.env.TEMPMAIL_DOMAIN?.trim() || null;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">临时邮箱</h1>
      <p className="mb-6 text-sm text-slate-500">
        共 {stats.mailbox_total} 个邮箱 · {stats.message_total} 封邮件 · 默认 24h 自动清理
        {domain ? (
          <>
            {' '}· 域名 <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{domain}</code>
          </>
        ) : (
          <span className="ml-1 text-amber-600">· TEMPMAIL_DOMAIN 未配置</span>
        )}
      </p>
      <TempmailAdminClient initialMailboxes={mailboxes} />
    </div>
  );
}
