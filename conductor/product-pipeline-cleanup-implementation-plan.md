# Implementation Plan

## Goal
Simplify BayState's product pipeline into a static-scrape-first workflow with per-SKU, quality-gated SERPER/AI fallback, a manual fallback approval gate, and one unified admin `Results` tab for all usable source results.

## Tasks

1. **Lock the target state model**
   - File: `apps/web/lib/pipeline/types.ts`
   - Changes: Keep `scraped` as the persisted DB status but relabel it to `Results` in `STAGE_CONFIG`; add a new persisted status `needs_fallback_review` for products whose static scrape did not meet identity-quality rules. Keep `searching`, `url_review`, and `extracting` as fallback operational statuses, not admin-selected entry points.
   - Acceptance: `PIPELINE_TABS` can show a simple admin flow: `imported`, `scraping`, `needs_fallback_review`, `scraped`/Results, `consolidating`, `finalizing`, `exporting`, `failed`; fallback operational statuses remain queryable/deep-linkable as needed.

2. **Create the DB migration for fallback review state and metadata**
   - File: `apps/web/supabase/migrations/YYYYMMDDHHMMSS_add_static_first_fallback_review.sql`
   - Changes: Add `needs_fallback_review` to enum `pipeline_status_five`. Add optional JSONB columns on `products_ingestion`: `scrape_quality jsonb default '{}'::jsonb` and `fallback_metadata jsonb default '{}'::jsonb`; add partial indexes for `pipeline_status = 'needs_fallback_review'` and `fallback_metadata` only if query plans need them.
   - Acceptance: Existing rows remain unchanged; products in `scraped` still appear in the renamed `Results` tab; no direct DB rename from `scraped` to `results` is performed.

3. **Update generated/shared DB types after migration**
   - File: `apps/web/lib/supabase/database.types.ts`
   - Changes: Regenerate or manually update enum/type entries for `needs_fallback_review`, `scrape_quality`, and `fallback_metadata`.
   - Acceptance: TypeScript accepts the new status and columns without casts.

4. **Revise transition rules**
   - File: `apps/web/lib/pipeline/core.ts`
   - Changes: Remove direct `imported -> searching`; add `needs_fallback_review` transitions: from `scraping`/`scraped` to `needs_fallback_review`, from `needs_fallback_review` to `searching`, `scraped`, `imported`, or `failed`; keep `searching -> url_review/extracting`, `url_review -> extracting`, `extracting -> scraped` for fallback execution only.
   - Acceptance: `validateTransition('imported', 'searching')` is false; fallback approval transitions are true.

5. **Separate static scrape orchestration from fallback orchestration**
   - Files: `apps/web/lib/pipeline-scraping.ts`, `apps/web/lib/pipeline-scraping-types.ts`
   - Changes: Rename or internally narrow the current `scrapeProducts()` contract so it only creates standard static YAML scraper jobs (`type: 'standard'`); remove `enrichment_method`, `officialBrandPhase`, `deepResearchCohort`, direct `deep_research`, and direct official-brand URL discovery/extraction branches from this static path.
   - Acceptance: Static scrape job inserts never produce `ai_search`, `official_brand_url_discovery`, `official_brand_extraction`, or `deep_research` job types.

6. **Add fallback orchestration as a separate module**
   - New File: `apps/web/lib/pipeline/fallback-orchestration.ts`
   - Changes: Implement coordinator-owned functions to approve fallback for SKUs, call existing server-side SERPER discovery via `runOfficialBrandDiscovery()`, choose/queue extraction through the existing direct URL/product URL extraction path, and persist approval/provenance metadata. Do not add DB access to the Python runner.
   - Acceptance: Fallback can be started only through this module/API and always records `approved_by`, `approved_at`, `budget_scope`, `quality_reason`, and source job IDs in `fallback_metadata`/`scrape_jobs.metadata`.

7. **Implement per-SKU static result quality evaluation**
   - New File: `apps/web/lib/pipeline/scrape-quality.ts`
   - Changes: Add `evaluateScrapeQuality(sku, input, sources)` that passes only when at least one source has a matched SKU/identifier plus core identity fields: title/name, brand/manufacturer, source URL, and any useful enrichment if present (image/category/specs). Explicitly do not require price, stock, or availability.
   - Acceptance: Returns a typed verdict with `pass | needs_fallback_review`, missing fields, source scores, and reason; unit tests cover price absence as non-failure.

