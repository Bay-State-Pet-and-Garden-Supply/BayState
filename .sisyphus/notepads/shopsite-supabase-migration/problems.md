# Problems for ShopSite Supabase Migration

## Unresolved / Follow-up

- 2026-04-04: `product_group_products` ended at 1,521 rows after 1,522 matched subproduct statements, implying at least one duplicate `(group_id, product_id)` relationship in source XML; acceptable due to idempotent conflict handling but worth profiling if exact relationship cardinality is required.
- 2026-04-04: 145 `<Subproduct>` SKUs from XML did not map to existing `products.sku` values and were skipped by design; confirm whether these are discontinued SKUs or require additional SKU normalization rules.
- 2026-04-04: Cross-sell import produced 29,563 unique matched relationships (92.42% match rate over 31,996 references), which is significantly higher than the planning assumption (~18,500 at 58%); verify if the baseline expectation was based on older/incomplete product coverage.
