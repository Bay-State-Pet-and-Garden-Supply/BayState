## Review

**FAIL** — one remaining race-hardening blocker in the claim endpoint.

- Correct: `apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql:10-43` creates the dedicated job queue with lease/result fields, and `:126-169` creates artifact records. Artifact evidence immutability is enforced by the `BEFORE UPDATE` trigger at `:274-317`, which resets envelope/provenance/payload/evidence/content fields to `OLD` values while allowing review metadata.
- Correct: `apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route.ts:114-128` uses the profile-maintenance progress route and applies conditional guards for matching lease token, runner ownership, non-terminal status, and unexpired lease before updating `payload.progress`.
- Correct: `apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:90-95` treats `cancelled` as terminal and avoids late result overwrites; `:144-168` persists `body.result` to the job row under `result`; `:185-213` inserts optional artifacts only after the guarded job update succeeds.
- Correct: `apps/scraper/core/api_client.py:927-931` posts progress to `/api/scraper/v1/profile-maintenance/{job_id}/progress`; `:983-990` nests parsed `result_json` under `result`; `:1011-1015` posts results to the dedicated result endpoint.
- Correct: `apps/scraper/daemon.py:538-572` uses the dedicated profile-maintenance progress/result client methods, and `:834-856` claims profile-maintenance work under the feature flag/concurrency limit. `uv run ruff ... --select F601` passed, so the prior daemon F601 issue is gone.
- Correct: Focused tests cover claim pagination past incompatible capability pages (`apps/web/__tests__/profile-maintenance/claim.test.ts:264-365`), stale/expired progress callbacks (`progress.test.ts:249-298`), cancelled result overwrite prevention (`result.test.ts:233-249`), result payload nesting (`apps/scraper/tests/unit/test_profile_maintenance.py:285-313`), and the runner skeleton behavior (`:319-406`).

- Blocker: `apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:302-306` marks max-attempt candidates failed with only `.eq('id', rowId)`. Unlike the normal claim update at `:312-331`, this path has no `attempt_count`, expected-status, lease, or non-terminal guard. If a candidate is cancelled or otherwise terminal between the SELECT page and this UPDATE, the claim endpoint can overwrite that terminal state to `failed`, leaving a residual cancelled-job/race-hardening hole. This should be changed to a conditional update using the same `expectedStatus`/`attempt_count` safeguards before final approval.

- Note: `plan.md` and `progress.md` were read but appear unrelated to this profile-maintenance slice (grouping workflow plan and external enrichment research progress), so validation was based on the requested files/current diff.
- Note: Full web typecheck was attempted and failed in files outside this review scope (`__tests__/app/api/scraper/v1/logs.test.ts`, `lib/consolidation/brand-resolver.ts`). No typecheck errors were reported for the profile-maintenance files in the output.

### Validation commands run