8. **Route static callbacks by quality**
   - Files: `apps/web/app/api/scraper/v1/chunk-callback/route.ts`, `apps/web/lib/scraper-callback/products-ingestion.ts`
   - Changes: Persist all meaningful source payloads, then evaluate each SKU after static job completion. Move passing SKUs to `scraped`/Results and failing SKUs to `needs_fallback_review`, writing `scrape_quality`. Remove official-brand/deep-research callback branching from the standard static path; keep extraction callback handling only for fallback jobs.
   - Acceptance: A single static job can produce mixed outcomes: some SKUs in `scraped`, some in `needs_fallback_review`.

9. **Simplify the admin static scrape API**
   - File: `apps/web/app/api/admin/pipeline/scrape/route.ts`
   - Changes: Stop accepting `enrichment_method`, `official_brand_phase`, `urls_by_sku`, and `deep_research`; require SKUs and optional static scraper slugs only; call the static orchestration path.
   - Acceptance: Requests with legacy enrichment-method fields are ignored or rejected with a clear 400; successful requests only start static scraper jobs.

10. **Add fallback approval API**
    - New File: `apps/web/app/api/admin/pipeline/fallback/route.ts`
    - Changes: Add `GET` for products in `needs_fallback_review`; add `POST` actions `approve_fallback`, `mark_results_anyway`, and `return_to_import`. `approve_fallback` transitions SKUs to fallback operational statuses and calls `fallback-orchestration.ts`.
    - Acceptance: Admins can approve fallback per SKU/cohort; fallback cannot be started for SKUs that did not pass through `needs_fallback_review` unless an explicit override is recorded.

11. **Keep URL candidate review as fallback-only infrastructure**
    - Files: `apps/web/app/api/admin/pipeline/official-brand/*/route.ts`, `apps/web/lib/official-brand-discovery.ts`, `apps/web/lib/official-brand-workflow.ts`, `apps/web/components/admin/pipeline/UrlReviewWorkspace.tsx`, `apps/web/components/admin/pipeline/OfficialBrandReviewClient.tsx`
    - Changes: Reword from “Official Brand” first-class method to “Fallback URL candidates”; hide direct entry from imported products; preserve candidate selection/extraction if fallback discovery returns ambiguous URLs.
    - Acceptance: Admins no longer choose Official Brand as an initial scrape method, but fallback approval can still reuse candidate review/extraction safely.

12. **Replace the Scraped tab with unified Results UI**
    - Files: `apps/web/components/admin/pipeline/ScrapedResultsView.tsx`, `apps/web/components/admin/pipeline/PipelineClient.tsx`, `apps/web/components/admin/pipeline/StageTabs.tsx`
    - Changes: Rename UI labels and tests from `Scraped` to `Results` while still querying status `scraped`; show both static sources and fallback extraction sources in the same source switcher; add provenance badges such as `Static scraper` and `Fallback SERPER/AI`.
    - Acceptance: Products from static and fallback extraction both appear in one `Results` workspace and can be consolidated from there.

13. **Remove direct enrichment method choices from admin UI**
    - Files: `apps/web/components/admin/pipeline/PipelineClient.tsx`, `apps/web/components/admin/pipeline/ScraperSelectDialog.tsx`, `apps/web/components/admin/pipeline/FloatingActionsBar.tsx`, `apps/web/components/admin/pipeline/ImportedResultsView.tsx`
    - Changes: `ScraperSelectDialog.onConfirm` accepts only scraper slugs; remove `Discover URLs`, Official Brand, Deep Research, and direct AI method controls from Imported/Results actions; add Fallback Review actions only in the new fallback review workspace.
    - Acceptance: Admin path is `Imported -> Scrape Selected -> Scraping -> Results or Fallback Review`; no strategy choice is displayed before static scraping.

14. **Add fallback review workspace**
    - New File: `apps/web/components/admin/pipeline/FallbackReviewView.tsx`
    - Changes: Show failed quality reason, missing identity fields, attempted static sources, source snippets, and estimated fallback cost/budget warning. Actions: `Approve fallback`, `Mark as Results`, `Return to Imported`, `Fail`.
    - Acceptance: Review is per-SKU and supports bulk approval, but cost approval remains explicit.

