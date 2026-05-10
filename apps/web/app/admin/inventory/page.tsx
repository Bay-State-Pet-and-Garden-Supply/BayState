import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { getInventoryDashboardStats } from '@/lib/admin/inventory/queries';
import { InventoryDashboard } from '@/components/admin/inventory/inventory-dashboard';
import { RevenueAtRisk } from '@/components/admin/dashboard/revenue-at-risk';

export default async function InventoryPage() {
  const stats = await getInventoryDashboardStats();

  return (
    <AdminPageShell title="Inventory Reconciliation">
      <div className="space-y-6">
        <InventoryDashboard stats={stats} />
        <RevenueAtRisk />
      </div>
    </AdminPageShell>
  );
}
