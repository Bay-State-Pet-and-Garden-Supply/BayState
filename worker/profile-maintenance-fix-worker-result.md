# Profile-Maintenance Fix Worker Result

## Summary

Applied all 7 accepted fixes from the profile-maintenance reviewer findings. No scope expansion, no additional features, no unrelated file changes. Existing dirty worktree preserved.

## Changed Files

| File | Fix |
|------|-----|
| `apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql` | Fix 1: Added `protect_profile_maintenance_artifacts_immutability()` BEFORE UPDATE trigger that resets immutable fields to OLD values, allowing only review/workflow metadata (review_status, reviewed_by, reviewed_at, review_comment, review_metadata, updated_at) to change after creation |
| `apps/scraper/daemon.py` | Fix 2: Replaced `job_logging.emit_progress()` with direct `client.submit_profile_maintenance_progress()` call routing to `/profile-maintenance/[jobId]/progress` instead of generic `/progress` (enrichment) endpoint. Fix 5: Removed duplicate `"job_id"` keys in two error-handler `extra` dicts (F601) |
| `apps/scraper/core/api_client.py` | Fix 4: Changed `submit_profile_maintenance_result()` to nest result payload under a `"result"` key instead of flattening it, so the web coordinator can persist it into `profile_maintenance_jobs.result` |
| `apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts` | Fix 3: Added lease expiry check (`lease_expires_at > now()`). Made UPDATE conditional on `id + lease_token + claimed_by + non-terminal status + unexpired lease` with `.select().maybeSingle()` to detect stale/raced callbacks |
| `apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route.ts` | Fix 3: Added lease expiry check. Added `lease_expires_at` to SELECT. Made UPDATE conditional on `id + lease_token + claimed_by + non-terminal status + unexpired lease` with `.select().maybeSingle()` for race detection |
| `apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/evidence-upload-url/route.ts` | Fix 6: Added `void _request; void _context;` to silence ESLint unused-param warnings |
| `apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts` | Fix 7: Changed `.limit()` to `.range()` with pagination in `findClaimableQueuedRows()`/`findExpiredClaimableRows()`. Added `claimQueuedWithUpdate()`/`claimExpiredWithUpdate()` pagination loop (PAGE_SIZE=10, MAX_TOTAL=100) to skip past incompatible early jobs |
| `apps/web/__tests__/profile-maintenance/result.test.ts` | Added mock chain support for conditional UPDATE. Added "rejects expired lease" test. Added "returns 409 when no row updated due to stale/raced callback" test |
| `apps/web/__tests__/profile-maintenance/progress.test.ts` | Added mock chain support for conditional UPDATE. Added "rejects progress on expired lease" test. Added "returns 409 when no row updated due to stale/raced callback" test |
| `apps/web/__tests__/profile-maintenance/claim.test.ts` | Added `.range()` to mock query builder. Added "skips unsatisfied-capability jobs and claims a satisfiable later one (head-of-line blocking)" test |
| `apps/scraper/tests/unit/test_profile_maintenance.py` | Added assertion for `body["result"]` in `test_submit_result_with_artifact`. Added new `test_submit_result_with_result_json_nests_under_result_key` test |

## Commands Run & Results

```bash
# Web Jest (profile-maintenance suite) — 31 tests, 3 suites, 0 failures
cd apps/web && node scripts/run-jest.cjs --testPathPatterns="profile-maintenance" --no-coverage
# Result: PASS (31/31)

# Web ESLint — 0 errors, 0 warnings (previously 2 warnings)
cd apps/web && npx eslint lib/profile-maintenance/ app/api/scraper/v1/profile-maintenance/
# Result: 0 errors, 0 warnings

# Scraper pytest (profile-maintenance tests) — 16 tests, 0 failures
cd apps/scraper && python3 -m pytest tests/unit/test_profile_maintenance.py -q
# Result: 16 passed (was 15, +1 new test)

# Scraper pytest (API client tests) — 27 tests, 0 failures (no regressions)
cd apps/scraper && python3 -m pytest tests/unit/test_api_client.py -q
# Result: 27 passed

# Ruff check on changed Python files — all clean (previously F601 failures)
cd apps/scraper && python3 -m ruff check runner/profile_maintenance.py tests/unit/test_profile_maintenance.py core/api_client.py daemon.py
# Result: All checks passed

# Python compilation — all files compile
cd apps/scraper && python3 -m py_compile core/api_client.py daemon.py runner/profile_maintenance.py
# Result: All OK
```

## Summary by Fix

| # | Issue | Fix | Status |
|---|-------|-----|--------|
| 1 | Artifact immutability not enforced | Added `protect_profile_maintenance_artifacts_immutability()` BEFORE UPDATE trigger that reverts immutable fields to OLD values | ✅ |
| 2 | PM daemon progress uses enrichment endpoint | Replaced `job_logging.emit_progress()` with direct `client.submit_profile_maintenance_progress()` call | ✅ |
| 3 | Lease/race hardening incomplete | Added lease expiry checks + conditional UPDATE (id+token+owner+non-terminal+unexpired) to both progress and result endpoints | ✅ |
| 4 | Result payload not persisted | Nested result under `"result"` key in API client so web endpoint persists it into `profile_maintenance_jobs.result` | ✅ |
| 5 | Ruff F601 duplicate keys | Removed duplicate `"job_id"` entries from two `extra` dicts in `_process_profile_maintenance_job()` | ✅ |
| 6 | ESLint unused-param warnings | Added `void _request; void _context;` to evidence-upload-url stub | ✅ |
| 7 | Claim head-of-line blocking | Paginated capability filtering: loops in batches of 10 up to 100 total, skipping incompatible early jobs | ✅ |

