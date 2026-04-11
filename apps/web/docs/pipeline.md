# Pipeline Documentation

This document describes the current Bay State ingestion pipeline used by the admin workflow in `apps/web`.

## Overview

The pipeline separates **persisted ingestion statuses** from **UI workflow stages**:

| Kind | Values | Purpose |
|------|--------|---------|
| Persisted statuses | `imported`, `scraped`, `finalized`, `failed` | Durable state stored in `products_ingestion.pipeline_status` |
| UI stages | `imported`, `scraping`, `scraped`, `consolidating`, `finalized`, `export`, `failed` | Admin tabs shown in the pipeline UI |

The key rule is:

- **`finalized`** is the explicit review state.
- **`export`** is a derived workflow tab for finalized products that already exist in the storefront `products` table.
- **`scraping`** and **`consolidating`** are derived UI stages based on active jobs, not stored statuses.

Legacy `stage=finalizing` links are normalized to `finalized`, and legacy `stage=published` links are normalized to `export`.

## Lifecycle

### 1. Imported

Products enter the pipeline as `imported`.

### 2. Scraping / Scraped

When a product has an active scrape job, the UI shows it in `scraping`.

After scrape results are written and no scrape job is active, the persisted status remains `scraped` and the UI shows `scraped`.

### 3. Consolidating / Finalized

AI consolidation works against `scraped` products. While a consolidation batch is active, the UI shows `consolidating`.

When consolidation is complete, the product moves to persisted status `finalized`. This is the manual review and approval queue.

### 4. Export

Publishing to the storefront does **not** create a new ingestion status.

When `/api/admin/pipeline/publish` succeeds, the product is synced into the storefront `products` table and the ingestion row remains `finalized`.

The admin UI then derives the product into the `export` tab based on storefront presence (`products.sku` with `published_at IS NOT NULL`), so it leaves the `finalized` review queue without introducing a separate persisted pipeline status.

### 5. Failed

Failed products remain in persisted status `failed` until retried or corrected.

## Transition Rules

Canonical persisted transitions:

- `imported -> scraped`
- `scraped -> finalized`
- `scraped -> imported`
- `finalized -> scraped`
- `failed -> imported`

Same-status writes are allowed for idempotency.

Direct writes to `published` are intentionally blocked because `published` is no longer a valid persisted pipeline status.

## Admin UI Model

The admin pipeline page uses the following tabs:

1. `imported`
2. `scraping`
3. `scraped`
4. `consolidating`
5. `finalized`
6. `export`
7. `failed`

Hydration rules:

- `imported`, `scraped`, and `failed` load directly from `products_ingestion.pipeline_status`
- `finalized` loads finalized ingestion rows that are **not** yet present in the storefront
- `export` loads finalized ingestion rows that **are** already present in the storefront
- `scraping` and `consolidating` are derived from active scrape/consolidation work

## Publishing Rules

These routes reject direct attempts to set `published` as a pipeline status:

- `PATCH /api/admin/pipeline/[sku]`
- `POST /api/admin/pipeline`
- `POST /api/admin/pipeline/bulk`
- `POST /api/admin/pipeline/transition`

Use:

- `POST /api/admin/pipeline/publish`

Publish and re-publish operations must originate from finalized products. The storefront row is the durable publication record.

## Export Behavior

ShopSite export data is sourced from the derived export queue.

- `loadStorefrontShopSiteExport()` reads `pipeline_export_queue`
- `pipeline_export_queue` contains finalized ingestion rows that already exist in the storefront
- `products_published` projects those export-queue rows into the storefront-ready shape used by downstream export workflows

This keeps exports aligned with actual storefront presence instead of duplicating publication state in `products_ingestion.pipeline_status`.

## Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/pipeline` | `GET` | List pipeline products by workflow stage or persisted status |
| `/api/admin/pipeline/counts` | `GET` | Get status counts for pipeline tabs |
| `/api/admin/pipeline/[sku]` | `GET` | Load a single pipeline product |
| `/api/admin/pipeline/[sku]` | `PATCH` | Update pipeline product data |
| `/api/admin/pipeline/bulk` | `POST` | Bulk persisted-status updates except invalid legacy `published` writes |
| `/api/admin/pipeline/transition` | `POST` | Transition persisted statuses |
| `/api/admin/pipeline/publish` | `POST` | Publish finalized products to the storefront `products` table |

## Database Notes

`products_ingestion.pipeline_status` is the source of truth for ingestion lifecycle state.

`pipeline_finalized_review` and `pipeline_export_queue` are derived views that split finalized ingestion rows by storefront presence.

`products_published` remains the convenience storefront-export view, but it is now sourced from `pipeline_export_queue` rather than a persisted `published` ingestion status.
