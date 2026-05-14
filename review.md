# Pipeline Simplification Migration Review

Review date: 2026-05-14

Command run: `bun run web tsc --noEmit`

Result: **failed** (`exit=1`). The compiler reported **225 TypeScript errors across 44 files**: **65 source errors** and **160 test errors**.

Old-status grep result: a broad grep for `searching|scraping|scraped|consolidating|finalizing|exporting|needs_fallback_review` found many expected legacy/docs/test hits. A targeted string-literal search in non-test TS/TSX source still found **96 old-status literals across 33 files**, including active routes/components.

## Review

### Correct

- The canonical pipeline type list is now the intended 8 statuses in `apps/web/lib/pipeline/types.ts:10-19`, and the main UI config has entries for all 8 statuses in `apps/web/lib/pipeline/types.ts:237-278`.
- `StageTabs` is wired to `PIPELINE_TABS` and `STAGE_CONFIG`, so the tab list itself reflects the new 8 statuses (`apps/web/components/admin/pipeline/StageTabs.tsx:7`, `apps/web/components/admin/pipeline/StageTabs.tsx:39-80`).
- Consolidation creation now marks submitted products as `merging` (`apps/web/lib/consolidation/direct-chat-service.ts:242-248`), and applying consolidation results transitions successful rows to `reviewing` while rejected/error rows return to `processed` (`apps/web/lib/consolidation/batch-service.ts:1758-1766`, `apps/web/lib/consolidation/batch-service.ts:1888-1896`, `apps/web/lib/consolidation/batch-service.ts:1920-1928`).
- The consolidation prompt/source path is partially adapted for `sources.enriched`: `prompt-builder.ts` treats `enriched` as trusted (`apps/web/lib/consolidation/prompt-builder.ts:21-24`), `product-sources.ts` preserves the `enriched` source shape (`apps/web/lib/product-sources.ts:478-483`), and `ProcessedResultsView` reads `product.sources.enriched` (`apps/web/components/admin/pipeline/ProcessedResultsView.tsx:68-88`).
- `ActiveEnrichmentsTab` queries the new `/api/admin/enrichment/jobs` endpoint (`apps/web/components/admin/pipeline/ActiveEnrichmentsTab.tsx:82-88`), and the admin job-creation route writes to `enrichment_jobs`/`enrichment_attempts` and sets products to `extracting` (`apps/web/app/api/admin/enrichment/jobs/route.ts:109-163`).
- The new enrichment modules (`contracts.ts`, `validation.ts`, `normalize-result.ts`, `metrics.ts`) do not show an obvious circular dependency: `contracts.ts` has no internal imports; `validation.ts` imports only `zod`; `normalize-result.ts` and `metrics.ts` import only contract types.

### Fixed

- None applied. This was a review-only pass, except for writing this report.

### Blocker

#### 1. The database migration does not migrate `products_ingestion.pipeline_status` to the new enum values

The app now writes `processed`, `merging`, `reviewing`, and `publishing`, but none of the new migrations alters `public.pipeline_status_five` or remaps existing rows. The only new migration SQL touching `processed` is for enrichment table status checks/RPC logic, not the product pipeline enum (`apps/web/supabase/migrations/20260514000000_simplify_pipeline_enrichment.sql:15-132`, `apps/web/supabase/migrations/20260514030000_add_enrichment_tables.sql:13-131`, `apps/web/supabase/migrations/20260514200000_add_enrichment_rpcs.sql:144-159`).

Impact: even after TypeScript fixes, writes like `pipeline_status: 'processed'` or `pipeline_status: 'merging'` will fail against the current enum. Generated DB types also still list the old workflow, which is consistent with this migration gap.

#### 2. The enrichment table migrations are not idempotent as written

Two migrations create the same three tables and the same RLS policies:

- `20260514000000_simplify_pipeline_enrichment.sql` creates `enrichment_targets`, `enrichment_jobs`, `enrichment_attempts`, and policies (`apps/web/supabase/migrations/20260514000000_simplify_pipeline_enrichment.sql:15-132`).
- `20260514030000_add_enrichment_tables.sql` repeats the same tables and policies (`apps/web/supabase/migrations/20260514030000_add_enrichment_tables.sql:13-131`).

