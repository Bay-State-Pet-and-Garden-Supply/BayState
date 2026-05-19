import { SquareStack } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { CohortDashboardClient } from '@/components/admin/cohorts/CohortDashboardClient';

export default function CohortDashboardPage() {
  return (
    <AdminPageShell
      title="Batches"
      description="Monitor cohort progress, brand readiness, and scraper assignment from one live operations queue."
      icon={<SquareStack className="h-5 w-5" />}
      eyebrow="Queue view"
    >
      <CohortDashboardClient />
    </AdminPageShell>
  );
}