15. **Standardize provenance conventions**
    - Files: `apps/web/lib/scraper-callback/products-ingestion.ts`, `apps/web/lib/product-sources.ts`, `apps/web/lib/consolidation/*`
    - Changes: For each source record, add `_provenance` fields: `source_kind` (`static_scraper` | `fallback_serper_ai`), `scrape_job_id`, `scrape_chunk_id`, `source_url`, `scraper_slug`, `quality_score`, and optional `serper_query`/`llm_model`. Keep top-level `sources._meta` for aggregate source history if needed.
    - Acceptance: Existing source filters ignore `_` metadata; consolidation can display source provenance without treating metadata as a product field.

16. **Standardize job metadata**
    - Files: `apps/web/lib/pipeline-scraping.ts`, `apps/web/lib/pipeline/fallback-orchestration.ts`, `apps/web/app/api/scraper/v1/poll/route.ts`
    - Changes: Add `metadata.pipeline_version = 'static_first_v1'`; use `orchestration_kind = 'static_scrape' | 'fallback_serper_discovery' | 'fallback_url_extraction'`; record `fallback_parent_job_id`, `approved_by`, `approved_at`, `quality_threshold_version`, `budget_scope`, and `source_kind`.
    - Acceptance: Active runs and callback logs can distinguish static and fallback work without relying on legacy `enrichment_method`.

17. **Clean up legacy web job types and branches**
    - Files: `apps/web/lib/pipeline-scraping.ts`, `apps/web/lib/pipeline-scraping-types.ts`, `apps/web/app/api/admin/pipeline/scrape/route.ts`, `apps/web/app/api/scraper/v1/poll/route.ts`, `apps/web/app/api/scraper/v1/job/route.ts`, `apps/web/app/api/admin/scraping/callback/route.ts`, `apps/web/lib/scraper-callback/contract.ts`
    - Changes: Remove/deprecate first-class `ai_search`, `official_brand_url_discovery`, `official_brand_extraction`, `legacy_combined`, and `deep_research` dispatch. Keep only the extraction capability required by fallback, named as fallback extraction rather than Official Brand enrichment.
    - Acceptance: Grep for legacy job types shows only migration compatibility, explicit rejection, archived docs, or tests that verify rejection.

18. **Keep Python runner stateless and narrow**
    - Files: `apps/scraper/runner/__init__.py`, `apps/scraper/runner/chunk_mode.py`, `apps/scraper/core/api_client.py`, `apps/scraper/scrapers/product_url_extraction/extractor.py`
    - Changes: Ensure runner only executes assigned static YAML jobs and approved fallback URL extraction jobs; leave SERPER discovery decisions in the web coordinator; keep existing rejection for deprecated direct AI/search job types.
    - Acceptance: Runner tests confirm deprecated job types fail fast and no DB credentials/access are added.

19. **Update pipeline queries and counts**
    - Files: `apps/web/lib/pipeline.ts`, `apps/web/app/api/admin/pipeline/counts/route.ts`, `apps/web/app/api/admin/pipeline/route.ts`, `apps/web/app/admin/pipeline/page.tsx`
    - Changes: Include `needs_fallback_review` in counts and product queries; make `Results` query status `scraped`; adjust available source filters to work across static and fallback source kinds.
    - Acceptance: Counts match DB statuses and `Results` tab source filters include both static and fallback source keys.

20. **Update tests for state model and static-first behavior**
    - Files: `apps/web/__tests__/lib/pipeline-status-validation.test.ts`, `apps/web/lib/pipeline/core.test.ts`, `apps/web/__tests__/lib/pipeline-transition.test.ts`, `apps/web/__tests__/lib/pipeline-scraping.test.ts`, `apps/web/__tests__/components/admin/pipeline/ScrapedResultsView.test.tsx`, `apps/web/__tests__/components/admin/pipeline/PipelineClient.operational-tabs.test.tsx`
    - Changes: Add `needs_fallback_review`, remove direct `imported -> searching`, assert static scrape route rejects legacy enrichment methods, update `Scraped` labels to `Results`, and add mixed callback quality routing tests.
    - Acceptance: Focused web tests pass.

