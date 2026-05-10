# Implementation Plan

## Goal
Replace the deprecated `official_brand_extraction` job type with `direct_url_extraction` end-to-end while keeping server-side Official Brand discovery and runner-side Product URL extraction separate.

## Tasks
1. **Make `direct_url_extraction` the canonical web job constant**: Add the canonical extraction type and stop local runtime code from depending on the old job type string.
   - File: `lib/official-brand-workflow.ts`
   - Changes: Add `export const DIRECT_URL_EXTRACTION_TYPE = 'direct_url_extraction';`. Change `getOfficialBrandPhaseFromJob()` line ~215 and `isOfficialBrandJobType()` line ~240 to check `DIRECT_URL_EXTRACTION_TYPE` instead of `OFFICIAL_BRAND_EXTRACTION_TYPE`. Either remove `OFFICIAL_BRAND_EXTRACTION_TYPE` or keep it only as a deprecated alias to `DIRECT_URL_EXTRACTION_TYPE` for one release; do not leave its value as `'official_brand_extraction'`.
   - Acceptance: `getOfficialBrandPhaseFromJob({ type: DIRECT_URL_EXTRACTION_TYPE })` returns `'extraction'`; `isOfficialBrandJobType(DIRECT_URL_EXTRACTION_TYPE)` returns `true`; grep finds no runtime comparisons against `'official_brand_extraction'`.

2. **Add product URL extraction source key handling for callbacks**: Support the runner result key change from `official_brand` to `product_url_extraction` without breaking legacy callback payloads.
   - File: `lib/official-brand-workflow.ts`
   - Changes: Add `export const PRODUCT_URL_EXTRACTION_SOURCE_KEY = 'product_url_extraction';`. In `buildExtractedOfficialBrandCandidateRows()` lines ~413-416, read `sources[PRODUCT_URL_EXTRACTION_SOURCE_KEY]` first, falling back to `sources[OFFICIAL_BRAND_SOURCE_KEY]` for already-completed legacy jobs. Keep `buildDiscoveryOfficialBrandCandidateRows()` using `OFFICIAL_BRAND_SOURCE_KEY` because web discovery still emits `official_brand` candidate payloads.
   - Acceptance: Extracted candidate rows are built from `{ product_url_extraction: {...} }`; legacy `{ official_brand: {...} }` extraction callback payloads still build rows.

3. **Update official-brand validation to accept the new extraction result key**: Validate direct URL extraction results for Official Brand flows.
   - File: `lib/scraper-callback/official-brand-validation.ts`
   - Changes: Import or duplicate the new `PRODUCT_URL_EXTRACTION_SOURCE_KEY` constant. In `filterOfficialBrandResultsForPersistence()`, call `validateOfficialBrandSourceForPersistence()` with `sources[PRODUCT_URL_EXTRACTION_SOURCE_KEY] ?? sources.official_brand`. Leave `acceptedResults[sku] = sources` unchanged so persisted product sources keep the runner source key.
   - Acceptance: Official Brand extraction callbacks with only `product_url_extraction` data are accepted/rejected using the same domain/confidence rules as old `official_brand` data.

4. **Create direct URL extraction jobs from pipeline scraping**: Queue only `direct_url_extraction` for Official Brand extraction requests.
   - File: `lib/pipeline-scraping.ts`
   - Changes: Replace import of `OFFICIAL_BRAND_EXTRACTION_TYPE` with `DIRECT_URL_EXTRACTION_TYPE`. Update `ScrapeJobInsertType` line ~92 to include `typeof DIRECT_URL_EXTRACTION_TYPE`. Update job type selection lines ~917-922 so `isOfficialBrandExtraction ? DIRECT_URL_EXTRACTION_TYPE`. Change `effectiveScrapersRaw` line ~916 so Official Brand extraction jobs use `['product_url_extraction']` instead of `['official_brand']`; keep deep research and standard scraper behavior unchanged. Leave `officialBrandPhase: 'extraction'`, selected URL item construction, cohort config, and metadata untouched.
   - Acceptance: The Official Brand extraction API inserts `scrape_jobs.type === 'direct_url_extraction'`, `scrape_jobs.scrapers === ['product_url_extraction']`, and `config.phase === 'extraction'`.

