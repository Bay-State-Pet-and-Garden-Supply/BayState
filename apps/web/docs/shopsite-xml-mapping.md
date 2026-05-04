# ShopSite XML to migration mapping

This document explains how the ShopSite XML contract maps into the Bay State migration parser and normalized product model.

## Corrected ProductField contract

`ProductField24` is the **only canonical category source** for normalized category behavior. The parser reads `ProductField31` only as preserved raw XML context for auditing and regression checks.

| XML field | Contract status | Destination |
| --- | --- | --- |
| `ProductField7` | Canonical operational field | `products.short_name` |
| `ProductField11` | Canonical operational field | `products.is_special_order` |
| `ProductField15` | Canonical operational field | `products.in_store_pickup` |
| `ProductField16` | Canonical normalization input | Brand name input |
| `ProductField17` | Canonical normalization input | Pet type input |
| `ProductField18` | Canonical normalization input | Generic facet |
| `ProductField19` | Canonical normalization input | Generic facet |
| `ProductField20` | Canonical normalization input | Generic facet |
| `ProductField21` | Canonical normalization input | Generic facet |
| `ProductField22` | Canonical normalization input | Generic facet |
| `ProductField23` | Canonical normalization input | Generic facet |
| `ProductField24` | Canonical normalization input | Category |
| `ProductField25` | Canonical normalization input | Product type |
| `ProductField26` | Canonical normalization input | Generic facet |
| `ProductField27` | Canonical normalization input | Generic facet |
| `ProductField29` | Canonical normalization input | Generic facet |
| `ProductField30` | Canonical normalization input | Generic facet |
| `ProductField31` | **Audit only** | raw XML payload for contract verification |
| `ProductField32` | Canonical relation input | One-way cross-sell links |

## Non-negotiable rules

- Never use `ProductField31` for normalized category behavior.
- `ProductField17` direct values are canonical; inference is fallback-only when the direct field is blank.
- `ProductField32` links are one-way and should skip duplicates, self-links, and missing SKUs.
- Blank canonical values clear normalized joins and nullable first-class fields on rerun.

## Implementation alignment

The live parser in `lib/admin/migration/shopsite-client.ts` reads the corrected ProductField set directly from XML and preserves the raw product XML for regression verification. The canonical field lists and audit-only exclusions live in `lib/shopsite/constants.ts`.
