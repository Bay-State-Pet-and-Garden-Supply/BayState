# Pipeline Documentation

This document describes the current Bay State admin ingestion pipeline in `apps/web`.

## Overview

The pipeline now uses a **single canonical workflow model**. `products_ingestion.pipeline_status` and the admin UI tabs use the same states:

1. `imported`
2. `scraping`
3. `scraped`
4. `consolidating`
5. `finalizing`
6. `exporting`
7. `failed`

There is no persisted `published` or `finalized` status anymore. Completed exports stay in `products_ingestion` for audit, but leave active pipeline views by setting `exported_at`.

## Workflow

### 1. Imported

Products enter the pipeline as `imported`.

### 2. Scraping

Submitting scrape work moves products into `scraping`.

When scrape work completes successfully, products move to `scraped`. Failed scrape jobs move still-scraping products to `failed`.

### 3. Consolidating

Submitting AI consolidation work moves products into `consolidating`.

When consolidation results are applied successfully, products move to `finalizing`.

### 4. Finalizing

`finalizing` is the manual review and approval workspace.

This is where staff confirm the consolidated record, make final edits, and approve the product for export workflows.

### 5. Exporting

Publishing from `finalizing` syncs the product into the storefront `products` table **and** moves the ingestion row into `exporting`.

`exporting` is the multiselect export queue. ShopSite upload/export actions operate from this stage.

When the terminal downstream export succeeds, the row stays in `products_ingestion` but gets `exported_at` set so it disappears from active pipeline tabs.

### 6. Failed

Failed products remain in `failed` until retried or manually corrected.

## Transition Rules

Canonical transitions:

- `imported -> scraping`
- `scraping -> scraped | failed | imported`
- `scraped -> consolidating | finalizing | imported | failed`
- `consolidating -> finalizing | scraped | failed`
- `finalizing -> exporting | scraped | failed`
- `exporting -> finalizing | failed`
- `failed -> imported`

Same-state writes are allowed for idempotency.

Legacy `published` writes are blocked. Legacy stage aliases are normalized at the route boundary:

- `finalized -> finalizing`
- `export -> exporting`
- `published -> exporting`

## Admin UI Model

The admin pipeline tabs match the stored workflow exactly:

1. `imported`
2. `scraping`
3. `scraped`
4. `consolidating`
5. `finalizing`
6. `exporting`
7. `failed`

Special behavior:

- `scraping` and `consolidating` now have real persisted counts instead of derived zero placeholders.
- `finalizing` remains the single-item review workspace.
- `exporting` is the dedicated multiselect export workspace.

## Publishing and Exporting

### Publish to storefront

- `POST /api/admin/pipeline/publish`
- Requires the product to be in `finalizing`
- Creates or updates the storefront `products` row
- Moves the ingestion row to `exporting`

### Active export queue

- `loadStorefrontShopSiteExport()` reads directly from `products_ingestion`
- Only rows with `pipeline_status = 'exporting'` and `exported_at IS NULL` are included

### Terminal export completion

- `POST /api/admin/pipeline/upload-shopsite`
- On success, marks selected/exported rows with `exported_at`
- Exported rows leave active pipeline views but remain queryable for audit/history

## Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/pipeline` | `GET` | List products by canonical workflow stage or persisted status |
| `/api/admin/pipeline/counts` | `GET` | Return counts for all workflow states |
| `/api/admin/pipeline/[sku]` | `GET` | Load a single pipeline product |
| `/api/admin/pipeline/[sku]` | `PATCH` | Update pipeline product data or workflow status |
| `/api/admin/pipeline/bulk` | `POST` | Bulk workflow-state updates |
| `/api/admin/pipeline/transition` | `POST` | Transition a product between valid workflow states |
| `/api/admin/pipeline/publish` | `POST` | Approve a finalizing product and move it into exporting |
| `/api/admin/pipeline/export` | `GET` | Download an XLSX export for a workflow status |
| `/api/admin/pipeline/export-xml` | `GET` | Download ShopSite XML for the active exporting queue |
| `/api/admin/pipeline/export-zip` | `GET` | Download ShopSite ZIP assets for the active exporting queue |
| `/api/admin/pipeline/upload-shopsite` | `POST` | Complete terminal ShopSite upload and retire exported rows from active views |

## Database Notes

- `products_ingestion.pipeline_status` is the source of truth for workflow state.
- `products_ingestion.exported_at` records terminal export completion.
- `pipeline_finalizing_queue` exposes active `finalizing` rows.
- `pipeline_finalized_review` is now a compatibility alias for `pipeline_finalizing_queue`.
- `pipeline_export_queue` exposes active `exporting` rows where `exported_at IS NULL`.
- `products_published` is a legacy compatibility view over completed exported rows retained in ingestion audit history.
