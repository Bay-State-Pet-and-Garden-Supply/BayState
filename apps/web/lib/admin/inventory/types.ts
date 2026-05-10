import type { ReconciliationIssueType } from '@/lib/admin/integrations/reconciliation-types';

export interface InventoryDashboardStats {
  lastSyncRun: {
    id: string;
    source_type: string;
    source_system: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    file_name: string | null;
  } | null;
  openIssues: number;
  registerOnlyProducts: number;
  priceMismatches: number;
  quantityMismatches: number;
  stockStatusMismatches: number;
  pushedToPipeline: number;
}

export type InventoryIssueStatus =
  | 'open'
  | 'ignored'
  | 'resolved'
  | 'pushed_to_pipeline';

export interface InventoryIssueFilters {
  syncRunId?: string;
  issueType?: ReconciliationIssueType;
  status?: InventoryIssueStatus;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface InventoryReconciliationItem {
  id: string;
  sync_run_id: string;
  sku: string;
  product_id: string | null;
  register_name: string | null;
  website_name: string | null;
  register_price: number | null;
  website_price: number | null;
  register_quantity: number | null;
  website_quantity: number | null;
  issue_type: string;
  severity: string;
  status: string;
  recommended_action: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface InventorySyncRunSummary {
  totalIssues: number;
  openIssues: number;
  resolvedIssues: number;
  ignoredIssues: number;
  pushedToPipeline: number;
  registerOnlyCount: number;
  priceMismatchCount: number;
  quantityMismatchCount: number;
  stockStatusMismatchCount: number;
}
