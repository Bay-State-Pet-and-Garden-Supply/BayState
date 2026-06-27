## Review

- **Correct:** The implemented scope matches the approved first vertical slice from `docs/plans/site-extraction-profiles-implementation-plan.md` / ADR 0011: a dedicated `profile_maintenance_jobs` + `profile_maintenance_artifacts` migration, scraper claim/progress/result APIs, scraper API client/daemon wiring behind `PROFILE_MAINTENANCE_JOBS_ENABLED`, and a `verify_pdp_seed` skeleton. I did not see admin UI/profile-table/enrichment overreach in the reviewed files.
- **Correct:** Focused web and scraper tests pass: `apps/web` profile-maintenance Jest suites passed 26/26, and `apps/scraper` profile-maintenance pytest passed 15/15. `npx tsc --noEmit` reported no diagnostics in profile-maintenance files, though the repo still exits non-zero from pre-existing diagnostics elsewhere.

- **Blocker:** `apps/scraper/daemon.py:596-600` and `apps/scraper/daemon.py:619-622` repeat the literal `job_id` key in logging `extra` dicts. `python3 -m ruff check runner/profile_maintenance.py tests/unit/test_profile_maintenance.py core/api_client.py daemon.py` fails with F601 on those two lines, so scraper lint will fail if run over the modified files. Smallest fix: remove the duplicate `"job_id": job_id` entries and rerun ruff on all changed Python files.

- **Blocker:** Successful scraper results are not persisted into `profile_maintenance_jobs.result`. The daemon sends successful handler output through `result_json` (`apps/scraper/daemon.py:565-570`), but `submit_profile_maintenance_result()` flattens that JSON into the top-level request body (`apps/scraper/core/api_client.py:983-994`). The web result route only writes the result column when `body.result` exists (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:132-140`), so the first vertical slice can mark jobs succeeded while leaving `result` null. Smallest fix: send `{ status, lease_token, result: json.loads(result_json), ... }`; update `apps/scraper/tests/unit/test_profile_maintenance.py:238-253` to assert `body["result"]`, and add/adjust a web test to verify the update payload includes `result`.

- **Blocker:** Artifact immutability is documented but not enforced. The migration labels artifacts as immutable evidence (`apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql:122-124`, `223-224`), but the only update trigger just refreshes `updated_at` (`260-272`) and the RLS policy grants staff `FOR ALL` on the whole row (`288-290`). This contradicts ADR 0011’s “artifact evidence is immutable; only review metadata mutable” rule. Smallest fix: add a `BEFORE UPDATE` trigger that rejects changes to envelope/provenance/payload/evidence/content fields, allowing only review metadata fields and `updated_at` to change.

- **Note:** Lease validation is too permissive. The result endpoint only checks a lease when `job.lease_token` is already non-null and never checks `lease_expires_at` (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:97-118`). The progress endpoint has the same conditional-token issue and does not even select `lease_expires_at` (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route.ts:52-70`). Smallest fix: require claimed/running jobs to have a matching, unexpired lease token and `claimed_by === runnerName` before accepting progress/results; add tests for unclaimed and expired-lease jobs.

- **Note:** The progress endpoint can terminalize a job as `failed` without `completed_at`, `error_code`, `error_message`, or artifact data because `ProgressBody.status` allows `failed` and `nextStatus` is written directly (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route.ts:100-108`). A later result callback is then ignored as already terminal. Smallest fix: reject `failed` on the progress endpoint (or map it to non-terminal progress only) and require terminal failures to use the result endpoint.

- **Note:** Claim tests do not cover the successful claim path, required-capability filtering, `job_kinds`, expired leases, or max-attempt handling. The current claim suite ends after empty-queue/capability-persistence cases (`apps/web/__tests__/profile-maintenance/claim.test.ts:214-261`), so regressions in `findClaimableQueuedRows()` / `tryClaimCandidate()` would not be caught.

- **Note:** Claim selection limits before filtering capabilities in memory (`apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:155-179`, `185-211`). If the first 10 queued/expired rows require capabilities this runner lacks, later claimable rows are skipped. Smallest fix: filter in SQL with JSONB containment where possible, or page until a satisfiable row is found; add a test with unsatisfied rows before a satisfiable candidate.

