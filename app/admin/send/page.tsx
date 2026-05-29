import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import SendAdminClient from '@/components/admin/SendAdminClient';
import type { SendCodeRow, SendFileRow } from '@/lib/send';

export const dynamic = 'force-dynamic';

export default async function AdminSendPage() {
  const session = await getSession();
  if (!session.admin) redirect('/admin/login');

  const db = getDb();
  const codes = db
    .prepare(
      `SELECT id, code, kind, note, enabled, max_uses, used_count, file_ttl_ms,
              used_at, used_by_ip, created_at
       FROM send_codes ORDER BY created_at DESC`,
    )
    .all() as SendCodeRow[];
  const files = db
    .prepare(
      `SELECT id, ciphertext_size, created_at, expires_at, downloaded_at,
              uploader_code_id, uploader_ip
       FROM send_files ORDER BY created_at DESC LIMIT 500`,
    )
    .all() as Array<Pick<
      SendFileRow,
      'id' | 'ciphertext_size' | 'created_at' | 'expires_at' | 'downloaded_at' | 'uploader_code_id' | 'uploader_ip'
    >>;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">匿名文件</h1>
      <p className="mb-6 text-sm text-slate-500">
        前台用户需要输入下方任一启用中的密码或一次性邀请码，才能上传文件。下载链接为一次性，密文加密在浏览器完成，服务器零知识。
      </p>
      <SendAdminClient initialCodes={codes} initialFiles={files} />
    </div>
  );
}
