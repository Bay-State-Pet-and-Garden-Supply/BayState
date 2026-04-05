# Decisions for ShopSite Supabase Migration

## Architectural Decisions

## Data Decisions

- 2026-04-04: Legacy redirects are generated entirely from XML, using the same slug collision strategy as the product batch generator (`slugify(name)`, then append `-{sku}` on first collision) so redirect imports do not depend on the partially populated `products` table.

## Strategy Decisions

- 2026-04-04: Legacy redirects are inserted in 100-row multi-value statements through the `exec_sql` RPC with `ON CONFLICT (old_path) DO NOTHING`, while duplicate XML `FileName` values are collapsed in-script before execution to keep batching deterministic.

- 2026-04-04: Task 3 execution used a dedicated `/tmp/run_migration_batches_1_50.py` runner that sanitizes generated SQL at runtime instead of rewriting batch files, preserving the generated artifacts while adapting them to the live Supabase schema.

- 2026-04-04: Kept the generated `/tmp/migration_products/products_100.sql` through `products_149.sql` files immutable and applied RPC/schema compatibility fixes inside the disposable executor script (`/tmp/run_migration_batches_101_150.py`) instead of rewriting batch sources.
- 2026-04-04: For Task 4, kept `/tmp/migration_products/products_050.sql` through `products_099.sql` immutable and implemented schema adaptation inside `/tmp/run_migration_batches_51_100.py` so the same batch artifacts can be rerun idempotently against the current Supabase schema.
- 2026-04-04: Product groups are keyed by deterministic parent-specific slug (`slugify(parent_name)-slugify(parent_sku)`) and inserted with `ON CONFLICT (slug) DO UPDATE` to prevent duplicate groups and keep reruns idempotent.
- 2026-04-04: Cross-sell importer queries `products` live at runtime and does not depend on `/tmp/sku_to_id.json`, ensuring SKU→ID resolution reflects the current DB state per task requirements.
- 2026-04-04: Cross-sell inserts use `ON CONFLICT DO NOTHING` (without a conflict target) and explicit in-script exclusion of existing `(product_id, related_product_id)` pairs to preserve idempotence despite missing/unknown unique index metadata on `related_products`.

- 2026-04-04: Decision documented to skip image migration in favor of using baystatepet.com/media/ URLs. Rationale: cost savings, existing CDN performance, reduced migration complexity, faster go-live timeline. Image migration can be revisited as separate future project if needed.
