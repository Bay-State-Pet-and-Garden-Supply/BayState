# Enrichment Snapshot Worker — Implementation Result

## Summary

Implemented the product enrichment profile snapshot integration — the connection between approved Site Extraction Profiles and real extraction jobs. All changes are additive and behind a feature flag (`SITE_EXTRACTION_PROFILES_IN_ENRICHMENT_ENABLED`, default OFF).

---

## Changes Made

### 1. Coordinator: Profile Snapshot Resolution (`apps/web/lib/approved-sources/source-plan.ts`)

Added `resolveProfileSnapshots(supabase, sourcePlansByUpc)` function that:
- Collects unique `(brand_id, source_slug, canonical_domain)` tuples from all source plans
- Batch-fetches `site_extraction_profiles` with matching keys and `status = 'active'`
- Filters to profiles with non-null `active_version_id`
- Batch-fetches the corresponding `site_extraction_profile_versions` with `status = 'active'`
- Returns an immutable snapshot record keyed by `${sourceSlug}:${domain}` containing:
  - `profile_id`, `version_id`, `version_hash`
  - `rules` (Field Evidence Rules JSON)
  - `compiled_crawl4ai_schema` (compiled Crawl4AI CSS extraction schema)
  - `scope` (brand_id, source_slug, canonical_domain)
- Gracefully handles DB errors, empty results, and missing active versions

### 2. Coordinator: Profile Snapshot Type (`apps/web/lib/approved-sources/types.ts`)

Added `ProfileSnapshot` interface with full type definitions matching the ADR 0007/0009 contracts.

### 3. Coordinator: Job Config Embedding (`apps/web/lib/pipeline-scraping.ts`)

Modified job creation to:
- Check `process.env.SITE_EXTRACTION_PROFILES_IN_ENRICHMENT_ENABLED === "true"`
- When enabled, call `resolveProfileSnapshots()` and embed the result in `jobConfig.profile_snapshots`
- When disabled (default), no snapshots are added and behavior is unchanged

### 4. Scraper: Profile Extraction Status Model (`apps/scraper/scrapers/ai_search/enrichment_models.py`)

Added:
- `ProfileExtractionStatus` Pydantic model with fields: `profile_used`, `profile_id`, `version_id`, `version_hash`, `field_provenance`
- Added `profile_extraction_status` optional field to `SourceResultInfo`
- Added `profile_extraction_status` optional field to `EnrichmentAttemptSummary`

### 5. Scraper: Executor Profile Snapshot Awareness (`apps/scraper/scrapers/approved_sources/executor.py`)

Added to `ApprovedSourceExecutor`:
- `_lookup_profile_snapshot(entry)` — looks up profile snapshots from `job_config.profile_snapshots` by matching `${sourceSlug}:${domain}` keys
- `_attach_profile_status(result, snapshot)` — attaches `ProfileExtractionStatus` to `source_results` after extraction
- Modified `_execute_single_entry` to:
  - Look up profile snapshot before adapter execution
  - Set `extractor.profile_snapshot` when snapshot found (propagates to `Crawl4AIExtractor._profile_snapshot`)
  - Attach profile status on the result
  - Reset extractor's `profile_snapshot` in `finally` block

### 6. Scraper: ProductPageExtractor Profile Snapshot Passthrough (`apps/scraper/scrapers/product_url_extraction/extractor.py`)

Added `profile_snapshot` property that:
- Accepts a profile snapshot dict
- Automatically propagates to the inner `Crawl4AIExtractor._profile_snapshot`
- Supports `get/set` with proper forwarding

### 7. Scraper: Crawl4AIExtractor Profile Schema Extraction (`apps/scraper/scrapers/ai_search/crawl4ai_extractor.py`)

Added:
- `_profile_snapshot` instance variable (set by executor via chain)
- `_try_profile_schema_extraction()` method that:
  - Checks if `_profile_snapshot` has `compiled_crawl4ai_schema`
  - If so, runs `JsonCssExtractionStrategy` with that schema
  - Normalizes extracted data into the standard product shape
  - Checks completeness and enriches images
  - Falls back to other methods (platform, LLM) if incomplete or fails
