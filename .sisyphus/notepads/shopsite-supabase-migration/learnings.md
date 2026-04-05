# Learnings for ShopSite Supabase Migration

## Conventions
- All migration scripts go in `/tmp/` (disposable utilities)
- SQL batch files go in `/tmp/migration_products/`
- Evidence files go to `.sisyphus/evidence/`
- Use `exec_sql()` RPC function for SQL execution

## Data Mapping
- Source: `temp/web_inventory032126.xml` (67MB ShopSite export)
- Target: Supabase PostgreSQL
- UPSERT pattern: `ON CONFLICT (sku) DO UPDATE SET ...`
- Duplicate strategy: last-write-wins

## Batch Structure
- 167 batches total
- 50 products per batch
- Transaction wrapping per batch

## Important Fields
- Cross-sells from `<ProductField32>` (pipe-delimited SKUs)
- Product groups from `<Subproducts>`
- Legacy URLs from `<FileName>`

## Learnings Log

- 2026-04-04: `xml.etree.ElementTree` parsing on ShopSite export required pre-decoding non-XML named entities (for example `&reg;`, `&trade;`) while preserving XML built-ins (`&amp;`, `&lt;`, etc.) to keep document well-formed.
- 2026-04-04: Product nodes are under `<ShopSiteProducts><Products><Product>...`; using `.//Product` yields all 8,330 entries from `temp/web_inventory032126.xml`.
- 2026-04-04: Generated SQL batches with `INSERT ... ON CONFLICT (sku) DO UPDATE SET ...` and `BEGIN/COMMIT` per file produced 167 files of 50 products (last batch partial), satisfying last-write-wins ordering.
- 2026-04-04: Legacy redirect extraction found 8,312 products with `<FileName>` but only 8,292 unique `old_path` values; 20 duplicate legacy URLs need first-write-wins handling before batching.
- 2026-04-04: The `exec_sql` RPC currently returns a success payload without SELECT results, so post-import verification needs direct Supabase table queries rather than RPC-based count queries.
- 2026-04-04: The deployed `exec_sql()` RPC does not accept transaction statements; batch runners must strip `BEGIN;`/`COMMIT;` before submission.
- 2026-04-04: The live `public.products` schema differs from generated SQL: `fulfillment_type` is absent, `shopsite_pages` is `jsonb`, and `quantity`/`low_stock_threshold` need non-null values during import.
- 2026-04-04: Supabase RPC success must be checked from `response.data` as well as exceptions because `exec_sql()` can return `{"error": ...}` payloads without raising.
- 2026-04-04: Supabase `exec_sql()` rejected the generated transaction wrappers (`BEGIN;` / `COMMIT;`) with `EXECUTE of transaction commands is not implemented`, so disposable batch runners must strip wrapper statements before RPC execution.
- 2026-04-04: The current `public.products` schema differs from the generated batch SQL: `fulfillment_type` is absent, `shopsite_pages` is `jsonb` rather than `text[]`, and explicit `NULL` quantities violate the table's not-null constraint even though the column default is `0`.
- 2026-04-04: For supabase-py product counts, `count=CountMethod.exact` returns accurate totals; the string form `count="exact"` under-reported counts during this migration task.
- 2026-04-04: Final Task 6 execution succeeded for `products_150.sql` through `products_166.sql` by transforming each `INSERT ... ON CONFLICT` statement to the live `public.products` schema at runtime; the final verification totals were 8,316 products overall and 7,938 products with `weight > 0`, indicating 830 net new rows from the last 17 batches because some SKUs were updates/duplicates.
- 2026-04-04: Task 4 succeeded by parsing each generated `INSERT` block at runtime and rebuilding it for the live schema: map `fulfillment_type` -> `product_type`, wrap `shopsite_pages` arrays with `to_jsonb(...)`, and coalesce nullable counters (`quantity`, `low_stock_threshold`, `minimum_quantity`) to table-safe defaults before calling `exec_sql()`.
- 2026-04-04: Product-group import from `<Subproducts>` should query the live `products` table directly for SKU-to-ID mapping (8,316 mapped SKUs), not rely on static SKU mapping artifacts.
- 2026-04-04: `<Subproducts>` extraction produced 1,667 child references, with 1,522 matched child SKUs and 145 unmatched/discontinued references that should be skipped without failing the batch import.
- 2026-04-04: Cross-sell import from `<ProductField32>` should page through `products` in 1,000-row windows (`.range(start,end)`) because supabase-py defaults to 1,000 rows per request; single-shot select undercounts SKU coverage.
- 2026-04-04: Live `related_products` table in this environment does not expose the expected unique constraint for `(product_id, related_product_id, relation_type)`, so `ON CONFLICT (cols)` fails; use `ON CONFLICT DO NOTHING` plus pre-filter against existing pairs for idempotent reruns.

- 2026-04-04: Comprehensive migration completion report generated. Total products migrated: 8,316 (99.83% of 8,330 source). Cross-sell match rate achieved 92.42%, significantly exceeding expected 58%. Image migration intentionally skipped to use baystatepet.com URLs, saving Supabase storage costs.
