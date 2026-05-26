# Oracle Review: Brand-Scoped Official Product Page Discovery Proposal

## Inherited decisions

- The web app is the coordinator; the scraper is a stateless API-only runner. The scraper must not read Supabase directly.
- `products_ingestion` is the central product creation pipeline. Register data enters there as `imported`, then moves through extraction, consolidation, review, and publish.
- UPC and price are protected input fields. Enrichment may supply evidence and descriptive fields, but must not override UPC/price.
- Brand official site configuration already exists as `brands.official_domains` / `preferred_domains` plus synced `brand_sources` records. The current schema does not have `official_url`, `official_domain`, or `aliases`.
- `brand_sources` and approved source plans already support `official_brand` entries, including `crawl4ai_direct` and `domain_search` for official domains.
- Crawl4AI is already the primary crawler/extractor in the scraper stack. It already wraps Playwright-like browser rendering, anti-bot handling, extraction strategies, and callback metadata.
- Current official-brand discovery is per-product/on-demand through `SerpDiscoveryAdapter`: UPC search, LLM name consolidation, brand-site search, then `ProductPageExtractor`.
- `official_brand_url_candidates` and `enrichment_targets` already exist as URL candidate/target persistence concepts. `enrichment_targets` appears to be the newer simplification path.
- Admin review already exists in the pipeline workspace, especially `ProcessedResultsView` / `ScrapedResultsView` and `ReviewingResultsView`. Drafts exist as review-state pipeline data, not as a separate product draft table.

## Diagnosis

The proposal has the right product instinct: brand-scoped official-domain matching, Crawl4AI-first extraction, evidence preservation, no auto-publishing, and human review are all consistent with the current direction.

As written, though, it reads too much like a greenfield subsystem. The risky parts are not the crawler or scorer; they are the new parallel data model and lifecycle it introduces:

- a replacement-looking `brands` table shape,
- a new `brand_url_index`,
- a new `product_creation_drafts` table,
- new draft review surfaces,
- and `agent-browser` as a named runtime dependency.

Those choices would duplicate or bypass major existing architecture: `brands.official_domains`, `brand_sources`, approved source plans, `products_ingestion`, `enrichment_targets` / `official_brand_url_candidates`, scraper callbacks, and the existing pipeline review UI.

The plan should be treated as a **resolver enhancement to the existing approved-source enrichment pipeline**, not as a new product creation pipeline.

## Ratings

| Area | Rating | Notes |
|---|---:|---|
| Architectural fit if adapted | 7/10 | The core idea fits well if it plugs into approved sources, products_ingestion, and existing review states. |
| Architectural fit as written | 4/10 | The proposed tables and UI imply parallel lifecycle/state that conflicts with current architecture. |
| Implementation risk | High | Whole-site crawling, indexing, scoring calibration, crawler orchestration, UI, and new persistence are all substantial. |
| Sequencing correctness | 5/10 | The phases are directionally logical, but they front-load schema and broad brand-site indexing before validating against existing SerpDiscovery failures. |
| Consistency with prior decisions | Mixed | Crawl4AI-first and evidence-first are consistent; new brand schema, separate drafts, and agent-browser dependency are not. |

## Drift / contradiction check

### 1. Proposed `brands` table conflicts with the real schema

The proposal suggests:

```sql
official_url text not null,
official_domain text not null,
aliases text[] default '{}',
crawl_status text,
last_crawled_at timestamptz
```

Current reality:

- `brands.official_domains text[]`
- `brands.preferred_domains text[]`
- `brand_sources` stores source domains and extraction configuration
- `aliases` was deliberately dropped in a prior consolidation migration

Do not replace or reshape `brands` around a single official URL/domain. Bay State already supports multi-domain brands and preferred domains. If aliases return, they need an explicit new decision and probably a separate table, not a silent reversal of the dropped column.

### 2. `product_creation_drafts` duplicates `products_ingestion`

The current pipeline already has a reviewable product lifecycle. Adding a separate draft table with statuses like `needs_review`, `approved`, `rejected`, and `unresolved` risks creating a second state machine beside:

```text
imported → extracting → processed → merging → reviewing → publishing / failed
```

If a persistent draft artifact is needed, it should either:

