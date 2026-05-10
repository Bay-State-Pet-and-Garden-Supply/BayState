# Implementation Plan

## Goal
Plan PRs 3-6 to finish source evidence, persisted Integra reconciliation, inventory UI, and dashboard metrics on top of the completed order schema/query foundation.

## Tasks

### PR 3: ShopSite Source Records

1. **Add ShopSite sync run helpers**
   - File: `scripts/sync-shopsite-orders.ts`
   - Changes: Replace `startLog`/`completeLog` as the primary tracking path with `startIntegrationSyncRun()` and `completeIntegrationSyncRun()` against `integration_sync_runs`; keep `migration_log` writes temporarily only as legacy telemetry if needed.
   - Key signatures:
     ```ts
     async function startIntegrationSyncRun(supabase: SupabaseClient): Promise<string | null>
     async function completeIntegrationSyncRun(supabase: SupabaseClient, syncRunId: string, result: SyncResult): Promise<void>
     ```
   - Acceptance: A sync inserts one `integration_sync_runs` row with `source_type='shopsite'`, `source_system='shopsite_15'`, `sync_kind='orders'`, final counts, status, and completion timestamp.

2. **Write canonical source fields during ShopSite order upsert**
   - File: `scripts/sync-shopsite-orders.ts`
   - Changes: Extend `orderRows` with `source_type: 'shopsite'`, `source_system: 'shopsite_15'`, `external_order_id`, `external_created_at`, `imported_at`, `payment_status: 'paid'`, `fulfillment_status: 'fulfilled'`; keep `source: 'shopsite'` for compatibility and keep `order_number = transformedOrder.legacy_order_number`.
   - Acceptance: Upserted orders keep legacy order numbers but are queryable by `source_type`, `source_system`, and `external_order_id`.

3. **Persist `order_source_records` per ShopSite order**
   - File: `scripts/sync-shopsite-orders.ts`
   - Changes: After order upsert, build one source record per transformed order and upsert by `(source_type, source_system, external_id)`.
   - Key signature:
     ```ts
     function buildShopSiteSourceRecord(input: {
       orderId: string;
       syncRunId: string | null;
       sourceOrderNumber: string;
       transformedOrder: ReturnType<typeof transformShopSiteOrder>["order"];
     }): Record<string, unknown>
     ```
   - Acceptance: Each synced order has one `order_source_records` row with raw XML under `raw_payload`, transaction/payment/address data under `normalized_payload`, and `sync_run_id` set when available.

4. **Add source-record transformation utilities**
   - File: `lib/admin/migration/order-sync.ts`
   - Changes: Export helpers that keep ShopSite normalization out of the script body.
   - Key signatures:
     ```ts
     export const SHOP_SITE_SOURCE_SYSTEM = 'shopsite_15';
     export function mapShopSitePaymentMethod(method?: string): 'credit_card' | 'paypal' | 'pickup';
     export function buildShopSiteOrderSourcePayload(transformedOrder: TransformedShopSiteOrder): {
       raw_payload: Record<string, unknown>;
       normalized_payload: Record<string, unknown>;
     };
     ```
   - Acceptance: `sync-shopsite-orders.ts` imports helpers instead of duplicating payload-shaping logic.

5. **Record order import events**
   - File: `scripts/sync-shopsite-orders.ts`
   - Changes: Insert/upsert `order_events` entries with `event_type='imported_from_shopsite'` after successful order upsert; avoid duplicates by using source record existence or include only for newly inserted source records if duplicate detection is easy.
   - Acceptance: Synced orders expose a timeline entry for ShopSite import.

6. **Optional schema hardening migration**
   - File: `supabase/migrations/YYYYMMDDHHMMSS_order_source_records_sync_run_fk.sql`
   - Migration outline:
     ```sql
     alter table public.order_source_records
       add constraint order_source_records_sync_run_id_fkey
       foreign key (sync_run_id)
       references public.integration_sync_runs(id)
       on delete set null;
     ```
   - Acceptance: Migration applies cleanly; skip if FK already exists in target branch.

7. **Validation**
   - Commands/checks: Run a limited sync in dry/test mode if supported, or `bunx tsc --noEmit` plus a small local script/mocked unit test for `buildShopSiteOrderSourcePayload`.
   - Verify in DB: `orders.external_order_id`, `order_source_records`, `integration_sync_runs`, and `order_events` rows are populated for a known ShopSite order.

