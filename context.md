# BayState Product Pipeline

End-to-end product data pipeline: extracts product information from distributor
and brand websites, then normalizes it into consistent ShopSite-ready records
through AI-powered grouping and consolidation.

## Language

### Extraction Pipeline

**Source Cascade**:
A per-brand ordered list of data sources (distributor websites) the system walks
top-to-bottom for every UPC, running all sources and keeping all results.
_Avoid_: Hierarchy, waterfall, priority chain.

**Source Plan**:
The per-UPC execution plan built from the brand's Source Cascade. Contains the
ordered list of sources to try, crawl policies, and the product's brand/input data.
_Avoid_: Extraction config, enrichment config.

**Distributor Source**:
A wholesale distributor website that lists products with retail data (Bradley,
Phillips, Pet Food Experts, etc.). May require authentication.
_Avoid_: Scraper, supplier site.

**Official Brand Site**:
The brand's own website. Used only for SERP-based AI discovery as a last resort.
_Avoid_: Brand page, manufacturer site.

**SERP Fallback**:
AI-powered search engine discovery of product pages on the brand's official site.
Only triggered when all Distributor Sources in the cascade ran without error AND
none found the product.
_Avoid_: AI extraction, LLM search.

**Source Error**:
A genuine malfunction — auth expired, site structure changed, network timeout.
Blocks SERP Fallback because we can't be sure the source didn't have the product.
Distinct from "not stocked."
_Avoid_: Failure, crash.

**Not Stocked**:
A clean outcome where a distributor source ran successfully but the product wasn't
found in their catalog. Does NOT block SERP Fallback.
_Avoid_: Not found, missing.

**Needs Attention**:
Pipeline status for UPCs where NO source found usable product data AND at least one
source had a genuine error (Source Error) that prevented a clean cascade. Products
where any source successfully found data advance to `processed` even if other
sources in the cascade errored.
_Avoid_: Failed, blocked, errored.

**Extraction Run**:
A single execution of the Source Cascade against one or more UPCs. "Run all, keep
all" — every enabled source is attempted regardless of early successes.
_Avoid_: Scrape job, enrichment job.

**Re-extraction**:
A subsequent Extraction Run that only retries sources that previously failed or
were never attempted (skips already-successful sources).
_Avoid_: Re-scrape, retry.

**Manual Product Entry**:
Future fallback when no automated source finds the product. A manager manually
provides the product URL or product data.

---

### Consolidation Pipeline

A downstream pipeline stage that normalizes multi-source product data into consistent
ShopSite export-ready records using LLM consolidation. Products flow through after
extraction completes (status `processed`).

**Product Group**:
A manufacturer product line — a family of SKU variants that share a brand,
category, and naming pattern but differ by flavor, size, count, or material.
Example: all UPCs under "Blue Buffalo Life Protection Dry Dog Food."
_Avoid_: Cohort, UPC prefix group, product family.

**Subproduct Group**:
A flavor or protein variant family within a Product Group. Example: all
"Chicken & Brown Rice" variants (5 lb., 15 lb., 30 lb.) within the Blue Buffalo
Life Protection line. Normally handled implicitly during consolidation; explicitly
detected only when a Product Group exceeds 30 UPCs and needs to be split for
token limits.
_Avoid_: Sub-family, variant cluster.

**Product Line Label**:
The human-readable canonical name for a Product Group, drawn from an
accumulated taxonomy stored in the `product_lines` table (referenced by
stable UUID via `products_ingestion.product_line_id`). Assigned by AI
classification during the Grouping stage.
_Avoid_: Group name, cluster label, product line name.

**Grouping**:
The pipeline stage between `processed` and `merging`. AI classification assigns
each product a Product Line Label, forming Product Groups. The operator reviews
and adjusts the groups before triggering consolidation.
_Avoid_: Classification stage, clustering, cohorting.

**Group Consolidation**:
A single LLM call that processes every product in a Product Group together,
producing one consolidated record per UPC. The LLM sees the full group and
generates inherently consistent names, brands, categories, and descriptions.
_Avoid_: Batch merge, multi-product consolidation, joint merge.

**Singleton**:
A product that was classified with confidence below 0.80 during Grouping and
is consolidated individually (the legacy per-product path).
_Avoid_: Ungrouped, orphan, straggler.

**Ungrouped**:
The fallback bucket for products that failed classification (confidence < 0.80).
These products are consolidated as Singletons.
_Avoid_: Orphans, stragglers, no-group.

## Relationships

