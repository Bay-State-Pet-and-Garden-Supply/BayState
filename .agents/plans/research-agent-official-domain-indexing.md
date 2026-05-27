# Research Agent Official-Domain Indexing Implementation Plan

## Objective

Make the research-agent self-sufficient for product page discovery when ingestion uploads only:

- `upc`
- `registerName`
- `brand`
- brand official domain / official website URL

The discovery pipeline should prefer cached/indexed official-brand pages, use Serper.dev as a fallback/cold-start discovery source, and verify candidates through existing deterministic acquisition/extraction/verification stages.

## Recommended Direction

Build a shared local SQLite-backed official-domain page index for the research-agent MVP.

Do **not** create one SQLite database per research-agent run. Use one shared research cache per local research-agent runtime, with WAL enabled and a single write path. Multiple research-agent runs can read from it and reuse previous crawls.

Long-term, promote the same conceptual model into the web coordinator/Supabase once the local contract stabilizes.

## Current Baseline

Relevant files:

- `apps/research-agent/src/schemas/ProductResearchInput.ts`
- `apps/research-agent/src/pipeline/discovery/official-domain-discovery.ts`
- `apps/research-agent/src/pipeline/discovery/serper-candidate-discovery.ts`
- `apps/research-agent/src/pipeline/discovery/static-candidate-discovery.ts`
- `apps/research-agent/src/pipeline/runProductResearchPipeline.ts`
- `apps/research-agent/src/pipeline/acquisition/http-page-acquisition.ts`
- `apps/research-agent/src/pipeline/extraction/*`
- `apps/research-agent/src/pipeline/verification/candidate-verifier.ts`
- `apps/research-agent/src/research/runProductResearchV2.ts`

Current direction already supports:

- UPC as required input anchor.
- Official domain/website as required discovery source.
- Optional `seedCandidateUrls` for tests/manual investigation.
- Serper.dev provider for external discovery.

Needed next step:

- Add a durable official-domain index/cache and make it the first discovery source.

## High-Level Architecture

```txt
ProductResearchInput
  upc + registerName + brand + officialDomain
        |
        v
Brief Builder
        |
        v
Discovery Providers, ordered by trust/cost:
  1. Local Official Domain Index Lookup
  2. Official Domain Fresh Crawl / Sitemap Indexer
  3. Serper site:domain queries
  4. Broader Serper UPC/name queries
  5. Optional seedCandidateUrls for manual/dev use
        |
        v
Deduplicate + Rank Candidates
        |
        v
Acquire Pages + Extract Facts
        |
        v
Verify UPC/register-name/brand evidence
        |
        v
ProductResearchReport + Storefront Draft
```

## Core Design Decisions

### 1. Use one shared SQLite cache per research-agent runtime

Default path:

```txt
apps/research-agent/.cache/research-agent/page-index.sqlite
```

Allow override:

```txt
RESEARCH_AGENT_CACHE_DB=/custom/path/page-index.sqlite
```

Rationale:

- Avoid repeated crawling for the same brand.
- Avoid conflicting per-run caches.
- Keep local MVP simple.
- SQLite is sufficient for local single-machine read-heavy workloads.

SQLite settings:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

### 2. Store extracted facts and searchable text, not just raw HTML

Raw HTML is useful for debugging but expensive to keep forever. Store:

- URL metadata
- fetch status
- content hash
- title/description/text excerpt
- extracted UPC/GTIN/SKU/brand/images/categories/attributes
- FTS text for lookup
- optional raw HTML path/blob with retention policy

### 3. Make indexing idempotent and TTL-aware

Each URL has:

- `lastFetchedAt`
- `lastIndexedAt`
- `contentHash`
- `fetchStatus`
- `errorMessage`
- `ttlExpiresAt`

Re-crawl only when:

- URL is missing
- TTL expired
- forced refresh requested
- previous fetch failed and retry backoff elapsed

### 4. Keep Serper.dev as fallback, not source of truth

Use Serper when:

- local index has no strong exact UPC/GTIN/SKU matches
- local FTS has no plausible register-name matches
- official sitemap is missing/incomplete
- cache is stale or cold

Serper queries should include:

```txt
site:<domain> "<upc>"
site:<domain> "<registerName>"
"<upc>" <brand>
<brand> <registerName> <upc>
```

### 5. Production promotion path

Do local SQLite first. Later move coordinator-owned cache to Supabase tables/object storage so all web workers and research runners share the same index.

## Proposed File/Module Layout

