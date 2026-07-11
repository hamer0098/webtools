import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { listBots, serializeBot } from '@/lib/tgbot';
import TgbotAdminClient from '@/components/admin/TgbotAdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminTgbotPage() {
  const session = await getSession();
  if (!session.admin) redirect('/admin/login');

  const bots = listBots().map(serializeBot);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">TG 机器人</h1>
      <p className="mb-6 text-sm text-slate-500">
        绑定 Telegram bot，按用途二选一：「匿名文件」= 发文件给它自动上传并回复一次性下载链接；
        「收藏箱」= 发文件/链接/文字给它永久收藏（链接可一键离线保存全文），前台 /archive 查看。
        受 Telegram 限制，机器人只能下载 ≤20MB 的文件。
      </p>
      <TgbotAdminClient initialBots={bots} />
    </div>
  );
}
