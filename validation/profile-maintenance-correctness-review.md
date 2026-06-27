## Review

- Correct: The implemented slice is scoped to the requested profile-maintenance foundation: new job/artifact migration, scraper claim/progress/result routes, shared TS types, scraper API client/daemon integration, runner skeleton, and focused tests only within the requested file set. The runner remains API-only; the new scraper methods call `/api/scraper/v1/profile-maintenance/*` and do not introduce direct DB access (`apps/scraper/core/api_client.py:769-1033`). Product enrichment behavior remains feature-flagged off by default for profile-maintenance claiming (`apps/scraper/daemon.py:711-717`, `apps/scraper/daemon.py:836-858`).
- Correct: Basic auth/ownership checks exist on the new runner APIs: claim validates runner auth and enabled status (`apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:44-71`), result validates terminal status plus lease token and runner ownership (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:68-122`), and progress validates auth, token, and owner (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route.ts:29-71`).
- Correct: Focused validation passed locally: web Jest profile-maintenance suites passed 26/26; scraper pytest passed 42/42 for `test_api_client.py` + `test_profile_maintenance.py`; ruff passed; ESLint had 0 errors and 2 existing-style unused-parameter warnings in the 501 stub.
- Fixed: None. Per instruction, no implementation files were modified; this review artifact was written only to `validation/profile-maintenance-correctness-review.md`.

- Blocker: Artifact immutability is not enforced. The plan/ADR require artifact evidence to be immutable, with only review/workflow metadata mutable (`docs/plans/site-extraction-profiles-implementation-plan.md:158-164`, `docs/adr/0011-dedicated-profile-maintenance-jobs.md:3-5`, `docs/plans/site-extraction-profiles-implementation-plan.md:500-508`). The migration creates mutable `payload`/`evidence_refs` fields (`apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql:149-168`), only adds an `updated_at` trigger (`apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql:261-272`), and grants staff `FOR ALL` on artifacts (`apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql:288-290`). Smallest fix: add a `BEFORE UPDATE` trigger or column-limited update policy that rejects changes to artifact envelope/provenance/payload/evidence/hash fields after insert while allowing review metadata updates; add a migration test or SQL assertion for this.
- Blocker: The daemon does not use the new profile-maintenance progress endpoint. `_process_profile_maintenance_job()` emits progress through `JobLoggingSession.emit_progress()` (`apps/scraper/daemon.py:538-548`), which ultimately calls `api_client.post_progress()` and posts to generic `/api/scraper/v1/progress` (`apps/scraper/core/api_client.py:1056-1065`). That web route updates `enrichment_jobs` and returns 404 for non-enrichment job IDs (`apps/web/app/api/scraper/v1/progress/route.ts:61-68`), so `profile_maintenance_jobs` remains `claimed` until result and the new `/profile-maintenance/[jobId]/progress` route is not exercised. Smallest fix: call `client.submit_profile_maintenance_progress(job_id, job.lease_token, "running", ...)` from the profile-maintenance daemon path/handlers, or teach `JobLoggingSession` to route progress by job type.
- Blocker: Lease validity/race checks are incomplete. The progress route does not select or check `lease_expires_at` (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route.ts:52-56`), and the result route compares only token/owner before updating by `id` only (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:97-147`). Expired leases can still submit progress/results if not yet reclaimed, and a row can change between load and update. Smallest fix: select/check `lease_expires_at > now()`, reject stale callbacks, and make progress/result updates conditional on `id`, `lease_token`, `claimed_by`, and a non-terminal status; add expired-lease and stale-callback tests.
- Blocker: Capability routing can head-of-line block. Claim queries take only the first 10 queued rows ordered by `created_at` and then filter capabilities in memory (`apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:155-179`), with the same pattern for expired rows (`apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:185-211`). If the first 10 jobs require capabilities this runner lacks, a claimable 11th job is never considered and the runner returns `job: null`. Smallest fix: use DB-side JSONB subset filtering or page/loop candidates until a claimable row is found; add a test with unsatisfied jobs ahead of a satisfiable job.