**PR 3 files**
- Modified: `scripts/sync-shopsite-orders.ts`, `lib/admin/migration/order-sync.ts`
- New optional: `supabase/migrations/YYYYMMDDHHMMSS_order_source_records_sync_run_fk.sql`

**PR 3 risks / edge cases**
- Existing `idx_orders_source_external_unique` includes `source_system`; make sure `source_system='shopsite_15'` is always set before relying on the unique external index.
- `sourceOrderNumber` and `legacy_order_number` must stay identical for old ShopSite compatibility.
- Current item import deletes/reinserts items; PR 3 can leave it alone unless duplicate source records expose unexpected item churn.
- `order_source_records` unique constraint with nullable `external_id` allows multiple nulls; ensure ShopSite external IDs are never null.

---

### PR 4: Integra Reconciliation Persistence

1. **Create reconciliation schema**
   - File: `supabase/migrations/YYYYMMDDHHMMSS_inventory_reconciliation.sql`
   - Migration outline:
     ```sql
     create type public.inventory_reconciliation_issue_type as enum (
       'register_only',
       'website_only',
       'price_mismatch',
       'quantity_mismatch',
       'stock_status_mismatch',
       'duplicate_sku',
       'invalid_row'
     );

     create type public.inventory_reconciliation_status as enum (
       'open',
       'ignored',
       'resolved',
       'pushed_to_pipeline'
     );

     create table public.inventory_reconciliation_items (
       id uuid primary key default gen_random_uuid(),
       sync_run_id uuid not null references public.integration_sync_runs(id) on delete cascade,
       sku text not null,
       product_id uuid references public.products(id),
       register_name text,
       website_name text,
       register_price numeric(10,2),
       website_price numeric(10,2),
       register_quantity numeric(10,2),
       website_quantity numeric(10,2),
       issue_type public.inventory_reconciliation_issue_type not null,
       severity text not null default 'medium',
       status public.inventory_reconciliation_status not null default 'open',
       recommended_action text,
       raw_register_payload jsonb not null default '{}',
       metadata jsonb not null default '{}',
       resolved_at timestamptz,
       resolved_by uuid references auth.users,
       created_at timestamptz not null default now()
     );

     create index idx_inventory_reconciliation_items_sync_run on public.inventory_reconciliation_items(sync_run_id);
     create index idx_inventory_reconciliation_items_status on public.inventory_reconciliation_items(status);
     create index idx_inventory_reconciliation_items_issue_type on public.inventory_reconciliation_items(issue_type);
     create index idx_inventory_reconciliation_items_sku on public.inventory_reconciliation_items(sku);
     ```
   - RLS: Admin/staff `SELECT` and `ALL`; service role bypass if scripts use service role.
   - Acceptance: Migration applies and generated Supabase types include the table/enums.

2. **Introduce durable reconciliation types**
   - File: `lib/admin/integra-sync.ts`
   - Changes: Replace/extend `SyncAnalysis` with durable reconciliation result types while keeping old exports temporarily if UI still imports them.
   - Key types:
     ```ts
     export type ReconciliationIssueType = 'register_only' | 'website_only' | 'price_mismatch' | 'quantity_mismatch' | 'stock_status_mismatch' | 'duplicate_sku' | 'invalid_row';

     export interface ReconciliationIssue {
       sku: string;
       productId: string | null;
       issueType: ReconciliationIssueType;
       severity: 'low' | 'medium' | 'high';
       registerName: string | null;
       websiteName: string | null;
       registerPrice: number | null;
       websitePrice: number | null;
       registerQuantity: number | null;
       websiteQuantity: number | null;
       recommendedAction: string;
       rawRegisterPayload?: Record<string, unknown>;
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
     ```
   - Acceptance: Existing parser still works; analyzer can produce issue rows without writing UI state only.

3. **Use `RegisterWorkbookProduct` as canonical parser output**
   - File: `lib/admin/integra-sync.ts`
   - Changes: Keep `parseIntegraExcel()` but have it return enough fields for reconciliation (`quantityOnHand`, dates) or add `parseIntegraWorkbookForReconciliation()` returning `RegisterWorkbookProduct[]`.
   - Acceptance: Reconciliation can detect price, quantity, and stock-status differences; not just missing SKUs.

