import { CohortDetailClient } from '@/components/admin/cohorts/CohortDetailClient';

interface CohortDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CohortDetailPage({ params }: CohortDetailPageProps) {
  const { id } = await params;

  return (
    <div className="space-y-6 p-6">
      <CohortDetailClient cohortId={id} />
    </div>
  );
}