## Residual Risks

- The artifact immutability trigger is a DB enforcement mechanism and can only be verified against a live Supabase instance, not in Jest unit tests.
- The PM daemon still uses `JobLoggingSession` for structured log capture; only the `emit_progress()` call was replaced with the PM-specific endpoint.
- The claim pagination (100 max total) is a reasonable ceiling for this first slice; extremely deep queues with >100 incompatible jobs before a compatible one would still block.
- No Supabase Storage bucket or signed upload implementation in this slice.
- Profile-maintenance work shares system resources when enabled but these mitigations are explicitly out of scope for this fix cycle.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "All 7 accepted fixes from the profile-maintenance reviews were applied without scope expansion. Changes are limited to: migration (1 new trigger function+trigger), 2 scraper Python files (api_client.py, daemon.py), 4 web route files (result, progress, evidence-upload, claim), 3 test files (result, progress, claim), and 1 scraper test file. No admin UI, no profile tables, no enrichment integration was added."
    }
  ],
  "changedFiles": [
    "apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql",
    "apps/scraper/core/api_client.py",
    "apps/scraper/daemon.py",
    "apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts",
    "apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route.ts",
    "apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/evidence-upload-url/route.ts",
    "apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts",
    "apps/web/__tests__/profile-maintenance/result.test.ts",
    "apps/web/__tests__/profile-maintenance/progress.test.ts",
    "apps/web/__tests__/profile-maintenance/claim.test.ts",
    "apps/scraper/tests/unit/test_profile_maintenance.py"
  ],
  "testsAddedOrUpdated": [
    "apps/web/__tests__/profile-maintenance/result.test.ts",
    "apps/web/__tests__/profile-maintenance/progress.test.ts",
    "apps/web/__tests__/profile-maintenance/claim.test.ts",
    "apps/scraper/tests/unit/test_profile_maintenance.py"
  ],
  "commandsRun": [
    {
      "command": "cd apps/web && node scripts/run-jest.cjs --testPathPatterns=\"profile-maintenance\" --no-coverage",
      "result": "passed",
      "summary": "31 tests passed (3 suites), 0 failures"
    },
    {
      "command": "cd apps/web && npx eslint lib/profile-maintenance/ app/api/scraper/v1/profile-maintenance/",
      "result": "passed",
      "summary": "0 errors, 0 warnings (previously 2 warnings)"
    },
    {
      "command": "cd apps/scraper && python3 -m pytest tests/unit/test_profile_maintenance.py -q",
      "result": "passed",
      "summary": "16 tests passed (was 15, +1 new for result payload assertion)"
    },
    {
      "command": "cd apps/scraper && python3 -m pytest tests/unit/test_api_client.py -q",
      "result": "passed",
      "summary": "27 tests passed (no regressions from api_client.py changes)"
    },
    {
      "command": "cd apps/scraper && python3 -m ruff check runner/profile_maintenance.py tests/unit/test_profile_maintenance.py core/api_client.py daemon.py",
      "result": "passed",
      "summary": "All checks passed (previously F601 failures)"
    },
    {
      "command": "cd apps/scraper && python3 -m py_compile core/api_client.py daemon.py runner/profile_maintenance.py",
      "result": "passed",
      "summary": "All Python files compile OK"
    },
    {
      "command": "git diff --cached --name-only | wc -l",
      "result": "passed",
      "summary": "0 staged files"
    }
  ],
  "validationOutput": [
    "Web Jest: 31/31 passed (claim:11, result:13, progress:7) — +5 new tests",
    "Web ESLint: 0 errors, 0 warnings — down from 2 warnings",
    "Scraper pytest profile-maintenance: 16/16 passed — +1 new test",
    "Scraper pytest api_client: 27/27 passed — 0 regressions",
    "Ruff: All checks passed — previously failed on F601",
    "Python compilation: 3/3 files compile cleanly",
    "Git: 0 staged files, dirty worktree unchanged"
  ],
  "residualRisks": [
    "Artifact immutability trigger requires live Supabase to verify; not covered by unit tests",
    "PM daemon still uses JobLoggingSession for structured log capture (only progress routing was fixed)",
    "Claim pagination ceiling of 100 rows is reasonable for first slice but not exhaustively scalable",
    "No Supabase Storage bucket or signed upload in this slice",
    "Profile-maintenance feature shares system resources with enrichment when enabled"
  ],
  "noStagedFiles": true,
  "diffSummary": "Applied 7 fixes from profile-maintenance reviewer findings: artifact DB immutability trigger, PM daemon progress routing to dedicated endpoint, lease+race hardening with conditional updates, result payload nesting, F601 key dedup, ESLint warning suppression, and paginated claim capability filtering. 5 new tests added (expired lease, stale callback, result payload, head-of-line blocking).",
  "reviewFindings": [
    "fixed: apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql - added immutability trigger for artifacts",
    "fixed: apps/scraper/daemon.py - progress now uses /profile-maintenance/[jobId]/progress; duplicate job_id keys removed",
    "fixed: apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts - lease expiry check + conditional update",
    "fixed: apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route.ts - lease expiry check + conditional update",
    "fixed: apps/scraper/core/api_client.py - result payload nested under 'result' key",
    "fixed: apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/evidence-upload-url/route.ts - ESLint warnings silenced",
    "fixed: apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts - pagination for capability filtering"
  ],
  "manualNotes": "All 7 fixes applied and validated. Web tests grew from 26 to 31 (+5). Scraper tests grew from 15 to 16 (+1). ESLint warnings dropped from 2 to 0. Ruff F601 errors fixed. No regressions in existing suites."
}
```