- be represented in `products_ingestion.consolidated`, `sources`, `image_candidates`, `selected_images`, and `confidence_score`, or
- be a narrowly scoped candidate/evidence table linked to `products_ingestion.upc`, not a separate publish lifecycle.

Also, `register_row_id uuid` is not the right anchor for the main product pipeline. The pipeline is UPC-centered through `products_ingestion.upc`; any register-row linkage needs to be explicitly reconciled with `inventory_reconciliation_items` and duplicate UPC behavior.

### 3. The proposal underuses existing candidate tables

Before creating `brand_url_index` and `product_creation_drafts`, reconcile with:

- `official_brand_url_candidates` — existing reviewable candidate URLs with status, confidence, score-ish metadata, brand/cohort/upc links.
- `enrichment_targets` — newer simplified URL target table.

A new `brand_url_index` may still be justified, but it should be a reusable brand-level cache, not the per-product candidate workspace. Per-product candidates should flow through the existing enrichment target/candidate path unless there is a clear reason to retire it.

### 4. `agent-browser` conflicts with current scraper runtime assumptions

The proposal correctly says not to use agent-browser as default discovery. But naming it as the fallback implementation is still premature:

- agent-browser is not installed or used.
- The scraper already uses Crawl4AI and browser rendering.
- The runner is async Python and API-only.

The fallback should be specified generically as **interactive browser extraction inside the scraper runner**, preferably via Crawl4AI/Playwright capabilities already present. Only introduce agent-browser if there is a proven gap Crawl4AI cannot cover.

### 5. Whole-brand crawling is a major shift from current on-demand discovery

Current discovery is per-product and search-assisted. The proposal shifts to crawling/indexing entire official brand sites first. That may be valuable for repeated UPCs, but it introduces substantial operational concerns:

- crawl duration and scheduling,
- robots/sitemap compliance,
- rate limits,
- stale cache invalidation,
- domain allowlist and redirect safety,
- storage growth from `page_text`,
- product/category/blog classification quality,
- multi-domain brands and umbrella brand sites.

This should be optional/cached enrichment, not a blocking prerequisite for brand setup.

## Missing pieces

- **Resolver contract:** Define exact input/output shape between web coordinator and scraper runner. The scraper cannot directly query `brand_url_index` unless the coordinator passes candidates or exposes an API.
- **Persistence decision:** Decide whether per-product URL candidates live in `enrichment_targets`, `official_brand_url_candidates`, or a replacement table before adding another table.
- **Crawl job orchestration:** Need crawl job table/status, leases, retry policy, recrawl TTL, limits per brand/domain, and admin-triggered run semantics.
- **Search index design:** `page_text text` alone is not enough. Use normalized URL, canonical URL, content hash, extraction version, maybe `tsvector`/trigram indexes, and storage limits. Avoid unbounded raw page text.
- **Canonicalization and dedupe:** Unique `(brand_id, url)` is weaker than normalized/canonical URL uniqueness. Redirects and canonical tags must dedupe.
- **Security:** Prevent SSRF and private-network crawling; enforce official-domain allowlists after redirects; preserve disallowed-domain filtering.
- **Evidence schema:** Field-level evidence needs a stable schema: source URL, selector/JSON-LD path/text span, extraction method, confidence, and whether the value came from model inference or source text.
- **Abbreviation rules model:** Needs global vs brand scope, priority, active flag, audit fields, token type enum, conflict handling, and admin correction workflow.
- **Scoring calibration:** The proposed point weights are plausible but arbitrary. Add score breakdown, fixtures from real register rows, and threshold tuning before automating draft creation.
- **Admin integration:** The proposal should specify whether new UI appears in Brands, Pipeline imported/processed tabs, or Monitoring. Avoid a standalone draft browser until existing pipeline surfaces prove insufficient.

## Recommended changes

### Keep

- Brand-scoped official-domain constraint.
- Crawl4AI as primary crawler/extractor.
- Evidence-first product enrichment.
- UPC as strong positive evidence but not required.
- Manual review before publishing.
- Local cache/index as a possible cost/performance improvement.

### Change