4. **Build persisted reconciliation service**
   - File: `lib/admin/integra-sync.ts`
   - Changes: Add functions to create sync run, analyze issues, insert rows, and return `syncRunId`.
   - Key signatures:
     ```ts
     export async function createIntegraSyncRun(input: { fileName?: string; rowCount: number; createdBy?: string | null }): Promise<string>;
     export async function analyzeIntegraReconciliation(registerProducts: RegisterWorkbookProduct[]): Promise<Omit<IntegraReconciliationResult, 'syncRunId'>>;
     export async function persistIntegraReconciliation(input: { syncRunId: string; issues: ReconciliationIssue[] }): Promise<void>;
     export async function runIntegraReconciliation(input: { buffer: ArrayBuffer; fileName?: string; createdBy?: string | null }): Promise<IntegraReconciliationResult>;
     ```
   - Acceptance: Upload path writes `integration_sync_runs` and `inventory_reconciliation_items`; no reconciliation data is lost after page refresh.

5. **Reuse register planning logic for mismatch detection**
   - File: `lib/admin/register-sync.ts`
   - Changes: Export `RegisterSyncPlan`, `RegisterSyncPreview`, `RegisterSyncChange`, and either expose `deriveInventoryStockStatus()` or add a public analyzer helper that PR 4 can reuse.
   - Acceptance: `integra-sync.ts` does not duplicate stock-status/price/quantity comparison logic.

6. **Update Integra server actions**
   - File: `app/admin/tools/integra-sync/actions.ts`
   - Changes: `analyzeIntegraAction()` should call `runIntegraReconciliation()` and return `{ success: true, syncRunId, summary }`; replace `processOnboardingAction(products)` with issue-based action.
   - Key signatures:
     ```ts
     export async function analyzeIntegraAction(formData: FormData): Promise<ActionState & { syncRunId?: string; summary?: IntegraReconciliationSummary }>;
     export async function pushReconciliationItemsToPipelineAction(issueIds: string[]): Promise<ActionState & { count?: number }>;
     ```
   - Acceptance: Upload returns a durable `syncRunId`, and push-to-pipeline updates issue status.

7. **Update onboarding push traceability**
   - File: `lib/admin/integra-sync.ts`
   - Changes: Add issue-based pipeline insertion that writes trace metadata to `products_ingestion.input`.
   - Key signature:
     ```ts
     export async function pushRegisterOnlyIssuesToOnboarding(issueIds: string[]): Promise<{ success: boolean; count: number; errors: string[] }>;
     ```
   - Required `products_ingestion.input` shape:
     ```ts
     {
       name,
       price,
       sku,
       quantityOnHand,
       source: 'integra',
       sync_run_id: syncRunId,
       reconciliation_item_id: issueId
     }
     ```
   - Acceptance: `inventory_reconciliation_items.status` changes to `pushed_to_pipeline` and `products_ingestion.pipeline_status='imported'`.

8. **Update current Integra upload UI minimally**
   - File: `app/admin/tools/integra-sync/SyncClient.tsx`
   - Changes: Display returned durable summary and link to `/admin/inventory/sync-runs/[syncRunId]`; keep old cards but rename “New Products” to “Register-only Products”.
   - Acceptance: Existing tool remains usable before full PR 5 UI lands.

9. **Validation**
   - Tests: Unit-test parser/analyzer with rows containing register-only, price mismatch, quantity mismatch, unchanged, and duplicate SKU cases.
   - Manual: Upload sample workbook, refresh page, verify rows still exist in `inventory_reconciliation_items` and sync run counts match.

**PR 4 files**
- Modified: `lib/admin/integra-sync.ts`, `lib/admin/register-sync.ts`, `app/admin/tools/integra-sync/actions.ts`, `app/admin/tools/integra-sync/SyncClient.tsx`
- New: `supabase/migrations/YYYYMMDDHHMMSS_inventory_reconciliation.sql`
- Optional tests: `__tests__/lib/admin/integra-sync.test.ts`, `__tests__/lib/admin/register-sync.test.ts`

**PR 4 risks / edge cases**
- Existing `parseRegisterRows()` deduplicates SKUs, so duplicate detection may require preserving raw rows before dedupe or adding a parser option.
- “Website-only” requires comparing full website SKU set against file SKU set; avoid loading entire catalog if SKU counts are very large, or batch/paginate.
- `products_ingestion` upsert by SKU can overwrite existing onboarding input; decide whether to merge trace metadata or skip existing rows.
- RLS must allow server actions for admin/staff and service scripts without exposing reconciliation data to customers.

---

### PR 5: Inventory UI