`create table if not exists` is safe, but `create policy "Staff can manage ..."` is not guarded. Running the second migration after the first should fail with “policy already exists”. The two definitions also diverge: the first allows `enrichment_targets.status = 'processing'` (`20260514000000...:20-21`), while the second omits it (`20260514030000...:18-19`).

#### 3. The enrichment RPC migration references columns that are never created

`claim_next_pending_enrichment_attempt` references `enrichment_attempts.lease_token`, `lease_expires_at`, and `claimed_by` (`apps/web/supabase/migrations/20260514200000_add_enrichment_rpcs.sql:38-41`, `apps/web/supabase/migrations/20260514200000_add_enrichment_rpcs.sql:64-72`), but the `enrichment_attempts` table definition does not include those columns (`apps/web/supabase/migrations/20260514000000_simplify_pipeline_enrichment.sql:93-116`). The RPC will fail at runtime if called.

#### 4. The Python runner is currently broken by missing exports in `enrichment_models.py`

`runner/__init__.py` imports `EnrichmentResultStatus`, `EnrichmentMode`, and `build_v1_from_extraction_result` from `scrapers.ai_search.enrichment_models` (`apps/scraper/runner/__init__.py:17-21`), but `enrichment_models.py` defines none of those symbols (`apps/scraper/scrapers/ai_search/enrichment_models.py:61-104`). This import runs at module load, so it can break legacy runner paths too, not only enrichment.

#### 5. The scraper enrichment API contract is mismatched on both claim and callback

- Server claim route returns `{ attempts: [...] }` with fields like `id`, `source_url`, and `config` (`apps/web/app/api/scraper/v1/claim-enrichment/route.ts:119-134`).
- Python client expects `{ attempt: ... }` with `attempt_id`, `target_url`, and `job_config` (`apps/scraper/core/api_client.py:679-701`).

So the daemon will treat successful claim responses as “no pending enrichment attempts”.

For callbacks:

- Server callback validates the request body as a top-level `EnrichmentResultV1` (`apps/web/app/api/scraper/v1/enrichment-callback/route.ts:85-103`).
- Python client sends `{ attempt_id, status, runner_name, result: <json string>, error_message }` (`apps/scraper/core/api_client.py:740-754`).

So submitted enrichment results will be rejected even after the missing validation export is fixed.

#### 6. New scraper routes use the wrong auth/DB pattern for runner endpoints

Existing scraper runner routes use `validateRunnerAuth` plus a service-role admin client (example: `apps/web/app/api/scraper/v1/claim-chunk/route.ts:3-4`, `apps/web/app/api/scraper/v1/claim-chunk/route.ts:80-102`). The new `claim-enrichment` and `enrichment-callback` routes do a raw env-var equality check and use the SSR user-context Supabase client (`apps/web/app/api/scraper/v1/claim-enrichment/route.ts:16-23`, `apps/web/app/api/scraper/v1/claim-enrichment/route.ts:35`; `apps/web/app/api/scraper/v1/enrichment-callback/route.ts:19-25`, `apps/web/app/api/scraper/v1/enrichment-callback/route.ts:100`).

Impact: API keys stored/validated through `validate_runner_api_key` will not work, and RLS on the new tables (`is_staff()` policies) will likely block unauthenticated runner requests.

#### 7. The main pipeline client still uses a non-existent `enriching` stage and is not wired to create enrichment jobs

`PipelineStage` does not include `enriching`, but `PipelineClient` and `FloatingActionsBar` still use it (`apps/web/components/admin/pipeline/PipelineClient.tsx:88-91`, `apps/web/components/admin/pipeline/PipelineClient.tsx:1117`, `apps/web/components/admin/pipeline/PipelineClient.tsx:1279`; `apps/web/components/admin/pipeline/FloatingActionsBar.tsx:32-38`). Even if renamed to `extracting`, the current “Start Enrichment” path just calls the generic bulk-status route via `handleBulkAction` (`apps/web/components/admin/pipeline/PipelineClient.tsx:1005-1021`) instead of POSTing to `/api/admin/enrichment/jobs`. A grep found no component that creates enrichment jobs; `ActiveEnrichmentsTab` only lists jobs.

