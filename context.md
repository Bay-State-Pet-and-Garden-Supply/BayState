# BayState Extraction Pipeline

Product data enrichment pipeline that extracts detailed product information from
distributor websites and official brand sources using automated web scraping and
AI-powered search.

## Language

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

## Relationships

- A **Brand** has one **Source Cascade** (ordered list of Distributor Sources + Official Brand Site as terminal fallback)
- A **Source Cascade** produces a **Source Plan** for each UPC
- A **Source Plan** is executed as an **Extraction Run** against one or more UPCs
- A **Re-extraction** only retries sources that did not succeed on the prior run
- A **Source Error** on any Distributor Source blocks **SERP Fallback** for that UPC when no source has found data
- A **UPC** with a **Source Error** AND no found data gets **Needs Attention** status
- A **UPC** with at least one `found` source outcome advances to **processed**

## Example dialogue

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

- "extraction mode" (mixed/distributor_only/ai_only) was a user-selected toggle — resolved: removed entirely, the cascade determines what runs
- "enrichment" vs "extraction" — resolved: these describe the same pipeline stage; "extraction" is the preferred term for the data-gathering phase
- "scraper" vs "source" — resolved: "source" describes the data provider, "scraper" describes the technical adapter; in user-facing language, always use "source"
- "Source Error → Needs Attention" was originally stated as unconditional — resolved: Source Errors block SERP fallback and force Needs Attention only when NO source found usable product data. If any source found data, the product advances to processed regardless of errors on other sources.
