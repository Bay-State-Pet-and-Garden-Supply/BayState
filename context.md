# BayState Domain Glossary

BayState imports retailer catalog rows, assigns brands, runs source-backed extraction, and consolidates facts into normalized product records. This glossary keeps product-line, variant, evidence, and pipeline grouping language precise.

## Language

**Brand**:
A catalog manufacturer or supplier identity used for Imported-stage grouping and extraction eligibility.
_Avoid_: vendor when referring to the catalog identity

**Brand Group**:
The Imported-stage workspace grouping for products sharing the same direct **Brand**.
_Avoid_: cohort, product line

**No Brand**:
A synthetic Imported-stage group for products that do not yet have an assigned **Brand**.
_Avoid_: unknown brand when referring to the workspace group

**Source Cascade**:
The per-Brand ordered set of approved extraction sources the system walks for a product.
_Avoid_: manual source selection, scraper list

**Product Line**:
A post-extraction manufacturer product family whose members share brand and core identity but differ by customer-visible options.
_Avoid_: same product, brand group, cohort

**Product Variant**:
A sellable UPC-level member of a **Product Line** distinguished by size, weight, count, flavor, color, material, or another customer-visible option.
_Avoid_: duplicate, size duplicate, same product

**Family Page**:
A source page that represents a **Product Line** or collection rather than one exact **Product Variant**.
_Avoid_: product page when the page has not been resolved to a variant

**External Source Evidence**:
Product facts observed from an approved or discovered external source, distinct from the retailer's imported catalog row.
_Avoid_: proof when the fact only came from imported input

**ShopSite Input**:
The retailer's imported catalog/POS row for a UPC, used as a target hint for enrichment rather than external proof.
_Avoid_: source evidence, verified source

**Cohort**:
A removed legacy UPC-prefix grouping concept that should not be used for new pipeline behavior.
_Avoid_: using cohort to mean Brand Group or Product Line

## Relationships

- A **Brand Group** contains Imported products that share one **Brand**.
- A **Source Cascade** belongs to a **Brand** and controls extraction source order.
- A **Product Line** has one or more **Product Variants**.
- A **Product Variant** belongs to exactly one **Product Line** and usually maps to exactly one UPC.
- **ShopSite Input** can hint at the expected **Product Variant**.
- **External Source Evidence** verifies facts about a **Product Variant**.
- A **Family Page** must be resolved to a specific **Product Variant** before it can provide variant-specific evidence.

## Example dialogue

> **Dev:** "SERP found the same product, but it might be a different size. Can we use it?"
> **Domain expert:** "Treat that as the same **Product Line**, not necessarily the same **Product Variant**. Use the **ShopSite Input** as the target hint, but require **External Source Evidence** or a variant-resolution step before accepting the extraction."

## Flagged ambiguities

- "Same product" was used for both a **Product Line** and a **Product Variant** — resolved: extraction acceptance is about the exact **Product Variant**, while grouping/consolidation can reason across the broader **Product Line**.
- "Cohort" conflicts with accepted Brand Group and Product Line language — resolved: Cohort is legacy terminology and should not describe new pipeline behavior.