1. **Create inventory data layer**
   - New files:
     - `lib/admin/inventory/types.ts`
     - `lib/admin/inventory/queries.ts`
     - `lib/admin/inventory/mutations.ts`
   - Key signatures:
     ```ts
     export interface InventoryDashboardStats {
       lastSyncRun: IntegrationSyncRun | null;
       openIssues: number;
       registerOnlyProducts: number;
       priceMismatches: number;
       quantityMismatches: number;
       stockStatusMismatches: number;
       pushedToPipeline: number;
     }

     export interface InventoryIssueFilters {
       syncRunId?: string;
       issueType?: ReconciliationIssueType;
       status?: 'open' | 'ignored' | 'resolved' | 'pushed_to_pipeline';
       q?: string;
       page?: number;
       pageSize?: number;
     }

     export async function getInventoryDashboardStats(): Promise<InventoryDashboardStats>;
     export async function getInventorySyncRuns(filters: { page?: number; pageSize?: number }): Promise<{ runs: IntegrationSyncRun[]; count: number }>;
     export async function getInventoryReconciliationItems(filters: InventoryIssueFilters): Promise<{ items: InventoryReconciliationItem[]; count: number }>;
     export async function getInventorySyncRunDetail(syncRunId: string): Promise<{ run: IntegrationSyncRun; summary: InventorySyncRunSummary }>;
     export async function markInventoryIssueStatusAction(issueId: string, status: InventoryReconciliationStatus): Promise<ActionState>;
     export async function pushInventoryIssueToPipelineAction(issueId: string): Promise<ActionState>;
     export async function linkInventoryIssueProductAction(issueId: string, productId: string): Promise<ActionState>;
     ```
   - Acceptance: UI pages do not query Supabase directly from client components.

2. **Build inventory dashboard route**
   - New file: `app/admin/inventory/page.tsx`
   - New components:
     - `components/admin/inventory/inventory-dashboard.tsx`
     - `components/admin/inventory/inventory-metric-card.tsx`
     - `components/admin/inventory/latest-sync-card.tsx`
   - Changes: Render cards for Last Integra Sync, Open Discrepancies, Register-only Products, Price Mismatches, Quantity Mismatches, Products Pushed to Pipeline.
   - Acceptance: `/admin/inventory` loads server-rendered metrics and links to sync runs/detail pages.

3. **Build sync runs list route**
   - New file: `app/admin/inventory/sync-runs/page.tsx`
   - New component: `components/admin/inventory/sync-runs-table.tsx`
   - Changes: Table of `integration_sync_runs` filtered to `source_type='integra'`, `sync_kind in ('inventory','reconciliation')`, with status/count/date links.
   - Acceptance: Users can browse historical Integra sync runs.

4. **Build sync run detail route**
   - New file: `app/admin/inventory/sync-runs/[id]/page.tsx`
   - New components:
     - `components/admin/inventory/sync-run-detail.tsx`
     - `components/admin/inventory/reconciliation-issues-table.tsx`
     - `components/admin/inventory/reconciliation-issue-actions.tsx`
     - `components/admin/inventory/issue-status-badge.tsx`
     - `components/admin/inventory/issue-type-badge.tsx`
   - Changes: Tabs/filters for All Issues, Register-only, Price mismatches, Quantity mismatches, Resolved, Ignored.
   - Acceptance: Detail page lists persisted issues and supports row-level actions.

5. **Add server action wrappers**
   - New file: `app/admin/inventory/actions.ts`
   - Changes: Re-export inventory mutation functions for client components.
   - Acceptance: Client action buttons call server actions only; no direct DB access in client code.

6. **Wire push-to-pipeline action**
   - Files: `lib/admin/inventory/mutations.ts`, `components/admin/inventory/reconciliation-issue-actions.tsx`
   - Changes: For `register_only` issues, call PR 4’s onboarding helper; for unsupported issue types, disable button with clear tooltip/copy.
   - Acceptance: Pushed rows appear in `products_ingestion` and issue status updates to `pushed_to_pipeline`.

7. **Validation**
   - Manual: Seed/upload an Integra sync with all issue types; verify dashboard counts, filters, and row actions.
   - Tests: Component smoke tests for badge render helpers and query unit tests with mocked Supabase if project pattern supports it.
   - Accessibility: Ensure table actions have labels and disabled states explain why.

