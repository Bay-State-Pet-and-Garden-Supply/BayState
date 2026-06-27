## Review
- **Correct:** The slice has the expected shape for AI Schema Draft + Profile Version validation/approval: admin draft/validate/approve routes require admin auth (`apps/web/app/api/admin/site-extraction-profiles/[profileId]/draft/route.ts:24-30`, `apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts:24-30`, `apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route.ts:27-33`), the approval route uses admin-only auth (`approve/route.ts:27-30`), and runner code stays API-only through the profile-maintenance endpoints (`apps/scraper/core/api_client.py:769-838`, `apps/scraper/daemon.py:538-573`).
- **Correct:** Focused web and scraper tests pass: `bun run web test -- --testPathPatterns="profile-maintenance/" --no-coverage --runInBand` passed 10 suites / 110 tests, and `cd apps/scraper && python3 -m pytest tests/unit/test_profile_maintenance.py tests/unit/test_draft_profile.py -q` passed 36 tests. Python lint also passed for the new runner/test files.
- **Correct:** The activation RPC migration applied cleanly in an isolated Supabase Postgres 17 container with minimal prerequisite tables (`APPLY_OK`), so no SQL syntax blocker was found in `apps/web/supabase/migrations/20260627000000_activate_profile_version_rpc.sql:10-80`.
- **Fixed:** None. Review-only; no source files were modified.
- **Blocker:** Profile-maintenance capability wiring makes the new jobs unclaimable and currently fails TypeScript. Draft jobs require `profile_maintenance.draft_site_extraction_profile` (`apps/web/app/api/admin/site-extraction-profiles/[profileId]/draft/route.ts:128-132`), but the claim route never maps a runner capability to that key (`apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:99-106`). Validation jobs require `profile_maintenance.validate_profile_version` (`apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts:165-168`), but the scraper default advertised capabilities omit it (`apps/scraper/core/api_client.py:809-814`), and the claim route’s local `ProfileMaintenanceCapability` interface omits it while line 104 reads it, producing `TS2339`. Smallest fix: add/import a single shared capability type including `draft_site_extraction_profile` and `validate_profile_version`, map both in `runnerCapKeys`, include both in scraper defaults, and merge newly advertised request capabilities into stored runner metadata.
- **Blocker:** Non-force approval can be satisfied by a zero-case validation. The validate route accepts a validation set even when `profile_validation_cases` is empty (`validate/route.ts:114-125`) and still enqueues a job/returns `caseCount` (`validate/route.ts:149-207`). The runner then returns `validation_status: "passed"` for empty or invalid `validation_cases` (`apps/scraper/runner/profile_maintenance.py:856-901`), and approval only checks for any passed run (`approve/route.ts:84-105`). Smallest fix: reject validation when the selected set has zero valid cases, and make the runner return failed/error for empty validation cases instead of passed fixture mode.
- **Blocker:** `bun run web typecheck --pretty false` fails in this slice. In addition to the claim-route `TS2339`, new `__tests__/profile-maintenance/version-update.test.ts` calls pass structural mocks where `updateVersionFromDraft` / `updateValidationRunFromValidation` require `SupabaseClient` (`apps/web/lib/profile-maintenance/version-update.ts:70-75`, first failing call at `apps/web/__tests__/profile-maintenance/version-update.test.ts:56`). Smallest fix: type the helper tests with an explicit `as unknown as SupabaseClient` test helper or loosen helper parameters to the actual minimal PostgREST surface used.
- **Note:** Failed validation jobs can leave versions stuck in `validating`: the validate route creates a pending run and sets the version to `validating` before enqueue (`validate/route.ts:127-147`), while result side effects only run for `body.status === 'succeeded'` inside the artifact branch (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:189-274`). The daemon submits unhandled runner failures as `status="failed"` without an artifact (`apps/scraper/daemon.py:591-609`), so the validation run/version are not reset. Add a failed/timed_out path that marks the run `error` and returns the version to `draft`.
- **Note:** The migration’s `SECURITY DEFINER` function is fully qualified for table access, but it does not set a fixed `search_path` (`apps/web/supabase/migrations/20260627000000_activate_profile_version_rpc.sql:15-17`). Add `SET search_path = public, pg_temp` to avoid Supabase security-lint warnings.
- **Note:** Tests cover auth/status/happy paths, but miss the edge cases above: claimability for `draft_site_extraction_profile`/`validate_profile_version`, zero-case validation, failed validation result cleanup, and validating that caller-provided `validation_set_id` belongs to the requested profile.

## Commands run
- `git status --short` — inspected dirty worktree; many unrelated changes are present, so this review was scoped to the AI schema draft/profile validation files.
- `bun run web typecheck --pretty false 2>&1 | grep -E "profile-maintenance|site-extraction-profiles|profile_maintenance|TS"; echo ...` — failed; relevant errors include `claim/route.ts(104,29): TS2339` plus `version-update.test.ts` SupabaseClient mock type errors.
- `bun run web test -- --testPathPatterns="profile-maintenance/" --no-coverage --runInBand` — passed; 10 suites / 110 tests.
- `cd apps/scraper && python3 -m pytest tests/unit/test_profile_maintenance.py tests/unit/test_draft_profile.py -q` — passed; 36 tests, warnings only.
- `cd apps/scraper && python3 -m ruff check runner/profile_maintenance.py tests/unit/test_draft_profile.py tests/unit/test_profile_maintenance.py` — passed.
- Isolated Docker/Supabase Postgres 17 migration apply with minimal prerequisite tables and `ON_ERROR_STOP=1` — passed (`APPLY_OK`).
- `git diff --cached --name-only` — passed; no staged files.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "not_satisfied",
      "evidence": "Review found blocking capability/claim wiring, zero-case validation approval, and TypeScript failures; no source files were modified by this review."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "Findings cite exact files/lines, commands run, validation output, and residual risks for independent review."
    }
  ],
  "changedFiles": [
    "validation/ai-draft-validation-conventions-review.md (review artifact written)",
    "apps/web/supabase/migrations/20260627000000_activate_profile_version_rpc.sql (reviewed)",
    "apps/web/app/api/admin/site-extraction-profiles/[profileId]/draft/route.ts (reviewed)",
    "apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts (reviewed)",
    "apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route.ts (reviewed)",
    "apps/web/lib/profile-maintenance/version-update.ts (reviewed)",
    "apps/web/lib/profile-maintenance/seed-update.ts (reviewed)",
    "apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts (reviewed)",
    "apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts (reviewed)",
    "apps/scraper/runner/profile_maintenance.py (reviewed)",
    "apps/scraper/core/api_client.py (reviewed)",
    "apps/scraper/daemon.py (reviewed)"
  ],
  "testsAddedOrUpdated": [
    "apps/web/__tests__/profile-maintenance/draft.test.ts (reviewed)",
    "apps/web/__tests__/profile-maintenance/validate.test.ts (reviewed)",
    "apps/web/__tests__/profile-maintenance/approve.test.ts (reviewed)",
    "apps/web/__tests__/profile-maintenance/version-update.test.ts (reviewed; type errors found)",
    "apps/web/__tests__/profile-maintenance/claim.test.ts (reviewed)",
    "apps/web/__tests__/profile-maintenance/result-seed-update.test.ts (reviewed)",
    "apps/web/__tests__/lib/profile-maintenance/seed-update.test.ts (reviewed)",
    "apps/scraper/tests/unit/test_draft_profile.py (reviewed)",
    "apps/scraper/tests/unit/test_profile_maintenance.py (reviewed)"
  ],
  "commandsRun": [
    {
      "command": "git status --short && git diff --name-only && git diff --stat",
      "result": "passed",
      "summary": "Inspected worktree; many unrelated dirty files exist, review scoped to AI schema draft/profile validation files."
    },
    {
      "command": "bun run web typecheck --pretty false 2>&1 | grep -E \"profile-maintenance|site-extraction-profiles|profile_maintenance|TS\"; echo TYPECHECK_EXIT=...",
      "result": "failed",
      "summary": "Typecheck exited 2; relevant errors include claim/route.ts TS2339 and version-update.test.ts SupabaseClient mock type errors."
    },
    {
      "command": "bun run web test -- --testPathPatterns=\"profile-maintenance/\" --no-coverage --runInBand",
      "result": "passed",
      "summary": "10 suites, 110 tests passed."
    },
    {
      "command": "cd apps/scraper && python3 -m pytest tests/unit/test_profile_maintenance.py tests/unit/test_draft_profile.py -q",
      "result": "passed",
      "summary": "36 tests passed; warnings only."
    },
    {
      "command": "cd apps/scraper && python3 -m ruff check runner/profile_maintenance.py tests/unit/test_draft_profile.py tests/unit/test_profile_maintenance.py",
      "result": "passed",
      "summary": "All checks passed."
    },
    {
      "command": "Isolated Docker Supabase Postgres 17 apply of 20260627000000_activate_profile_version_rpc.sql with minimal prerequisite tables and ON_ERROR_STOP=1",
      "result": "passed",
      "summary": "Migration applied successfully (APPLY_OK)."
    },
    {
      "command": "git diff --cached --name-only",
      "result": "passed",
      "summary": "No staged files."
    }
  ],
  "validationOutput": [
    "Web Jest profile-maintenance: PASS, 10 suites / 110 tests.",
    "Scraper pytest profile-maintenance/draft_profile: PASS, 36 tests.",
    "Ruff focused runner/tests: PASS.",
    "Activation RPC migration apply sanity: PASS (APPLY_OK).",
    "Web typecheck: FAIL with relevant claim-route capability TS2339 and new version-update test mock type errors."
  ],
  "residualRisks": [
    "Current worktree contains many unrelated changes outside this slice; isolate before accepting a narrow PR.",
    "Validation_set_id profile ownership and malformed body validation are not covered by tests.",
    "Security-definer search_path should be fixed to satisfy Supabase security lint conventions."
  ],
  "noStagedFiles": true,
  "diffSummary": "Reviewed AI Schema Draft/Profile Version validation + approval slice: new activation RPC, admin draft/validate/approve routes, profile-maintenance side-effect helpers, claim/result extensions, scraper runner handlers/API client updates, and focused tests. Review artifact only was written.",
  "reviewFindings": [
    "blocker: apps/web/app/api/admin/site-extraction-profiles/[profileId]/draft/route.ts:128 + apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:99 - draft jobs require a capability the claim route never produces, so they are unclaimable.",
    "blocker: apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts:165 + apps/scraper/core/api_client.py:809 - validate jobs require validate_profile_version but the default scraper capabilities omit it; claim/route.ts:104 also fails TS2339.",
    "blocker: apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts:114 + apps/scraper/runner/profile_maintenance.py:856 - zero validation cases can produce a passed run and satisfy non-force approval.",
    "blocker: bun run web typecheck --pretty false - new profile-maintenance files introduce TypeScript errors.",
    "note: apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:238 - failed validation jobs do not update profile_validation_runs/version state.",
    "note: apps/web/supabase/migrations/20260627000000_activate_profile_version_rpc.sql:15 - SECURITY DEFINER function should set search_path."
  ],
  "manualNotes": "Review-only: no source files edited. Findings written to validation/ai-draft-validation-conventions-review.md as requested."
}
```