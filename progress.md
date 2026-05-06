# Progress Update

## Pipeline Data Flow Investigation — Complete

Traced the full ConsolidationResult → FinalizationDraft → products table publish flow.

### Key Finding: `category` and `confidence_score` are dropped when finalization draft is saved

The `buildConsolidatedPayloadFromDraft()` function (finalization-draft.ts:261-284) intentionally omits `category` and `confidence_score` from the payload that gets written back to `products_ingestion.consolidated` on PATCH save. Since the PATCH handler ([sku]/route.ts) replaces the entire consolidated jsonb, any fields not in the payload are lost.

- `category`: Written during consolidation batch apply, but dropped on first draft save. Publication skips it (sync call is commented out).
- `confidence_score`: Stored in both the consolidated jsonb AND the dedicated `confidence_score` column. Dropped from jsonb on draft save, but survives in the column.
- `brand` (text): Written to consolidated jsonb. Dropped on draft save (only `brand_id` persists).
- `description`, `long_description`, `search_keywords`: Survive all stages. Written as nullable text to products table.
- `product_on_pages`: Survives, transformed via `parseShopSitePages` to `shopsite_pages` jsonb.

Report written to `scout_pipeline.md`.