21. **Update fallback/official-brand review tests**
    - Files: `apps/web/__tests__/lib/official-brand-review.test.ts`, `apps/web/__tests__/api/admin/pipeline/active-runs.test.ts`, new `apps/web/__tests__/lib/pipeline-scrape-quality.test.ts`, new `apps/web/__tests__/api/admin/pipeline/fallback-route.test.ts`
    - Changes: Recast official-brand tests as fallback URL candidate/extraction tests; add quality verdict coverage and approval metadata coverage.
    - Acceptance: Tests prove fallback is per-SKU, approval-gated, and not cohort-wide.

22. **Update scraper tests around legacy paths**
    - Files: `apps/scraper/tests/unit/test_ai_search_e2e_runner.py`, `apps/scraper/tests/test_official_brand_search.py`, `apps/scraper/tests/unit/test_official_brand_scraper.py`, `apps/scraper/tests/test_runner_entrypoints.py`, `apps/scraper/tests/unit/test_api_client.py`
    - Changes: Keep tests for stateless runner and direct URL extraction; update/remove tests that expect direct `ai_search` or `official_brand_*` runner jobs to execute; add rejection tests for deprecated job types.
    - Acceptance: Normal scraper pytest subset passes without live/SERPER tests.

23. **Update docs and cleanup references**
    - Files: `apps/web/AGENTS.md`, `apps/web/app/admin/AGENTS.md`, `conductor/research-serper-fallback.md`, relevant README/admin docs
    - Changes: Document the flow as Static Scrape -> Fallback Review -> SERPER/AI Fallback -> Results -> Consolidation; note price is not part of scrape quality; record legacy deprecations.
    - Acceptance: Admin docs no longer describe choosing between static, AI search, deep research, or Official Brand as initial scrape methods.

24. **Run focused validation**
    - Files: N/A
    - Changes: Run commands below after implementation.
    - Acceptance: All focused checks pass before broad CI.

## Files to Modify

- `apps/web/lib/pipeline/types.ts` - add `needs_fallback_review`; relabel `scraped` as `Results`; separate persisted statuses from visible tabs if needed.
- `apps/web/lib/pipeline/core.ts` - transition matrix for static-first and fallback approval.
- `apps/web/lib/pipeline.ts` - counts, queries, sources, transition helpers for new state and Results label.
- `apps/web/lib/pipeline-scraping.ts` - static-only scrape orchestration.
- `apps/web/lib/pipeline-scraping-types.ts` - remove legacy enrichment options from static scrape options.
- `apps/web/lib/scraper-callback/products-ingestion.ts` - quality-aware source persistence and provenance.
- `apps/web/lib/product-sources.ts` - provenance normalization/metadata handling.
- `apps/web/app/api/admin/pipeline/scrape/route.ts` - static scrape API only.
- `apps/web/app/api/scraper/v1/chunk-callback/route.ts` - callback quality routing and simplified static path.
- `apps/web/app/api/scraper/v1/poll/route.ts` - stop dispatching legacy first-class job types.
- `apps/web/app/api/scraper/v1/job/route.ts` - align job type normalization/rejection.
- `apps/web/app/api/admin/pipeline/official-brand/*/route.ts` - reuse as fallback URL candidate/extraction endpoints or rename in a later cleanup.
- `apps/web/components/admin/pipeline/PipelineClient.tsx` - remove enrichment-method UI; route fallback review and Results workspace.
- `apps/web/components/admin/pipeline/ScraperSelectDialog.tsx` - static scraper selection only.
- `apps/web/components/admin/pipeline/FloatingActionsBar.tsx` - remove direct URL discovery/Official Brand actions.
- `apps/web/components/admin/pipeline/ImportedResultsView.tsx` - remove fallback method prompts from import workspace.
- `apps/web/components/admin/pipeline/ScrapedResultsView.tsx` - rename/rework as unified Results view with provenance badges.
- `apps/web/components/admin/pipeline/StageTabs.tsx` - simple visible flow and Results label.
- `apps/scraper/runner/__init__.py` and related runner files - keep stateless execution and legacy job-type rejection.
- Existing web and scraper tests listed above - update expectations.

## New Files

