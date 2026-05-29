'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import AdminSidebar from './AdminSidebar';
import LogoutButton from './LogoutButton';

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="打开菜单"
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100 md:hidden dark:hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-semibold">Webtools 后台</span>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="flex">
        {/* 桌面端固定侧栏 */}
        <div className="hidden md:block">
          <AdminSidebar />
        </div>

        {/* 移动端 drawer */}
        {drawerOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 w-60 bg-white shadow-xl md:hidden dark:bg-slate-900">
              <div className="relative h-full">
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="关闭菜单"
                  className="absolute right-2 top-2 z-10 rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
                <AdminSidebar onNavigate={() => setDrawerOpen(false)} />
              </div>
            </div>
          </>
        )}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