- `bun run web test -- --testPathPatterns="profile-maintenance"` — passed, 3 suites / 32 tests.
- `cd apps/scraper && python -m pytest tests/unit/test_profile_maintenance.py` — failed because `python` is not installed on PATH; reran with `uv`.
- `cd apps/scraper && python -m ruff check daemon.py core/api_client.py runner/profile_maintenance.py tests/unit/test_profile_maintenance.py --select F601,F821,F841` — failed because `python` is not installed on PATH; reran with `uv`.
- `cd apps/scraper && uv run pytest tests/unit/test_profile_maintenance.py` — passed, 16 tests (warnings only from environment/plugin deprecations).
- `cd apps/scraper && uv run ruff check daemon.py core/api_client.py runner/profile_maintenance.py tests/unit/test_profile_maintenance.py` — passed.
- `cd apps/scraper && uv run ruff check daemon.py core/api_client.py runner/profile_maintenance.py tests/unit/test_profile_maintenance.py --select F601` — passed.
- `cd apps/scraper && uv run ruff check daemon.py core/api_client.py runner/profile_maintenance.py tests/unit/test_profile_maintenance.py --select F601,F821,F841` — failed on stricter-than-configured F841 unused-local findings; default Ruff and targeted F601 both passed.
- `bun run web lint -- app/api/scraper/v1/profile-maintenance lib/profile-maintenance` — passed.
- `bun run web typecheck --pretty false` — failed on unrelated files outside this review scope.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete finding reported with file/line refs: blocker in apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:302-306; correctness evidence cited across migration, API routes, scraper client/daemon, and tests."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "bun run web test -- --testPathPatterns=\"profile-maintenance\"",
      "result": "passed",
      "summary": "3 profile-maintenance Jest suites passed; 32 tests passed."
    },
    {
      "command": "cd apps/scraper && python -m pytest tests/unit/test_profile_maintenance.py",
      "result": "failed",
      "summary": "Environment issue: /bin/bash: python: command not found; reran successfully with uv."
    },
    {
      "command": "cd apps/scraper && python -m ruff check daemon.py core/api_client.py runner/profile_maintenance.py tests/unit/test_profile_maintenance.py --select F601,F821,F841",
      "result": "failed",
      "summary": "Environment issue: /bin/bash: python: command not found; reran with uv."
    },
    {
      "command": "cd apps/scraper && uv run pytest tests/unit/test_profile_maintenance.py",
      "result": "passed",
      "summary": "16 profile-maintenance pytest tests passed; warnings only."
    },
    {
      "command": "cd apps/scraper && uv run ruff check daemon.py core/api_client.py runner/profile_maintenance.py tests/unit/test_profile_maintenance.py",
      "result": "passed",
      "summary": "Default configured Ruff checks passed for reviewed scraper files."
    },
    {
      "command": "cd apps/scraper && uv run ruff check daemon.py core/api_client.py runner/profile_maintenance.py tests/unit/test_profile_maintenance.py --select F601",
      "result": "passed",
      "summary": "No duplicate-key F601 findings in reviewed scraper files."
    },
    {
      "command": "cd apps/scraper && uv run ruff check daemon.py core/api_client.py runner/profile_maintenance.py tests/unit/test_profile_maintenance.py --select F601,F821,F841",
      "result": "failed",
      "summary": "Stricter-than-configured scan reported F841 unused locals; default Ruff and targeted F601 passed."
    },
    {
      "command": "bun run web lint -- app/api/scraper/v1/profile-maintenance lib/profile-maintenance",
      "result": "passed",
      "summary": "ESLint passed for profile-maintenance API/lib files."
    },
    {
      "command": "bun run web typecheck --pretty false",
      "result": "failed",
      "summary": "Failed only in unrelated files outside review scope: __tests__/app/api/scraper/v1/logs.test.ts and lib/consolidation/brand-resolver.ts."
    }
  ],
  "validationOutput": [
    "Jest profile-maintenance: PASS (3 suites, 32 tests).",
    "Pytest profile-maintenance: PASS (16 tests).",
    "Ruff default + F601 targeted checks: PASS; ad hoc stricter F841 scan failed on unused locals.",
    "Targeted web ESLint: PASS.",
    "Full web typecheck: FAIL outside reviewed profile-maintenance scope."
  ],
  "residualRisks": [
    "Claim max-attempt cleanup update can overwrite a job that becomes cancelled/terminal after candidate selection because it only filters by id.",
    "Full web typecheck currently fails outside this review scope."
  ],
  "noStagedFiles": true,
  "diffSummary": "Reviewed profile-maintenance queue migration, shared types, scraper claim/progress/result API routes, evidence-upload stub, scraper API client/daemon integration, runner skeleton, and focused web/scraper tests. Only apps/scraper/core/api_client.py and apps/scraper/daemon.py are tracked modifications in this scope; the new profile-maintenance files are currently untracked.",
  "reviewFindings": [
    "blocker: apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:302-306 - max-attempt failure update lacks conditional status/attempt/lease guards and can overwrite cancelled/terminal state in a race."
  ],
  "manualNotes": "Review-only; no code files were modified. Findings written to validation/profile-maintenance-final-correctness-review.md as requested."
}
```