- `apps/web/supabase/migrations/YYYYMMDDHHMMSS_add_static_first_fallback_review.sql` - enum/metadata migration.
- `apps/web/lib/pipeline/scrape-quality.ts` - per-SKU identity quality evaluator.
- `apps/web/lib/pipeline/fallback-orchestration.ts` - coordinator-owned SERPER/AI fallback approval and job creation.
- `apps/web/app/api/admin/pipeline/fallback/route.ts` - fallback review list/actions.
- `apps/web/components/admin/pipeline/FallbackReviewView.tsx` - manual fallback gate UI.
- `apps/web/__tests__/lib/pipeline-scrape-quality.test.ts` - quality evaluator tests.
- `apps/web/__tests__/api/admin/pipeline/fallback-route.test.ts` - fallback API tests.

## Data Handling and Migration Notes

- Do **not** rename persisted `scraped` to `results`; use `Results` as UI label only.
- Add `needs_fallback_review` with `ALTER TYPE pipeline_status_five ADD VALUE IF NOT EXISTS` before code deploy that writes it.
- Backfill is optional: leave current `scraped`, `searching`, `url_review`, and `extracting` rows untouched. For stale legacy operational rows, run a one-time admin SQL/report to decide whether to return to `imported`, keep in review, or mark failed.
- Preserve existing `official_brand_url_candidates` data for audit and fallback reuse; do not drop the table in the first cleanup.
- Store quality verdicts on `products_ingestion.scrape_quality` so admins can see why fallback is requested and so callback behavior is auditable.
- Store fallback approvals on `products_ingestion.fallback_metadata` and `scrape_jobs.metadata`; include actor, timestamp, estimated/actual spend, source URLs, and parent static job ID.
- Price must not be part of quality success/failure; register/import data remains the price source of truth.

## Dependencies

- Tasks 1-4 must land before any code writes `needs_fallback_review`.
- Tasks 5, 7, and 8 are tightly coupled: static orchestration, quality evaluator, and callback routing must be implemented together.
- Task 10 depends on Task 6 and the migration.
- UI tasks 12-14 depend on the new status, fallback API, and query updates.
- Runner cleanup should wait until web fallback orchestration names the extraction job type it still needs.
- Test updates should be done alongside each code phase, with final broad validation after docs cleanup.

## Validation Commands

From repo root unless noted:

```bash
bun run web test -- --testPathPatterns="pipeline-status-validation|pipeline-transition|pipeline-scraping|pipeline-scrape-quality|fallback-route"
bun run web test -- --testPathPatterns="components/admin/pipeline"
bun run web lint
bun run web build
```

Scraper focused checks from `apps/scraper`:

```bash
pytest -m "not benchmark and not live and not performance" --ignore=tests/benchmarks
pytest tests/test_runner_entrypoints.py tests/unit/test_api_client.py tests/unit/test_result_quality.py
ruff check . --output-format=github
mypy . --ignore-missing-imports || true
```

Manual validation:
- Import 5-10 SKUs with mixed static outcomes.
- Start static scrape once; verify successful SKUs land in `Results` and low-quality SKUs land in `Fallback Review`.
- Approve fallback for one SKU; verify SERPER/AI work is initiated only after approval and results return to the same `Results` tab.
- Consolidate one static-only result and one fallback result from the unified Results workspace.

## Risks

- `pipeline_status_five` is an enum despite carrying more than five states; enum migrations must be deployed before app code writes the new value.
- Callback routing can accidentally move all SKUs cohort-wide if quality evaluation is not strictly per-SKU.
- Existing in-flight official-brand/deep-research jobs may still callback; keep compatibility handling until active jobs drain.
- Renaming UI from `Scraped` to `Results` without changing DB status requires careful tests so routes/counts still query `scraped`.
- Removing direct AI/deep-research branches may break hidden admin shortcuts or old docs/tests; use grep-based cleanup before merge.
- SERPER result quality and LLM extraction reliability need production-like SKU validation; fallback approval should show cost and confidence before spend.

## Decision Checkpoints

- Confirm whether fallback approval should auto-extract the top high-confidence SERPER result or always require URL candidate review before LLM extraction.
- Confirm acceptable default fallback budget limits per SKU/cohort before enabling bulk approval.
