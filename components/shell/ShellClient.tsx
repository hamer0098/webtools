'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import Sidebar from './Sidebar';

type ToolItem = {
  slug: string;
  name: string;
  icon: string | null;
  group_name: string | null;
};

export default function ShellClient({
  tools,
  children,
}: {
  tools: ToolItem[];
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen md:flex">
      {/* 移动端顶栏 */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-neutral-200 bg-white/95 px-4 py-2.5 backdrop-blur md:hidden dark:border-neutral-800 dark:bg-neutral-950/95">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="打开菜单"
          className="rounded-md p-1 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/" className="font-semibold">
          Webtools
        </Link>
      </header>

      {/* 桌面端：固定左侧 Sidebar */}
      <div className="hidden md:block">
        <Sidebar tools={tools} />
      </div>

      {/* 移动端 drawer：背景遮罩 + 抽屉 */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-64 shadow-xl md:hidden">
            <div className="relative h-full">
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="关闭菜单"
                className="absolute right-2 top-2 z-10 rounded-md p-1 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800"
              >
                <X className="h-5 w-5" />
              </button>
              <Sidebar tools={tools} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        </>
      )}

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
