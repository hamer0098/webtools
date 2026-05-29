import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getAdminUser } from '@/lib/admin';
import AccountPanel from '@/components/admin/AccountPanel';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await getSession();
  if (!session.admin) redirect('/admin/login');
  const user = getAdminUser();
  if (!user) redirect('/admin/login');

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">账户与 2FA</h1>
      <p className="mb-6 text-sm text-slate-500">修改管理员密码、启用两步验证</p>
      <AccountPanel
        username={user.username}
        has2fa={!!user.totp_secret}
      />
    </div>
  );
}
