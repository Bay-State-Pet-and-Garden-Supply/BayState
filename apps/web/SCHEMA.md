# Bay State Web Schema Guide

Canonical schema reference for `apps/web`.

## Principles
- `products` is the canonical storefront catalog.
- `products_ingestion` is the pipeline workspace and must stay separate.
- External systems belong behind adapter tables, not in canonical product columns.
- ShopSite sync state lives in `shopsite_product_sync`, not in storefront reads.
- `integration_sync_runs` is the canonical sync-run ledger.

## Active schema layers

### 1. Canonical storefront core
Primary customer-facing and admin-managed tables.

| Table | Role | Notes |
|---|---|---|
| `products` | Canonical product catalog | Keep active commerce fields here: `price`, `stock_status`, `quantity`, `weight`, `images`, `gtin`, `published_at`, `upc`, etc. |
| `brands` | Canonical brand dimension | Includes brand identity and domain metadata. |
| `categories` | Canonical taxonomy tree | Department/category hierarchy for navigation. |
| `product_categories` | Product-category assignments | `relationship_type` distinguishes canonical vs secondary vs collection. |
| `pet_types` | Canonical pet taxonomy | Structural reference data. |
| `product_pet_types` | Product-pet links | Supports personalization and filters. |
| `facet_definitions` | Canonical filter definitions | Public-facing faceted navigation vocabulary. |
| `facet_values` | Canonical filter values | Normalized value dictionary per definition. |
| `product_facets` | Product-facet assignments | Product filter membership. |
| `product_storefront_settings` | Storefront-only flags | `is_featured`, `pickup_only`. |
| `product_variants` | Variant model (partial) | Keep in baseline even though storefront currently reads price from `products`. |
| `product_options` | Variant option names | Part of variant model. |
| `product_option_values` | Variant option values | Part of variant model. |
| `product_images` | Durable image records | Supports richer media than `products.images`. |
| `product_reviews` | Reviews | Live admin usage. |
| `services` | Non-product catalog items | Used in orders and settings. |
| `site_settings` | Operational site settings | Prefer this over ad hoc settings tables. |
| `orders`, `order_items`, `order_events` | Order system | Canonical order history and audit trail. |

### 2. Pipeline / enrichment workspace
Operational data that should not be merged into canonical storefront rows.

| Table | Role |
|---|---|
| `products_ingestion` | Raw/imported/consolidated pipeline record per UPC |
| `pipeline_audit_log` | Pipeline status change audit trail |
| `pipeline_retry_queue` | Retry orchestration |
| `enrichment_jobs`, `enrichment_attempts`, `enrichment_targets` | Enrichment orchestration |
| `consolidation_review_requests` | Consolidation review workflow |
| `cohort_batches`, `cohort_members` | Pipeline grouping / batching |
| `b2b_feeds`, `b2b_sync_jobs` | Supplier feed adapters |

### 3. External adapter / sync layer
Legacy and integration-specific records.

| Table | Role | Notes |
|---|---|---|
| `external_sources` | Canonical registry of external systems | ShopSite, Integra, web, manual import, generic import. |
| `integration_sync_runs` | Canonical sync ledger | Replaces `migration_log` for active sync tracking. |
| `shopsite_product_sync` | ShopSite product sync state | Holds pending/synced/failed state for canonical products. |
| `order_source_records` | Raw/normalized source payloads for orders | Preserves adapter payloads. |
| `legacy_redirects` | Legacy URL redirects | Keep as adapter concern. |
| `orders_ingestion` | Legacy order import staging | Review but keep adapter boundary. |
| `inventory_reconciliation_items` | Integra reconciliation issues | Depends on `integration_sync_runs`. |

## Deprecated / legacy behavior
- `products.shopsite_sync_status`, `products.shopsite_last_synced_at`, and `products.shopsite_last_sync_error` are legacy compatibility columns.
- New code should read/write ShopSite sync state through `shopsite_product_sync`.
- `migration_log` is legacy. New sync writes belong in `integration_sync_runs`.

## Table classification decisions

### Keep core
- `products`
- `brands`
- `categories`
- `product_categories`
- `pet_types`
- `product_pet_types`
- `facet_definitions`
- `facet_values`
- `product_facets`
- `product_storefront_settings`
- `product_variants`
- `product_options`
- `product_option_values`
- `product_images`
- `product_reviews`
- `services`
- `site_settings`
- `orders`
- `order_items`
- `order_events`

### Keep pipeline
- `products_ingestion`
- `pipeline_audit_log`
- `pipeline_retry_queue`
- `enrichment_jobs`
- `enrichment_attempts`
- `enrichment_targets`
- `consolidation_review_requests`
- `cohort_batches`
- `cohort_members`
- `b2b_feeds`
- `b2b_sync_jobs`

### Keep external adapter
- `external_sources`
- `integration_sync_runs`
- `shopsite_product_sync`
- `order_source_records`
- `legacy_redirects`
- `orders_ingestion`
- `inventory_reconciliation_items`

### Review / likely merge
- `app_settings` → prefer `site_settings`
- `inventory_items`
- `price_history`
- `recently_viewed`
- `related_products`
- `pages`

### Drop candidates
- `product_answers`
- `product_questions`
- `product_attributes`
- `product_tags`
- `tags`
- `product_types`
- `product_scraped_sites`
- `review_helpful_votes`
- `service_costs`
- `subscription_items`
- `subscription_suggestions`
- scraper-config legacy tables already replaced or superseded by current schema work

## Pipeline status
Canonical persisted values for `products_ingestion.pipeline_status`:

```ts
['imported', 'awaiting_brand', 'extracting', 'processed', 'merging', 'reviewing', 'publishing', 'failed']
```

Do not introduce alternate names in application code or migrations.

## Seed expectations
Local bootstrap should provide at minimum:
- 12+ products
- 6+ brands
- 8+ categories
- 4+ services
- 3+ site settings
- 3+ facet definitions
- 10+ facet values
- 3+ pet types
- 1+ featured product
- 1+ pickup-only product
- sample orders for admin testing

## Baseline squash (applied)
The 213-item migration chain has been squashed into a single cumulative baseline:

| File | Purpose |
|---|---|
| `migrations/20250101000000_baseline.sql` | Cumulative schema: tables, enums, functions, views, RLS, triggers, seed taxonomy |
| `migrations/20260518093000_external_sources_and_shopsite_sync.sql` | Follow-up: `external_sources`, `shopsite_product_sync`, RPC updates |

213 historical migrations have been archived to `supabase/migrations_archive/`. Do not restore them — they are superseded by the baseline. If you need to inspect a specific migration for context, the archive preserves filenames unchanged.

## Required safety steps before destructive schema work
1. Take a full `pg_dump` of production.
2. Back up: `products`, `products_ingestion`, `brands`, `categories`, `product_categories`, `facet_*`, `orders*`, `integration_sync_runs`, `inventory_reconciliation_items`, `scraper_configs`, `scraper_credentials`, `cohort_*`.
3. Validate `db:reset`, `local:verify`, tests, and typecheck before any destructive migration.
4. Prefer additive-safe migrations over destructive DDL.
