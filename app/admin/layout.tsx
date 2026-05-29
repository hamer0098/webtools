import { getSession } from '@/lib/session';
import AdminShell from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const loggedIn = !!session.admin;

  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <main className="mx-auto max-w-md px-4 py-12">{children}</main>
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
