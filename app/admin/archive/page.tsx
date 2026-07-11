import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { listItems, serializeItem } from '@/lib/archive';
import ArchiveAdminClient from '@/components/admin/ArchiveAdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminArchivePage() {
  const session = await getSession();
  if (!session.admin) redirect('/admin/login');

  const { items, total } = listItems({});

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">收藏箱</h1>
      <p className="mb-6 text-sm text-slate-500">
        通过收藏 bot（后台「TG 机器人」绑定，用途选「收藏箱」）收集的文件 / 链接 / 文字。
        这里可以勾选打包下载到本地、删除条目；前台 /archive 用 TG 一次性码或 2FA 动态码解锁查看。
      </p>
      <ArchiveAdminClient initialItems={items.map((i) => serializeItem(i))} initialTotal={total} />
    </div>
  );
}
