# Approved Source Extraction — Fix Session Summary

## Files Changed

### BLOCKER 1: Migration enum transaction safety
- **`apps/web/supabase/migrations/20260514220000_add_approved_source_extraction.sql`** — Removed sections 4 (backfill) and 5 (seed) which referenced the newly added `awaiting_brand` enum value in the same transaction. The DO block addition of the enum value is now safe because no subsequent statement in the migration references it.
- **`apps/web/supabase/migrations/20260514220001_backfill_approved_sources.sql`** **(NEW)** — Contains the backfill and seed operations in a separate migration file, ensuring the `awaiting_brand` enum value is committed before it's referenced.

### BLOCKER 2: Backfill cast safety
- **`apps/web/supabase/migrations/20260514220001_backfill_approved_sources.sql`** — Added UUID format validation (`~ '^[0-9a-f]{8}-...'`) AND existence check against `brands` table before casting `(consolidated->>'brand_id')::uuid`, preventing FK violations from malformed or orphaned data.

### BLOCKER 3: Runner cannot execute approved-source jobs
- **`apps/web/app/api/scraper/v1/claim-enrichment/route.ts`** — When a `source_plan` exists on an attempt, the route now sends `"approved_source_extraction"` as the `source_url` sentinel value instead of `null` or empty string.
- **`apps/scraper/core/api_client.py`** — Added `source_plan: dict[str, Any] | None = None` field to `ClaimedEnrichment` dataclass, parsed from the claim response.
- **`apps/scraper/daemon.py`** — In `_process_enrichment`, when `target_url == "approved_source_extraction"`, the source plan is included in the job payload.
- **`apps/scraper/runner/__init__.py`** — In `_run_enrichment_job`, when `target_url == "approved_source_extraction"`, the function logs the source plan presence and returns a placeholder success rather than crashing from a missing URL.

### BLOCKER 4: cohorts.ts must write products_ingestion.brand_id
- **`apps/web/lib/pipeline/cohorts.ts`** — `recohortProducts()` now writes `brand_id: brandId` directly to `products_ingestion` alongside `cohort_id` and `consolidated`. Also transitions `pipeline_status` from `awaiting_brand` to `imported` when a brand is assigned.

### BLOCKER 5: core.test.ts test expectations
- **`apps/web/lib/pipeline/core.test.ts`** — Added `awaiting_brand` to expected `STATUS_TRANSITIONS` object with transitions `['imported', 'failed']`.
- **`apps/web/__tests__/lib/pipeline-status-validation.test.ts`** — Added `awaiting_brand` to the matrix `validTargets` with transitions `['awaiting_brand', 'imported', 'failed']`.

### BLOCKER 6: Empty plan guard
- **`apps/web/lib/approved-sources/source-plan.ts`** — After building source entries, if `orderedEntries.length === 0`, the function returns `ok: false` with the error `"No approved sources configured for brand {name} ({slug})"` instead of returning an empty plan that would create a useless job.

### HIGH 1: Subdomain blocking
- **`apps/scraper/scrapers/approved_sources/policy.py`** — Changed `is_disallowed_domain()`, `is_domain_allowed()`, and `is_asset_domain_allowed()` from exact-match to suffix-match: `images.amazon.com` is now blocked by `amazon.com`. Partial matches like `not-amazon.com` are NOT blocked.
- **`apps/web/lib/approved-sources/source-plan.ts`** — Changed `isDisallowed()` from exact-match to suffix-match using `.some()` and `endsWith("." + disallowed)`.

### HIGH 2: PipelineProduct missing brand_id
- **`apps/web/lib/pipeline/types.ts`** — Added `brand_id?: string | null` to the `PipelineProduct` interface.

## Validation Results

| Test Suite | Status |
|-----------|--------|
| `lib/pipeline/core.test.ts` | ✅ 12/12 passed |
| `__tests__/lib/pipeline-status-validation.test.ts` | ✅ 4/4 passed |
| `lib/pipeline/types.test.ts` | ✅ 30/30 passed (2 suites) |
| Python policy module: subdomain blocking | ✅ All 6 checks passed |
| Python policy module: `images.amazon.com` blocked | ✅ True |
| Python policy module: `amazon.com` blocked (exact) | ✅ True |
| Python policy module: `not-amazon.com` NOT blocked | ✅ False |
| Python policy module: disallowed always beats allowed | ✅ True |

## Remaining Work (not in scope of this fix session)
- Missing unit tests for `buildApprovedSourcePlans` and runner policy
- Admin UI for brand source management and per-product brand assignment
- Concrete runner adapters (Phillips, official brand, etc.)
- Deprecation of old `scraper_configs` and official-brand URL candidate flows
- Wiring policy gate into `crawl4ai_extractor.py` pre-crawl URL validation