1. Replace “Add Brand Official URL Support” with “Extend existing official domain/source configuration.”
   - Use `brands.official_domains`, `preferred_domains`, and `brand_sources`.
   - Do not introduce single `official_url` / `official_domain` fields.

2. Treat aliases as a separate decision.
   - Since `aliases` was dropped, reintroduce only with rationale.
   - Prefer `brand_aliases` or scoped `register_abbreviation_rules` over a loose `brands.aliases text[]` column.

3. Replace `product_creation_drafts` with pipeline-native persistence.
   - Store candidate/evidence/extracted source data through `enrichment_targets` / `official_brand_url_candidates` and `products_ingestion.sources`.
   - Let existing pipeline statuses represent review/publish state.

4. Rename the feature from “product draft creation” to “official product page resolver.”
   - Output should be a selected official URL + extraction evidence + enriched source payload.
   - The pipeline/consolidation layer remains responsible for final product draft/review state.

5. Replace `agent-browser fallback` with `interactive extraction fallback`.
   - First use Crawl4AI/Playwright capabilities in the Python runner.
   - Add agent-browser only after a proven technical need.

## Better sequencing

1. **Measure current failures first**
   - Review SerpDiscoveryAdapter outcomes on real register rows.
   - Identify whether failures are due to abbreviation parsing, search discovery, dynamic rendering, images, or scoring.

2. **Define persistence and API contracts**
   - Choose `enrichment_targets` vs `official_brand_url_candidates` vs new replacement.
   - Define resolver result shape and evidence schema.
   - Ensure coordinator-runner API remains the only scraper integration path.

3. **Add abbreviation parsing and scoring as pure services**
   - Implement parser/rules and candidate scoring with fixtures.
   - Use existing register rows and known product URLs for tests.

4. **Improve on-demand official-domain discovery**
   - Add sitemap/robots/homepage/category discovery as additional candidate sources for the existing official-brand adapter.
   - Store candidates in the chosen existing candidate table.

5. **Add optional brand URL index only after proving reuse value**
   - Build `brand_url_index` as a brand-level cache, not the primary product workflow.
   - Add crawl jobs, TTL, dedupe, indexing, and admin observability.

6. **Integrate evidence into existing pipeline UI**
   - Start with source tabs / processed review / reviewing workspace.
   - Add URL-index browsing only if admins need to debug crawl coverage.

7. **Add interactive extraction fallback last**
   - Use existing Crawl4AI/browser stack first.
   - Avoid new runtime dependencies unless necessary.

## Recommendation

Do **not** implement the proposal as written. Approve the direction, but revise the plan so it becomes an incremental enhancement of the existing approved-source enrichment pipeline.

Best next move: rewrite the proposal around this architecture:

```text
products_ingestion row with brand_id
→ approved-source official_brand resolver
→ abbreviation parser + candidate scoring
→ existing/newly chosen URL candidate table
→ Crawl4AI extraction through scraper runner
→ products_ingestion.sources enriched with field-level evidence
→ existing processed/reviewing pipeline UI
→ publish only after admin review
```

Only add `brand_url_index` after the team confirms that cached brand-site crawling materially improves coverage or cost versus the existing SerpDiscoveryAdapter.

## Risks

- The local index may become stale and confidently match old/discontinued products.
- Brand umbrella domains may mix multiple brands or product lines, causing false positives.
- Abbreviation rules can overfit if seeded too aggressively.
- Candidate scores may look precise while being poorly calibrated.
- Whole-site crawling can create operational load and domain compliance issues.
- A separate draft table would fragment review state and confuse admins.
- Adding agent-browser prematurely increases runtime complexity without clear benefit.

## Need from main agent

No blocking product decision is required to evaluate the proposal. Before implementation, the main decision needed is:

**Should this be a pipeline-native resolver enhancement, or is there a deliberate desire to create a separate draft lifecycle?**

Oracle recommendation: choose pipeline-native resolver enhancement.

## Suggested execution prompt

No implementation handoff is warranted yet. The next handoff should be a planning/editing task: revise `docs/plans/brand-scoped-official-product-page-discovery-proposal.md` to align with existing `products_ingestion`, `brand_sources`, `enrichment_targets` / `official_brand_url_candidates`, and the Crawl4AI runner architecture.
