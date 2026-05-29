import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import NotesTable from '@/components/admin/NotesTable';

export const dynamic = 'force-dynamic';

type NoteRowView = {
  slug: string;
  has_password: number;
  size_bytes: number;
  updated_at: number;
  last_viewed_at: number;
  created_at: number;
};

export default async function AdminNotesPage() {
  const session = await getSession();
  if (!session.admin) redirect('/admin/login');

  const notes = getDb()
    .prepare(
      `SELECT slug, password_hash IS NOT NULL AS has_password,
              size_bytes, updated_at, last_viewed_at, created_at
       FROM notes
       ORDER BY updated_at DESC
       LIMIT 500`,
    )
    .all() as NoteRowView[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">笔记管理</h1>
      <p className="mb-6 text-sm text-slate-500">查看所有笔记、批量删除、清理过期数据</p>
      <NotesTable initialNotes={notes} />
    </div>
  );
}