- Note: The migration exposes both jobs and artifacts to any authenticated user (`apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql:284-294`). If BayState has non-staff authenticated users, tighten these SELECT policies to `public.is_staff()` because artifact payload/evidence refs are admin/profile-maintenance evidence.
- Note: Profile-maintenance work is behind a feature flag, but when enabled it shares the global `MAX_CONCURRENT_JOBS` pool (`apps/scraper/daemon.py:780-784`, `apps/scraper/daemon.py:836-858`) despite the plan calling for separate concurrency to avoid product-pipeline starvation (`docs/plans/site-extraction-profiles-implementation-plan.md:260-261`, `docs/plans/site-extraction-profiles-implementation-plan.md:491-497`). Consider reserving enrichment capacity or using a separate PM task pool.
- Note: Runner skeleton behavior is intentionally static, but it treats an empty URL as a verified example.com fixture (`apps/scraper/runner/profile_maintenance.py:55-68`). Before any admin enqueue path exists, validate required payload fields so malformed jobs cannot create verified artifacts.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "blocked",
      "evidence": "Scope is limited to the requested first vertical slice, but correctness blockers remain: artifact immutability is not enforced, daemon progress is routed to the enrichment progress endpoint, lease validity is incomplete, and capability routing can head-of-line block."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "Reviewed requested files plus directly imported progress/logging context, cited file/line evidence, listed changed files/tests, ran focused web and scraper validation commands, and checked staged state."
    }
  ],
  "changedFiles": [
    "apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql",
    "apps/web/lib/profile-maintenance/types.ts",
    "apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts",
    "apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts",
    "apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route.ts",
    "apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/evidence-upload-url/route.ts",
    "apps/web/__tests__/profile-maintenance/claim.test.ts",
    "apps/web/__tests__/profile-maintenance/result.test.ts",
    "apps/web/__tests__/profile-maintenance/progress.test.ts",
    "apps/scraper/core/api_client.py",
    "apps/scraper/daemon.py",
    "apps/scraper/runner/profile_maintenance.py",
    "apps/scraper/tests/unit/test_profile_maintenance.py"
  ],
  "testsAddedOrUpdated": [
    "apps/web/__tests__/profile-maintenance/claim.test.ts",
    "apps/web/__tests__/profile-maintenance/result.test.ts",
    "apps/web/__tests__/profile-maintenance/progress.test.ts",
    "apps/scraper/tests/unit/test_profile_maintenance.py"
  ],
  "commandsRun": [
    {
      "command": "git status --short --untracked-files=all -- <requested target paths>",
      "result": "passed",
      "summary": "Target diff includes 2 modified tracked files and 11 untracked new files; unrelated dirty worktree files outside scope were not reviewed."
    },
    {
      "command": "git diff --cached --quiet; echo staged_exit:$?",
      "result": "passed",
      "summary": "staged_exit:0 (no staged files)."
    },
    {
      "command": "cd apps/web && node scripts/run-jest.cjs --testPathPatterns=\"profile-maintenance\" --no-coverage",
      "result": "passed",
      "summary": "3 suites passed, 26 tests passed."
    },
    {
      "command": "cd apps/scraper && python3 -m pytest tests/unit/test_profile_maintenance.py -q",
      "result": "passed",
      "summary": "15 tests passed; warnings from Python 3.14/pytest-asyncio and requests dependency versions."
    },
    {
      "command": "cd apps/scraper && python3 -m pytest tests/unit/test_api_client.py tests/unit/test_profile_maintenance.py -q",
      "result": "passed",
      "summary": "42 tests passed; warnings from Python 3.14/pytest-asyncio and requests dependency versions."
    },
    {
      "command": "cd apps/scraper && ruff check runner/profile_maintenance.py tests/unit/test_profile_maintenance.py",
      "result": "passed",
      "summary": "All checks passed."
    },
    {
      "command": "cd apps/web && npx eslint lib/profile-maintenance/ app/api/scraper/v1/profile-maintenance/",
      "result": "passed",
      "summary": "0 errors, 2 warnings for unused underscore-prefixed params in evidence-upload-url stub."
    }
  ],
  "validationOutput": [
    "Web Jest: PASS __tests__/profile-maintenance/{claim,progress,result}.test.ts; 26/26 tests passed.",
    "Scraper pytest focused: 15/15 profile-maintenance tests passed.",
    "Scraper pytest with existing API client suite: 42/42 tests passed.",
    "Ruff: All checks passed.",
    "ESLint: 0 errors, 2 warnings in the 501 stub."
  ],
  "residualRisks": [
    "No Supabase Storage bucket or signed upload implementation in this slice; evidence refs are inline only.",
    "No admin APIs/profile tables/browser profile tables yet, so result callbacks cannot update PDP seed/profile/browser target rows.",
    "Capability key naming should be locked before later jobs; docs mention crawl4ai_model_schema_draft while current code uses model_schema_draft.",
    "Result artifact insert is non-atomic/non-fatal; a succeeded job can be recorded without its artifact if insert fails."
  ],
  "noStagedFiles": true,
  "diffSummary": "Adds profile_maintenance_jobs/profile_maintenance_artifacts schema, TS types, scraper claim/result/progress/evidence-stub routes, scraper API client methods, daemon profile-maintenance polling/dispatch, a static verify_pdp_seed runner skeleton, and focused Jest/pytest tests.",
  "reviewFindings": [
    "blocker: apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql:149 - artifact payload/evidence fields are mutable despite immutable artifact requirement.",
    "blocker: apps/scraper/daemon.py:538 - profile-maintenance progress is emitted through generic JobLoggingSession/post_progress, which targets enrichment_jobs instead of profile_maintenance_jobs.",
    "blocker: apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:97 - lease token is checked but lease expiry and conditional update ownership are not enforced.",
    "blocker: apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:161 - capability filtering after a fixed limit can hide claimable jobs behind unsatisfied jobs.",
    "note: apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql:284 - authenticated-wide SELECT policies may expose maintenance evidence to non-staff users.",
    "note: apps/scraper/daemon.py:780 - PM jobs share global concurrency and can reduce enrichment capacity when the PM flag is enabled."
  ],
  "manualNotes": "No code changes were made. Review scope stayed on the requested files, with nearby context inspected only for imported progress/logging behavior."
}
```