- A **Brand** has one **Source Cascade** (ordered list of Distributor Sources + Official Brand Site as terminal fallback)
- A **Source Cascade** produces a **Source Plan** for each UPC
- A **Source Plan** is executed as an **Extraction Run** against one or more UPCs
- A **Re-extraction** only retries sources that did not succeed on the prior run
- A **Source Error** on any Distributor Source blocks **SERP Fallback** for that UPC when no source has found data
- A **UPC** with a **Source Error** AND no found data gets **Needs Attention** status
- A **UPC** with at least one `found` source outcome advances to **processed**

- A **Product Group** contains one or more UPCs sharing the same **Product Line Label**
- A **Product Line Label** is a normalized, human-readable identifier for a **Product Group**
- The **Grouping** stage uses AI classification to assign each product a **Product Line Label**
- Products that fail classification (confidence < 0.80) become **Singletons** and are consolidated individually
- **Group Consolidation** processes every product in a **Product Group** in a single LLM call
- Re-extraction preserves the existing **Product Line Label** (no re-classification)
- After migration, UPC-prefix **cohorts** are deprecated; **Product Groups** (via `product_line_id`) replace them

## Example dialogue

> **Dev:** "Can two products from different brands end up in the same Product Group?"
> **Domain expert:** "No. The classification prompt includes brand as a key signal.
> Two products with different brands will always get different Product Line Labels,
> even if their names are similar."

> **Dev:** "What if the AI classifies a product with 0.75 confidence — just below the threshold?"
> **Domain expert:** "It becomes a Singleton. The operator can still manually assign
> it to a group from the Grouping UI if the classification was clearly wrong. The
> 0.80 threshold is a default, not a hard gate."

> **Dev:** "What if a Product Group has 40 UPCs — too many for one LLM call?"
> **Domain expert:** "The system auto-splits large groups by Subproduct Group
> (flavor families). The Chicken variants get one consolidation call, the Beef
> variants get another. Products within each split share the same Product Line
> Label and still benefit from group-level consistency."

> **Dev:** "If Bradley returns a 503 and Phillips finds nothing, does SERP still run?"
> **Domain expert:** "No. A Source Error on Bradley blocks the SERP Fallback even
> though Phillips ran clean. We don't know if Bradley had the product — we couldn't
> check. The UPC goes to Needs Attention instead."

> **Dev:** "What if Phillips finds the product with high confidence, but Bradley got a 503?"
> **Domain expert:** "Then Phillips found it, so it goes to processed. Bradley's 503
> is recorded in the source attempt history, but since we have usable data, we don't
> hold the whole product hostage."

> **Dev:** "What if all distributors ran clean but none had the product?"
> **Domain expert:** "Then SERP runs as fallback. If that also turns up nothing, the
> product advances to processed with no enrichment data. The manager will eventually
> add it manually through the new entry flow."

> **Dev:** "What if a brand has no Source Cascade configured?"
> **Domain expert:** "Extraction can't start until the cascade is set up. The UI tells
> the manager exactly which brand needs configuration."

## Flagged ambiguities

### Extraction pipeline

- "extraction mode" (mixed/distributor_only/ai_only) was a user-selected toggle — resolved: removed entirely, the cascade determines what runs
- "enrichment" vs "extraction" — resolved: these describe the same pipeline stage; "extraction" is the preferred term for the data-gathering phase
- "scraper" vs "source" — resolved: "source" describes the data provider, "scraper" describes the technical adapter; in user-facing language, always use "source"
- "Source Error → Needs Attention" was originally stated as unconditional — resolved: Source Errors block SERP fallback and force Needs Attention only when NO source found usable product data. If any source found data, the product advances to processed regardless of errors on other sources.

### Consolidation pipeline

- "product group" vs "product line" vs "product family" — resolved: "Product Group" is the canonical term; "product line" is the specific label string assigned to a group; "product family" is deprecated
- "cohort" vs "Product Group" — resolved: UPC-prefix cohorts are legacy; Product Groups replace them entirely
- "ungrouped" vs "singleton" — resolved: "Ungrouped" is the bucket of products that failed classification; "Singleton" is the consolidation strategy applied to each product in that bucket
- "merge" vs "consolidation" — resolved: "consolidation" is the canonical term for the LLM normalization step; "merge" implies combining records
- "product_line" column — repurposed: the existing `products_ingestion.product_line_id` column now references `product_lines.id` via FK instead of storing a raw string
- TwoPhaseConsolidationService — removed: the new group-based architecture makes post-hoc consistency checking redundant
- Subproduct Groups are implicit except for oversized groups (>30 UPCs), where explicit detection runs for splitting