#### 8. `UrlReviewWorkspace` is still backed by official-brand routes/tables, not `enrichment_targets`

The workspace calls `/api/admin/pipeline/official-brand/url-review-cohorts` and `/api/admin/pipeline/official-brand/candidates` (`apps/web/components/admin/pipeline/UrlReviewWorkspace.tsx:34-63`) and renders `OfficialBrandReviewClient` (`apps/web/components/admin/pipeline/UrlReviewWorkspace.tsx:124-128`). This does not satisfy the requirement to use `enrichment_targets` instead of `official_brand_url_candidates`.

#### 9. `ProcessedResultsView` reads `sources.enriched`, but the main UI does not render it

`PipelineClient` imports `ProcessedResultsView` (`apps/web/components/admin/pipeline/PipelineClient.tsx:26`) but renders `ScrapedResultsView` for `currentStage === 'processed'` (`apps/web/components/admin/pipeline/PipelineClient.tsx:1317-1319`). `ScrapedResultsView` is not imported, causing a TS error, and the new processed/enriched UI is effectively unused.

#### 10. Publishing is broken at compile time

`publishToStorefront` defines `markProductAsExporting`, duplicates `updated_at`, then calls the non-existent `markProductAsPublishing` (`apps/web/lib/pipeline/publish.ts:214-222`, `apps/web/lib/pipeline/publish.ts:256`, `apps/web/lib/pipeline/publish.ts:275`). This blocks the `publishing` transition.

### Note

- `.DS_Store` is modified in the working tree. This looks unrelated to the pipeline migration and should be reverted before merge if unintentional.
- `progress.md` and planning `.md` files are present/untracked; per repo agent guidance, I did not treat `progress.md` as noise.

## Deliverable 1: TypeScript errors needing fixes

### Summary

- Total: **225** errors in **44** files.
- Source: **65** errors in **21** files.
- Tests: **160** errors in **23** files.

### Source bugs / active source compile errors

- `apps/web/lib/pipeline/publish.ts`
  - Duplicate `updated_at` in update payload at line 221.
  - Missing `markProductAsPublishing` references at lines 256 and 275; local function is named `markProductAsExporting` at line 214.
- `apps/web/lib/pipeline/derivation.ts`
  - Calls missing `findActiveExtractionJob` at line 160; defined helper is `findActiveEnrichmentJob` at line 183.
- `apps/web/app/api/scraper/v1/enrichment-callback/route.ts`
  - Imports missing `safeValidateEnrichmentResultV1` from validation at line 11.
- `apps/web/app/api/admin/pipeline/status-compat.ts`
  - Legacy route map returns old statuses for `enriched`, `finalized`, `export`, and `published` at lines 8-11.
  - Return type fails because map values include old statuses at line 51.
- `apps/web/components/admin/pipeline/PipelineClient.tsx`
  - Invalid `enriching` stage in `LIVE_OPERATIONAL_TABS` at lines 88-91.
  - Invalid `handleStageChange('enriching')` at line 1117.
  - Missing `UrlReviewWorkspace` import/use at line 1252.
  - Invalid `currentStage === 'enriching'` branch at line 1279.
  - Missing `ScrapedResultsView` import/use at line 1318; intended component appears to be `ProcessedResultsView`.
  - Several implicit `any` parameters caused by missing component prop types around lines 1258-1362.
- `apps/web/components/admin/pipeline/FloatingActionsBar.tsx`
  - Invalid `nextStage: 'enriching'` and `enriching` key at lines 32-38.
- `apps/web/components/admin/pipeline/StatusBadge.tsx`
  - Uses invalid `enriching` status at lines 35 and 88.
- `apps/web/components/admin/pipeline/PipelineStats.tsx`
  - Uses `Globe` without importing it at line 41.
  - Uses invalid `enriching` status at line 46.
- `apps/web/components/admin/pipeline/ActiveEnrichmentsTab.tsx`
  - References `PipelineRunStatusLabels` instead of imported `PIPELINE_RUN_STATUS_LABELS` at lines 176 and 270.
