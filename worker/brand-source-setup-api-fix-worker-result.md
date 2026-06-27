# Brand Source Setup API — Fix Implementation Result

## Summary

Applied all 6 accepted fixes from the correctness and conventions reviews to the Brand Source Setup API slice. All changes are scoped to the existing codebase patterns without reformatting unrelated files.

## Changes Made

### Fix 1: Share/unify domain normalization

**Files changed:**
- `apps/web/lib/approved-sources/source-plan.ts` — Exported `normalizeDomain()` and `isDisallowed()` (previously private)
- `apps/web/app/api/admin/brands/[id]/source-setup/route.ts` — Replaced local `normalizeDomain()` with shared import; imports `isDisallowed` + `DISALLOWED_DOMAINS`; rejects disallowed marketplace/blog domains with 400
- `apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts` — `hostMatchesDomain()` now uses shared `normalizeDomain()` on both sides to strip leading `www.`, ensuring `www.example.com` and `example.com` are treated as the same canonical domain

### Fix 2: Lock source_setup PUT to official_brand / brand.slug

**Files changed:**
- `apps/web/app/api/admin/brands/[id]/source-setup/route.ts` — `validatePutBody()` no longer accepts `source_slug` or `source_type` from request body; PUT handler forces `source_type='official_brand'` and `source_slug=brand.slug` in all DB writes

### Fix 3: Fix duplicate/reused PDP seed idempotency + Fix 4: Race-safe insert

**Files changed:**
- `apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts` — Changed from check-then-insert to insert-first pattern for race safety. On unique violation (code `23505`), fetches existing seed; if non-verified, checks for existing non-terminal `verify_pdp_seed` job and enqueues one if none active. Returns the job instead of `verificationJob: null`. New `ensureVerificationJob()` and `enqueueVerifyPdpSeed()` helpers extracted.

### Fix 5: Require PDP page-classification evidence before marking seed verified

**Files changed:**
- `apps/web/lib/profile-maintenance/seed-update.ts` — Added check: when `verification_status === 'verified'`, also require `resultPayload.page_classification === 'product_detail_page'` before setting `trust_status='verified'` and `verified_at`. Without this evidence, seeds stay `candidate` even if verification_status says verified.

### Fix 6: Enforce artifact.kind matches job.kind

**Files changed:**
- `apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts` — Before creating artifact, checks if `body.artifact.kind` is provided and matches `job.kind`. If mismatched, logs warning and skips artifact creation.

### Test updates

- `apps/web/__tests__/profile-maintenance/brand-source-setup.test.ts` — Added 5 new tests: disallowed domain rejection (www.walmart.com), additional disallowed domain (petsmart.com), forced source_slug/source_type ignores request body, race-safe reuse with job enqueue, race-safe verified seed returns 409.
- `apps/web/__tests__/profile-maintenance/result.test.ts` — Fixed artifact insert mock to support `.select('id').maybeSingle()` chain (was previously a bare promise).
- `apps/web/__tests__/profile-maintenance/result-seed-update.test.ts` — Added test: artifact kind mismatch skips insertion; added `page_classification` to result payloads for PDP-evidence guard.
- `apps/web/__tests__/lib/profile-maintenance/seed-update.test.ts` — Added 2 negative tests: verified without PDP evidence (category_page) and verified without page_classification at both return early. Fixed existing tests to include `page_classification: 'product_detail_page'`.

## Validation Results

```
Test Suites: 6 passed, 6 total
Tests:       79 passed, 79 total  (was 72, 7 new tests added)
Time:        0.653s
```

### ESLint
```
npx eslint <5 changed files>
→ No errors, no warnings (clean)
```

### Worktree
- No files staged by this task
- Pre-existing dirty worktree preserved (19+ modified/untracked pre-existing files untouched)
- 6 new test suites/passed at same count as pre-existing

## Residual Risks

