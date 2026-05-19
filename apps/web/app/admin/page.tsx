import { LayoutDashboard } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { AdminDashboardView } from '@/components/admin/dashboard/admin-dashboard-view';

export default function AdminDashboardPage() {
  return (
    <AdminPageShell
      title="Dashboard"
      description="See the current operational picture before you move into pipeline, runner health, catalog, or fulfillment work."
      icon={<LayoutDashboard className="h-5 w-5" />}
      eyebrow="Operations overview"
    >
      <AdminDashboardView />
    </AdminPageShell>
  );
}