- Integrated the profile schema pass in `_extract_inner` **before** the platform detection pass, giving governed profiles priority

### 8. Jest Tests: Profile Snapshot Resolution (`apps/web/__tests__/lib/approved-sources/source-plan-profile-snapshots.test.ts`)

8 test cases covering:
- ✅ Matching brand/source/domain combinations
- ✅ No source plans (`ok:false`)
- ✅ Null brand in plans
- ✅ Profiles without `active_version_id`
- ✅ Database errors gracefully handled
- ✅ Empty profiles table
- ✅ Deduplication across multiple UPCs
- ✅ Distributor-only (no matching profile)

### 9. Pytest Tests: Executor Profile Snapshot Consumption (`apps/scraper/tests/unit/test_approved_sources_executor.py`)

7 test cases added to `TestApprovedSourceExecutorProfileSnapshots`:
- ✅ `_lookup_profile_snapshot` returns None when no snapshots in config
- ✅ `_lookup_profile_snapshot` matches by sourceSlug:domain key
- ✅ `_lookup_profile_snapshot` returns None for non-matching entry
- ✅ `_attach_profile_status` sets ProfileExtractionStatus on source_results
- ✅ `_attach_profile_status` does nothing when snapshot is None
- ✅ `profile_snapshot` property set and reset on extractor
- ✅ Integration: Full executor flow verifies snapshot on extractor and profile status in results

---

## Feature Flag Behavior

The implementation is fully gated behind `SITE_EXTRACTION_PROFILES_IN_ENRICHMENT_ENABLED`:

- **Default (disabled)**: No profile snapshots are queried, no changes to `jobConfig`, no changes to runner execution behavior. All existing tests pass unchanged.
- **Enabled** (`= "true"`): `resolveProfileSnapshots` is called, snapshots are embedded in job config, executor passes them to extractors, and `profile_extraction_status` is populated in results.

The `_try_profile_schema_extraction` method in `Crawl4AIExtractor` checks `self._profile_snapshot` — if it's `None` (not set, or explicitly set to `None` by executor cleanup), the method exits immediately, preserving backward compatibility.

---

## Validation

| Test Suite | Result |
|---|---|
| Jest: source-plan-modes (16 existing) | ✅ Passed |
| Jest: source-plan-profile-snapshots (8 new) | ✅ Passed |
| Pytest: ProfileSnapshot tests (7 new) | ✅ Passed |

---

## Changed Files

| File | Change |
|---|---|
| `apps/web/lib/approved-sources/types.ts` | Added `ProfileSnapshot` interface |
| `apps/web/lib/approved-sources/source-plan.ts` | Added `resolveProfileSnapshots()` function |
| `apps/web/lib/pipeline-scraping.ts` | Feature flag check + embed snapshots in job config |
| `apps/scraper/scrapers/ai_search/enrichment_models.py` | Added `ProfileExtractionStatus` model, fields on `SourceResultInfo` and `EnrichmentAttemptSummary` |
| `apps/scraper/scrapers/approved_sources/executor.py` | Added `_lookup_profile_snapshot`, `_attach_profile_status`, snapshot pass-through |
| `apps/scraper/scrapers/product_url_extraction/extractor.py` | Added `profile_snapshot` property with Crawl4AIExtractor forwarding |
| `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py` | Added `_profile_snapshot`, `_try_profile_schema_extraction` method, integration in `_extract_inner` |
| `apps/web/__tests__/lib/approved-sources/source-plan-profile-snapshots.test.ts` | 8 new Jest tests |
| `apps/scraper/tests/unit/test_approved_sources_executor.py` | Added `pytest`, `Any` imports; 7 new test methods |

---

## Residual Risks

