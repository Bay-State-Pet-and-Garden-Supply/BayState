# AI Draft + Profile Version Validation Fix — Worker Result

## Summary

Applied 9 requested fixes across web (Next.js/TypeScript) and scraper (Python) code. All existing tests pass with modifications.

---

## Changes by Fix

### Fix #1: Draft jobs unclaimable
**Status: Already implemented.** `model_schema_draft` is present in the local `ProfileMaintenanceCapability` interface (line 30) and mapped in capability building (line 103) of `claim/route.ts`. No change needed.

### Fix #2: TS2339 in claim route (`validate_profile_version`)
**Changed file:** `apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts`
Added `validate_profile_version?: boolean` to the local `ProfileMaintenanceCapability` interface. This field was used at line 104 but absent from the type, causing TS2339.

### Fix #3: Force=true bypasses validation
**Changed file:** `apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route.ts`
Removed the `force` option entirely. Changed validation check from "any passed run exists" to "the latest validation run (by created_at desc) must have status=passed". This prevents bypassing validation.

### Fix #4: RPC auth hardening
**Changed file:** `apps/web/supabase/migrations/20260627000000_activate_profile_version_rpc.sql`
Added `REVOKE EXECUTE ON FUNCTION public.activate_profile_version FROM PUBLIC, anon, authenticated` and `GRANT EXECUTE ON FUNCTION public.activate_profile_version TO service_role`.

### Fix #5: Version update without durable artifact
**Changed file:** `apps/web/lib/profile-maintenance/version-update.ts`
Both `updateVersionFromDraft` and `updateValidationRunFromValidation` now check for a non-null `artifactId` before modifying target rows. If `artifactId` is null, they log a warning and return early.

### Fix #6: Validation set not scoped to profile
**Changed file:** `apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts`
When the caller provides a `validation_set_id`, the route now fetches the set and verifies its `profile_id` matches the route's `profileId`. Returns 404 if set not found, 400 if profile_id mismatch.

### Fix #7: Zero validation cases can pass
**Changed file:** `apps/scraper/runner/profile_maintenance.py`
The empty validation cases handler now returns `validation_status: "failed"` instead of `"passed"`. At least one validation case is required for a passing run.

### Fix #8: ESLint warning (unused `artifactId` in version-update.ts)
**Changed file:** `apps/web/lib/profile-maintenance/version-update.ts`
The `artifactId` parameter in `updateVersionFromDraft` is now used as a guard (see Fix #5). No longer unused.

### Fix #9: TypeScript errors
No new TypeScript errors introduced. Pre-existing mock-type errors in test files remain (SupabaseClient mock type mismatches — pre-existing pattern, not related to this change).

---

## Changed Files

1. `apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts` — Added `validate_profile_version` to local interface
2. `apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route.ts` — Removed `force`, require latest run passed
3. `apps/web/supabase/migrations/20260627000000_activate_profile_version_rpc.sql` — Added REVOKE/GRANT auth hardening
4. `apps/web/lib/profile-maintenance/version-update.ts` — Added artifactId guard in both functions
5. `apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts` — Added validation set profile_id check
6. `apps/scraper/runner/profile_maintenance.py` — Empty cases return failed, not passed

## Tests Added or Updated

7. `apps/web/__tests__/profile-maintenance/approve.test.ts` — Updated for removed `force`, added "latest run not passed" test
8. `apps/web/__tests__/profile-maintenance/version-update.test.ts` — Added tests for artifactId guard in both functions
9. `apps/scraper/tests/unit/test_draft_profile.py` — Updated empty-case test to expect `failed`

## Validation Results

### Web tests (112/112 pass)
```
PASS __tests__/profile-maintenance/result.test.ts
PASS __tests__/profile-maintenance/brand-source-setup.test.ts
PASS __tests__/profile-maintenance/progress.test.ts
PASS __tests__/profile-maintenance/claim.test.ts
PASS __tests__/profile-maintenance/draft.test.ts
PASS __tests__/profile-maintenance/validate.test.ts
PASS __tests__/profile-maintenance/result-seed-update.test.ts
PASS __tests__/lib/profile-maintenance/seed-update.test.ts
PASS __tests__/profile-maintenance/approve.test.ts
PASS __tests__/profile-maintenance/version-update.test.ts

Test Suites: 10 passed, 10 total
Tests:       112 passed, 112 total
```

### ESLint (clean)
```
$ npx eslint app/api/admin/site-extraction-profiles lib/profile-maintenance app/api/scraper/v1/profile-maintenance
→ No output (clean)
```

### TypeScript (no new errors)
No new errors in source files. Pre-existing mock-type errors in test files unchanged.

### Scraper tests (36/36 pass)
```
tests/unit/test_profile_maintenance.py ......................... [ 69%]
tests/unit/test_draft_profile.py .............                   [100%]
====================== 36 passed in 0.65s ======================
```

### Ruff (clean)
```
$ python3 -m ruff check runner/profile_maintenance.py
→ All checks passed!
```

## Residual Risks

- The migration REVOKE/GRANT statements are additive and safe for existing databases, but the migration must be run before the function is used in production.
- Validation set scoping fix could theoretically break callers passing a set_id from a different profile (which is the correct behavior).
- Empty validation case sets now fail instead of passing — any workflow depending on fixture-only passes needs to supply at least one case.

## Recommended Next Step

Run migration on target environment, then manual E2E verify:
1. Draft profile → validate → approve flow
2. Empty validation set returns failed, not passed
3. Force parameter is rejected (if passed)
