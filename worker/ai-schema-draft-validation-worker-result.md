# AI Schema Draft + Profile Version Validation/Approval — Implementation Result

## Summary

Implemented the complete AI Schema Draft + Profile Version validation + approval slice from the plan. This covers admin API routes for draft/validate/approve, runner handlers for `draft_site_extraction_profile` and `validate_profile_version`, result-side effect helpers, validation set auto-creation from verified seeds, DB migration for atomic activation, claim route capability updates, API client default capability updates, and comprehensive tests.

---

## Changed Files

### New files created:

| File | Purpose |
|------|---------|
| `apps/web/supabase/migrations/20260627000000_activate_profile_version_rpc.sql` | PG function `activate_profile_version()` for atomic version activation |
| `apps/web/app/api/admin/site-extraction-profiles/[profileId]/draft/route.ts` | POST: enqueue `draft_site_extraction_profile` job |
| `apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts` | POST: enqueue `validate_profile_version` job |
| `apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route.ts` | POST: atomic approval via RPC |
| `apps/web/lib/profile-maintenance/version-update.ts` | Side-effect helpers: `updateVersionFromDraft()`, `updateValidationRunFromValidation()` |
| `apps/web/__tests__/profile-maintenance/draft.test.ts` | 8 tests for draft API route |
| `apps/web/__tests__/profile-maintenance/validate.test.ts` | 8 tests for validate API route |
| `apps/web/__tests__/profile-maintenance/approve.test.ts` | 9 tests for approve API route |
| `apps/web/__tests__/profile-maintenance/version-update.test.ts` | 7 tests for version-update helpers |
| `apps/web/__tests__/profile-maintenance/helpers/mock-chain.ts` | Shared PostgREST mock builder for tests |
| `apps/scraper/tests/unit/test_draft_profile.py` | 11 tests for draft + validate runner handlers |

### Modified files:

| File | Change |
|------|--------|
| `apps/web/lib/profile-maintenance/seed-update.ts` | Added `ensureValidationCaseForSeed()` — auto-create validation set/cases from verified PDP seeds; fix `pageClassification` scope bug |
| `apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts` | Added kind-specific dispatch for `draft_site_extraction_profile` and `validate_profile_version` |
| `apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts` | Added `validate_profile_version` capability key mapping |
| `apps/web/lib/profile-maintenance/types.ts` | Added `validate_profile_version` to `ProfileMaintenanceCapabilities` interface |
| `apps/scraper/runner/profile_maintenance.py` | Added `_run_draft_site_extraction_profile()`, `_run_validate_profile_version()`, schema generation helpers; updated dispatch |
| `apps/scraper/core/api_client.py` | Added `model_schema_draft` and `validate_profile_version` to default capabilities |
| `apps/scraper/tests/unit/test_profile_maintenance.py` | Changed unsupported job kind test to use `browser_profile_setup`; added `model_schema_draft` to capability assertion |
| `apps/web/__tests__/lib/profile-maintenance/seed-update.test.ts` | Extended mock to support `ensureValidationCaseForSeed` queries |
| `apps/web/__tests__/profile-maintenance/result-seed-update.test.ts` | Extended mock to support `ensureValidationCaseForSeed` queries |

---

## Implementation Details

### 1. DB Migration (20260627000000)

Creates `activate_profile_version(p_version_id, p_approved_by, p_approval_note)` that atomically:
- Retires the currently active version for the profile (sets to `retired`)
- Activates the target version (sets to `active`, stores approval metadata)
- Updates `site_extraction_profiles.active_version_id` and `status='active'`
- Returns JSON result with activation details
- Raises exceptions (via `RAISE`) if version not found, already active, or state changed

### 2. Admin Draft Route (POST /api/admin/site-extraction-profiles/[profileId]/draft)

- Requires admin auth (admin or staff)
- Guards: profile must exist with status `draft`, need at least one verified PDP seed, no in-flight draft job
- Enqueues `draft_site_extraction_profile` job with correct payload and required capabilities
- Returns 202 with job + profile info

### 3. Admin Validate Route (POST /api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate)

- Requires admin auth (admin or staff)
- Guards: version must exist with status `draft`/`rejected`, has `compiled_crawl4ai_schema`, validation set exists, no in-flight run
- Creates `profile_validation_runs` row, sets version to `validating`
- Enqueues `validate_profile_version` job with cases + schema embedded in payload
- Returns 202 with job + validation run info

### 4. Admin Approve Route (POST /api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve)

- Requires admin-only auth (rejects staff)
- Guards: version in `draft`/`validating`, has `compiled_crawl4ai_schema`, passed validation run exists (or `force=true`), approval_note >= 10 chars
- Calls `activate_profile_version` RPC for atomic activation
- Returns success with updated version + profile

