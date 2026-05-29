import DownloadClient from './DownloadClient';

export const dynamic = 'force-dynamic';

export default async function DownloadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DownloadClient id={id} />;
}
