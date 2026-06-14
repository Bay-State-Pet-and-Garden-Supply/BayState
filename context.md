# Code Context: Pipeline Imported Tab — "Run" / "Start Extraction" Flow

## Files Retrieved

1. **`apps/web/app/admin/pipeline/page.tsx`** (lines 1-100) — Main pipeline page (server component). Default stage is `'imported'`. Fetches products by stage via `getProductsByStage()`, passes `PipelineClient` props.

2. **`apps/web/components/admin/pipeline/PipelineClient.tsx`** (lines 1-1761) — Main orchestrator. Renders `StageTabs`, switches content view by `currentStage`. For `imported`, renders `ImportedResultsView`.

3. **`apps/web/components/admin/pipeline/ImportedResultsView.tsx`** (lines 1-610) — Imported tab UI. Two-column layout: left sidebar (cohort list via `PipelineSidebarTable`), right area (management panels). Sub-components: `ManagementPanel` (single cohort), `BulkManagementPanel` (multi-cohort).

4. **`apps/web/components/admin/pipeline/management/ManagementPanel.tsx`** (lines 1-250) — Right sidebar for a single cohort in Imported tab. Contains the **"Start Extraction"** button.

5. **`apps/web/components/admin/pipeline/management/BulkManagementPanel.tsx`** (lines 1-200) — Right sidebar for multi-cohort selection. Contains **"Start Bulk Extraction"** button.

6. **`apps/web/components/admin/pipeline/StageTabs.tsx`** (lines 1-80) — Tab bar. Tabs: imported, extracting, processed, grouping, merging, reviewing, publishing, failed, needs_attention.

7. **`apps/web/components/admin/pipeline/FloatingActionsBar.tsx`** (lines 1-200) — Bulk actions bar. **NOT shown for `imported` stage** (see `PipelineClient.tsx` line ~1700: `currentStage !== "imported"`).

8. **`apps/web/app/api/admin/pipeline/bulk/route.ts`** (lines 1-110) — `POST /api/admin/pipeline/bulk`. The single API endpoint called when clicking "Start Extraction". Validates status transition, calls `bulkUpdateStatus()`.

9. **`apps/web/lib/pipeline.ts`** (lines 845-945) — `bulkUpdateStatus()` function. Fetches current products, validates transitions (via `validateTransition` from `core.ts`), updates `products_ingestion.pipeline_status` to `'extracting'`, clears `exported_at`, logs to audit.

10. **`apps/web/lib/pipeline/core.ts`** (lines 1-50) — Status transition state machine. `imported → extracting` is a valid transition.

11. **`apps/web/lib/pipeline/types.ts`** (lines 1-380) — Pipeline types, `STAGE_CONFIG`, `PERSISTED_PIPELINE_STATUSES`, `PIPELINE_TABS`. Imported tab label: **"Imported"**, description: *"New products waiting for brand assignment, source setup, or extraction."*

12. **`apps/web/app/api/admin/pipeline/scrape/route.ts`** (lines 1-20) — **DEPRECATED** (410 Gone). Returns error: *"Manual scraper selection has been replaced by the automated Source Cascade."* Only remaining caller is `scraper-network-dashboard.tsx` (a separate runner admin page, not the main pipeline UI).

13. **`apps/web/app/admin/pipeline/batch-actions.ts`** (lines 1-95) — Server actions `updateProductsBatch()` and `updateCohortBatch()` for brand assignment from Imported tab.

14. **`apps/web/app/api/admin/brands/[id]/source-cascade/route.ts`** (lines 1-200) — `GET /api/admin/brands/{id}/source-cascade` — Polled by `ManagementPanel` to check if cascade is configured (enables the "Start Extraction" button).

15. **`apps/web/lib/approved-sources/source-plan.ts`** (lines 1-550) — `buildApprovedSourcePlans()` builds per-UPC source plans using brand sources from `brand_sources` table. Used by the scraper coordinator (not directly by the "Start Extraction" button).

16. **`apps/web/components/admin/pipeline/ActiveEnrichmentsTab.tsx`** (lines 1-170) — Extracting tab view. Shows active enrichment jobs. Uses `useJobSubscription` for realtime.

