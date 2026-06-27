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

**Site Extraction Profile**:
A governed extraction-knowledge base for one **Brand** + source + domain. Stores **Field Evidence Rules** that tell the scraper how to extract product data from that brand's official website. Belongs to exactly one **Brand**.
_Avoid_: scraper config, extraction template

**Field Evidence Rule**:
A single declarative extraction rule that maps a product field (title, price, image, SKU) to a CSS selector or XPath on the source website. Stored as JSON inside a **Profile Version**. Compiled into a Crawl4AI schema at execution time. See ADR 0008.
_Avoid_: scraper rule, extraction config

**Profile Version**:
An immutable, reviewable revision of a **Site Extraction Profile**. Contains the full set of **Field Evidence Rules**, a compiled Crawl4AI schema, and a deterministic version hash. Only one version may be active per profile at a time. Created via AI schema draft, **Selector Workshop** save, **Explicit Correction** promotion, or manual creation.
_Avoid_: profile snapshot, extraction version

**Selector Workshop**:
The admin interface for interactively editing, live-testing, and saving **Field Evidence Rules** with visual feedback against real product pages. Uses a dedicated synchronous extraction endpoint on the scraper runner (not the async job queue). Produces **Profile Versions** with `created_from: 'manual'`.
_Avoid_: profile editor, config builder

**PDP Seed**:
A known Product Detail Page URL for a **Brand** + source + domain. Used to bootstrap extraction knowledge and validate **Site Extraction Profiles**. Verified via automated crawl + page classification. Promoted to **Validation Cases** after verification.
_Avoid_: known URL, target page

**Validation Case**:
A curated test case within a **Profile** validation set. Each case targets one URL with expected assertions (page type, extracted values). Used by the async `validate_profile_version` job to gate profile activation.
_Avoid_: test case, expected output

**Explicit Correction**:
A deliberate, reusable field-level correction (accepted or rejected) linked to a **Brand** + source + domain. Survives **Profile Version** regenerations. Promoted corrections create new **Profile Versions** with `created_from: 'explicit_correction'`.
_Avoid_: manual fix, override

## Relationships

- A **Brand Group** contains Imported products that share one **Brand**.
- A **Source Cascade** belongs to a **Brand** and controls extraction source order.
- A **Product Line** has one or more **Product Variants**.
- A **Product Variant** belongs to exactly one **Product Line** and usually maps to exactly one UPC.
- **ShopSite Input** can hint at the expected **Product Variant**.
- **External Source Evidence** verifies facts about a **Product Variant**.
- A **Family Page** must be resolved to a specific **Product Variant** before it can provide variant-specific evidence.
- A **Site Extraction Profile** belongs to one **Brand** (scoped by brand_id + source_slug + canonical_domain).
- A **Profile Version** belongs to exactly one **Site Extraction Profile**. Only one version may be active at a time.
- Each **Profile Version** contains one or more **Field Evidence Rules**.
- A **PDP Seed** anchors extraction knowledge for a **Brand** + source + domain. Verified seeds become **Validation Cases**.
- An **Explicit Correction** may be promoted into a new **Profile Version** with `created_from: 'explicit_correction'`.
- The **Selector Workshop** produces **Profile Versions** directly (`created_from: 'manual'`) and uses a synchronous runner endpoint distinct from the async job queue.

## Example dialogue

> **Dev:** "SERP found the same product, but it might be a different size. Can we use it?"
> **Domain expert:** "Treat that as the same **Product Line**, not necessarily the same **Product Variant**. Use the **ShopSite Input** as the target hint, but require **External Source Evidence** or a variant-resolution step before accepting the extraction."

## Flagged ambiguities

- "Same product" was used for both a **Product Line** and a **Product Variant** — resolved: extraction acceptance is about the exact **Product Variant**, while grouping/consolidation can reason across the broader **Product Line**.
- "Cohort" conflicts with accepted Brand Group and Product Line language — resolved: Cohort is legacy terminology and should not describe new pipeline behavior.
