import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import AuditPanel from '@/components/admin/AuditPanel';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const session = await getSession();
  if (!session.admin) redirect('/admin/login');
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">操作日志</h1>
      <p className="mb-6 text-sm text-slate-500">登录、配置变更、删除等关键操作的审计记录</p>
      <AuditPanel />
    </div>
  );
}