17. **`apps/web/app/api/admin/pipeline/runs/route.ts`** (lines 1-250) — `GET /api/admin/pipeline/runs`. Aggregates consolidation and enrichment runs. Legacy enrichment runs still shown from `enrichment_jobs` table.

## Key Code

### What the Imported tab contains

The Imported tab shows **products grouped into cohorts/batches** (from `products_ingestion` table). Each product is a `PipelineProduct` with `upc`, `input` (raw data), `sources`, `consolidated`, `cohort_id`, and `pipeline_status`. The UI organizes them by cohort. Products in `pipeline_status = 'imported'` or `'awaiting_brand'` appear here.

### Actions available in Imported tab

| Action | Where | What it calls |
|--------|-------|--------------|
| **Import Integra** (CSV) | Sidebar button | `IntegraImportDialog` |
| **Add Product** (manual) | Sidebar button | `ManualAddProductDialog` |
| **Start Extraction** | `ManagementPanel` (single cohort) | `POST /api/admin/pipeline/bulk` |
| **Start Bulk Extraction** | `BulkManagementPanel` (multi-cohort) | `POST /api/admin/pipeline/bulk` |
| **Split & Assign Brand** | Bottom bar (selected products) | `POST /api/admin/pipeline/bulk/brand` |
| **Edit Batch** | Cohort accordion + sidebar | `CohortEditDialog` |
| **Assign Brand** | `CohortBrandPicker` in sidebar | `updateCohortBatch()` / `updateProductsBatch()` server actions |

### The "Start Extraction" call chain (ManagementPanel, lines 65-108)

```
ManagementPanel.handleStartExtraction()
  │
  ├─ Checks: brand assigned? brand.source_cascade_configured_at set?
  │    (button disabled if not configured)
  │
  ├─ POST /api/admin/pipeline/bulk
  │    Body: { upcs: [...], toStatus: "extracting", resetResults: true }
  │
  ├─ app/api/admin/pipeline/bulk/route.ts
  │    ├─ Validates auth
  │    ├─ Validates toStatus ∈ PERSISTED_PIPELINE_STATUSES
  │    ├─ Calls bulkUpdateStatus(upcs, 'extracting', userId, resetResults=true)
  │         │
  │         └─ lib/pipeline.ts:bulkUpdateStatus()
  │              ├─ Fetches current products
  │              ├─ Validates transitions (imported → extracting ✓)
  │              ├─ UPDATE products_ingestion
  │              │    SET pipeline_status = 'extracting',
  │              │        updated_at = NOW(),
  │              │        exported_at = NULL
  │              │    WHERE upc IN (...)
  │              ├─ (resetResults=true but target≠imported/processed → no data clear)
  │              └─ Logs audit entry
  │
  └─ UI: toast("Extraction started"), onRefresh(), products disappear from Imported tab
```

### What the "Start Extraction" button does NOT call

- **NOT** `POST /api/admin/pipeline/scrape` — This endpoint is deprecated (returns 410 Gone). Its only remaining caller is `scraper-network-dashboard.tsx` (the Scraper Network Dashboard under `/admin/pipeline/runners/scraper-network`), which is a separate runner operator/page that the main pipeline Imported tab never reaches.
- **NOT** `POST /api/admin/enrichment/jobs` — This route directory exists but is **empty** (no route handler). The deprecated `/pipeline/scrape` endpoint references it as the replacement, but it's not implemented.
- **NOT** `POST /api/admin/consolidation/submit` — That's the "Consolidate" button from the Processed/Groups tab.

### Cascade readiness check

`ManagementPanel` checks cascade readiness _independently_ of the bulk action:

```
GET /api/admin/brands/{brandId}/source-cascade
  → checks brands.source_cascade_configured_at is set
  → checks at least one enabled distributor source exists
  → returns { configured: true/false }
```

This is purely a **frontend gate** — the "Start Extraction" button is disabled if cascade is not configured. The bulk API itself does NOT validate cascade readiness; it just changes status.

### What happens after status changes to 'extracting'

