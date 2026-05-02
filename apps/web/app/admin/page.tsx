import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { AdminDashboardView } from '@/components/admin/dashboard/admin-dashboard-view';

/**
 * Admin Dashboard Page
 * Overhauled to provide high-density metrics and real-time scraper status.
 */
export default function AdminDashboardPage() {
  return (
    <AdminPageShell title="Dashboard" description="Real-time overview of Bay State Pet & Garden Supply operations.">
      <AdminDashboardView />
    </AdminPageShell>
  );
}
