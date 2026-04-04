# Corrected ShopSite ProductField Mapping Matrix

This document freezes the corrected ShopSite ProductField contract for migration work. It is the single source of truth for parser, schema, import, and regression-test behavior.

## Canonical rules

- `ProductField24` is the only canonical category source.
- `ProductField31` is audit-only raw payload and is never used for normalized category behavior.
- `ProductField17` direct values are canonical; inference is fallback only when `ProductField17` is blank.
- `ProductField32` cross-sells are one-way, split on `|`, and skip duplicates, self-links, and missing SKUs.
- Blank canonical values clear normalized joins and nullable first-class fields on rerun.

## Mapping matrix

| ProductField | Meaning | Contract target | Normalization notes |
| --- | --- | --- | --- |
| `PF7` | Child / Short Name | `products.short_name` | Blank clears `short_name` on rerun. |
| `PF11` | Special Order | `products.is_special_order` | Boolean field; truthy values include `yes`, `checked`, `true`, `1`. Blank/other values are false. |
| `PF15` | In Store Pick-up | `products.in_store_pickup` | Boolean field; truthy values include `yes`, `checked`, `true`, `1`. Blank/other values are false. |
| `PF16` | Facet - Brand | Canonical brand input | Direct brand facet value; blank clears brand join. |
| `PF17` | Facet - Pet Type | Canonical pet type input | Direct value wins; inference only when blank. Blank canonical value clears direct join before fallback logic is applied. |
| `PF18` | Facet - Lifestage | Generic normalized facet | Blank clears product-to-facet join. |
| `PF19` | Facet - Pet Size | Generic normalized facet | Blank clears product-to-facet join. |
| `PF20` | Facet - Special Diet | Generic normalized facet | Blank clears product-to-facet join. |
| `PF21` | Facet - Health Feature | Generic normalized facet | Blank clears product-to-facet join. |
| `PF22` | Facet - Food Form | Generic normalized facet | Blank clears product-to-facet join. |
| `PF23` | Facet - Flavor | Generic normalized facet | Blank clears product-to-facet join. |
| `PF24` | Facet - Category | Canonical category input | Only normalized category source. PF31 disagreement never overrides PF24. Blank clears category joins on rerun. |
| `PF25` | Facet - Product Type | Canonical product-type input | Blank clears product-type join on rerun. |
| `PF26` | Facet - Product Feature | Generic normalized facet | Blank clears product-to-facet join. |
| `PF27` | Facet - Size | Generic normalized facet | Blank clears product-to-facet join. |
| `PF29` | Facet - Color | Generic normalized facet | Blank clears product-to-facet join. |
| `PF30` | Facet - Packaging Type | Generic normalized facet | Blank clears product-to-facet join. |
| `PF32` | Product Cross Sell | One-way cross-sell relation input | Split on `|`; skip duplicate SKUs, self-SKU, and missing SKUs. Blank clears prior cross-sell joins on rerun. |

## Explicit exclusions

| Field | Status | Reason |
| --- | --- | --- |
| `PF31` | Excluded from normalization | Preserved only in raw ShopSite payload for audit/drift review. |

## Fixture coverage

- `PF24-WINS-001`: PF24/PF31 disagreement proving PF24 remains canonical.
- `DIRECT-PET-001`: direct PF17 plus populated PF7/PF11/PF15 operational fields.
- `FALLBACK-PET-001`: blank PF17 plus blank canonical values to encode rerun clearing semantics.
- `XSELL-SOURCE-001`: PF32 duplicate/self/missing-SKU filtering.
- `XSELL-TARGET-001`: valid PF32 relation target.