**PR 5 files**
- New: `app/admin/inventory/page.tsx`, `app/admin/inventory/sync-runs/page.tsx`, `app/admin/inventory/sync-runs/[id]/page.tsx`, `app/admin/inventory/actions.ts`
- New: `components/admin/inventory/*`
- New: `lib/admin/inventory/types.ts`, `lib/admin/inventory/queries.ts`, `lib/admin/inventory/mutations.ts`
- Modified optional: admin navigation file if inventory route is not already visible (identify exact nav file during implementation, likely under `components/admin/` or `app/admin/`).

**PR 5 risks / edge cases**
- Need exact admin nav location before adding menu link.
- Large issue tables need server pagination; do not fetch all rows into client.
- Product linking needs a product lookup UI; if too large, defer to text SKU/product ID search action.
- Price/quantity update actions were in the original vision but require careful product mutation/audit behavior; keep PR 5 to status/link/push unless scope is expanded.

---

### PR 6: Dashboard Metrics

1. **Add dashboard metric views and recent activity expansion**
   - New file: `supabase/migrations/YYYYMMDDHHMMSS_order_inventory_dashboard_views.sql`
   - Migration outline:
     ```sql
     create or replace view public.dashboard_order_stats as
     select
       count(*) filter (where created_at::date = current_date) as today_order_count,
       coalesce(sum(total) filter (where created_at::date = current_date), 0) as today_sales,
       count(*) filter (where status in ('pending', 'processing')) as open_orders,
       count(*) filter (where payment_status in ('unpaid', 'authorized')) as unpaid_orders,
       count(*) filter (where fulfillment_status = 'ready_for_pickup') as ready_for_pickup,
       count(*) filter (where source_type = 'integra' and created_at::date = current_date) as today_register_orders,
       count(*) filter (where source_type = 'web' and created_at::date = current_date) as today_web_orders
     from public.orders;

     create or replace view public.dashboard_inventory_reconciliation_stats as
     select
       count(*) filter (where status = 'open') as open_issues,
       count(*) filter (where issue_type = 'register_only' and status = 'open') as register_only_products,
       count(*) filter (where issue_type = 'price_mismatch' and status = 'open') as price_mismatches,
       count(*) filter (where issue_type = 'quantity_mismatch' and status = 'open') as quantity_mismatches,
       max(created_at) as last_issue_created_at
     from public.inventory_reconciliation_items;

     grant select on public.dashboard_order_stats to authenticated;
     grant select on public.dashboard_inventory_reconciliation_stats to authenticated;
     ```
   - Extend `public.get_dashboard_recent_activity(limit_count int)` with UNION branches for new web orders, ShopSite sync completed, Integra sync completed, inventory discrepancy found, product pushed from Integra to pipeline, and order fulfillment events.
   - Acceptance: Views and RPC return rows in Supabase SQL editor for admin/staff auth.

2. **Update dashboard stats hook types and fetches**
   - File: `hooks/use-dashboard-stats.ts`
   - Changes: Add `OrderStats` and `InventoryReconciliationStats` interfaces; fetch four views in `Promise.all`; return `orderStats` and `inventoryStats`.
   - Key types:
     ```ts
     interface OrderStats {
       today_order_count: number;
       today_sales: number;
       open_orders: number;
       unpaid_orders: number;
       ready_for_pickup: number;
       today_register_orders: number;
       today_web_orders: number;
     }

     interface InventoryReconciliationStats {
       open_issues: number;
       register_only_products: number;
       price_mismatches: number;
       quantity_mismatches: number;
       last_issue_created_at: string | null;
     }
     ```
   - Acceptance: Existing consumers keep working; dashboard handles missing/null stats safely.

3. **Add manager-facing metric cards**
   - File: `components/admin/dashboard/admin-dashboard-view.tsx`
   - Changes: Add cards for Today’s Sales, Open Orders, Ready for Pickup, Unpaid Orders, Inventory Issues, Register-only Products; link cards to `/admin/orders` and `/admin/inventory` filtered views where possible.
   - Acceptance: Dashboard first row/section includes store-manager metrics, not just product/scraper metrics.

4. **Extend recent activity UI type support**
   - Files: `hooks/use-recent-activity.ts`, `components/admin/dashboard/recent-activity-feed.tsx`
   - Changes: Add activity types such as `inventory`, `integration`, and `fulfillment` or map new DB `type` values to existing `system/order/product/pipeline`; add icons if new types are used.
   - Acceptance: New activity rows render with icons/status styles and valid links.

