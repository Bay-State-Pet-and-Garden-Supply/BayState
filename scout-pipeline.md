# Pipeline Architecture Investigation

## 1. Pipeline Stages (6 + 1 sub-status)

**Source:** `apps/web/lib/pipeline/types.ts`

The product pipeline is an 8-state state machine persisted in `products_ingestion.pipeline_status`:

| Status | Purpose | Next States |
|---|---|---|
| `imported` | Initial entry point; raw data loaded | `extracting`, `awaiting_brand`, `failed` |
| `awaiting_brand` | Sub-status of imported — product has no brand assigned yet | `imported`, `failed` |
| `extracting` | Scraper/enrichment running on product | `processed`, `imported`, `failed` |
| `processed` | Scraping complete, awaiting AI consolidation | `merging`, `reviewing`, `imported`, `failed` |
| `merging` | Active AI consolidation batch in progress | `reviewing`, `processed`, `failed` |
| `reviewing` | Ready for human review before publishing | `publishing`, `processed`, `failed` |
| `publishing` | Being published to storefront + external exports | `reviewing`, `failed` |
| `failed` | Terminal error state; can be retried | `imported`, `extracting` |

The UI shows 7 tabs: **imported**, **extracting**, **processed**, **merging**, **reviewing**, **publishing**, **failed**. The `awaiting_brand` products are folded into the `imported` tab.

**State machine enforcement:** `apps/web/lib/pipeline/core.ts` — `validateTransition()` prevents invalid transitions.

## 2. How Register Rows Become Products

### Data Flow

```
Register data (Integra ERP) 
    → inventory_reconciliation_items (reconciliation)
    → pushToPipeline() writes to products_ingestion
    → pipeline_status = 'imported'
    → assignProductsToCohorts() groups by UPC prefix + brand
    → User assigns brand → cohort re-assignment
    → brand_id present → eligible for extraction
```

### Import Entry Points

1. **Primary: Integra sync** (`apps/web/lib/admin/integra-sync.ts`)
   - `pushToPipeline()` upserts into `products_ingestion` with `pipeline_status: 'imported'`
   - Sets `input.name` from `issue.register_name`, `input.price` from `issue.register_price`
   - Marks `inventory_reconciliation_items` as `pushed_to_pipeline`
   - Immediately calls `assignProductsToCohorts()` to group new products by UPC prefix

2. **B2B sync** (`apps/web/lib/b2b/sync-service.ts`)
   - Creates products_ingestion rows with `pipeline_status: 'imported'` from distributor feeds

3. **Manual reset** (`apps/web/lib/pipeline.ts`)
   - `clearEnrichmentResultsAndResetStatus()` resets products back to `imported`

### The `products_ingestion` Table Schema

**Source:** `apps/web/SCHEMA.md`, `apps/web/lib/pipeline/types.ts`

```
products_ingestion:
  upc (PK)
  input (jsonb)       — raw imported data (register name, price)
  sources (jsonb)      — scraped data keyed by source slug
  consolidated (jsonb) — AI-consolidated product data
  enrichment_config (jsonb) — per-product extraction config
  pipeline_status (text) — state machine status
  brand_id (uuid) FK → brands
  cohort_id (uuid) FK → cohort_batches
  image_candidates, selected_images
  confidence_score, error_message, retry_count
  created_at, updated_at, exported_at
```

Key design rule: **Price and UPC are PROTECTED fields** that never come from enrichment (`apps/web/lib/enrichment/types.ts`). They always originate from the `products_ingestion.input`.

## 3. The `product_creation_drafts` Table

**Does not exist yet.** It is proposed in `docs/plans/brand-scoped-official-product-page-discovery-proposal.md` (line 487+):

