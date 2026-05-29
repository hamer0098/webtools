import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Webtools',
  description: '个人在线工具集合站',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
