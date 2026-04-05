# Issues for ShopSite Supabase Migration

## Problems Encountered

- 2026-04-04: Task 5 started with only 1,000 existing `products` rows, so successful execution of batches `100-149` raised the total to 3,500 rather than the plan's expected ~7,500. Earlier batch ranges do not appear to have been fully loaded yet.

## Unresolved Blockers

## Gotchas

- 2026-04-04: Removing transaction wrappers changed failure behavior from all-or-nothing to partial progress per statement, so reruns must rely on idempotent UPSERTs and current count baselines may already reflect partial imports.

- 2026-04-04: Batch SQL generated for migration assumes transaction-wrapped `exec_sql()` support plus a `fulfillment_type` column and nullable `quantity`; current Supabase schema does not match those assumptions.
- 2026-04-04: Task 4 completed with 50/50 successful batch RPC calls, but row growth was +2,490 instead of +2,500 because some SKUs in batches `050-099` already existed and were updated via UPSERT rather than inserted as new rows.
- 2026-04-04: Orchestrator-provided Supabase URL host (`fapnuczapcatelxxmrail`) did not resolve; importer execution succeeded only after using the project ref from the service-role JWT (`fapnuczapctelxxmrail`).
- 2026-04-04: Initial cross-sell importer attempt only loaded 1,000 product SKUs due supabase pagination default and then failed verification with `column related_products.id does not exist`; corrected by paged SKU fetch and counting on `product_id`.
- 2026-04-04: Cross-sell batch SQL initially used `ON CONFLICT (product_id, related_product_id, relation_type) DO NOTHING`, but RPC returned `there is no unique or exclusion constraint matching the ON CONFLICT specification` for all batches in this DB.