5. **Validation**
   - SQL: Query both new dashboard views and `get_dashboard_recent_activity(10)` after inserting sample order, sync run, event, and reconciliation row.
   - UI: Load admin dashboard and verify no client errors, loading states still work, and links navigate correctly.
   - Regression: Existing product/scraper stats still appear.

**PR 6 files**
- New: `supabase/migrations/YYYYMMDDHHMMSS_order_inventory_dashboard_views.sql`
- Modified: `hooks/use-dashboard-stats.ts`, `hooks/use-recent-activity.ts`, `components/admin/dashboard/admin-dashboard-view.tsx`, `components/admin/dashboard/recent-activity-feed.tsx`
- Optional modified: `components/admin/dashboard/metric-card.tsx` only if currency formatting/link support is needed.

**PR 6 risks / edge cases**
- `dashboard_inventory_reconciliation_stats` depends on PR 4 migration; PR 6 must not merge before PR 4.
- Current `Activity.type` union is narrow; DB function and TS hook must agree or UI falls back to system icon.
- `payment_status` values are enum-based now; use `unpaid`/`authorized`, not legacy `pending`/`processing` payment statuses.
- Dashboard views with no rows must still return one row with zeros via aggregate behavior.

## Files to Modify
- `scripts/sync-shopsite-orders.ts` - PR 3 ShopSite sync run/source record writes.
- `lib/admin/migration/order-sync.ts` - PR 3 ShopSite source payload helpers.
- `lib/admin/integra-sync.ts` - PR 4 durable reconciliation service and onboarding traceability.
- `lib/admin/register-sync.ts` - PR 4 export reusable plan/change types and stock-status helper.
- `app/admin/tools/integra-sync/actions.ts` - PR 4 actions return sync run IDs and push issue IDs.
- `app/admin/tools/integra-sync/SyncClient.tsx` - PR 4 minimal durable result UI/link.
- `hooks/use-dashboard-stats.ts` - PR 6 fetch order/inventory dashboard stats.
- `hooks/use-recent-activity.ts` - PR 6 activity type updates.
- `components/admin/dashboard/admin-dashboard-view.tsx` - PR 6 new dashboard cards.
- `components/admin/dashboard/recent-activity-feed.tsx` - PR 6 render new activity types.

## New Files
- `supabase/migrations/YYYYMMDDHHMMSS_order_source_records_sync_run_fk.sql` - optional PR 3 FK hardening.
- `supabase/migrations/YYYYMMDDHHMMSS_inventory_reconciliation.sql` - PR 4 reconciliation table/enums/RLS.
- `lib/admin/inventory/types.ts` - PR 5 inventory UI/data types.
- `lib/admin/inventory/queries.ts` - PR 5 inventory dashboard/list/detail queries.
- `lib/admin/inventory/mutations.ts` - PR 5 issue status/link/push mutations.
- `app/admin/inventory/page.tsx` - PR 5 inventory dashboard route.
- `app/admin/inventory/sync-runs/page.tsx` - PR 5 sync run list route.
- `app/admin/inventory/sync-runs/[id]/page.tsx` - PR 5 sync run detail route.
- `app/admin/inventory/actions.ts` - PR 5 server action wrappers.
- `components/admin/inventory/*` - PR 5 inventory dashboard, tables, badges, actions.
- `supabase/migrations/YYYYMMDDHHMMSS_order_inventory_dashboard_views.sql` - PR 6 dashboard views/recent activity function update.

## Dependencies
- PR 3 depends on PR 1 tables/columns: `integration_sync_runs`, `order_source_records`, `order_events`, `orders.source_type`, `orders.external_order_id`.
- PR 4 depends on PR 1 `integration_sync_runs` and existing `products_ingestion` pipeline statuses.
- PR 5 depends on PR 4 `inventory_reconciliation_items` and PR 1 `integration_sync_runs`.
- PR 6 depends on PR 1 and PR 4; recent activity also benefits from PR 3/PR 5 events/status updates.

## Risks
- Timestamped migrations must be ordered so PR 4 lands before PR 6 dashboard inventory views.
- Supabase generated types should be regenerated after PR 4 and PR 6 migrations, or local types must be updated manually in the same PR.
- Avoid client-side DB access in new inventory components; all reads/mutations should go through server components/actions.
- Avoid hard-deleting or overwriting financial/source evidence; source records and order events are append/upsert evidence trails.
- Reconciliation duplicate SKU detection conflicts with current parser dedupe behavior; implementation must decide whether to preserve raw rows.
- Large catalogs/sync files require batched DB reads and server pagination.