```sql
create table product_creation_drafts (
  id uuid primary key default gen_random_uuid(),
  register_row_id uuid not null,
  brand_id uuid not null references brands(id),
  selected_url_candidate_id uuid,
  draft_product_data jsonb not null,
  confidence numeric,
  status text default 'needs_review',
  evidence jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Draft statuses would be: `needs_review`, `approved`, `rejected`, `needs_more_data`, `unresolved`.

The current system publishes directly from `products_ingestion` → `products` table (storefront) via `publishToStorefront()` — there is no draft table between pipeline review and publishing.

## 4. Complete Product Creation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. IMPORT                                                        │
│    Integra sync → products_ingestion (pipeline_status: imported)  │
│    Auto-cohorting by UPC prefix + brand                          │
├─────────────────────────────────────────────────────────────────┤
│ 2. BRAND ASSIGNMENT                                              │
│    User assigns brand via admin UI → re-cohorts if brand changes  │
│    pipeline_status stays imported until brand is assigned        │
├─────────────────────────────────────────────────────────────────┤
│ 3. SCRAPING / EXTRACTION                                         │
│    a) Approved Source Plan built (apps/web/lib/approved-sources/) │
│       - Looks up brand_sources table for configured sources      │
│       - Falls back to brand.official_domains for ai_only mode    │
│    b) Scraper job dispatched to runner                           │
│    c) Runner executes Crawl4AI engine (Python)                   │
│    d) Results callback → persistProductsIngestionSources*()       │
│       - Stores in products_ingestion.sources                     │
│       - Transitions to pipeline_status: processed                │
├─────────────────────────────────────────────────────────────────┤
│ 4. AI CONSOLIDATION                                              │
│    a) Batch submitted to Gemini (gemini-batch-service.ts)        │
│       or legacy batch-service.ts                                 │
│    b) Status → merging while processing                         │
│    c) Consolidation applies to products_ingestion.consolidated   │
│       - Merges with sources + input data                         │
│    d) On complete → reviewing (if confidence OK) or processed    │
│       (if low confidence)                                        │
├─────────────────────────────────────────────────────────────────┤
│ 5. REVIEW                                                        │
│    Admin reviews consolidated products in pipeline UI            │
│    Can edit, reset to processed, or approve for publishing       │
├─────────────────────────────────────────────────────────────────┤
│ 6. PUBLISH                                                       │
│    publishToStorefront(upc) in apps/web/lib/pipeline/publish.ts  │
│    - Reads products_ingestion where pipeline_status = reviewing  │
│    - Resolves name, description, price, category, facets         │
│    - Migrates images to durable storage                          │
│    - Upserts into products (storefront table)                    │
│    - syncProductCategoryLinks()                                  │
│    - syncProductFacets()                                         │
│    - upsertShopSiteSyncByProductIds() for ShopSite export        │
│    - Transitions to pipeline_status: publishing                  │
├─────────────────────────────────────────────────────────────────┤
│ 7. SHOPSITE EXPORT                                               │
│    shopsite/export-builder.ts picks up publishing products        │
│    Builds XML feed, sends to ShopSite                            │
└─────────────────────────────────────────────────────────────────┘
```

## 5. Existing Crawl4AI Usage

**Heavy usage exists in the Python scraper runner.**

| Component | Path | Purpose |
|---|---|---|
| `Crawl4AIEngine` | `apps/scraper/src/crawl4ai_engine/engine.py` | Main async context manager wrapping `AsyncWebCrawler`. Configuration, result normalization, markdown generation, extraction orchestration. |
| CSS/XPath Strategies | `.../strategies/css_strategy.py`, `xpath_strategy.py` | Wrap `JsonCssExtractionStrategy` / `JsonXPathExtractionStrategy` from crawl4ai. Can build schemas from YAML selectors. |
| `base.py` | `.../strategies/base.py` | Shared `BaseExtractionStrategy` — schema builder from YAML selectors, field normalization, async extraction. |
| `anti_bot.py` | `.../anti_bot.py` | Anti-bot detection and evasion — import-checks crawl4ai's `BrowserConfig`. |
| `retry.py` | `.../retry.py` | Retry logic with crawl4ai-specific site name defaults. |
| `metrics.py` | `.../metrics.py` | `Crawl4AIMetricsCollector` — thread-safe, per-site perf, anti-bot stats. |
| `types.py` | `.../types.py` | `EngineConfig` type definitions. |
| Callback contract | `apps/web/lib/scraper-callback/contract.ts` | Validates `crawl4ai` nested metadata object in callback payloads. |
| Validation test | `apps/web/__tests__/validation/callback-validation.test.ts` | Tests acceptance of `crawl4ai` metadata in completed callbacks. |
| Approved sources | `apps/web/lib/approved-sources/source-plan.ts` | Builds plans with `adapterSlug: "crawl4ai_direct"` for official brand domains. |

**Crawl4AI version constraint:** `crawl4ai>=0.8.0` in `apps/scraper/requirements.txt`.

## 6. Existing agent-browser Usage

