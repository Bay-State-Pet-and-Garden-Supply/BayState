import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { CohortDashboardClient } from '@/components/admin/cohorts/CohortDashboardClient';

export default function CohortDashboardPage() {
  return (
    <AdminPageShell title="Cohorts">
      <CohortDashboardClient />
    </AdminPageShell>
  );
}