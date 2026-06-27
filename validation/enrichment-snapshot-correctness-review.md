## Review
- Correct: Feature flag is off by default. `apps/web/lib/pipeline-scraping.ts:600-603` only resolves/embeds profile snapshots when `SITE_EXTRACTION_PROFILES_IN_ENRICHMENT_ENABLED === "true"`; absent/false env values leave `jobConfig.profile_snapshots` unset.
- Correct: Without `profile_snapshots`, the runner path is additive/no-op: `ApprovedSourceExecutor._lookup_profile_snapshot()` returns `None` from `job_config` only (`apps/scraper/scrapers/approved_sources/executor.py:381-397`), `ProductPageExtractor.profile_snapshot` defaults to `None` (`apps/scraper/scrapers/product_url_extraction/extractor.py:52-93`), and `Crawl4AIExtractor._try_profile_schema_extraction()` returns immediately when no snapshot is set (`apps/scraper/scrapers/ai_search/crawl4ai_extractor.py:1025-1026`).
- Correct: The snapshot consumption path is payload-based for site extraction profiles. The coordinator resolver reads Supabase; runner profile lookup reads `job_config.profile_snapshots` (`apps/scraper/scrapers/approved_sources/executor.py:389-396`) and `crawl4ai_engine` consumes a provided `extraction_strategy` (`apps/scraper/src/crawl4ai_engine/engine.py:270-314`) rather than querying profile tables.
- Correct: Snapshot payloads are designed as self-contained immutable data: `resolveProfileSnapshots()` includes `profile_id`, `version_id`, `version_hash`, `rules`, `compiled_crawl4ai_schema`, and `scope` in the job config snapshot (`apps/web/lib/approved-sources/source-plan.ts:751-762`).
- Fixed: None. Review-only; no source files were modified.
- Blocker: `apps/web/lib/pipeline-scraping.ts:552-555` stores unwrapped `ApprovedSourcePlan` objects in `sourcePlansByUpc`, then passes that map to `resolveProfileSnapshots()` at `apps/web/lib/pipeline-scraping.ts:600-603`. The resolver expects `Record<string, SourcePlanResult>` and skips every value without `result.ok`/`result.plan` (`apps/web/lib/approved-sources/source-plan.ts:635-649`). Result: even with the feature flag enabled, the coordinator resolves zero snapshots and never embeds `jobConfig.profile_snapshots`. Smallest fix: call `resolveProfileSnapshots(supabase, plans)` before unwrapping, or change the resolver to accept the actual `Record<string, ApprovedSourcePlan>` shape used by `jobConfig.source_plans_by_upc`; add a `scrapeProducts` test with the flag enabled.
- Blocker: Snapshot keys drop `brand_id` even though the profile schema is brand-scoped. `site_extraction_profiles` is unique by `(brand_id, source_slug, canonical_domain)` (`apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql:31-33`), but `resolveProfileSnapshots()` dedupes and indexes by only `${sourceSlug}:${domain}` (`apps/web/lib/approved-sources/source-plan.ts:655-660`, `apps/web/lib/approved-sources/source-plan.ts:694-699`), and the runner also looks up only `sourceSlug:domain` (`apps/scraper/scrapers/approved_sources/executor.py:392-396`). A multi-brand enrichment job that shares a distributor/source domain can embed or use the wrong brand's profile, and the payload cannot represent two brand-specific snapshots for the same source/domain. Smallest fix: key by brand as well, e.g. `${brandId}:${sourceSlug}:${domain}`, or nest snapshots by UPC; have the runner validate `snapshot.scope.brand_id === plan.brand.id` before use.
- Blocker: `ProfileExtractionStatus` is emitted by the scraper but dropped by the web callback parser. Python defines/sends `SourceResultInfo.profile_extraction_status` (`apps/scraper/scrapers/ai_search/enrichment_models.py:394-437`) via `model_dump_json()` (`apps/scraper/runner/__init__.py:452-456`), but the web `SourceResultInfoSchema` has no `profile_extraction_status` field (`apps/web/lib/scraper-callback/enrichment-result.ts:53-76`). Zod object parsing strips unknown fields before persistence, and `buildSourceAttemptRows()` stores only `sr.product` as `raw_result`, so profile status is not available downstream. Smallest fix: add a zod schema for `profile_extraction_status` and persist it in `products_ingestion.sources[...]` and/or `enrichment_source_attempts.raw_result`/metadata.
- Note: `profile_used` is currently truthy when a snapshot matched, not necessarily when profile-schema extraction succeeded. The scraper falls through when a snapshot lacks schema or profile extraction is incomplete (`apps/scraper/scrapers/ai_search/crawl4ai_extractor.py:1028-1034`, `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py:1959-1975`), but `_attach_profile_status()` unconditionally sets `profile_used=True` for any matched snapshot (`apps/scraper/scrapers/approved_sources/executor.py:399-416`, called at `apps/scraper/scrapers/approved_sources/executor.py:506-507`). Consider tracking `profile_attempted` separately and setting `profile_used` only when the returned extraction method/profile marker confirms profile-schema success.
- Note: The snapshot path itself does not query Supabase from the runner, but the current runner still has an existing direct Supabase credential fallback (`apps/scraper/core/api_client.py:1194-1207`, `apps/scraper/core/api_client.py:1300-1305`, `apps/scraper/core/api_client.py:1352-1355`). If the acceptance requirement means literally no direct Supabase queries anywhere in the runner, that legacy fallback must be removed or disabled in favor of coordinator API credential endpoints.
- Note: The Brand Source Setup UI says “All set! Enrichment will use active profile” whenever a profile is active (`apps/web/components/admin/brands/BrandSourceSetupProfileStatusStep.tsx:214-218`), but the enrichment profile path is feature-flagged off by default and currently blocked by the embedding bug above. Gate the copy on the runtime flag or soften it to avoid promising active use.

