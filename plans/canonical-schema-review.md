# Review: Canonical Schema First, ShopSite as Legacy Adapter

**Reviewer:** Antigravity (Claude Opus 4.6)  
**Date:** 2026-05-16  
**Verdict:** ✅ **Approve with amendments**

---

## Overall Assessment

The pitch is **directionally correct and well-argued.** The three-layer architecture (canonical → pipeline → external adapter) is sound ecommerce engineering, and the codebase evidence overwhelmingly supports the claim that migration sprawl is causing real damage. I counted **213 migration files**, including two massive `remote_schema.sql` dumps (175KB and 40KB), three separate scraper-config migration attempts, a pipeline status enum that's been renamed/recreated at least six times, and tables being created in remote_schema that were supposedly dropped in earlier migrations.

The pitch earns its strongest marks on diagnosis. The prescription needs refinement in a few places.

---

## Answers to the 10 Review Questions

### 1. Does the proposed canonical schema overfit the current app, or is it flexible enough for the future storefront?

**It's well-balanced, with one concern.**

The proposed `products` table is lean and correct — `sku`, `slug`, `name`, `brand_id`, `canonical_category_id`, `status`, `visibility`. That's a solid canonical identity table.

However, the **current `products` table already has operational columns** that the pitch doesn't account for: `price`, `stock_status`, `quantity`, `low_stock_threshold`, `weight`, `images`, `gtin`, `availability`, `is_special_order`, `is_taxable`, `minimum_quantity`, `search_keywords`, `published_at`, `upc`. These are actively queried by the storefront ([products.ts L66-96](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/lib/products.ts#L66-L96)).