The `PipelineClient` detects `currentStage === 'extracting'` and renders `ActiveEnrichmentsTab` instead of `ImportedResultsView`. The extracting tab shows:
- Active/queued enrichment jobs from the `enrichment_jobs` table
- A message: *"Products are now extracted through the automated source cascade. Active extraction runs are tracked per-source, not as batch jobs."*

**However**, the "Start Extraction" button in the ManagementPanel **does not create enrichment jobs or trigger any actual scraping**. It only changes `pipeline_status` to `'extracting'`. The actual extraction is picked up by the scraper runner coordinator, which polls for products in `extracting` status and uses `buildApprovedSourcePlans()` (from `lib/approved-sources/source-plan.ts`) to create source plans from the brand's configured cascade.

### The deprecated (old) enrichment pipeline

The old flow was:
1. User clicked "Scrape" or similar → `POST /api/admin/pipeline/scrape` with `{ upcs, scrapers }`
2. Server created an `enrichment_jobs` + `enrichment_attempts` row
3. Scraper runner claimed the job via heartbeat/progress protocol
4. Runner scraped the configured scrapers
5. Runner posted results back to the callback

This whole flow is now **deprecated**. The `/api/admin/pipeline/scrape` endpoint returns 410 Gone. The old `enrichment_jobs` table is still used for display in the Extracting tab via `ActiveEnrichmentsTab` + `useJobSubscription`, and the `runs/route.ts` still aggregates them for the monitoring views.

## Architecture

```
User clicks "Start Extraction" on Imported tab
         │
         ▼
  ManagementPanel (single cohort) or BulkManagementPanel (multi-cohort)
         │
         ├── Checks cascade config via GET /api/admin/brands/{id}/source-cascade
         │     (This is just a frontend UX gate — the button is disabled if false)
         │
         └── POST /api/admin/pipeline/bulk { upcs, toStatus: "extracting", resetResults: true }
               │
               ▼
         app/api/admin/pipeline/bulk/route.ts
               │
               └── bulkUpdateStatus() in lib/pipeline.ts
                     │
                     └── UPDATE products_ingestion SET pipeline_status = 'extracting'
                           │
                           ▼
                     Products now visible in Extracting tab (ActiveEnrichmentsTab)
                     Actual extraction: Scraper runner polls/claims these products
                     via the coordinator mechanism (heartbeat, source plans)
```

The scraper runner actually processes extracting products using:
1. `lib/pipeline-scraping.ts` — builds `ScrapeOptions` and calls `buildApprovedSourcePlans()`
2. `lib/approved-sources/source-plan.ts` — builds per-UPC source plans from `brand_sources` table
3. `lib/approved-sources/source-cascade.ts` — determines which sources are configured, untried, or errored
4. Runner scrapes via crawl4ai/Playwright and posts results

## Start Here

Open **`apps/web/components/admin/pipeline/management/ManagementPanel.tsx`** — this is where the "Start Extraction" button lives for the Imported tab. Follow the `handleStartExtraction` function (lines 65-108) to trace the exact API call.

## Key Findings

1. **The "Start Extraction" button only calls `POST /api/admin/pipeline/bulk` with `toStatus: 'extracting'`** — it simply transitions the pipeline status. It does NOT call the old scrape endpoint.

2. **The old `POST /api/admin/pipeline/scrape` is fully deprecated (410 Gone)** and only still called from the Scraper Network Dashboard (`scraper-network-dashboard.tsx`), which is a separate runner admin/monitoring page under `/admin/pipeline/runners/scraper-network`. The main pipeline Imported tab never hits this endpoint.

3. **The `POST /api/admin/enrichment/jobs` route directory exists but is completely empty** — no route handler is defined. The deprecated scrape endpoint's error message references it, but it was never implemented.

4. **There is a gap**: The "Start Extraction" button merely changes `pipeline_status` to `'extracting'`. It does NOT directly create enrichment jobs or queue scraping. The actual extraction depends on the scraper runner coordinator mechanism to pick up these products. If the scraper runner coordinator is not working or not connected, products will appear stuck in `extracting` status.

5. **The cascade readiness check** (`GET /api/admin/brands/{id}/source-cascade`) is a frontend-only UX gate. The bulk API does not re-validate cascade readiness — it just changes status.
