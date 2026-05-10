import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { createClient } from '@/lib/supabase/server';
import { Launchpad } from '@/components/admin/inventory/launchpad';
import type { InventoryReconciliationItemRow } from '@/lib/admin/integrations/reconciliation-types';

export default async function LaunchpadPage() {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from('inventory_reconciliation_items')
    .select('*')
    .eq('issue_type', 'register_only')
    .in('status', ['open', 'pushed_to_pipeline'])
    .order('register_quantity', { ascending: false });

  const rows = (items ?? []) as InventoryReconciliationItemRow[];

  // Fetch pipeline status for each SKU from products_ingestion
  let pipelineBySku: Record<string, { id: string; pipeline_status: string }> = {};
  if (rows.length > 0) {
    const skus = rows.map(r => r.sku).filter(Boolean);
    const { data: ingestionRows } = await supabase
      .from('products_ingestion')
      .select('id, sku, pipeline_status')
      .in('sku', skus);

    if (ingestionRows) {
      for (const row of ingestionRows) {
        pipelineBySku[row.sku] = { id: row.id, pipeline_status: row.pipeline_status as string };
      }
    }
  }

  return (
    <AdminPageShell title="Register-only Product Launchpad">
      <Launchpad items={rows} pipelineBySku={pipelineBySku} />
    </AdminPageShell>
  );
}
