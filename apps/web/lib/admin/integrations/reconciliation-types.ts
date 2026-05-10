/** Integra reconciliation shared types */

export type ReconciliationIssueType =
  | 'register_only'
  | 'website_only'
  | 'price_mismatch'
  | 'quantity_mismatch'
  | 'stock_status_mismatch'
  | 'duplicate_sku'
  | 'invalid_row';

export type ReconciliationIssueSeverity = 'low' | 'medium' | 'high';

export interface ReconciliationIssue {
  sku: string;
  productId: string | null;
  issueType: ReconciliationIssueType;
  severity: ReconciliationIssueSeverity;
  registerName: string | null;
  websiteName: string | null;
  registerPrice: number | null;
  websitePrice: number | null;
  registerQuantity: number | null;
  websiteQuantity: number | null;
  recommendedAction: string;
  rawRegisterPayload?: Record<string, unknown>;
}

export type ReconciliationIssueStatus = 'open' | 'ignored' | 'resolved' | 'pushed_to_pipeline';

export interface InventoryReconciliationItemRow {
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
  issue_type: ReconciliationIssueType;
  severity: string;
  status: ReconciliationIssueStatus;
  recommended_action: string | null;
  metadata: Record<string, unknown>;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export interface IntegraReconciliationResult {
  syncRunId: string;
  totalInFile: number;
  matchedProducts: number;
  unchangedProducts: number;
  registerOnlyCount: number;
  websiteOnlyCount: number;
  priceMismatchCount: number;
  quantityMismatchCount: number;
  stockStatusMismatchCount: number;
  issues: ReconciliationIssue[];
}