**None in the codebase.** The scraper uses Playwright (via Crawl4AI's built-in browser) directly, not agent-browser.

References to agent-browser appear only in the proposal document (`docs/plans/brand-scoped-official-product-page-discovery-proposal.md`) as a planned fallback for dynamic page interaction:

> "Use agent-browser only when Crawl4AI cannot fully inspect a promising page."

agent-browser is **not installed** in `requirements.txt` and **not imported** anywhere in `apps/scraper/`.

## 7. Brands and Official Domains

The `brands` table already has `official_domains` (string[]) and `preferred_domains` (string[]) columns. The `brand_sources` table stores per-source extraction configuration including domains, adapter slugs, and auth requirements.

When brands are created/updated, `syncOfficialBrandSource()` auto-syncs an `official_brand` entry into `brand_sources` (`apps/web/app/admin/brands/actions.ts`).

Recommended sources (`apps/web/lib/approved-sources/source-plan.ts`):
- `official_brand` — scrapes official brand website
- `distributor` — distributor catalog feeds
- `internal` — internal data
- `licensed_feed` — licensed data feeds

Extraction modes: `mixed` (default), `distributor_only`, `ai_only`.

## 8. How the Proposal Would Fit

The **brand-scoped product page discovery proposal** (`docs/plans/brand-scoped-official-product-page-discovery-proposal.md`) is designed to slot **between steps 1 (import) and 3 (scraping)** of the existing pipeline:

### Hook Points

| Proposal Phase | Would Integrate Into |
|---|---|
| Brand official URL setup | Already exists in `brands.official_domains` — minor admin UI enhancements |
| Abbreviation expansion rules | New table + parser — not yet in codebase |
| Brand URL indexer | New table `brand_url_index` + crawl job — would use existing Crawl4AI engine |
| Candidate resolver | New service in `apps/web/lib` or `apps/web/lib/pipeline` |
| Candidate extraction | Would reuse `Crawl4AIEngine` from `apps/scraper` |
| Candidate scoring | New service |
| **Product draft creation** | **New table `product_creation_drafts`** — does not exist yet |
| agent-browser fallback | New — no existing infrastructure |
| Review UI for drafts | New admin UI components |

### Gaps in Existing Architecture

1. **No discovery layer** — current system relies on approved sources (brand_sources with known domains) and direct extraction. There's no brand site crawling/indexing to discover product pages.
2. **No abbreviation expansion** — register names are stored raw in `input.name`; the pipeline doesn't parse them into brand/species/flavor/size tokens.
3. **No `product_creation_drafts` table** — products go directly from pipeline review → storefront `products`. No intermediate draft with evidence tracking.
4. **No URL index** — no `brand_url_index` table or crawling workflow to pre-index brand sites.
5. **No agent-browser** — no fallback for JavaScript-heavy pages that Crawl4AI can't fully handle.

### What Already Exists That Supports the Proposal

- `brands.official_domains` and `brand_sources` already store official site configuration
- Crawl4AI engine is production-ready and used for all extraction
- The approved sources system (`source-plan.ts`) already builds per-UPC extraction plans with official brand domains
- The scraper-callback contract already accepts `crawl4ai` metadata blocks
- Persistence functions (`persistProductsIngestionSources*`) handle multi-source merge
- The pipeline state machine has capacity — drafts could flow into `imported` → `extracting` when ready for scraping

## 9. Key Files for Further Investigation

| Priority | File | Why |
|---|---|---|
| 1 | `apps/web/lib/pipeline/types.ts` | Pipeline types — defines every status and transition |
| 2 | `apps/web/lib/pipeline/core.ts` | Transition validation |
| 3 | `apps/web/lib/pipeline/publish.ts` | Current publish flow (products_ingestion → products) |
| 4 | `apps/web/lib/pipeline/queries.ts` | How pipeline products are queried |
| 5 | `apps/web/lib/admin/integra-sync.ts` | Primary import path (register → products_ingestion) |
| 6 | `apps/web/lib/scraper-callback/products-ingestion.ts` | Result persistence (scraper → products_ingestion) |
| 7 | `apps/web/lib/approved-sources/source-plan.ts` | How source plans are built from brand_sources |
| 8 | `apps/web/lib/enrichment/types.ts` | Protected fields rule (price/UPC never from enrichment) |
| 9 | `apps/scraper/src/crawl4ai_engine/engine.py` | Crawl4AIEngine — main crawler orchestration |
| 10 | `apps/scraper/src/crawl4ai_engine/strategies/base.py` | How extraction strategies are built from YAML |
| 11 | `apps/web/SCHEMA.md` | Schema guide — authoritative table classification |
| 12 | `docs/plans/brand-scoped-official-product-page-discovery-proposal.md` | The proposal itself |