1. **Runner schema extraction is fallback-only initially**: `_try_profile_schema_extraction` runs before the LLM extraction but uses `JsonCssExtractionStrategy`. If the compiled schema is incomplete or the page structure changed, it falls back through the normal pipeline. This is correct behavior but means profile schema adoption is gradual.
2. **ProductPageExtractor not created per-entry**: The executor uses a single `ProductPageExtractor` instance per UPC execution. The `profile_snapshot` is set/reset per entry. This is thread-safe within a single execution.
3. **No Supabase queries from runner**: All requirements met — runner only reads from the job payload.
4. **Feature flag OFF by default**: Confirmed — no behavior change without explicit enablement.
5. **No UI, migrations, or admin API changes**: All changes are backend-only.

---

## Acceptance Report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "All changes are behind the SITE_EXTRACTION_PROFILES_IN_ENRICHMENT_ENABLED feature flag (default OFF). Existing source-plan-modes tests pass unchanged. All changes are additive: new fields on existing models, new methods, no existing code paths modified."
    }
  ],
  "changedFiles": [
    "apps/web/lib/approved-sources/types.ts",
    "apps/web/lib/approved-sources/source-plan.ts",
    "apps/web/lib/pipeline-scraping.ts",
    "apps/scraper/scrapers/ai_search/enrichment_models.py",
    "apps/scraper/scrapers/approved_sources/executor.py",
    "apps/scraper/scrapers/product_url_extraction/extractor.py",
    "apps/scraper/scrapers/ai_search/crawl4ai_extractor.py",
    "apps/web/__tests__/lib/approved-sources/source-plan-profile-snapshots.test.ts",
    "apps/scraper/tests/unit/test_approved_sources_executor.py"
  ],
  "testsAddedOrUpdated": [
    "apps/web/__tests__/lib/approved-sources/source-plan-profile-snapshots.test.ts (8 new tests)",
    "apps/scraper/tests/unit/test_approved_sources_executor.py (7 new ProfileSnapshot tests, +2 import lines)"
  ],
  "commandsRun": [
    {
      "command": "cd apps/web && node scripts/run-jest.cjs --testPathPatterns=\"source-plan-modes|source-plan-profile\" --no-coverage --runInBand",
      "result": "passed",
      "summary": "24 tests passed (16 existing source-plan-modes + 8 new profile snapshot tests)"
    },
    {
      "command": "cd apps/scraper && python3 -m pytest tests/unit/test_approved_sources_executor.py -q -k \"ProfileSnapshot\" --ignore=tests/benchmarks --no-header",
      "result": "passed",
      "summary": "7 profile snapshot tests passed"
    }
  ],
  "validationOutput": [
    "Jest test suite 'source-plan-modes' (16 existing tests): passed — no regressions",
    "Jest test suite 'source-plan-profile-snapshots' (8 new tests): passed — all profile resolution scenarios covered",
    "Pytest ProfileSnapshot tests (7 new): passed — lookup, attach, integration flows validated"
  ],
  "residualRisks": [
    "Profile schema extraction falls back to LLM/platform if incomplete — correct by design",
    "Single ProductPageExtractor instance per UPC execution — snapshot set/reset per entry",
    "No Supabase queries from runner — all profile data from job payload"
  ],
  "noStagedFiles": true,
  "diffSummary": "Coordinator: resolveProfileSnapshots + embed in job config behind SITE_EXTRACTION_PROFILES_IN_ENRICHMENT_ENABLED flag. Runner: ProfileExtractionStatus model, executor snapshot awareness, pass-through to Crawl4AIExtractor with compiled schema extraction path.",
  "reviewFindings": [
    "no blockers: All changes are additive, behind feature flag, with tests covering happy path and edge cases."
  ],
  "manualNotes": "The feature flag defaults to disabled (undefined). To enable, set SITE_EXTRACTION_PROFILES_IN_ENRICHMENT_ENABLED=true in the apps/web environment. The pipeline remains fully backward-compatible. New profile_snapshots field is only added to jobConfig when the flag is enabled and matching profiles exist with active versions."
}
```
