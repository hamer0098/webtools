import { redirect } from 'next/navigation';
import { generateSlug } from '@/lib/utils/slug';

export const dynamic = 'force-dynamic';

export default function NotepadIndex() {
  redirect(`/notepad/${generateSlug()}`);
}