```txt
apps/research-agent/src/cache/
  page-index-db.ts              # SQLite connection, migrations, WAL config
  page-index-repository.ts      # CRUD/query methods
  page-index-schema.ts          # TypeScript types for persisted rows
  page-index-migrations.ts      # Local SQL migrations

apps/research-agent/src/pipeline/discovery/
  official-domain-index-discovery.ts   # Query cache for candidates
  official-domain-indexer.ts           # Crawl/index domain pages
  sitemap-url-discovery.ts             # Sitemap/sitemap-index parser
  product-url-classifier.ts            # Product-like URL heuristics

apps/research-agent/tests/
  page-index-db.test.ts
  official-domain-index-discovery.test.ts
  official-domain-indexer.test.ts
  sitemap-url-discovery.test.ts
```

## SQLite Schema Draft

### `domains`

```sql
create table if not exists domains (
  id integer primary key autoincrement,
  normalized_domain text not null unique,
  official_website_url text,
  brand_name text,
  created_at text not null,
  updated_at text not null,
  last_sitemap_checked_at text,
  last_crawl_started_at text,
  last_crawl_completed_at text
);
```

### `domain_urls`

```sql
create table if not exists domain_urls (
  id integer primary key autoincrement,
  domain_id integer not null references domains(id) on delete cascade,
  url text not null unique,
  normalized_url text not null unique,
  url_type text not null default 'unknown',
  discovered_from text,
  first_seen_at text not null,
  last_seen_at text not null,
  last_fetched_at text,
  fetch_status integer,
  fetch_error text,
  content_hash text,
  title text,
  description text,
  text_excerpt text,
  is_product_like integer not null default 0,
  index_status text not null default 'pending'
);

create index if not exists idx_domain_urls_domain_id on domain_urls(domain_id);
create index if not exists idx_domain_urls_product_like on domain_urls(domain_id, is_product_like);
```

### `page_facts`

```sql
create table if not exists page_facts (
  id integer primary key autoincrement,
  domain_url_id integer not null references domain_urls(id) on delete cascade,
  source_url text not null,
  title text,
  description text,
  images_json text not null default '[]',
  categories_json text not null default '[]',
  attributes_json text not null default '{}',
  upcs_json text not null default '[]',
  brand text,
  confidence real not null default 0,
  evidence_json text not null default '[]',
  jsonld_json text not null default '[]',
  extracted_at text not null
);

create index if not exists idx_page_facts_domain_url_id on page_facts(domain_url_id);
```

### `page_fts`

Use SQLite FTS5 over normalized searchable content.

```sql
create virtual table if not exists page_fts using fts5(
  normalized_url unindexed,
  normalized_domain unindexed,
  title,
  description,
  body,
  attributes,
  tokenize = 'porter unicode61'
);
```

### Optional `crawl_runs`

```sql
create table if not exists crawl_runs (
  id integer primary key autoincrement,
  normalized_domain text not null,
  run_type text not null,
  status text not null,
  started_at text not null,
  completed_at text,
  urls_discovered integer not null default 0,
  urls_fetched integer not null default 0,
  urls_indexed integer not null default 0,
  error text
);
```

## Discovery Scoring Strategy

### Exact identifier match

Highest confidence if page facts contain exact normalized UPC in any of:

- `gtin`
- `gtin8`
- `gtin12`
- `gtin13`
- `gtin14`
- `sku`
- `mpn`
- heuristic barcode sequences

### FTS/register-name match

If no exact UPC match:

- tokenize `registerName`
- remove brand/UPC anchor tokens
- query FTS for remaining descriptor tokens
- boost product-like paths
- boost official-domain/subdomain pages
- penalize category/search/blog/support pages

### Candidate source types

Add or reuse source types:

- `official_index_exact` if schema can be expanded later
- for current schema, use `official` with `discoveredFrom: page-index:exact-upc`
- `sitemap` for newly discovered sitemap URLs
- `serp` for Serper results
- `input` only for `seedCandidateUrls`

## Implementation Phases

### Phase 1 — Local SQLite cache foundation

Goal: Add reusable local page-index storage with tests.

Tasks:

1. Add `src/cache/page-index-db.ts` using Bun SQLite (`bun:sqlite`).
2. Initialize cache DB path from `RESEARCH_AGENT_CACHE_DB` or default `.cache/research-agent/page-index.sqlite`.
3. Create migration/bootstrap SQL.
4. Enable WAL and busy timeout.
5. Add repository methods:
   - `upsertDomain()`
   - `upsertDiscoveredUrl()`
   - `markFetchResult()`
   - `upsertPageFacts()`
   - `searchByUpc()`
   - `searchByText()`
   - `getStaleProductLikeUrls()`
6. Add unit tests with temporary SQLite DB files.

Acceptance criteria:

