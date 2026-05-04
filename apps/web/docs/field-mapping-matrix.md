# ShopSite ProductField mapping matrix

This matrix is the versioned contract for the corrected ShopSite ProductField mapping used by the migration parser and downstream normalization.

| Field | Meaning | Target |
| --- | --- | --- |
| `PF7` | Child / Short Name | `products.short_name` |
| `PF11` | Special Order | `products.is_special_order` |
| `PF15` | In Store Pick-up | `products.in_store_pickup` |
| `PF16` | Facet - Brand | Canonical brand input |
| `PF17` | Facet - Pet Type | Canonical pet type input |
| `PF18` | Facet - Lifestage | Generic normalized facet |
| `PF19` | Facet - Pet Size | Generic normalized facet |
| `PF20` | Facet - Special Diet | Generic normalized facet |
| `PF21` | Facet - Health Feature | Generic normalized facet |
| `PF22` | Facet - Food Form | Generic normalized facet |
| `PF23` | Facet - Flavor | Generic normalized facet |
| `PF24` | Facet - Category | Canonical category input |
| `PF25` | Facet - Product Type | Canonical product-type input |
| `PF26` | Facet - Product Feature | Generic normalized facet |
| `PF27` | Facet - Size | Generic normalized facet |
| `PF29` | Facet - Color | Generic normalized facet |
| `PF30` | Facet - Packaging Type | Generic normalized facet |
| `PF31` | Legacy Category Payload | Audit only raw payload |
| `PF32` | Product Cross Sell | One-way cross-sell relation input |

## Contract rules

- `ProductField24` is the only canonical category source.
- `ProductField31` is audit-only raw payload and is never used for normalized category behavior.
- `ProductField17` direct values are canonical; inference is fallback only when the field is blank.
- `ProductField32` cross-sells are one-way, split on `|`, and skip duplicates, self-links, and missing SKUs.
- Blank canonical values clear normalized joins and nullable first-class fields on rerun.

## Operational notes

- `PF7`, `PF11`, and `PF15` populate first-class operational product columns rather than generic facet tables.
- `PF16`, `PF17`, `PF24`, and `PF25` feed dedicated canonical normalization paths.
- `PF18`, `PF19`, `PF20`, `PF21`, `PF22`, `PF23`, `PF26`, `PF27`, `PF29`, and `PF30` remain generic normalized facets.
