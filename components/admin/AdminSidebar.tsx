'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { LayoutDashboard, Wrench, NotebookPen, FileLock2, Mail, Bot, ShieldCheck, ScrollText } from 'lucide-react';

const ITEMS = [
  { href: '/admin', label: '概览', icon: LayoutDashboard, exact: true },
  { href: '/admin/tools', label: '工具管理', icon: Wrench },
  { href: '/admin/notes', label: '匿名笔记', icon: NotebookPen },
  { href: '/admin/send', label: '匿名文件', icon: FileLock2 },
  { href: '/admin/tempmail', label: '临时邮箱', icon: Mail },
  { href: '/admin/tgbot', label: 'TG 机器人', icon: Bot },
  { href: '/admin/account', label: '账户与 2FA', icon: ShieldCheck },
  { href: '/admin/audit', label: '操作日志', icon: ScrollText },
];

export default function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() || '';
  return (
    <aside className="sticky top-0 h-screen w-60 shrink-0 border-r border-slate-200 bg-white md:top-14 md:h-[calc(100vh-3.5rem)] dark:border-slate-800 dark:bg-slate-900">
      <nav className="p-3 pt-12 md:pt-3">
        {ITEMS.map((it) => {
          const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={onNavigate}
              className={clsx(
                'mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              <Icon className="h-4 w-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