5. **Normalize runner-facing job type in scraper API poll endpoint**: Pass `direct_url_extraction` through to the runner.
   - File: `app/api/scraper/v1/poll/route.ts`
   - Changes: Replace `OFFICIAL_BRAND_EXTRACTION_TYPE` import/return type with `DIRECT_URL_EXTRACTION_TYPE`. Update `normalizeRunnerJobType()` lines ~115-117 so it passes through `OFFICIAL_BRAND_URL_DISCOVERY_TYPE` and `DIRECT_URL_EXTRACTION_TYPE`. Do not pass through `'official_brand_extraction'`; old rows should be migrated.
   - Acceptance: Poll responses for direct URL extraction jobs include `job_type: 'direct_url_extraction'`; no poll normalization branch returns `'official_brand_extraction'`.

6. **Normalize runner-facing job type in single-job endpoint**: Keep `/api/scraper/v1/job` consistent with poll.
   - File: `app/api/scraper/v1/job/route.ts`
   - Changes: Replace `OFFICIAL_BRAND_EXTRACTION_TYPE` import/return type with `DIRECT_URL_EXTRACTION_TYPE`. Update `normalizeRunnerJobType()` lines ~96-98 to pass through `OFFICIAL_BRAND_URL_DISCOVERY_TYPE` and `DIRECT_URL_EXTRACTION_TYPE` only.
   - Acceptance: Direct URL extraction jobs fetched by ID are returned as `direct_url_extraction`; old `official_brand_extraction` is not emitted.

7. **Update active-runs phase detection**: Remove the hardcoded old extraction type from active run API output.
   - File: `app/api/admin/pipeline/active-runs/route.ts`
   - Changes: Import `DIRECT_URL_EXTRACTION_TYPE` and `OFFICIAL_BRAND_URL_DISCOVERY_TYPE` from `@/lib/official-brand-workflow`, or replace literals directly. In `getOfficialBrandPhase()` lines ~70-76, compare URL discovery to `OFFICIAL_BRAND_URL_DISCOVERY_TYPE` and extraction to `DIRECT_URL_EXTRACTION_TYPE`.
   - Acceptance: Jobs with `type: 'direct_url_extraction'` return `officialBrandPhase: 'extraction'`; tests no longer use `official_brand_extraction`.

8. **Update pipeline UI filter**: Show active Official Brand extraction jobs under the new job type.
   - File: `components/admin/pipeline/PipelineClient.tsx`
   - Changes: Replace `<ActiveRunsTab jobSubtype="official_brand_extraction" />` line ~1455 with `jobSubtype="direct_url_extraction"` or a constant import if safe for this client component.
   - Acceptance: The extraction active-runs card filters for `direct_url_extraction` jobs.

9. **Add migration for scrape job type transition**: Update existing rows and the DB CHECK constraint.
   - File: `supabase/migrations/20260510030000_deprecate_official_brand_extraction_job_type.sql`
   - Changes: Create a new timestamped migration. First update existing rows: `UPDATE public.scrape_jobs SET type = 'direct_url_extraction' WHERE type = 'official_brand_extraction';`. Then drop and recreate `scrape_jobs_type_check` with allowed values `standard`, `ai_search`, `official_brand_url_discovery`, `direct_url_extraction`, `deep_research`. Do not edit old migration files.
   - Acceptance: New inserts of `direct_url_extraction` pass; new inserts of `official_brand_extraction` fail; existing old rows are migrated before the new constraint is applied.

10. **Clean scraper runner constants/imports**: Remove the redundant runner job type and deprecated wrapper import.
   - File: `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/runner/__init__.py`
   - Changes: Remove `from scrapers.ai_search.official_brand_scraper import OfficialBrandScraper` line ~15. Remove `OFFICIAL_BRAND_EXTRACTION_TYPE = "official_brand_extraction"` line ~31. Keep `OFFICIAL_BRAND_URL_DISCOVERY_TYPE` and `DIRECT_URL_EXTRACTION_TYPE`. Remove `OfficialBrandScraper` from `__all__` lines ~1391-1399.
   - Acceptance: `python3 -c "from runner import DIRECT_URL_EXTRACTION_TYPE, ProductUrlExtractor"` works; `from runner import OfficialBrandScraper` is no longer supported.

11. **Update scraper runner job detection and legacy rejection**: Route only direct URL extraction to ProductUrlExtractor and reject legacy combined paths.
   - File: `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/runner/__init__.py`
   - Changes: Rename `is_official_brand_job` around line ~556 to a neutral name such as `is_product_url_extraction_job` or `is_special_url_job`. Include `DIRECT_URL_EXTRACTION_TYPE`, `OFFICIAL_BRAND_URL_DISCOVERY_TYPE`, legacy `'ai_search'`, and optionally legacy scraper name `official_brand` only so deprecated jobs are caught and rejected. Remove `OFFICIAL_BRAND_EXTRACTION_TYPE` from the set. In `_run_official_brand_job()` line ~1070, set `scraper_name = 'product_url_extraction'`. In phase detection line ~1096, set extraction only when `job_config.job_type == DIRECT_URL_EXTRACTION_TYPE` or `raw_phase == 'extraction'` with a non-legacy job. Add a branch before extraction setup that rejects `job_config.job_type == 'ai_search'` and raw `'official_brand_extraction'` with an error telling callers to use `direct_url_extraction` and server-side discovery.
   - Acceptance: `official_brand_url_discovery` still returns the existing server-side discovery rejection; `direct_url_extraction` calls `extract_products_from_urls_batch()`; `ai_search` and `official_brand_extraction` do not call `scrape_products_batch()` or extraction.

