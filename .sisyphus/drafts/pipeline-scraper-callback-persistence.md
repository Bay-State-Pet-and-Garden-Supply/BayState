# Draft: Pipeline scraper callback persistence

## Requirements (confirmed)
- Scraper operation was run from `BayStateApp/app/admin/pipeline/`.
- Runner found products on Bradley Caldwell, but scraper results were not saved to pipeline products.
- Ensure runner API endpoint can handle product data from multiple sources.
- Ensure successful scraper results are stored in DB.
- Support variable scraper payload structures (some sources provide more/less fields).
- Ensure DB storage still works when running locally.
- User requested exhaustive search effort: multiple parallel explore/librarian agents + direct Grep/rg/ast-grep.
- Runs should be treated as production persistence runs (not test-only behavior).
- Missing SKU policy confirmed: strict fail (do not auto-upsert missing products_ingestion rows).
- Automated test strategy confirmed: TDD.
- Malformed payload policy: reject callback with 4xx (no partial writes).
- Local auth policy: strict auth always (no local bypass).

## Technical Decisions
- Investigate callback ingestion path first (`app/api/admin/scraping/callback` and downstream persistence).
- Validate schema normalization and source-agnostic handling before DB write.
- Plan should include an explicit source-agnostic payload contract at callback boundary and a resilient persistence path for missing pre-seeded SKU rows.
- Because callback path is unknown, plan should cover BOTH callback handlers (`/api/admin/scraping/callback` and `/api/scraper/v1/chunk-callback`) to avoid blind spots.

## Research Findings
- Prior sessions confirm this code area was previously analyzed (`app/api/admin/scraping/callback/route.ts`, `products_ingestion`, consolidation flow).
- `app/api/admin/scraping/callback/route.ts` updates `products_ingestion` via per-SKU `.update(...).eq('sku', sku)` only; no upsert/insert fallback if SKU row does not exist.
- Same route skips `products_ingestion` writes entirely when `scrape_jobs.test_mode = true`.
- Callback payload typing is semi-flexible (`results.data: Record<string, ScrapedData>`), but `ScrapedData` is narrowed to known fields; extra source fields are still merged at runtime through object spread.
- Potential silent drop path: per-SKU update errors are logged but loop continues; endpoint still returns success.
- Chunk callback route (`app/api/scraper/v1/chunk-callback/route.ts`) has similar behavior; it throws if SKU row missing (`No products_ingestion row found for SKU ...`) but catches at top-level and returns 500.
- Runner auth requires API key (`X-API-Key` / `Bearer bsr_...`) via `validateRunnerAuth`; local runs without valid key will fail before writes.
- Pipeline page reads `products_ingestion` with initial status `staging`; scrape callback sets status to `scraped`.
- Test infra exists: Jest configured in `BayStateApp/package.json` (`"test": "jest"`), with docs recommending `CI=true npm test`.
- Heterogeneous payload support is permissive at ingestion: callbacks merge raw source objects into `sources` JSON, so unknown fields are preserved on write.
- Strictness boundary appears downstream: consolidation filters source fields and maps into a narrower consolidated schema, so non-whitelisted/source-specific fields may not affect final consolidated output unless explicitly normalized.
- Callbacks assume `results.data` shape is `Record<sku, object>`; missing/empty `results.data` can still yield completed jobs with zero product persistence.
- External webhook-ingestion guidance emphasizes: verify/ack quickly, idempotent processing keys, replay-safe storage, tolerant readers for schema evolution, and DLQ/retry patterns.
- Postgres/Supabase guidance reinforces JSONB + normalized columns, targeted GIN/expression indexes, and explicit ON CONFLICT policies for deterministic conflict handling.

## Open Questions
- Which callback path did your run use: `/api/admin/scraping/callback` or `/api/scraper/v1/chunk-callback`?
- (Resolved) malformed payloads: reject callback with explicit 4xx.
- (Resolved) local auth: strict API key auth in all environments.

## Scope Boundaries
- INCLUDE: ingestion endpoint behavior, normalization, persistence path, local-mode behavior.
- EXCLUDE: unrelated scraper extraction logic unless it directly blocks ingestion.

## Test Strategy Decision
- **Infrastructure exists**: YES (Jest)
- **Automated tests**: YES (TDD)
- **Agent-Executed QA**: YES (mandatory regardless of test choice)
