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
        绑定 Telegram bot 后，把文件发/转发给它即自动上传到「匿名文件」，机器人回复一次性下载链接。
        受 Telegram 限制，机器人只能下载 ≤20MB 的文件。
      </p>
      <TgbotAdminClient initialBots={bots} />
    </div>
  );
}