**Amendment:** The canonical `products` table should include these active commerce fields. Omitting them forces either:
- Storing price/stock/weight in `product_variants` only (which the current storefront doesn't query), or
- A breaking refactor of every storefront query on day one.

The proposed schema should list `price`, `compare_at_price`, `stock_status`, `quantity`, `weight`, `images`, `gtin`, `is_taxable`, `is_special_order`, and `published_at` as first-class `products` columns. These aren't ShopSite legacy — they're standard ecommerce fields.

---

### 2. Should `products` and `products_ingestion` remain separate?

**Yes. Strongly agree with the pitch.**

The evidence is overwhelming. `products_ingestion` is queried 50+ times across the codebase ([pipeline.ts](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/lib/pipeline.ts), [enrichment](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/lib/enrichment), [consolidation](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/lib/consolidation), etc.) with JSONB columns (`input`, `sources`, `consolidated`, `selected_images`, `image_candidates`) that would be toxic in a storefront table. The pipeline has its own status enum (`imported → extracting → processed → merging → reviewing → publishing → failed`), its own lifecycle, and its own RLS policy needs.

Merging these would create the exact junk-drawer table the pitch warns about.

**One note:** The current publish flow ([publish.ts](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/lib/pipeline/publish.ts)) already upserts from `products_ingestion` → `products`. That boundary is working. Keep it.

---

### 3. Should ShopSite fields ever be first-class canonical columns?

**Agree with the pitch: only real business concepts, not legacy field names.**

The current `products` table already has three ShopSite-specific columns:
- `shopsite_sync_status` 
- `shopsite_last_synced_at`
- `shopsite_last_sync_error`

These are queried in [products.ts L80-81](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/lib/products.ts#L80-L81), [pipeline/publish.ts](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/lib/pipeline/publish.ts), and the [upload-shopsite route](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/app/api/admin/pipeline/upload-shopsite/route.ts).

**Amendment:** These should be moved to a `shopsite_product_sync` table (or folded into the proposed `legacy_product_mappings`) during the baseline. They're sync metadata, not product identity. The storefront reads them but only for admin display — the customer-facing pages don't need sync status.

However, `is_special_order` and `pickup_only` (in `product_storefront_settings`) **are** real business concepts that happen to come from ShopSite. They should stay canonical.

---

### 4. Are `product_variants` mature enough to keep, or should they be staged behind admin readiness?

**Keep them, but document the gap.**

Code references are limited to:
- [database.types.ts](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/lib/supabase/database.types.ts) (auto-generated)
- [supabase.ts](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/types/supabase.ts) (types)
- [variants.ts](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/lib/admin/variants.ts) (admin library)

The storefront does **not** query `product_variants` directly — it reads `price` from the `products` table. The admin edit page references variants, so the table is needed, but the variant → storefront display path isn't wired up yet.

**Recommendation:** Keep in the baseline, mark as `KEEP_CORE (partial)`, and note that storefront variant display is a post-baseline feature.

---

### 5. Should `product_types` be dropped?

**Yes, drop it.**

Code search shows `product_types` referenced only in `database.types.ts` — that's auto-generated from the schema and doesn't count as active usage. The table was created in the `remote_schema.sql` dump ([line 628-633](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/supabase/migrations/20260513031718_remote_schema.sql#L628-L633)) and has no:
- Active queries
- Seed data
- FK dependencies from live tables
- Admin UI references

The `products` table already has a `product_type text` column that serves the same purpose without a join table.

**Verdict:** `DROP`. The text column on `products` is sufficient.

---

### 6. Should `migration_log` be renamed to `import_runs` or `external_sync_runs`?

**The codebase already has `integration_sync_runs`**, which is the de facto replacement. The `migration_log` table is referenced by:
- [history.test.ts](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/__tests__/lib/admin/migration/history.test.ts)
- [history.ts](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/lib/admin/migration/history.ts)
- [migration-history.tsx](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/components/admin/migration/migration-history.tsx)
- [sync-shopsite-products.ts](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/scripts/sync-shopsite-products.ts)
- [sync-shopsite-orders.ts](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/scripts/sync-shopsite-orders.ts)

**Amendment:** Don't rename — consolidate. The `integration_sync_runs` table ([integra-sync.ts L132-186](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/lib/admin/integra-sync.ts#L132-L186)) already handles Integra reconciliation with `source_type`, `source_system`, `sync_kind`, etc. That's a more mature and generic design. Migrate `migration_log` data into `integration_sync_runs` and deprecate the old table. The ShopSite sync scripts can be updated to use the same table.

---

### 7. Should external source adapter tables be added now or deferred?

**Add `external_sources` now. Defer the rest.**

The codebase already has the conceptual equivalent:
- `integration_sync_runs` (tracks sync operations)
- `inventory_reconciliation_items` (tracks per-SKU discrepancies)
- ShopSite export builder reads from `products_ingestion` + `brands`

Adding a full `external_product_records` + `legacy_product_mappings` + `legacy_url_redirects` schema now would be premature — there's no code that would use them yet.

**What to add now:**
- `external_sources` (minimal: `id`, `key`, `name`, `source_type`, `config`, `is_active`, `created_at`) — this replaces hardcoded `'shopsite'` / `'integra'` strings scattered through `integration_sync_runs`.

**What to defer:**
- `external_product_records`
- `legacy_product_mappings`
- `legacy_url_redirects` (note: `legacy_redirects` already exists in the schema from `remote_schema.sql`)

---

### 8. Should the baseline be one file or split into schema/RLS/functions/realtime?

**Split it. Agree with the pitch.**

The two `remote_schema.sql` files prove why single-file baselines are painful — the 175KB one is unreadable by humans and barely parseable by agents. The four-file split is correct:

```
baseline_schema.sql          (tables, enums, extensions, indexes, constraints)
baseline_rls.sql             (RLS enablement and policies)
baseline_functions_views.sql (functions, triggers, views, RPCs)
baseline_realtime.sql        (realtime publication setup)
```

**Additional recommendation:** Add a 5th file:

```
baseline_seed_taxonomy.sql   (facet definitions, facet values, categories, pet types)
```

The massive taxonomy seed migration ([20260509131500_seed_retail_taxonomy_and_pet_types.sql](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/supabase/migrations/20260509131500_seed_retail_taxonomy_and_pet_types.sql), 97KB) contains critical reference data that's neither schema nor seed-fixture. It defines the category tree, facet definitions, and pet type master list. Treating this as a schema-level baseline (run during `db:reset`) rather than a seed (run during `db:seed`) ensures agents always see the taxonomy as structural, not optional.

---

### 9. Does the seed strategy cover admin panel testing well enough?

**No. The current seed is dangerously thin.**

The [seed.sql](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/supabase/seed.sql) creates:
- 1 admin user
- 1 runner + 1 API key
- 3 brands (Wondercide, Catit, Fromm)
- 10 products (all $9.99, no descriptions, no images, no categories)
- No services
- No site settings
- No orders
- No pipeline/ingestion data
- No product_storefront_settings rows
- No product_categories rows

The [verification script](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/scripts/verify-local-bootstrap.ts) expects ≥12 products, ≥6 brands, ≥8 categories, ≥4 services, ≥3 site settings, ≥3 facet definitions, ≥10 facet values, ≥3 pet types, ≥1 featured product, and ≥1 pickup-only product. **The current seed fails at least 6 of these checks.**

**Required seed additions for baseline:**

| Seed module | Current state | Needed |
|---|---|---|
| `00-auth.sql` | ✅ Admin user + runner | OK |
| `01-taxonomy.sql` | ❌ Only 3 brands | ≥6 brands, ≥8 categories (linked to taxonomy), ≥3 pet types, facet defs/values |
| `02-products.sql` | ❌ 10 bare products | ≥12 products with descriptions, images, category links, storefront settings |
| `03-scraping.sql` | ❌ Empty | ≥2 scraper configs for pipeline testing |
| `04-orders.sql` | ❌ Empty | ≥2 orders with items for admin testing |
| `05-settings.sql` | ❌ Empty | ≥4 services, ≥3 site settings |

---

### 10. What production data must be backed up or transformed before any destructive change?

> [!CAUTION]
> This is the most critical operational question and the pitch doesn't address it specifically enough.

**Before any squash:**

1. **`products` table** — all production product rows (including SKUs, prices, stock status, images, slugs). This is the live catalog.
2. **`products_ingestion` table** — all pipeline state, JSONB payloads, selected images, consolidation results. This represents months of enrichment work.
3. **`brands` table** — all brand records with official domains, preferred domains, logo URLs.
4. **`categories` + `product_categories`** — the entire taxonomy tree and product-category assignments.
5. **`facet_definitions` + `facet_values` + `product_facets`** — faceted navigation data.
6. **`orders` + `order_items` + `order_events`** — all order history.
7. **`enrichment_jobs` + `enrichment_job_logs`** — recent enrichment history (or at minimum, counts and metadata for the dashboard views).
8. **`integration_sync_runs` + `inventory_reconciliation_items`** — Integra reconciliation history.
9. **`scraper_configs` + `scraper_credentials`** — scraper configuration (these are the production scraper definitions).
10. **`cohort_batches` + `cohort_members`** — cohort assignments used by the pipeline.

**Recommended approach:**
- Take a full `pg_dump` before any destructive migration
- Run the squash on a branch, test `db:reset` + `local:verify` + `build` + `typecheck`
- The baseline migration should be additive-safe: `CREATE TABLE IF NOT EXISTS`, not `DROP TABLE CASCADE`

---

## Additional Findings Not in the Pitch

### The ShopSite export builder is actually well-isolated

The [ShopSite export builder](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/lib/shopsite/export-builder.ts) reads from `products_ingestion` (not `products`), resolves brand names from `brands`, and maps to ShopSite XML format. This is already an adapter pattern — it just doesn't have its own database tables. The pitch's adapter layer would formalize what's already happening in code.

### `integration_sync_runs` is the pitch's `external_sources` in disguise

The existing `integration_sync_runs` table (used by [integra-sync.ts](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/lib/admin/integra-sync.ts)) already has `source_type`, `source_system`, `sync_kind`, `file_name`, `row_count`, `status`, and result tracking. This is 80% of what the pitch proposes as `import_runs`. Rather than creating parallel tables, the baseline should promote `integration_sync_runs` as the canonical sync tracking table and add `external_sources` as its foreign key parent.

### The pipeline status enum saga needs a hard stop

I found at least 6 migrations touching `pipeline_status`:
- `20260314120000_add_pipeline_status_new.sql`
- `20260314120001_rollback_pipeline_status_new.sql`
- `20260319120000_pipeline_five_stage.sql`
- `20260402000000_normalize_pipeline_status.sql`
- `20260402103000_cleanup_pipeline_status.sql`
- `20260514040000_migrate_pipeline_status_enum.sql`

The current canonical set is `imported | awaiting_brand | extracting | processed | merging | reviewing | publishing | failed` ([types.ts L11-20](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/lib/pipeline/types.ts#L11-L20)). The baseline must freeze this enum and include it verbatim. No more migration-driven enum evolution.

### Tables from `remote_schema.sql` that should be classified now

The 175KB remote_schema dump created many tables that the pitch's suspect list misses:

| Table | Evidence | Recommendation |
|---|---|---|
| `app_settings` | Created in remote_schema, no TS references outside database.types | `REVIEW` → likely merge into `site_settings` |
| `b2b_feeds` | Referenced only in `b2b/sync-service.ts` | `KEEP_PIPELINE` |
| `b2b_sync_jobs` | Referenced only in `b2b/sync-service.ts` | `KEEP_PIPELINE` |
| `consolidation_review_requests` | Active in consolidation service | `KEEP_PIPELINE` |
| `inventory_items` | Created in remote_schema, minimal references | `REVIEW` |
| `legacy_redirects` | Created in remote_schema, no TS references | `KEEP_EXTERNAL_ADAPTER` (rename to `legacy_url_redirects`) |
| `orders_ingestion` | Created in remote_schema, referenced in sync scripts | `KEEP_EXTERNAL_ADAPTER` |
| `pages` | Created in remote_schema, no TS references | `REVIEW` → likely `DROP` |
| `price_history` | Created in remote_schema, no TS references | `REVIEW` |
| `product_answers` | Created in remote_schema, no TS references | `DROP` |
| `product_attributes` | Created in remote_schema, no TS references | `DROP` (facets replace this) |
| `product_images` | Created in remote_schema, referenced in types but not queries | `KEEP_CORE` (needed for variants) |
| `product_option_values` | Created in remote_schema, no query references | `KEEP_CORE` (part of variant system) |
| `product_options` | Created in remote_schema, no query references | `KEEP_CORE` (part of variant system) |
| `product_questions` | Created in remote_schema, no TS references | `DROP` |
| `product_reviews` | Active in [reviews.ts](file:///c:/Users/thoma/OneDrive/Desktop/scripts/BayState/apps/web/lib/admin/reviews.ts) | `KEEP_CORE` |
| `product_scraped_sites` | Created in remote_schema, no TS references | `DROP` (replaced by enrichment_jobs) |
| `product_tags` + `tags` | Created in remote_schema, no TS references | `DROP` (facets replace this) |
| `recently_viewed` | Created in remote_schema, no TS references | `REVIEW` |
| `related_products` | Created in remote_schema, no TS references | `REVIEW` |
| `review_helpful_votes` | Created in remote_schema, no TS references | `DROP` |
| `scraper_config_test_skus` | Created in remote_schema, dropped later | `DROP` |
| `scraper_config_versions` | Created in remote_schema, dropped later | `DROP` |
| `scraper_selectors` | Created in remote_schema, dropped later | `DROP` |
| `scraper_workflow_steps` | Created in remote_schema, dropped later | `DROP` |
| `service_costs` | Created in remote_schema, no TS references | `DROP` |
| `subscription_items` | Created in remote_schema, no TS references | `DROP` |
| `subscription_suggestions` | Created in remote_schema, no TS references | `DROP` |

---

## Summary of Amendments

1. **Canonical `products` must include active commerce fields** (price, stock_status, quantity, weight, images, etc.) — not just identity columns.
2. **Move `shopsite_sync_status` columns** out of `products` into a sync-tracking table.
3. **Add only `external_sources`** now; defer the full adapter schema.
4. **Promote `integration_sync_runs`** as the canonical sync-run table instead of creating `import_runs`.
5. **Fix the seed** — current seed fails the verification script's own checks.
6. **Add a 5th baseline file** for taxonomy reference data (categories, facets, pet types).
7. **Classify 26+ tables** from the remote_schema dump that the pitch's suspect list missed.
8. **Freeze the pipeline status enum** at `imported | awaiting_brand | extracting | processed | merging | reviewing | publishing | failed`.
9. **Document the production backup plan** before any destructive migration.
10. **Don't rename `legacy_redirects`** — it already exists; just keep it.

---

## Execution Order Recommendation

```
Phase 0: Backup & audit
  → pg_dump production
  → Confirm table row counts for all suspect tables
  → Final DROP/KEEP decisions with business owner

Phase 1: Baseline migration files
  → Write 5 baseline SQL files from production schema
  → Archive 213 old migrations to migrations_archive/
  → Test: db:stop → db:start → db:reset → local:verify

Phase 2: Seed enrichment  
  → Flesh out all 6 seed modules to pass verification
  → Test: db:reset → local:verify → build → typecheck

Phase 3: SCHEMA.md documentation
  → Document every table with classification and ownership
  → Add to AGENTS.md as required reading for schema work

Phase 4: Code cleanup
  → Remove shopsite_sync_status from Product type/queries
  → Add external_sources table
  → Migrate migration_log usage to integration_sync_runs
```

> [!IMPORTANT]
> Phases 0-2 should be a single PR. Phase 3 can follow immediately. Phase 4 should be a separate PR because it touches application code.