- `apps/web/components/admin/pipeline/ProcessedResultsView.tsx`
  - Unsafe direct cast to `Record<string, unknown>` at line 82.
  - Passes unsupported props to `PipelineSidebarTable` at line 348 and has implicit `any` callback parameters at lines 348 and 352.
- `apps/web/lib/design-tokens.ts`
  - Status color/label/CSS maps still contain old statuses (`searching`, `scraping`, `scraped`, `needs_fallback_review`, `consolidating`, `finalizing`, `exporting`) at lines 24-35, 38-49, and 75-88.
- `apps/web/lib/enrichment/sources.ts`
  - Uses `specifications` in `providesFields`, but `specifications` is not in `ENRICHABLE_FIELDS` (`apps/web/lib/enrichment/sources.ts:145-147`, `apps/web/lib/enrichment/sources.ts:169`).
- `apps/web/components/admin/pipeline/PipelineProductDetail.tsx`
  - Status dropdown still uses old statuses at lines 36-43.
  - “Save & Move” still targets `exporting` at line 207 and checks `exporting` at line 484.
- `apps/web/components/admin/pipeline/PipelineProductCard.tsx`
  - Checks old `finalizing`/`exporting` statuses at line 160.
- `apps/web/app/api/admin/pipeline/export/route.ts`
  - Checks `status === 'finalizing'` at line 172 and still queries `pipeline_status = 'exporting'` for selected SKU exports at line 213.
- `apps/web/app/api/admin/pipeline/diagnostic/route.ts`
  - Count map still contains old statuses at lines 38-50 and export queue query still uses `exporting` at line 21.
- `apps/web/app/api/admin/pipeline/runs/route.ts`
  - Imports removed scrape-run helpers at lines 6-9.
  - Still aggregates `scrape_jobs` at lines 99-131; this no longer matches the new enrichment run model.
- `apps/web/components/admin/pipeline/ActiveConsolidationsTab.tsx`
  - Compares new `PipelineRunKind` to removed `serp_search`/`page_scrape` kinds at line 100.

### Cleanup-needed compile errors

- `apps/web/app/api/admin/pipeline/clear-scrape-results/route.ts`
  - Imports removed `clearScrapeResultsAndResetStatus` at line 2. Use `clearEnrichmentResultsAndResetStatus` or delete/replace the route.
- `apps/web/lib/pipeline/fallback-orchestration.ts`
  - Still transitions to `searching` and `needs_fallback_review` at lines 231 and 244. This file is a cleanup-phase delete candidate.
- `apps/web/components/admin/pipeline/finalizing/ProductListSidebar.tsx`
  - Passes removed `variant="finalizing"` at line 112; current variants are `processed | reviewing | imported | url_review`.
- `apps/web/app/api/admin/pipeline/runs/route.ts`
  - Should be refactored from scrape jobs to enrichment jobs or removed with the scrape cleanup.

### Test files using old status names / removed exports

- `apps/web/__tests__/lib/pipeline-status-validation.test.ts`: 33 errors; old statuses include `searching`, `scraping`, `scraped`, `needs_fallback_review`, `consolidating`, `finalizing`, `exporting`.
- `apps/web/lib/pipeline/derivation.test.ts`: 17 errors; old statuses and removed `ACTIVE_SCRAPE_JOB_STATUSES`.
- `apps/web/lib/pipeline/core.test.ts`: 16 errors; old transition expectations.
- `apps/web/__tests__/lib/design-tokens.test.ts`: 14 errors; old design-token keys.
- `apps/web/__tests__/components/admin/pipeline/pipeline-stats.test.tsx`: 12 errors; old statuses.
- `apps/web/__tests__/components/admin/pipeline/PipelineClient.operational-tabs.test.tsx`: 10 errors; old operational tabs.
- `apps/web/__tests__/components/admin/pipeline/pipeline-selection.test.tsx`: 10 errors; old statuses.
- `apps/web/__tests__/components/admin/pipeline/StageTabs.test.tsx`: 7 errors; old tab list.
- `apps/web/__tests__/components/admin/pipeline/published-export-actions.test.tsx`: 7 errors; old export stage.
- `apps/web/lib/pipeline/queries.test.ts`: 7 errors; old query stages.
- `apps/web/__tests__/lib/pipeline/run-types.test.ts`: 5 errors; removed scrape-run helpers/kinds.
- `apps/web/__tests__/components/admin/pipeline/StatusBadge.test.tsx`: 4 errors; old statuses.
- `apps/web/__tests__/pipeline/undo.test.ts`: 3 errors; old `scraped` transition.
- `apps/web/__tests__/lib/pipeline-transition.test.ts`: 3 errors; old `scraping`/`scraped` transitions.
- `apps/web/__tests__/components/admin/pipeline/ScrapedResultsView.test.tsx`: 2 errors; old `scraped` stage.
- `apps/web/__tests__/lib/pipeline.test.ts`: 2 errors; old `scraped`/`finalizing`.
- `apps/web/__tests__/performance/benchmarks.test.ts`: 2 errors; old `finalizing`.
- Single-error test files: `FloatingActionsBar.test.tsx`, `pipeline-product-grid.test.tsx`, `finalization-copilot-workspace.test.ts`, `finalization-draft.test.ts`, `filters.test.tsx`, `lib/pipeline/types.test.ts`.