### 5. Runner Handler: `_run_draft_site_extraction_profile`

- Extracts payload: `profile_id`, `verified_seed_urls`
- Crawls first verified seed URL (fallback chain)
- Calls `_generate_schema_from_html()` which:
  - Tries `JsonCssExtractionStrategy.generate_schema()` with LLM if available
  - Falls back to `_build_structural_schema()` using regex pattern matching
- Converts generated schema to BayState Field Evidence Rules format
- Computes deterministic SHA256 version hash
- Returns artifact with rules, compiled schema, hash, and summary

### 6. Runner Handler: `_run_validate_profile_version`

- Extracts payload: `profile_version_id`, `validation_run_id`, `compiled_crawl4ai_schema`, `validation_cases`
- For each case: crawls URL, applies schema, compares against expected assertions
- Classifies failures: `crawl_failure`, `identity_failure`, `source_mismatch`, `rule_failure`, `value_mismatch`
- Aggregates results with pass/fail summary and failure breakdown
- Empty case list returns passed with `validation_mode='fixture'`

### 7. Result Side-Effect Helpers

- `updateVersionFromDraft()`: Creates `site_extraction_profile_version` row with `created_from='ai_schema_draft'`, incremented version_number
- `updateValidationRunFromValidation()`: Updates `profile_validation_runs` status, links artifact, updates version status (pass→validating, fail→draft)

### 8. Validation Set Auto-Creation

- `ensureValidationCaseForSeed()` in seed-update.ts: Finds/creates default validation set for profile, creates `profile_validation_cases` row for verified seed, links back

### 9. Capability Updates

- Claim route: Added `validate_profile_version` capability key mapping
- Types: Added `validate_profile_version` to interface
- API client defaults: Added `model_schema_draft` capability

---

## Validation Output

### Web Jest Tests (110 tests, 10 suites — all pass)

```bash
bun run web test -- --testPathPatterns="profile-maintenance/" --no-coverage --runInBand
```

```
Test Suites: 10 passed, 10 total
Tests:       110 passed, 110 total
```

Tests cover:
- Draft route: 401, 404, 400 (not draft), 400 (no seeds), 409 (in-flight), 202 (success), capabilities check
- Validate route: 401, 404, 400 (wrong status), 400 (no schema), 400 (no set), 409 (in-flight), 202 (success)
- Approve route: 401, 403 (staff), 404, 400 (wrong status), 400 (no schema), 400 (no validation run), 400 (short note), 200 (success), force=true
- Version update helpers: draft version creation, version numbering, missing data no-op, error handling, validation run status (passed/failed), missing ID no-op, invalid status no-op
- Existing tests: all still pass (result, claim, progress, seed-update, brand-source-setup)

### Scraper Pytest Tests (36 tests — all pass)

```bash
python3 -m pytest tests/unit/test_profile_maintenance.py tests/unit/test_draft_profile.py -q
```

```
36 passed in 0.64s
```

Tests cover:
- Draft handler: missing profile_id, missing seeds, crawl failure→rejected, PDP page→schema generated, schema structure, deterministic hash, Field Evidence Rules wrapper shape
- Validate handler: all pass→passed, crawl failure→classified correctly, empty cases→passed, artifact structure
- Existing tests: all still pass (unsupported job kind updated, capabilities verified)

### Lint (Python — clean)

```bash
ruff check runner/profile_maintenance.py tests/unit/test_draft_profile.py tests/unit/test_profile_maintenance.py
```

No lint errors.

---

## Residual Risks

| Risk | Status |
|------|--------|
| `JsonCssExtractionStrategy.generate_schema()` requires LLM API key | Handler falls back to structural analysis if LLM unavailable — graceful degradation is in place |
| Generated schema quality may be poor for complex PDP pages | Schema is draft-only (not active by default); validation catches poor schemas; retry with different seed URL supported |
| `ensureValidationCaseForSeed()` logs warning on failure (non-fatal) | Intentionally non-fatal — seed verification still succeeds even if validation case creation fails |
| Validation case data size in job payload | Limited to available cases in the validation set; runner handles empty case list gracefully |
| Race condition: concurrent approval requests | PG function's `WHERE status IN ('draft', 'validating')` + `IF NOT FOUND` guard prevents double-activation; partial unique index adds defense-in-depth |
| Activation race with retired old version | Transactional — old active retired before new active set, all in one RPC call |

---