| Risk | Status |
|------|--------|
| Seed update is still non-atomic with job/artifact update | Accepted — partial failures log warnings, retry by re-enqueuing seed job |
| `result.test.ts` mock doesn't test `product_detail_page_seeds` update | Out of scope for this fix; `result-seed-update.test.ts` covers that path |
| No manual API smoke test | Code-only validation via Jest + ESLint |
| Pre-existing staged files unrelated to this fix | Preserved; this task made no staged changes |

## Recommended Next Step
Add the Brand Source Setup UI drawer or the `draft_site_extraction_profile` admin endpoint per the plan.

## Acceptance Report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "All 6 fixes implemented: shared domain normalization, locked source_type/slug, race-safe seed insert with job enqueue, PDP-evidence gate, artifact-kind enforcement. 79 tests pass. ESLint clean. No staged changes. Pre-existing dirty worktree preserved."
    }
  ],
  "changedFiles": [
    "apps/web/lib/approved-sources/source-plan.ts",
    "apps/web/app/api/admin/brands/[id]/source-setup/route.ts",
    "apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts",
    "apps/web/lib/profile-maintenance/seed-update.ts",
    "apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts",
    "apps/web/__tests__/profile-maintenance/brand-source-setup.test.ts",
    "apps/web/__tests__/profile-maintenance/result.test.ts",
    "apps/web/__tests__/profile-maintenance/result-seed-update.test.ts",
    "apps/web/__tests__/lib/profile-maintenance/seed-update.test.ts"
  ],
  "testsAddedOrUpdated": [
    "apps/web/__tests__/profile-maintenance/brand-source-setup.test.ts (added 5 tests, restructured 1)",
    "apps/web/__tests__/profile-maintenance/result.test.ts (fixed artifact mock for .select('id') chain)",
    "apps/web/__tests__/profile-maintenance/result-seed-update.test.ts (added 1 test, updated 1 payload)",
    "apps/web/__tests__/lib/profile-maintenance/seed-update.test.ts (added 2 tests, updated 2 payloads)"
  ],
  "commandsRun": [
    {
      "command": "node scripts/run-jest.cjs --testPathPatterns='profile-maintenance' --no-coverage --runInBand",
      "result": "passed",
      "summary": "6 suites, 79 tests all passed (was 72 before fixes)"
    },
    {
      "command": "npx eslint <5 changed files>",
      "result": "passed",
      "summary": "0 errors, 0 warnings (fixed 1 any cast in pdp-seeds route)"
    },
    {
      "command": "git diff --cached --name-only && git status --short",
      "result": "passed",
      "summary": "No files staged by this task; pre-existing worktree preserved"
    }
  ],
  "validationOutput": [
    "All 79 Jest tests pass (6 suites)",
    "ESLint clean on all changed source files",
    "Pre-existing staged/modified files untouched"
  ],
  "residualRisks": [
    "Seed update remains non-atomic with job/artifact update — partial failure still possible, logged as warning, retry by re-enqueuing seed",
    "result.test.ts does not assert product_detail_page_seeds update path; coverage handled by result-seed-update.test.ts",
    "No manual API smoke test performed"
  ],
  "noStagedFiles": true,
  "diffSummary": "Exported normalizeDomain/isDisallowed from source-plan.ts; replaced local domain normalizer in source-setup route with shared; locked source_type/source_slug in PUT; PDP seed POST changed to insert-first race-safe pattern with job enqueue for non-verified existing seeds; added PDP page_classification gate to seed-update helper; added artifact-kind enforcement to result route; 7 new tests, 4 test payload updates.",
  "reviewFindings": [
    "no blockers: All 6 accepted fixes applied and validated",
    "note: The source-plan.ts export is on top of pre-existing staged changes to that file",
    "note: No new schema migration, scraper, UI, or enrichment pipeline changes"
  ],
  "manualNotes": "Implementation complete. All tests pass. Ready for review."
}
```