## Deliverable 2: Logic / integration issues

1. `normalizePipelineStage` does not cover all old-to-new mappings. It currently maps `scraped`, `consolidating`, and `exporting`, but misses `searching`, `scraping`, `finalizing`, and `needs_fallback_review` (`apps/web/lib/pipeline/types.ts:56-63`). It also has `finalized` but not the old persisted `finalizing` value.
2. `status-compat.ts` has wrong legacy mappings for `enriched`, `finalized`, `export`, and `published` and misses `scraping` (`apps/web/app/api/admin/pipeline/status-compat.ts:6-20`).
3. `UrlReviewWorkspace` still reads official-brand API data rather than `enrichment_targets` (`apps/web/components/admin/pipeline/UrlReviewWorkspace.tsx:34-63`).
4. `OfficialBrandReviewClient` still posts to official-brand routes including `/extract` (`apps/web/components/admin/pipeline/OfficialBrandReviewClient.tsx:163`, `apps/web/components/admin/pipeline/OfficialBrandReviewClient.tsx:246`, `apps/web/components/admin/pipeline/OfficialBrandReviewClient.tsx:320`, `apps/web/components/admin/pipeline/OfficialBrandReviewClient.tsx:370`).
5. No UI path creates `/api/admin/enrichment/jobs`; the only hit is `ActiveEnrichmentsTab` GET. The old “scrape” dialog still posts `/api/admin/pipeline/scrape` (`apps/web/components/admin/pipeline/PipelineClient.tsx:1089-1097`).
6. `ProcessedResultsView` reset uses body keys `new_status` and `reset_results`, but bulk route expects `toStatus` and `resetResults` (`apps/web/components/admin/pipeline/ProcessedResultsView.tsx:157-164`; `apps/web/app/api/admin/pipeline/bulk/route.ts:21-28`, `apps/web/app/api/admin/pipeline/bulk/route.ts:64-70`).
7. `app/api/admin/enrichment/jobs/route.ts` does not preserve admin auth patterns: POST only checks `supabase.auth.getUser()` and GET does no auth check at all (`apps/web/app/api/admin/enrichment/jobs/route.ts:15-23`, `apps/web/app/api/admin/enrichment/jobs/route.ts:190-204`). Existing admin pipeline routes use `requireAdminAuth`.
8. `app/api/admin/enrichment/jobs/route.ts` uses a user-context client. Its writes to `enrichment_jobs`/`enrichment_attempts` may be blocked by the new RLS policies unless the user is staff (`apps/web/supabase/migrations/20260514000000_simplify_pipeline_enrichment.sql:81-87`, `apps/web/supabase/migrations/20260514000000_simplify_pipeline_enrichment.sql:126-132`).
9. `claim-enrichment` fetches IDs and then updates them, but does not store lease tokens on attempts and does not use the RPC intended for atomic claim (`apps/web/app/api/scraper/v1/claim-enrichment/route.ts:41-74`, `apps/web/app/api/scraper/v1/claim-enrichment/route.ts:100-117`).
10. `enrichment-callback` creates retry attempts after calculating job completion, so a low-confidence retry can mark the parent job complete before inserting the next queued attempt (`apps/web/app/api/scraper/v1/enrichment-callback/route.ts:193-237`).
11. `consolidation/submit` does not require `pipeline_status = 'processed'`; it submits any product with sources and direct-chat then moves those SKUs to `merging` (`apps/web/app/api/admin/consolidation/submit/route.ts:31-52`, `apps/web/lib/consolidation/direct-chat-service.ts:242-248`). This can move URL-review/imported products if they have any source data.
12. Existing consolidation routes still use old statuses: cancel/delete resets `consolidating -> scraped` (`apps/web/app/api/admin/consolidation/[batchId]/route.ts:80-88`), reset route selects `consolidating` and writes `scraped` (`apps/web/app/api/admin/consolidation/reset/route.ts:38-62`), and `/consolidation/scraped` queries `scraped` (`apps/web/app/api/admin/consolidation/scraped/route.ts:23-27`).
13. `PipelineClient` routes `publishing` through `ImportedResultsView` (`apps/web/components/admin/pipeline/PipelineClient.tsx:1405-1454`), so the publishing/export workspace behavior is not clearly migrated.
14. `PipelineStats` renders 8 statuses but uses `xl:grid-cols-7`, so the layout was not fully adjusted for 8 cards (`apps/web/components/admin/pipeline/PipelineStats.tsx:136`).
15. TypeScript contract and validation disagree on enrichment mode: `contracts.ts` says `EnrichmentMode = "json_ld" | "metadata" | "llm" | "mixed"` (`apps/web/lib/enrichment/contracts.ts:14`), but validation and DB checks use `structured | metadata | llm | mixed` (`apps/web/lib/enrichment/validation.ts:22-27`, `apps/web/supabase/migrations/20260514000000_simplify_pipeline_enrichment.sql:62-63`). Python also uses `structured | metadata | llm | mixed` (`apps/scraper/scrapers/ai_search/enrichment_models.py:68`).