## Acceptance Report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "AI Schema Draft, Profile Version validation, and approval implemented with proper async job queue, PG atomic activation, runner handlers, result side-effects, auto-created validation sets, and capability-gated claiming. No UI, Browser Profile, enrichment, or export/public API changes."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "Changed files, tests added, commands run, validation output, residual risks, and no staged files are all documented below. 110 Web tests + 36 Python tests all pass."
    }
  ],
  "changedFiles": [
    "apps/web/supabase/migrations/20260627000000_activate_profile_version_rpc.sql",
    "apps/web/app/api/admin/site-extraction-profiles/[profileId]/draft/route.ts",
    "apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts",
    "apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route.ts",
    "apps/web/lib/profile-maintenance/version-update.ts",
    "apps/web/lib/profile-maintenance/seed-update.ts",
    "apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts",
    "apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts",
    "apps/web/lib/profile-maintenance/types.ts",
    "apps/scraper/runner/profile_maintenance.py",
    "apps/scraper/core/api_client.py",
    "apps/web/__tests__/profile-maintenance/draft.test.ts",
    "apps/web/__tests__/profile-maintenance/validate.test.ts",
    "apps/web/__tests__/profile-maintenance/approve.test.ts",
    "apps/web/__tests__/profile-maintenance/version-update.test.ts",
    "apps/web/__tests__/profile-maintenance/helpers/mock-chain.ts",
    "apps/scraper/tests/unit/test_draft_profile.py",
    "apps/scraper/tests/unit/test_profile_maintenance.py",
    "apps/web/__tests__/lib/profile-maintenance/seed-update.test.ts",
    "apps/web/__tests__/profile-maintenance/result-seed-update.test.ts"
  ],
  "testsAddedOrUpdated": [
    "apps/web/__tests__/profile-maintenance/draft.test.ts (8 tests)",
    "apps/web/__tests__/profile-maintenance/validate.test.ts (8 tests)",
    "apps/web/__tests__/profile-maintenance/approve.test.ts (9 tests)",
    "apps/web/__tests__/profile-maintenance/version-update.test.ts (7 tests)",
    "apps/scraper/tests/unit/test_draft_profile.py (11 tests)",
    "apps/scraper/tests/unit/test_profile_maintenance.py (updated 2 tests)",
    "apps/web/__tests__/lib/profile-maintenance/seed-update.test.ts (extended mock)",
    "apps/web/__tests__/profile-maintenance/result-seed-update.test.ts (extended mock)"
  ],
  "commandsRun": [
    {
      "command": "bun run web test -- --testPathPatterns=\"profile-maintenance/\" --no-coverage --runInBand",
      "result": "passed",
      "summary": "10 suites, 110 tests — all pass"
    },
    {
      "command": "cd apps/scraper && python3 -m pytest tests/unit/test_profile_maintenance.py tests/unit/test_draft_profile.py -q",
      "result": "passed",
      "summary": "36 passed, 0 failed"
    },
    {
      "command": "cd apps/scraper && python3 -m ruff check runner/profile_maintenance.py tests/unit/test_draft_profile.py tests/unit/test_profile_maintenance.py",
      "result": "passed",
      "summary": "No lint errors"
    }
  ],
  "validationOutput": [
    "Web: 10 test suites, 110 tests — all pass (draft: 8, validate: 8, approve: 9, version-update: 7, + existing 78)",
    "Scraper: 36 pytest tests — all pass (draft: 6, validate: 5, + existing 25 updated)",
    "Python lint: clean (no errors from ruff)"
  ],
  "residualRisks": [
    "JsonCssExtractionStrategy.generate_schema() LLM fallback: runner falls back to structural regex-based analysis if LLM unavailable — graceful degradation",
    "ensureValidationCaseForSeed() failure is non-fatal: seed verification succeeds even if validation case creation fails",
    "Activation race handled: PG RPC with WHERE + IF NOT FOUND + partial unique index provides defense-in-depth"
  ],
  "noStagedFiles": true,
  "diffSummary": "1 new migration (atomic activation PG function), 1 new helper module (version-update.ts), 3 new admin API routes (draft/validate/approve), 2 new runner handlers (draft + validate), 1 shared test mock helper, result route dispatch extension, claim route capability key addition, validation set auto-creation in seed-update, API client default capability update, 4 new test suites (32 new tests) + 1 new Python test suite (11 new tests) + updated existing tests (4 modified)",
  "reviewFindings": [
    "no blockers: All ADR constraints respected (profiles are first-class, AI schemas are draft-only, artifacts are immutable, runners use API-only boundary, validation mode labeled)"
  ],
  "manualNotes": "Dirty worktree preserved. No files staged. All new and existing tests pass. Implementation follows the plan order (migration → seed-update → version-update → runner handlers → admin routes → result route → claim/api-client → tests). The only Python syntax concern (f-string quote reuse on 3.10) was fixed by extracting the nested expression to a variable."
}
```
