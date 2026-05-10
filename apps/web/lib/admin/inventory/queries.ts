import { createClient } from '@/lib/supabase/server';
import type { IntegrationSyncRun } from '@/lib/orders';
import type { InventoryDashboardStats, InventoryIssueFilters, InventorySyncRunSummary } from './types';
import type { InventoryReconciliationItemRow } from '@/lib/admin/integrations/reconciliation-types';

export async function getInventoryDashboardStats(): Promise<InventoryDashboardStats> {
  const supabase = await createClient();

  const { data: lastRun } = await supabase
    .from('integration_sync_runs')
    .select('*')
    .eq('source_type', 'integra')
    .eq('sync_kind', 'inventory')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: stats } = await supabase
    .from('inventory_reconciliation_items')
    .select('issue_type, status');

  const items = stats || [];

  return {
    lastSyncRun: (lastRun ?? null) as IntegrationSyncRun | null,
    openIssues: items.filter(i => i.status === 'open').length,
    registerOnlyProducts: items.filter(i => i.issue_type === 'register_only' && i.status === 'open').length,
    priceMismatches: items.filter(i => i.issue_type === 'price_mismatch' && i.status === 'open').length,
    quantityMismatches: items.filter(i => i.issue_type === 'quantity_mismatch' && i.status === 'open').length,
    stockStatusMismatches: items.filter(i => i.issue_type === 'stock_status_mismatch' && i.status === 'open').length,
    pushedToPipeline: items.filter(i => i.status === 'pushed_to_pipeline').length,
  };
}

export async function getInventorySyncRuns(filters?: {
  page?: number;
  pageSize?: number;
}): Promise<{ runs: IntegrationSyncRun[]; count: number }> {
  const supabase = await createClient();
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('integration_sync_runs')
    .select('*', { count: 'exact' })
    .eq('source_type', 'integra')
    .eq('sync_kind', 'inventory')
    .order('started_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching sync runs:', error);
    return { runs: [], count: 0 };
  }

  return { runs: (data || []) as IntegrationSyncRun[], count: count ?? 0 };
}

export async function getInventoryReconciliationItems(filters: InventoryIssueFilters): Promise<{
  items: InventoryReconciliationItemRow[];
  count: number;
}> {
  const supabase = await createClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('inventory_reconciliation_items')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (filters.syncRunId) query = query.eq('sync_run_id', filters.syncRunId);
  if (filters.issueType) query = query.eq('issue_type', filters.issueType);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.q) {
    const sanitized = filters.q.trim().replace(/[%_]/g, '');
    if (sanitized.length > 0) {
      query = query.or(`sku.ilike.%${sanitized}%,register_name.ilike.%${sanitized}%`);
    }
  }

  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching reconciliation items:', error);
    return { items: [], count: 0 };
  }

  return { items: (data || []) as InventoryReconciliationItemRow[], count: count ?? 0 };
}

export async function getInventorySyncRunDetail(syncRunId: string): Promise<{
  run: IntegrationSyncRun;
  summary: InventorySyncRunSummary;
} | null> {
  const supabase = await createClient();

  const { data: run, error: runError } = await supabase
    .from('integration_sync_runs')
    .select('*')
    .eq('id', syncRunId)
    .single();

  if (runError || !run) return null;

  const { data: items } = await supabase
    .from('inventory_reconciliation_items')
    .select('issue_type, status')
    .eq('sync_run_id', syncRunId);

  const all = items || [];
  const summary: InventorySyncRunSummary = {
    totalIssues: all.length,
    openIssues: all.filter(i => i.status === 'open').length,
    resolvedIssues: all.filter(i => i.status === 'resolved').length,
    ignoredIssues: all.filter(i => i.status === 'ignored').length,
    pushedToPipeline: all.filter(i => i.status === 'pushed_to_pipeline').length,
    registerOnlyCount: all.filter(i => i.issue_type === 'register_only').length,
    priceMismatchCount: all.filter(i => i.issue_type === 'price_mismatch').length,
    quantityMismatchCount: all.filter(i => i.issue_type === 'quantity_mismatch').length,
    stockStatusMismatchCount: all.filter(i => i.issue_type === 'stock_status_mismatch').length,
  };

  return { run: run as IntegrationSyncRun, summary };
}