12. **Update scraper runner output metadata/comments**: Remove misleading Official Brand extraction language from direct extraction jobs.
   - File: `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/runner/__init__.py`
   - Changes: Replace comment line ~1254 with “direct_url_extraction uses ProductUrlExtractor”. Consider renaming result fields for new jobs from `official_brand_phase` to `product_url_extraction_phase` while keeping `official_brand_phase` only if callback compatibility requires it. Keep `config.phase = 'extraction'` behavior stable. Ensure result payload uses source key `product_url_extraction` because `scraper_name` changed.
   - Acceptance: Runner result data shape is `results['data'][sku]['product_url_extraction'] = {...}` for direct URL extraction jobs.

13. **Update web tests for new job type**: Replace old extraction type literals and assertions.
   - File: `__tests__/lib/official-brand-workflow.test.ts`
   - Changes: Import `DIRECT_URL_EXTRACTION_TYPE` and `PRODUCT_URL_EXTRACTION_SOURCE_KEY`. Update extraction phase and `isOfficialBrandJobType` tests to use `DIRECT_URL_EXTRACTION_TYPE`. Update `buildExtractedOfficialBrandCandidateRows` tests to use `[PRODUCT_URL_EXTRACTION_SOURCE_KEY]` for the primary path, and add/keep one fallback test for `[OFFICIAL_BRAND_SOURCE_KEY]` legacy payloads.
   - Acceptance: Workflow tests prove direct URL extraction is the extraction job type and extracted candidate rows support new + legacy source keys.

14. **Update pipeline scraping tests**: Assert new job type and scraper name.
   - File: `__tests__/lib/pipeline-scraping.test.ts`
   - Changes: Rename test title line ~674 from `official_brand_extraction` to `direct_url_extraction`. Update assertions lines ~700 and ~734 to expect `insertedPayload.type === 'direct_url_extraction'`. Add/assert `insertedPayload.scrapers` equals `['product_url_extraction']` if the mock exposes it.
   - Acceptance: Pipeline scraping tests fail if the old job type is inserted.

15. **Update active-runs tests**: Use the new job type in mocks and expected API response.
   - File: `__tests__/api/admin/pipeline/active-runs.test.ts`
   - Changes: Replace mock job `type: "official_brand_extraction"` line ~96 with `"direct_url_extraction"`. Replace expected `jobType: 'official_brand_extraction'` line ~168 with `'direct_url_extraction'`.
   - Acceptance: Active-runs tests verify direct URL extraction displays as Official Brand extraction phase.

16. **Update callback validation tests for source key rename**: Cover official-brand validation over `product_url_extraction` results.
   - File: `__tests__/lib/scraper-callback/official-brand-validation.test.ts`
   - Changes: Change primary fixtures from `official_brand` to `product_url_extraction`, or add a new test case with `product_url_extraction` accepted/rejected by the same domain rules. Keep one legacy `official_brand` fallback test if the code keeps fallback support.
   - Acceptance: Validation tests prove Official Brand workflow callbacks still work after runner result key changes.

17. **Clean scraper-side references to old job type string**: Update benchmark/tuning references only if they are intended to describe the job type, not historical fixture names.
   - File: `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/scrapers/ai_search/tuning_inventory.json`
   - Changes: If the `official_brand_extraction_seed` identifier is meant to track the job type, rename it to `direct_url_extraction_seed`; otherwise leave it and document it as fixture lineage. Update tests accordingly only if renamed.
   - File: `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/tests/unit/test_tuning_inventory.py`
   - Changes: Update expected fixture id/path only if the inventory id changes.
   - Acceptance: No production runner code references `'official_brand_extraction'`; fixture naming decisions are explicit.