### Commands run
- `git status --short && git diff --stat` — passed; inspected changed-file surface.
- `bun run web test -- --runTestsByPath __tests__/lib/approved-sources/source-plan-profile-snapshots.test.ts __tests__/app/api/scraper/v1/enrichment-callback-route.test.ts __tests__/app/api/admin/enrichment/jobs-route.test.ts` — passed; 3 suites / 28 tests.
- `bun run web test -- --runTestsByPath __tests__/lib/approved-sources/source-plan-modes.test.ts` — passed; 16 tests.
- `bun run web test -- --runTestsByPath __tests__/components/admin/brands/BrandSourceSetupDrawer.test.tsx` — passed; 19 tests.
- `cd apps/scraper && uv run pytest tests/unit/test_approved_sources_executor.py -q` — timed out after 180s after collecting 35 tests; reran the profile snapshot class below.
- `cd apps/scraper && uv run pytest tests/unit/test_approved_sources_executor.py::TestApprovedSourceExecutorProfileSnapshots -q` — passed; 7 tests, with Python 3.14/pytest-asyncio deprecation warnings.
- `git diff --cached --name-only` — passed; no staged files.

### Residual risks
- I did not run the full web/scraper suites.
- Existing tests do not cover `scrapeProducts()` with `SITE_EXTRACTION_PROFILES_IN_ENRICHMENT_ENABLED=true`, so the embedding bug is visible from code review but not caught by tests.
- The direct Supabase credential fallback appears pre-existing relative to `HEAD`; I treated it as a current-state invariant risk rather than a snapshot-specific regression.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete blockers and notes include file paths and line numbers in reviewFindings and the Review section."
    }
  ],
  "changedFiles": [
    "validation/enrichment-snapshot-correctness-review.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git status --short && git diff --stat",
      "result": "passed",
      "summary": "Inspected changed-file surface."
    },
    {
      "command": "bun run web test -- --runTestsByPath __tests__/lib/approved-sources/source-plan-profile-snapshots.test.ts __tests__/app/api/scraper/v1/enrichment-callback-route.test.ts __tests__/app/api/admin/enrichment/jobs-route.test.ts",
      "result": "passed",
      "summary": "3 Jest suites passed, 28 tests."
    },
    {
      "command": "bun run web test -- --runTestsByPath __tests__/lib/approved-sources/source-plan-modes.test.ts",
      "result": "passed",
      "summary": "16 Jest tests passed."
    },
    {
      "command": "bun run web test -- --runTestsByPath __tests__/components/admin/brands/BrandSourceSetupDrawer.test.tsx",
      "result": "passed",
      "summary": "19 Jest tests passed."
    },
    {
      "command": "cd apps/scraper && uv run pytest tests/unit/test_approved_sources_executor.py -q",
      "result": "timed out",
      "summary": "Timed out after 180s after collecting 35 tests; only partial progress output was produced."
    },
    {
      "command": "cd apps/scraper && uv run pytest tests/unit/test_approved_sources_executor.py::TestApprovedSourceExecutorProfileSnapshots -q",
      "result": "passed",
      "summary": "7 pytest tests passed; Python 3.14/pytest-asyncio deprecation warnings emitted."
    },
    {
      "command": "git diff --cached --name-only",
      "result": "passed",
      "summary": "No staged files."
    }
  ],
  "validationOutput": [
    "Feature flag is default-off via strict env equality check.",
    "No behavior change without profile_snapshots in runner paths verified from code and focused tests.",
    "Three blockers found: coordinator passes wrong resolver shape, snapshot keys are not brand-scoped, and profile_extraction_status is dropped by web callback parsing."
  ],
  "residualRisks": [
    "Full test suites were not run.",
    "No existing test covers scrapeProducts() embedding snapshots with SITE_EXTRACTION_PROFILES_IN_ENRICHMENT_ENABLED=true.",
    "Current runner has a pre-existing direct Supabase credential fallback outside the snapshot path."
  ],
  "noStagedFiles": true,
  "diffSummary": "Review-only; source files were not modified. The reviewed slice adds coordinator profile snapshot resolution/embedding and scraper-side snapshot consumption/status plumbing.",
  "reviewFindings": [
    "blocker: apps/web/lib/pipeline-scraping.ts:552-603 and apps/web/lib/approved-sources/source-plan.ts:635-649 - enabled flag path passes plain plans into a resolver that requires SourcePlanResult wrappers, so no snapshots are embedded.",
    "blocker: apps/web/lib/approved-sources/source-plan.ts:655-699 and apps/scraper/scrapers/approved_sources/executor.py:392-396 - snapshot keys omit brand_id although profiles are unique by brand/source/domain, allowing wrong profiles in multi-brand jobs.",
    "blocker: apps/web/lib/scraper-callback/enrichment-result.ts:53-76 - web callback schema omits profile_extraction_status emitted by scraper models, so Profile Extraction Status is stripped before persistence.",
    "note: apps/scraper/scrapers/approved_sources/executor.py:399-416 - profile_used is set when a snapshot matched, not when profile-schema extraction actually succeeded.",
    "note: apps/scraper/core/api_client.py:1194-1207 - current runner still contains legacy direct Supabase credential lookup; snapshot profile data itself is payload-only."
  ],
  "manualNotes": "plan.md/progress.md did not describe this slice; review was based on actual changed files and the worker result artifact. No source files were edited."
}
```