- **Note:** Targeted web ESLint reports two warnings in the 501 stub because `_request` and `_context` are unused (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/evidence-upload-url/route.ts:8-14`). This is not blocking, but it is small slop to remove.

## Commands run

- `cd apps/web && node scripts/run-jest.cjs --testPathPatterns="profile-maintenance" --no-coverage` — passed, 26 tests / 3 suites.
- `cd apps/scraper && python3 -m pytest tests/unit/test_profile_maintenance.py -q` — passed, 15 tests; warnings from the local Python 3.14/pytest stack.
- `cd apps/web && npx eslint lib/profile-maintenance/ app/api/scraper/v1/profile-maintenance/` — passed with 2 warnings in the evidence-upload-url stub.
- `cd apps/web && npx tsc --noEmit --pretty false` filtered for profile-maintenance paths — no profile-maintenance diagnostics; command exit was 1 due pre-existing diagnostics elsewhere.
- `cd apps/scraper && python3 -m py_compile core/api_client.py daemon.py runner/profile_maintenance.py` — passed.
- `cd apps/scraper && python3 -m ruff check runner/profile_maintenance.py tests/unit/test_profile_maintenance.py core/api_client.py daemon.py` — failed on `daemon.py` F601 duplicate-key errors.
- `git diff --cached --name-only | wc -l` — 0 staged files.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete findings include blockers and notes with file/line refs for daemon lint failures, result payload persistence, artifact immutability, lease validation, progress terminalization, claim coverage, claim filtering, and lint warnings."
    }
  ],
  "changedFiles": [
    "validation/profile-maintenance-conventions-review.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "cd apps/web && node scripts/run-jest.cjs --testPathPatterns=\"profile-maintenance\" --no-coverage",
      "result": "passed",
      "summary": "26 tests passed across 3 profile-maintenance Jest suites."
    },
    {
      "command": "cd apps/scraper && python3 -m pytest tests/unit/test_profile_maintenance.py -q",
      "result": "passed",
      "summary": "15 scraper profile-maintenance tests passed; local Python emitted deprecation/dependency warnings."
    },
    {
      "command": "cd apps/web && npx eslint lib/profile-maintenance/ app/api/scraper/v1/profile-maintenance/",
      "result": "passed",
      "summary": "0 errors, 2 warnings for unused params in evidence-upload-url stub."
    },
    {
      "command": "cd apps/web && npx tsc --noEmit --pretty false (filtered for profile-maintenance diagnostics)",
      "result": "failed",
      "summary": "No profile-maintenance diagnostics; tsc exited 1 from pre-existing diagnostics elsewhere."
    },
    {
      "command": "cd apps/scraper && python3 -m py_compile core/api_client.py daemon.py runner/profile_maintenance.py",
      "result": "passed",
      "summary": "Modified Python files compile."
    },
    {
      "command": "cd apps/scraper && python3 -m ruff check runner/profile_maintenance.py tests/unit/test_profile_maintenance.py core/api_client.py daemon.py",
      "result": "failed",
      "summary": "F601 duplicate dictionary key errors in daemon.py at lines 599 and 622."
    },
    {
      "command": "git diff --cached --name-only | wc -l",
      "result": "passed",
      "summary": "0 staged files."
    }
  ],
  "validationOutput": [
    "review-findings: 3 blockers, 5 notes with file/line refs",
    "web focused tests passed; scraper focused tests passed; scraper ruff failed on modified daemon.py",
    "residual-risks: lease expiry/ownership hardening and test coverage gaps remain after the reported blockers"
  ],
  "residualRisks": [
    "Ruff fails until duplicate daemon.py keys are removed.",
    "Successful runner results are not stored in profile_maintenance_jobs.result until the API client payload shape is fixed.",
    "Artifact evidence can be mutated unless DB-level immutability is added.",
    "Lease expiry/unclaimed-job paths and progress failure behavior need hardening and tests.",
    "Claim endpoint coverage does not yet prove capability routing under realistic queues."
  ],
  "noStagedFiles": true,
  "diffSummary": "Reviewed first vertical slice: new profile-maintenance migration/types/routes/tests/runner handler and modified scraper API client/daemon wiring. No source files changed by this review; only this validation report was written.",
  "reviewFindings": [
    "blocker: apps/scraper/daemon.py:596-600 and 619-622 - duplicate job_id keys make ruff fail with F601.",
    "blocker: apps/scraper/core/api_client.py:983-994 plus apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:132-140 - result_json is flattened, so successful job results are not persisted.",
    "blocker: apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql:122-124, 260-272, 288-290 - artifact immutability is documented but not enforced.",
    "note: apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:97-118 and progress/route.ts:52-70 - lease validation should require matching unexpired claimed leases.",
    "note: apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route.ts:100-108 - progress can mark jobs failed without terminal result details.",
    "note: apps/web/__tests__/profile-maintenance/claim.test.ts:214-261 - claim success/capability/expired-lease paths are not covered.",
    "note: apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:155-211 - in-memory capability filtering after limit can skip later claimable jobs.",
    "note: apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/evidence-upload-url/route.ts:8-14 - unused params produce ESLint warnings."
  ],
  "manualNotes": "Reviewed only the requested files plus nearby existing packaging route context for conventions. plan.md/progress.md are unrelated/stale for this slice; the docs and worker result define the relevant profile-maintenance scope."
}
```