- Cache initializes with migrations.
- Re-running migrations is idempotent.
- Exact UPC and FTS queries return expected URLs.
- Tests pass with no network access.

### Phase 2 — Sitemap and official URL discovery

Goal: Populate URL inventory for an official domain.

Tasks:

1. Extract sitemap logic from `official-domain-discovery.ts` into `sitemap-url-discovery.ts`.
2. Support:
   - `/sitemap.xml`
   - sitemap indexes
   - nested sitemap files
   - basic gzip if needed later
3. Add URL classifier:
   - product-like path hints: `/product`, `/products`, `/shop`, `/item`, `/p/`, `/recipes` for pet food brands
   - low-signal hints: `/blog`, `/support`, `/contact`, `/account`, `/cart`, `/search`
4. Store discovered URLs in `domain_urls`.
5. Limit first MVP crawl size per domain, e.g. 500 discovered URLs and 50 product-like fetches per indexing pass.

Acceptance criteria:

- Given fixture sitemap XML, product-like URLs are extracted and stored.
- Low-signal URLs are stored or ignored according to classifier rules.
- Indexer is idempotent.

### Phase 3 — Page acquisition + fact extraction into index

Goal: Reuse existing page acquisition and extractors to fill the cache.

Tasks:

1. Implement `OfficialDomainIndexer` that accepts:
   - `ProductResearchBrief`
   - acquisition provider
   - fact extractors
   - cache repository
2. Fetch product-like URLs subject to limits/timeouts.
3. Run existing extractors:
   - `JsonLdExtractor`
   - `MetaExtractor`
   - `TextHeuristicExtractor`
4. Merge facts with `mergePageFacts()`.
5. Persist facts and FTS text.
6. Store fetch failures with retry/backoff metadata.

Acceptance criteria:

- A mocked acquisition response with JSON-LD product data creates searchable facts.
- Exact UPC lookup finds the indexed page.
- Register-name FTS lookup finds product-like pages.

### Phase 4 — Official-domain index discovery provider

Goal: Make indexed official pages the first discovery provider.

Tasks:

1. Add `OfficialDomainIndexDiscovery` implementing `CandidateDiscoveryProvider`.
2. Query order:
   - exact UPC facts
   - UPC in FTS/body
   - register-name/title/path FTS
3. Return `CandidateUrlInput[]` with:
   - `sourceType: "official"`
   - title/snippet from cached facts
   - `discoveredFrom: "page-index:<match-type>"`
4. Add warnings for cache misses/stale cache.
5. Wire provider before `OfficialDomainDiscovery` and `SerperCandidateDiscovery` in `runProductResearchV2.ts`.

Acceptance criteria:

- If cache has exact UPC page, pipeline discovers it without Serper.
- If cache misses, pipeline still falls through to current discovery providers.
- Candidate ranking prefers exact official indexed match.

### Phase 5 — Cold-start indexing during research runs

Goal: If cache is empty/stale, index enough official-domain pages to help the current product.

Tasks:

1. Add an option to `runProductResearchV2()`:

```ts
indexing?: "off" | "lookup-only" | "refresh-stale" | "cold-start"
```

Default for CLI local runs:

```txt
cold-start
```

Default for tests:

```txt
off or lookup-only
```

2. In pipeline discovery:
   - query cache first
   - if insufficient candidates and indexing enabled, run bounded indexer
   - query cache again
   - then fall through to Serper
3. Add controls:
   - max discovered URLs
   - max pages fetched
   - max elapsed time
   - force refresh flag

Acceptance criteria:

- Cold cache can crawl a fixture sitemap, index pages, and select candidate.
- Slow/failed indexing does not block fallback discovery indefinitely.

### Phase 6 — CLI and operational controls

Goal: Make indexing inspectable and controllable from local CLI.

Add commands:

```txt
bun run research-product --input <path> --indexing cold-start
bun run research-product --input <path> --indexing lookup-only
bun run research-product --input <path> --force-index-refresh
bun run research-product index-domain --brand <brand> --domain <domain>
bun run research-product cache-stats
```

Or, if keeping one command is cleaner, add subcommands directly in `src/cli.ts`:

```txt
bun run src/cli.ts index-domain --brand Fromm --domain frommfamily.com
bun run src/cli.ts cache-stats
bun run src/cli.ts cache-prune --older-than-days 30
```

Acceptance criteria:

- Developer can pre-index a domain.
- Developer can inspect cache counts.
- Developer can prune old failed/raw content records.

### Phase 7 — Tests and fixtures

Add fixtures:

```txt
apps/research-agent/tests/fixtures/sitemaps/fromm-sitemap.xml
apps/research-agent/tests/fixtures/pages/fromm-product-jsonld.html
apps/research-agent/tests/fixtures/pages/generic-category-page.html
```

