import { SquareStack } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { CohortDetailClient } from '@/components/admin/cohorts/CohortDetailClient';

interface CohortDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CohortDetailPage({ params }: CohortDetailPageProps) {
  const { id } = await params;

  return (
    <AdminPageShell
      title="Batch details"
      description="Review one batch, brand readiness, scraper recommendations, and member products without leaving the queue system."
      icon={<SquareStack className="h-5 w-5" />}
      eyebrow="Workspace view"
      backHref="/admin/cohorts/dashboard"
      backLabel="Back to batches"
      fullHeight
    >
      <CohortDetailClient cohortId={id} />
    </AdminPageShell>
  );
}
