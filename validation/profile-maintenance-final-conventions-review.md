## Review

**PASS** — no blockers found in the scoped profile-maintenance vertical-slice diff.

- **Correct:** The migration stays scoped to a dedicated profile-maintenance queue/artifact model (`apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql:10`, `:126`) with job/artifact enum constraints (`:51`, `:177`), lease fields (`:26`), immutable artifact protection (`:274-317`), and RLS policies (`:322-339`). I did not see product enrichment/admin UI writes or Browser Profile runtime storage beyond denormalized IDs/job kinds.
- **Correct:** The scraper API claim route uses runner auth, capability gating, persisted runner capability metadata, lease-token claims, pagination past incompatible jobs, and conditional updates (`apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:44-134`, `:220-345`).
- **Correct:** Progress/result callbacks verify lease token, runner ownership, lease expiry, and reject stale/raced updates using guarded `UPDATE` predicates (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route.ts:68-142`; `apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:98-183`). Result submission stores the structured result and optional artifact without touching enrichment/admin UI paths (`result/route.ts:144-224`).
- **Correct:** Scraper integration is gated and additive: API client PM methods are behind `PROFILE_MAINTENANCE_JOBS_ENABLED` and use dedicated `/profile-maintenance/*` endpoints (`apps/scraper/core/api_client.py:769-1036`); daemon PM polling is separately gated/concurrency-limited (`apps/scraper/daemon.py:709-714`, `:832-856`); the runner skeleton only dispatches `verify_pdp_seed` with fixture artifacts and fails unsupported kinds (`apps/scraper/runner/profile_maintenance.py:18-111`).
- **Correct:** Tests cover the accepted fixes I expected to see: claim capability persistence and head-of-line avoidance (`apps/web/__tests__/profile-maintenance/claim.test.ts:254-365`), progress lease expiry and stale/raced callbacks (`progress.test.ts:249-299`), result cancellation/idempotency, artifact insert, expired lease, stale callback handling (`result.test.ts:233-415`), and scraper payload nesting/capabilities/runner behavior (`apps/scraper/tests/unit/test_profile_maintenance.py:132-182`, `:220-313`, `:316-405`).
- **Fixed:** none; review-only task and no source files were modified.
- **Blocker:** none.
- **Note (minor):** `apps/web/lib/profile-maintenance/types.ts:63-80` exports `ProfileMaintenanceCapabilities` with a required `profile_maintenance: boolean`, but the actual route contract and scraper client use `capabilities.profile_maintenance.enabled` (`claim/route.ts:26-40`; `apps/scraper/core/api_client.py:822-829`). Runtime is covered by tests, but align the exported shared type before TypeScript callers rely on it.

### Validation commands run

- `bun run web test -- --testPathPatterns="profile-maintenance"` — passed; 3 suites / 32 tests.
- `cd apps/scraper && python -m pytest tests/unit/test_profile_maintenance.py` — failed locally because `python` is not on PATH.
- `cd apps/scraper && uv run pytest tests/unit/test_profile_maintenance.py` — passed; 16 tests, with environment/dependency deprecation warnings only.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete scoped findings include no blockers plus a minor shared-type contract note at apps/web/lib/profile-maintenance/types.ts:63-80; validation commands and results are listed."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [
    "apps/web/__tests__/profile-maintenance/claim.test.ts",
    "apps/web/__tests__/profile-maintenance/progress.test.ts",
    "apps/web/__tests__/profile-maintenance/result.test.ts",
    "apps/scraper/tests/unit/test_profile_maintenance.py"
  ],
  "commandsRun": [
    {
      "command": "bun run web test -- --testPathPatterns=\"profile-maintenance\"",
      "result": "passed",
      "summary": "3 profile-maintenance Jest suites passed; 32 tests passed."
    },
    {
      "command": "cd apps/scraper && python -m pytest tests/unit/test_profile_maintenance.py",
      "result": "failed",
      "summary": "Local shell has no python executable on PATH."
    },
    {
      "command": "cd apps/scraper && uv run pytest tests/unit/test_profile_maintenance.py",
      "result": "passed",
      "summary": "16 scraper unit tests passed; warnings were dependency/deprecation noise."
    }
  ],
  "validationOutput": [
    "PASS: no blockers in scoped profile-maintenance diff.",
    "Web tests: PASS __tests__/profile-maintenance/{claim,progress,result}.test.ts; 32 passed.",
    "Scraper tests: uv run pytest tests/unit/test_profile_maintenance.py; 16 passed."
  ],
  "residualRisks": [
    "Minor: exported TS capability type in apps/web/lib/profile-maintenance/types.ts does not match the runtime enabled-based claim payload shape.",
    "Full repo lint/typecheck/build were not run because the task scope was the current profile-maintenance diff and the worktree contains many unrelated changes."
  ],
  "noStagedFiles": true,
  "diffSummary": "Scoped diff adds a profile_maintenance_jobs/artifacts migration, shared PM types, scraper-facing PM claim/progress/result/stub upload routes, focused web tests, scraper API client/daemon PM polling integration, and a Phase 1 verify_pdp_seed runner with unit tests.",
  "reviewFindings": [
    "blocker: none",
    "note: apps/web/lib/profile-maintenance/types.ts:63-80 - shared capability request type uses profile_maintenance boolean while runtime route/client use capabilities.profile_maintenance.enabled; align before TS consumers rely on it."
  ],
  "manualNotes": "No source files modified by this review; only the required validation report artifact was written. plan.md/progress.md appear stale/unrelated to this profile-maintenance slice."
}
```
