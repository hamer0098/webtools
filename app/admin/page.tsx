import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import { getAdminUser } from '@/lib/admin';
import { bootstrapAdminFromEnv } from '@/lib/admin';
import { Wrench, NotebookPen, ScrollText, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const session = await getSession();
  if (!session.admin) redirect('/admin/login');

  bootstrapAdminFromEnv();
  const db = getDb();
  const totalTools = (db.prepare('SELECT COUNT(*) AS c FROM tools').get() as { c: number }).c;
  const enabledTools = (
    db.prepare('SELECT COUNT(*) AS c FROM tools WHERE enabled = 1').get() as { c: number }
  ).c;
  const totalNotes = (db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: number }).c;
  const totalSize = (
    db.prepare('SELECT COALESCE(SUM(size_bytes), 0) AS s FROM notes').get() as { s: number }
  ).s;
  const auditCount = (
    db.prepare('SELECT COUNT(*) AS c FROM audit_log').get() as { c: number }
  ).c;
  const lastLogin = (
    db
      .prepare(
        "SELECT created_at FROM audit_log WHERE event = 'auth.login.success' ORDER BY created_at DESC LIMIT 1",
      )
      .get() as { created_at: number } | undefined
  )?.created_at;
  const recentFails = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM audit_log WHERE event IN ('auth.login.fail','auth.2fa.fail') AND created_at > ?",
      )
      .get(Date.now() - 7 * 86400_000) as { c: number }
  ).c;

  const user = getAdminUser();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">概览</h1>
      <p className="mb-6 text-sm text-slate-500">系统运行状态与最近活动</p>

      {user && !user.totp_secret && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1 text-sm">
            <div className="font-medium text-amber-900 dark:text-amber-200">还未启用两步验证</div>
            <div className="mt-0.5 text-amber-700 dark:text-amber-300/80">
              建议立即启用 2FA，给后台再加一道防线
            </div>
          </div>
          <Link
            href="/admin/account"
            className="rounded-md bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700"
          >
            去启用
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={<Wrench className="h-4 w-4 text-blue-600" />}
          title="工具数量"
          value={`${enabledTools} / ${totalTools}`}
          href="/admin/tools"
          sub="启用 / 总数"
        />
        <StatCard
          icon={<NotebookPen className="h-4 w-4 text-emerald-600" />}
          title="笔记数量"
          value={String(totalNotes)}
          href="/admin/notes"
          sub={`总大小 ${(totalSize / 1024).toFixed(1)} KB`}
        />
        <StatCard
          icon={<ScrollText className="h-4 w-4 text-violet-600" />}
          title="日志条数"
          value={String(auditCount)}
          href="/admin/audit"
          sub={`近 7 天失败 ${recentFails}`}
        />
        <StatCard
          icon={<ShieldCheck className="h-4 w-4 text-rose-600" />}
          title="安全"
          value={user?.totp_secret ? '已启用 2FA' : '未启用 2FA'}
          href="/admin/account"
          sub={lastLogin ? `上次登录 ${fmtRelative(lastLogin)}` : '尚无登录记录'}
        />
      </div>
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
  sub,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-blue-400 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-xs text-slate-500">{title}</span>
      </div>
      <div className="text-xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

function fmtRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return `${Math.floor(diff / 86400_000)} 天前`;
}