## Deliverable 3: Files still importing deleted/removed exports

- `apps/web/app/api/admin/pipeline/clear-scrape-results/route.ts:2` imports removed `clearScrapeResultsAndResetStatus`.
- `apps/web/app/api/admin/pipeline/runs/route.ts:6-9` imports removed `mapScrapeJobStatusToRunStatus`, `determineScrapeJobKind`, and `getScrapeStageLabel`.
- `apps/web/app/api/scraper/v1/enrichment-callback/route.ts:11` imports missing `safeValidateEnrichmentResultV1`.
- `apps/web/lib/pipeline/derivation.test.ts:7` imports removed `ACTIVE_SCRAPE_JOB_STATUSES`.
- `apps/web/lib/pipeline/types.test.ts:2` imports removed `getStageDataStatus`.
- `apps/web/__tests__/lib/pipeline/run-types.test.ts:3-6` imports removed scrape-run helpers.
- `apps/scraper/runner/__init__.py:17-21` imports missing Python symbols from `enrichment_models.py`: `EnrichmentResultStatus`, `EnrichmentMode`, and `build_v1_from_extraction_result`.

## Deliverable 4: Prioritized fix list

1. **Database first:** add/repair migration to update `pipeline_status_five` to the 8-status vocabulary, remap existing rows (`searching -> url_review`, `scraping -> extracting`, `scraped -> processed`, `consolidating -> merging`, `finalizing -> reviewing`, `exporting -> publishing`, `needs_fallback_review -> url_review` or the chosen canonical target), and regenerate Supabase types.
2. **Fix migration idempotency:** remove the duplicate enrichment-table migration or guard/drop policies before creating them; align `enrichment_targets.status` checks; add missing attempt lease columns if the RPC is kept.
3. **Fix runner API auth/DB clients:** use `validateRunnerAuth` and service-role admin Supabase clients in `claim-enrichment` and `enrichment-callback`.
4. **Align the enrichment API contract:** make claim response and Python client agree (`attempt` vs `attempts`, `id` vs `attempt_id`, `source_url` vs `target_url`); make callback accept the Python payload or make Python submit the top-level `EnrichmentResultV1` plus attempt metadata.
5. **Fix Python imports/builders:** implement/export `EnrichmentMode`, `EnrichmentResultStatus`, and `build_v1_from_extraction_result`, or change `runner/__init__.py` to match the actual model file. This is critical because it can break legacy runner imports.
6. **Fix core TS blockers:** `publish.ts`, `derivation.ts`, `validation.ts` missing export, status-compat mappings, design-tokens, and all invalid `enriching` references.
7. **Wire the UI to the new flow:** `url_review` should read/write `enrichment_targets`; “Start Enrichment” should POST `/api/admin/enrichment/jobs`; `extracting` should render `ActiveEnrichmentsTab`; `processed` should render `ProcessedResultsView`.
8. **Update existing API routes:** pipeline export, diagnostic, consolidation cancel/reset/scraped, and runs route must use `processed/merging/reviewing/publishing` and `enrichment_jobs` instead of old scrape/official-brand statuses.
9. **Enforce consolidation input status:** submit only `processed` products or explicitly document/validate any exceptions.
10. **Phase 8 cleanup:** delete or quarantine old fallback/scrape/official-brand modules and routes after their remaining imports are removed.
11. **Update tests last:** once source and DB contracts are stable, replace old status expectations in the 23 failing test files.

