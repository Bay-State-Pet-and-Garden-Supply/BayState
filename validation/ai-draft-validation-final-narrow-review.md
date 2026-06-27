## Review

**Overall: FAIL — 5/9 requested blockers passed, 4/9 still fail.**

### Pass/fail per requested blocker

1. **FAIL — claim route capability mapping.** `apps/web/app/api/admin/site-extraction-profiles/[profileId]/draft/route.ts:128-132` requires `profile_maintenance.draft_site_extraction_profile`, but `apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:100-107` never adds that key to `runnerCapKeys`. Validation mapping for `validate_profile_version` exists at `claim/route.ts:105`, but scraper defaults still omit both `draft_site_extraction_profile` and `validate_profile_version` (`apps/scraper/core/api_client.py:802-814`).
2. **FAIL — `types.ts` capability interface.** `ProfileMaintenanceCapabilities` includes `model_schema_draft` and `validate_profile_version` but not `draft_site_extraction_profile` (`apps/web/lib/profile-maintenance/types.ts:63-70`), while draft jobs require that exact capability key.
3. **PASS — approve route validation gate.** The route no longer has a force bypass in the inspected code and fetches the most recent validation run by `created_at` before requiring `status === 'passed'` (`apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route.ts:83-100`).
4. **PASS — RPC grants.** The migration now revokes execute from `PUBLIC`, `anon`, and `authenticated`, and grants only `service_role` (`apps/web/supabase/migrations/20260627000000_activate_profile_version_rpc.sql:85-86`).
5. **PASS — version-update artifact guard.** Both version-update helpers return before target-row writes when `artifactId` is null (`apps/web/lib/profile-maintenance/version-update.ts:77-83`, `:164-170`), and validation run updates link `summary_artifact_id` to the durable artifact (`:191-201`).
6. **PASS — validation set profile scoping.** Provided validation sets are loaded and checked against the route `profileId` (`apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts:71-90`); implicit set lookup is also scoped with `.eq('profile_id', profileId)` (`:93-99`).
7. **FAIL — zero-cases rejection.** The validate route fetches cases and proceeds without rejecting `cases.length === 0` (`apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts:135-148`, response returns `caseCount: cases.length` at `:223-228`). The runner now reports `validation_status: 'failed'` for empty cases, but still returns job `status: 'succeeded'` (`apps/scraper/runner/profile_maintenance.py:856-901`), so zero-case validation is not rejected.
8. **PASS — ESLint cleanup.** Targeted web ESLint completed with no diagnostics: `cd apps/web && bun run lint -- app/api/admin/site-extraction-profiles lib/profile-maintenance app/api/scraper/v1/profile-maintenance`.
9. **FAIL — TypeScript errors.** `cd apps/web && bun run typecheck --pretty false` exits 1. In-scope errors remain in `apps/web/__tests__/profile-maintenance/version-update.test.ts` where structural mocks are passed to helpers typed as `SupabaseClient` (`:57`, `:80`, `:108`, `:129`, `:146`, `:202`, `:223`, `:248`, `:271`, `:285`). One additional pre-existing logs test mock error remains at `apps/web/__tests__/app/api/scraper/v1/logs.test.ts:39`.

### Correct
- Focused Jest suite passed: `bun run web test -- --testPathPatterns="profile-maintenance/" --no-coverage --runInBand` — 10 suites / 112 tests.
- Focused scraper pytest passed: `cd apps/scraper && uv run pytest tests/unit/test_draft_profile.py tests/unit/test_profile_maintenance.py -q` — 36 tests passed, warnings only.
- Focused Ruff passed with no diagnostics for the touched scraper files.

### Fixed
- None by this reviewer. Review-only; no source files were modified.

### Blocker
- `apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:100-107` + `apps/web/app/api/admin/site-extraction-profiles/[profileId]/draft/route.ts:128-132` — draft jobs remain unclaimable because the required `profile_maintenance.draft_site_extraction_profile` key is not mapped.
- `apps/web/lib/profile-maintenance/types.ts:63-70` — shared capability type still cannot represent `draft_site_extraction_profile`.
- `apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts:135-148` — zero-case validation sets are still enqueued rather than rejected.
- `apps/web/__tests__/profile-maintenance/version-update.test.ts` — TypeScript still fails on new profile-maintenance test mock types.

