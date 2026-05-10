import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { getInventoryDashboardStats } from '@/lib/admin/inventory/queries';
import { InventoryDashboard } from '@/components/admin/inventory/inventory-dashboard';

export default async function InventoryPage() {
  const stats = await getInventoryDashboardStats();

  return (
    <AdminPageShell title="Inventory Reconciliation">
      <InventoryDashboard stats={stats} />
    </AdminPageShell>
  );
}