18. **Run focused validation**: Verify web + runner behavior.
   - File: no source change
   - Changes: From `apps/web`, run focused tests: `bun run test -- __tests__/lib/official-brand-workflow.test.ts __tests__/lib/pipeline-scraping.test.ts __tests__/api/admin/pipeline/active-runs.test.ts __tests__/lib/scraper-callback/official-brand-validation.test.ts`. From `apps/scraper`, run import and runner smoke checks with Python 3: import `runner`, assert `DIRECT_URL_EXTRACTION_TYPE == 'direct_url_extraction'`, assert `OFFICIAL_BRAND_EXTRACTION_TYPE` is absent, and mock `ProductUrlExtractor.extract_products_from_urls_batch()` for a `direct_url_extraction` job if a suitable runner test fixture exists.
   - Acceptance: Focused tests pass; grep for production code finds no `'official_brand_extraction'` except deprecated alias/comments or historical fixtures explicitly allowed.

## Files to Modify
- `lib/official-brand-workflow.ts` - add `DIRECT_URL_EXTRACTION_TYPE`, add `PRODUCT_URL_EXTRACTION_SOURCE_KEY`, update phase/type checks and extraction row source lookup.
- `lib/scraper-callback/official-brand-validation.ts` - validate `product_url_extraction` source key with legacy fallback.
- `lib/pipeline-scraping.ts` - queue `direct_url_extraction` and use `product_url_extraction` scraper name for extraction jobs.
- `app/api/scraper/v1/poll/route.ts` - pass through `DIRECT_URL_EXTRACTION_TYPE` to runner.
- `app/api/scraper/v1/job/route.ts` - pass through `DIRECT_URL_EXTRACTION_TYPE` to runner.
- `app/api/admin/pipeline/active-runs/route.ts` - detect extraction phase from `direct_url_extraction`.
- `components/admin/pipeline/PipelineClient.tsx` - filter active extraction runs by `direct_url_extraction`.
- `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/runner/__init__.py` - remove `OFFICIAL_BRAND_EXTRACTION_TYPE` and `OfficialBrandScraper`, route/reject legacy job types, use `product_url_extraction` result key.
- `__tests__/lib/official-brand-workflow.test.ts` - update constants/source-key assertions.
- `__tests__/lib/pipeline-scraping.test.ts` - update expected job type and scraper name.
- `__tests__/api/admin/pipeline/active-runs.test.ts` - update job type fixtures/expectations.
- `__tests__/lib/scraper-callback/official-brand-validation.test.ts` - add/update source key validation cases.
- `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/scrapers/ai_search/tuning_inventory.json` - optional fixture id/name cleanup if desired.
- `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/tests/unit/test_tuning_inventory.py` - optional only if tuning inventory fixture id changes.

## New Files
- `supabase/migrations/20260510030000_deprecate_official_brand_extraction_job_type.sql` - migrates existing `official_brand_extraction` rows to `direct_url_extraction` and updates `scrape_jobs_type_check`.

## Dependencies
- Task 1 must happen before web imports can switch to `DIRECT_URL_EXTRACTION_TYPE`.
- Tasks 2 and 3 must happen before changing runner `scraper_name` to `product_url_extraction`; otherwise callbacks will reject or skip extraction results.
- Task 4 depends on Task 1 and should be paired with Task 9 to avoid DB constraint insert failures.
- Tasks 5 and 6 depend on Task 1 and Task 9 so runner polling can return the new type accepted by DB.
- Tasks 10-12 depend on Task 4/9 conceptually: web must queue `direct_url_extraction` before runner removes support for the old type.
- Tests in Tasks 13-16 depend on their corresponding runtime changes.

## Risks
- Changing runner `scraper_name` to `product_url_extraction` changes persisted source keys in `products_ingestion.sources`; callback validation and candidate-row builders must support this or Official Brand extraction persistence will break.
- `product_url_extraction` is a generic arbitrary URL source; consolidation trust ranking may treat it as `standard`, not trusted/manufacturer. Decide separately whether official-brand-reviewed direct URLs should be elevated in consolidation prompts.
- Removing `official_brand_extraction` from the DB constraint can fail if rows are not migrated first; the migration must update old rows before recreating the constraint.
- Keeping a deprecated `OFFICIAL_BRAND_EXTRACTION_TYPE` alias in TypeScript reduces breakage but leaves stale naming in the API surface. Removing it is cleaner but requires updating every import in one pass.
- Legacy runner jobs with `ai_search`, `official_brand` scraper name, or raw `official_brand_extraction` may still exist in queues. The runner should reject them with a clear error rather than accidentally processing them as standard jobs.
- Some scraper benchmark/tests still reference `OfficialBrandScraper` discovery APIs that are already deprecated/removed. Do not reintroduce runner discovery to satisfy those tests; update or quarantine them separately if they block CI.
