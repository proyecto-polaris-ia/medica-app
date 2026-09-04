import { notFound } from 'next/navigation';
import { getProviderSnapshot } from '@/lib/admin/provider-snapshot';
import { ProviderSnapshot } from '@/components/admin/ProviderSnapshot';

export const dynamic = 'force-dynamic';

export default async function ProviderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const snapshot = await getProviderSnapshot(id, new Date());
    return <ProviderSnapshot snapshot={snapshot} />;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'NotFoundError' || error.name === 'ValidationError')
    ) {
      notFound();
    }
    throw error;
  }
}