## Deliverable 5: Overall readiness assessment

**Not ready to compile or run.** The TypeScript build currently fails. More importantly, fixing TypeScript alone will not make the migration runnable because the database enum migration is missing, the enrichment migrations are not idempotent, the runner API auth/client pattern is wrong, the Python worker cannot import, and the UI is not wired to create/process enrichment jobs.

After the critical database/API/worker/UI issues above are fixed, the remaining test updates should be straightforward old-status expectation rewrites.

## Phase 8 deletion readiness

Delete candidates and remaining references that must be removed/refactored first:

- `apps/web/lib/pipeline/scrape-quality.ts`
  - Referenced by `apps/web/app/api/scraper/v1/chunk-callback/route.ts:11` and `apps/web/__tests__/lib/pipeline-scrape-quality.test.ts`.
- `apps/web/lib/pipeline/fallback-orchestration.ts`
  - Referenced by `apps/web/app/api/admin/pipeline/official-brand/extract/route.ts:16` and `apps/web/app/api/admin/pipeline/fallback/route.ts:13`.
- Official-brand stack:
  - `apps/web/lib/official-brand-discovery.ts`, `official-brand-review.ts`, `official-brand-review-types.ts`, `official-brand-scoring.ts`, `official-brand-workflow.ts`, `lib/scraper-callback/official-brand-validation.ts`.
  - Active references remain in `UrlReviewWorkspace`, `OfficialBrandReviewClient`, `CandidateUrlPicker`, `app/admin/pipeline/official-brand/page.tsx`, `app/api/admin/pipeline/official-brand/*`, `app/api/scraper/v1/chunk-callback/route.ts`, `app/api/scraper/v1/poll/route.ts`, `app/api/scraper/v1/job/route.ts`, `app/api/admin/scraping/callback/route.ts`, and tests.
- Components:
  - `apps/web/components/admin/pipeline/FallbackReviewView.tsx` appears self-contained but calls `/api/admin/pipeline/fallback` at line 109.
  - `apps/web/components/admin/pipeline/SearchingTab.tsx` calls `/api/admin/pipeline/official-brand/url-review-cohorts` at line 37.
- Old API routes:
  - `apps/web/app/api/admin/pipeline/fallback/route.ts`
  - `apps/web/app/api/admin/pipeline/official-brand/*`
  - `apps/web/app/api/admin/pipeline/scrape/route.ts`
  - likely old scrape callback paths if the legacy scrape runner path is removed: `apps/web/app/api/admin/scraping/callback/route.ts` and `apps/web/app/api/scraper/v1/chunk-callback/route.ts`.
- Legacy consolidation routes to rename/delete:
  - `apps/web/app/api/admin/consolidation/scraped/route.ts`
  - `apps/web/app/api/admin/consolidation/reset/route.ts` still describes `consolidating -> scraped`.