### Note
- `apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts:197-199` still inserts validation jobs with `brand_id`, `source_slug`, and `canonical_domain` as `undefined`; if artifact scope was part of the original validation-set scoping concern, that remains a follow-up risk.
- `apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:229-238` still treats artifact insert failure as non-fatal. The helper guard prevents target updates without an artifact, but a succeeded job can still have no target-row side effect.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Returned pass/fail for all 9 requested blockers with concrete file/line evidence and command results. Overall result: FAIL, with 4 unresolved blockers."
    }
  ],
  "changedFiles": [
    "validation/ai-draft-validation-final-narrow-review.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "bun run web test -- --testPathPatterns=\"profile-maintenance/\" --no-coverage --runInBand",
      "result": "passed",
      "summary": "10 Jest suites passed; 112 tests passed."
    },
    {
      "command": "cd apps/scraper && uv run pytest tests/unit/test_draft_profile.py tests/unit/test_profile_maintenance.py -q",
      "result": "passed",
      "summary": "36 pytest tests passed; warnings only."
    },
    {
      "command": "cd apps/scraper && uv run ruff check runner/profile_maintenance.py tests/unit/test_draft_profile.py tests/unit/test_profile_maintenance.py core/api_client.py daemon.py --output-format=github",
      "result": "passed",
      "summary": "No Ruff diagnostics."
    },
    {
      "command": "cd apps/web && bun run lint -- app/api/admin/site-extraction-profiles lib/profile-maintenance app/api/scraper/v1/profile-maintenance",
      "result": "passed",
      "summary": "No ESLint diagnostics."
    },
    {
      "command": "cd apps/web && bun run typecheck --pretty false",
      "result": "failed",
      "summary": "Typecheck exits 1 with profile-maintenance/version-update.test.ts SupabaseClient mock errors and one logs.test.ts mock error."
    },
    {
      "command": "git diff --cached --name-only",
      "result": "passed",
      "summary": "No staged files."
    }
  ],
  "validationOutput": [
    "PASS: approve route latest-validation gate at approve/route.ts:83-100.",
    "PASS: activation RPC grant hardening at 20260627000000_activate_profile_version_rpc.sql:85-86.",
    "PASS: version-update helpers require non-null artifactId at version-update.ts:77-83 and :164-170.",
    "PASS: provided validation_set_id is checked against profileId at validate/route.ts:71-90.",
    "PASS: targeted ESLint, Ruff, Jest, and pytest commands passed.",
    "FAIL: claim route does not map profile_maintenance.draft_site_extraction_profile while draft route requires it.",
    "FAIL: shared ProfileMaintenanceCapabilities omits draft_site_extraction_profile.",
    "FAIL: zero-case validation is not rejected by the validate route; runner returns succeeded/failed-result instead.",
    "FAIL: web typecheck still fails."
  ],
  "residualRisks": [
    "Focused tests pass but do not cover draft_site_extraction_profile claimability or zero-case route rejection.",
    "Validation jobs still omit brand/source/domain scope in inserted rows, if that scope is required for artifacts.",
    "Result route still records artifact insert failures as non-fatal; target updates are skipped by helper guard, but the job can remain succeeded without a target update.",
    "Full web typecheck is failing, including in-scope profile-maintenance test errors."
  ],
  "noStagedFiles": true,
  "diffSummary": "Review-only final narrow check. No source files edited; this report artifact was written. Current status: 5 requested blockers pass and 4 fail.",
  "reviewFindings": [
    "blocker: apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:100-107 - claim route never maps profile_maintenance.draft_site_extraction_profile, while apps/web/app/api/admin/site-extraction-profiles/[profileId]/draft/route.ts:128-132 requires it.",
    "blocker: apps/web/lib/profile-maintenance/types.ts:63-70 - ProfileMaintenanceCapabilities omits draft_site_extraction_profile.",
    "blocker: apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts:135-148 - zero validation cases are not rejected before run/job creation.",
    "blocker: apps/web/__tests__/profile-maintenance/version-update.test.ts:57 - web typecheck still fails on in-scope SupabaseClient mock type errors."
  ],
  "manualNotes": "No source modifications were made. The only file written by this reviewer is the required validation report."
}
```