Test categories:

1. DB migration/idempotency.
2. Sitemap parsing.
3. Product URL classification.
4. Page fact persistence.
5. Exact UPC lookup.
6. Register-name FTS lookup.
7. Discovery provider cache-hit behavior.
8. Pipeline fallback behavior when cache misses.
9. Pipeline does not call Serper when strong cache candidate exists.
10. Pipeline calls Serper when cache/indexing cannot find candidates.

### Phase 8 — Future coordinator/Supabase promotion

Do not implement this in MVP, but design local interfaces so they can later map to coordinator persistence.

Possible future tables in web app:

- `brand_domain_pages`
- `brand_domain_page_facts`
- `brand_domain_crawl_runs`
- `brand_domain_page_embeddings` or FTS/search vector table

Promotion strategy:

- Keep research-agent interfaces repository-based.
- Add Supabase repository implementation later.
- Do not let pipeline stages depend directly on SQLite APIs.

## Suggested Interface Sketches

### Cache repository

```ts
export interface PageIndexRepository {
  upsertDomain(input: UpsertDomainInput): Promise<IndexedDomain>;
  upsertDiscoveredUrls(domain: string, urls: DiscoveredDomainUrl[]): Promise<void>;
  upsertPageFacts(input: UpsertPageFactsInput): Promise<void>;
  searchByUpc(input: PageIndexUpcSearchInput): Promise<IndexedPageCandidate[]>;
  searchByText(input: PageIndexTextSearchInput): Promise<IndexedPageCandidate[]>;
  getStats(): Promise<PageIndexStats>;
}
```

### Index discovery provider

```ts
export class OfficialDomainIndexDiscovery implements CandidateDiscoveryProvider {
  constructor(private readonly repo: PageIndexRepository) {}

  async discoverCandidates(
    brief: ProductResearchBrief,
    context: ProductResearchPipelineContext,
  ): Promise<DiscoveryResult> {
    // exact UPC search, then FTS search
  }
}
```

### Indexer

```ts
export class OfficialDomainIndexer {
  async indexDomainForBrief(
    brief: ProductResearchBrief,
    context: ProductResearchPipelineContext,
    options: OfficialDomainIndexingOptions,
  ): Promise<OfficialDomainIndexingResult> {
    // sitemap discovery, bounded acquisition, extraction, persist facts
  }
}
```

## Risk Assessment

### Risk: Crawling too many pages

Mitigation:

- Bounded URL discovery and fetch limits.
- Product-like URL classifier.
- Per-domain TTL/backoff.
- CLI pre-index command for larger jobs.

### Risk: Official pages omit UPC

Mitigation:

- Store/register-name FTS search.
- Use Serper fallback.
- Allow distributor candidate verification when official evidence is incomplete.

### Risk: SQLite writer contention

Mitigation:

- WAL mode.
- Single repository write path.
- Keep writes small and transaction-batched.
- For production, move to coordinator-owned persistence.

### Risk: Cache staleness

Mitigation:

- TTL fields.
- Content hashes.
- `--force-index-refresh`.
- Revalidate selected canonical URL during acquisition/verification.

### Risk: Storing too much raw HTML

Mitigation:

- Store extracted facts and FTS text as primary cache.
- Store raw HTML only optionally or with pruning.
- Add cache stats/prune command.

## MVP Acceptance Criteria

The feature is MVP-complete when:

1. Research-agent can initialize and query a shared SQLite page index.
2. Official sitemap/product pages can be indexed into SQLite.
3. Exact UPC lookup can produce official-domain candidates without Serper.
4. FTS lookup can produce plausible official-domain candidates when UPC is absent from page facts.
5. Serper remains available as fallback.
6. Existing product research pipeline still returns schema-valid `ProductResearchReport` and storefront draft.
7. Focused tests pass:

```txt
cd apps/research-agent
bun run typecheck
bun run test
```

## Recommended Initial PR Scope

Keep the first implementation PR narrow:

1. Add SQLite cache + migrations + repository tests.
2. Add page-index discovery provider with exact UPC + FTS lookup.
3. Wire lookup-only provider before Serper.
4. Add fixtures and tests.

Defer full cold-start crawling/indexing to a second PR if the first PR becomes too large.

## Final Recommendation

Use official-domain indexing as the primary discovery path and Serper.dev as the fallback. A shared SQLite cache is not excessive for the local MVP; per-agent SQLite instances would be excessive. Keep the cache behind repository interfaces so we can promote it to coordinator-owned persistence later without rewriting pipeline logic.
