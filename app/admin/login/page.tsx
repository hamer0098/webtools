import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import LoginForm from '@/components/admin/LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getSession();
  if (session.admin) redirect('/admin');
  return (
    <div className="mt-12">
      <div className="mb-6 text-center">
        <div className="text-xl font-semibold">Webtools</div>
        <div className="text-sm text-slate-500">管理后台</div>
      </div>
      <LoginForm />
    </div>
  );
}
