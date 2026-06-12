/** Integra reconciliation shared types */

export type ReconciliationIssueType =
  | 'register_only'
  | 'website_only'
  | 'price_mismatch'
  | 'quantity_mismatch'
  | 'stock_status_mismatch'
  | 'duplicate_upc'
  | 'invalid_row';

export type ReconciliationIssueSeverity = 'low' | 'medium' | 'high';

export interface ReconciliationIssue {
  upc: string;
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
  reconciliation_id: string | null;
  upc: string;
  product_id: string | null;
  register_price: number | null;
  website_price: number | null;
  register_quantity: number | null;
  website_quantity: number | null;
  issue_type: string;
  status: string;
  notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string | null;
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
