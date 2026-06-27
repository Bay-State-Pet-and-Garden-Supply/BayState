# Review Fixes Worker Result

## Summary

Implemented all 8 fixes from the Browser Profile and Enrichment Snapshot correctness reviews. No scope widening.

## Changes by Fix

### Fix 1: storage_ref opaque (UUID instead of filesystem path)
- **Runner** (`apps/scraper/runner/profile_maintenance.py`):
  - Added `_profile_registry` module with persistent JSON file (`~/.crawl4ai/profiles/profile_registry.json`) mapping UUID → filesystem path
  - `_generate_opaque_key()` generates UUID for each profile
  - `_register_profile_path()` persists the mapping locally
  - `_resolve_profile_path()` looks up UUID → path at revalidation time
  - Setup handler now returns UUID as `storage_ref` instead of filesystem path
  - Revalidation handler resolves UUID through registry first, falls back to direct path for backward compat
  - Artifact payload uses `storage_ref_available` boolean, never exposes the path
- **Web** (`apps/web/lib/profile-maintenance/browser-profile-update.ts`):
  - Added `isOpaqueKey()` validator: accepts UUID format or hex hash, rejects filesystem paths (`/`, `~`, `.`, `..`, `\\`)
  - `updateBrowserProfileFromSetup()` now rejects non-opaque `storage_ref` values and marks the profile as `validation_failed`

### Fix 2: Require seed URL verification as validation evidence
- **Runner** (`apps/scraper/runner/profile_maintenance.py`):
  - Setup handler: resolves `target_pdp_seed_ids` to URLs via API call, then verifies each with a crawl using the created profile
  - Requires at least one successful seed crawl; returns `"missing_seed_evidence"` error if none verified
  - Revalidation handler: same seed resolution and verification logic, requires at least one verified seed when IDs are provided
  - Non-verified seeds result in `"expired"` status with `"no_seeds_verified"` reason
- **Web** (`apps/web/lib/profile-maintenance/browser-profile-update.ts`):
  - `BrowserProfileSetupResult` interface extended with `target_pdp_seeds_verified?: string[]`
  - `updateBrowserProfileFromSetup()` validates `target_pdp_seeds_verified` is a non-empty array before accepting validated status

### Fix 3: Fail-closed helpers for browser profile updates
- **Web** (`apps/web/lib/profile-maintenance/browser-profile-update.ts`):
  - `updateBrowserProfileFromSetup()`: Missing `browser_profile_id` or `artifactId` now marks setup request as `failed` (not silently skipped)
  - DB update failure now marks setup request as `failed` instead of continuing
  - `getRequiredBrowserProfileStatus()`: DB errors now return `{ usable: false, reason: "..." }` instead of `{ usable: true }`

### Fix 4: Check function for required+stale browser profiles
- **Web** (`apps/web/lib/profile-maintenance/browser-profile-update.ts`):
  - Added `RequiredProfileCheckResult` interface
  - Added `checkAndSignalStaleBrowserProfiles()` function:
    - Queries all `browser_profiles` rows where `required=true`
    - Checks status, storage_ref validity, and staleness
    - Emits structured console warnings as attention signals
    - Returns array of `RequiredProfileCheckResult` objects for caller inspection
  - Does not block extraction; designed to be called before job creation or from cron

### Fix 5: Remove interactive capabilities from scraper defaults + fix TS interface
- **Python** (`apps/scraper/core/api_client.py`):
  - Removed `browser_profile_setup` and `browser_profile_runtime` from both default capability lists
  - These are only advertised when explicitly configured via `PROFILE_MAINTENANCE_CAPABILITIES` env var
- **TypeScript** (`apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts`):
  - Added `draft_site_extraction_profile?: boolean` to `ProfileMaintenanceCapability` interface
- **Tests** (`apps/scraper/tests/unit/test_profile_maintenance.py`):
  - Updated `test_claim_sends_capabilities_in_request` to assert `browser_profile_setup` and `browser_profile_runtime` are NOT in default capabilities

### Fix 6: Fix enabled flag path type mismatch
- **Web** (`apps/web/lib/pipeline-scraping.ts`):
  - Added `sourcePlansByUpcRaw` variable that captures the original `Record<string, SourcePlanResult>` from `buildApprovedSourcePlans()`
  - `resolveProfileSnapshots()` is now called with `sourcePlansByUpcRaw` (which has `SourcePlanResult` wrappers with `.ok`/`.plan`) instead of the unwrapped `sourcePlansByUpc` (which has raw `ApprovedSourcePlan` objects)
  - Fixes the bug where `resolveProfileSnapshots` iterated `Object.values()` and checked `result.ok`/`result.plan` on plain plan objects that don't have those properties, resulting in zero snapshots being embedded

### Fix 7: Add brand_id to snapshot keys to prevent cross-brand misrouting
- **Web** (`apps/web/lib/approved-sources/source-plan.ts`):
  - Changed snapshot keys from `${sourceSlug}:${domain}` to `${brandId}:${sourceSlug}:${domain}`
  - Both key generation (step 1) and profile indexing (step 3) use the brand-scoped key
- **Python** (`apps/scraper/scrapers/approved_sources/executor.py`):
  - `_lookup_profile_snapshot()` now constructs brand-scoped keys `{plan_brand_id}:{sourceSlug}:{domain}`
  - Validates `snapshot.scope.brand_id` matches the plan's brand ID, skipping mismatched snapshots
- **Tests** (`apps/web/__tests__/lib/approved-sources/source-plan-profile-snapshots.test.ts`):
  - Updated all key assertions from `testbrand:testbrand.com` to `brand-1:testbrand:testbrand.com`

### Fix 8: Add profile_extraction_status to web callback
- **Web** (`apps/web/lib/scraper-callback/enrichment-result.ts`):
  - Added `ProfileExtractionStatusSchema` Zod schema matching Python's `ProfileExtractionStatus` model
  - Added `profile_extraction_status: ProfileExtractionStatusSchema.nullable().optional()` to `SourceResultInfoSchema`
  - Added `_buildRawResultWithProfileStatus()` helper that includes `_profile_extraction_status` alongside product data in `raw_result`
  - `buildSourceAttemptRows()` now uses this helper to persist profile status metadata

## Validation Results

### Web Jest tests (profile-maintenance|source-plan pattern)
```
Test Suites: 15 passed, 15 total
Tests:       149 passed, 149 total
Time:        1.295 s
```

### Python pytest tests
```
tests/unit/test_profile_maintenance.py  - 31 passed
tests/unit/test_image_candidates.py     - 29 passed
Total: 60 passed in 1.24s
```

### Web typecheck (production files only)
No production file errors. Pre-existing test file type issues remain unchanged.

### Git staged status
No staged files.
