# Remove legacy cohorts and group Imported products by Brand

**Status:** accepted

## Context

The legacy cohort system grouped Imported products by UPC prefix through `cohort_batches`, `cohort_members`, and `products_ingestion.cohort_id`. In practice, this forced pipeline managers to open multiple prefix-based groups to understand which products remained for the same Brand.

Product Lines do not solve this Imported-stage problem because Product Lines are identified later, after extraction/classification. At Imported time, the only meaningful grouping dimension is the product's assigned Brand.

## Decision

Remove the legacy cohort system and make `products_ingestion.brand_id` the authoritative Imported-stage grouping field.

- Imported products are grouped into Brand Groups.
- Products with no `brand_id` appear in a synthetic No Brand group.
- Operators select individual products and assign a Brand directly.
- Brand assignment is a pure product update; it does not implicitly change pipeline status.
- Starting extraction preflights that every selected product has a direct Brand.
- Source Plan building no longer falls back to cohort metadata.

## Consequences

- Drop `cohort_batches`, `cohort_members`, and legacy `cohort_id` columns.
- Remove cohort admin APIs, utilities, and UI components.
- Imported-stage batch management is simpler and reflects how operators actually reason about remaining work.
- Product Line grouping remains separate and only applies after extraction/classification.
