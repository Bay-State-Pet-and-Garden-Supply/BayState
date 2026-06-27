## Review
- Correct:
  - Admin setup/revalidate routes enforce admin auth and duplicate in-flight request checks before enqueueing jobs (`apps/web/app/api/admin/browser-profiles/setup-requests/route.ts:14-78`, `apps/web/app/api/admin/browser-profiles/[id]/revalidate/route.ts:46-84`).
  - Profile-maintenance result callbacks validate runner auth, terminal status, lease token, lease expiry, runner ownership, and use a conditional update before target-row side effects (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:71-175`).
  - Revalidation result handling clears `storage_ref` and `runner_name` on `revoked` (`apps/web/lib/profile-maintenance/browser-profile-update.ts:233-240`).
  - Current runner artifact payloads avoid raw cookie/localStorage fields; they emit summary fields such as status, size, booleans, and seed results (`apps/scraper/runner/profile_maintenance.py:1291-1301`, `apps/scraper/runner/profile_maintenance.py:1578-1588`).

- Fixed: none — review only; no source files were modified.

- Blocker: Browser Profile storage identity is not opaque and is persisted/exposed through Supabase job artifacts/rows.
  - Evidence: ADR 0010 requires identity/runtime state to stay out of Supabase and job payloads (`docs/adr/0010-browser-profile-registry-runtime-storage.md:3`). The runner returns the actual profile filesystem path as `result.storage_ref` and logs it (`apps/scraper/runner/profile_maintenance.py:1255-1281`). The result endpoint persists `body.result` unchanged into `profile_maintenance_jobs.result` (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:151-159`). Revalidation enqueues `storage_ref` in `profile_maintenance_jobs.payload` and returns it from the admin route (`apps/web/app/api/admin/browser-profiles/[id]/revalidate/route.ts:94-100`, `apps/web/app/api/admin/browser-profiles/[id]/revalidate/route.ts:149-156`). `profile_maintenance_jobs` has authenticated read RLS (`apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql:330-331`). Tests currently assert path-style refs (`apps/web/__tests__/app/api/admin/browser-profiles/revalidate.test.ts:34`, `apps/web/__tests__/profile-maintenance/browser-profile-result-update.test.ts:162`).
  - Smallest fix: make `storage_ref` a non-path opaque key (for example, a runner-local registry ID keyed by `browser_profile_id`), strip it from job payloads/admin responses/job `result`, and add server-side allowlist/sanitization before inserting Browser Profile artifacts (`result/route.ts:201-218`). Update tests to reject filesystem paths and secret-bearing keys.

- Blocker: setup/revalidate validation can succeed without proof, so fail-closed behavior is not correct.
  - Evidence: setup marks the profile `validated` even when the smoke test is skipped because only seed IDs are available (`apps/scraper/runner/profile_maintenance.py:1268-1281`). Revalidation does not resolve target seed URLs, crawls only the domain root, initializes `auth_working = True`, and treats non-auth crawl failures as still valid (`apps/scraper/runner/profile_maintenance.py:1431-1479`, `apps/scraper/runner/profile_maintenance.py:1490-1492`). The web helper treats any setup status other than exactly `failed` as validated and will store a null/non-opaque `storage_ref` (`apps/web/lib/profile-maintenance/browser-profile-update.ts:75-109`). The required-profile helper also returns usable on database errors (`apps/web/lib/profile-maintenance/browser-profile-update.ts:315-317`).
  - Smallest fix: require `validation_status === "validated"` plus a non-empty opaque `storage_ref` for setup; otherwise mark `validation_failed`. For setup/revalidate, include or resolve actual seed URLs and require at least one successful authenticated validation target before returning `validated`; unknown/transient crawl failures should not bless the profile. Treat DB errors in required-profile checks as unusable/fail-closed.

- Blocker: required Browser Profile fail-closed checks are not wired into extraction job creation.
  - Evidence: `getRequiredBrowserProfileStatus()` exists (`apps/web/lib/profile-maintenance/browser-profile-update.ts:300-364`), but `scrapeProducts()` builds approved source plans and optional site extraction profile snapshots without importing/calling it (`apps/web/lib/pipeline-scraping.ts:542-610`). Static search found no call sites outside the helper definition.
  - Smallest fix: during source-plan/job creation, check each brand/source/domain that may require a Browser Profile; skip/fail UPCs with a clear `browser_profile_required_unusable` reason when status is missing, stale, invalid, or lookup errors, and only pass an approved opaque Browser Profile reference to runners when usable.

- Blocker: Browser Profile capability routing is unreliable and currently breaks web typecheck.
  - Evidence: `bun run web typecheck` fails on `app/api/scraper/v1/profile-maintenance/claim/route.ts(105,29)` because `draft_site_extraction_profile` is used but missing from the local `ProfileMaintenanceCapability` interface (`apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:26-33`, `apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:100-108`). The Python client defaults every enabled profile-maintenance runner to advertise `browser_profile_setup` and `browser_profile_runtime` (`apps/scraper/core/api_client.py:793-821`), despite the setup handler documenting that only interactive-capable runners should advertise setup (`apps/scraper/runner/profile_maintenance.py:1191-1194`).
  - Smallest fix: add the missing TS capability field; change runner defaults to a safe non-interactive set and require explicit env/stored runner metadata for `browser_profile_setup`/`browser_profile_runtime`; update tests that currently expect these capabilities by default.

- Note: Focused Jest and pytest suites pass, but `bun run web typecheck` fails. Besides the production claim-route error above, several new Jest files are global scripts and redeclare top-level mocks (for example `apps/web/__tests__/app/api/admin/browser-profiles/revalidate.test.ts:13-17` and `apps/web/__tests__/app/api/admin/browser-profiles/setup-requests.test.ts:14-18`). Add `export {}` or convert to imports if typecheck is expected to pass.
- Note: `plan.md` and `progress.md` were read but describe unrelated grouping/research work, not this Browser Profile slice.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete findings include file paths, line numbers, severities, and smallest fixes for storage_ref leaks, fail-closed gaps, missing required-profile wiring, capability routing, and typecheck failures."
    }
  ],
  "changedFiles": [
    "validation/browser-profile-correctness-review.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "bun run web test -- --testPathPatterns=\"browser-profiles|profile-maintenance|source-plan-profile-snapshots\"",
      "result": "passed",
      "summary": "16 suites passed, 146 tests passed."
    },
    {
      "command": "cd apps/scraper && python -m pytest tests/unit/test_profile_maintenance.py",
      "result": "failed",
      "summary": "Failed locally because python was not found."
    },
    {
      "command": "cd apps/scraper && python3 -m pytest tests/unit/test_profile_maintenance.py",
      "result": "passed",
      "summary": "31 tests passed; warnings from local Python 3.14/pytest-asyncio."
    },
    {
      "command": "bun run web typecheck",
      "result": "failed",
      "summary": "tsc failed; relevant production error is missing draft_site_extraction_profile on ProfileMaintenanceCapability, plus test-file global redeclarations/mock typing errors."
    },
    {
      "command": "git diff --cached --name-only",
      "result": "passed",
      "summary": "No staged files."
    }
  ],
  "validationOutput": [
    "Focused web Jest tests passed: 16 suites / 146 tests.",
    "Focused scraper pytest passed with python3: 31 tests.",
    "Web typecheck failed with Browser Profile/profile-maintenance related TypeScript issues."
  ],
  "residualRisks": [
    "No live BrowserProfiler success path was exercised; tests cover import-error/nonexistent-path paths only.",
    "No database/RLS integration test was run; RLS and persistence findings are from static inspection of migrations/routes."
  ],
  "noStagedFiles": true,
  "diffSummary": "Reviewed Browser Profile setup/revalidate routes, profile-maintenance result and update helpers, runner handlers/API client, migrations, and focused tests. No source code changes made.",
  "reviewFindings": [
    "blocker: apps/scraper/runner/profile_maintenance.py:1255-1281 and apps/web/app/api/admin/browser-profiles/[id]/revalidate/route.ts:94-100 - storage_ref is a filesystem path and is persisted/exposed instead of opaque.",
    "blocker: apps/scraper/runner/profile_maintenance.py:1268-1281 and 1431-1492 - setup/revalidate can mark profiles validated without real seed/auth proof.",
    "blocker: apps/web/lib/profile-maintenance/browser-profile-update.ts:75-109 and 315-317 - malformed setup results/DB errors fail open instead of closed.",
    "blocker: apps/web/lib/pipeline-scraping.ts:542-610 - required Browser Profile helper is not wired into extraction scheduling.",
    "blocker: apps/scraper/core/api_client.py:793-821 and apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:26-33,105 - runner defaults advertise interactive capabilities and TS capability type is incomplete."
  ],
  "manualNotes": "Review-only run. plan.md/progress.md were unrelated to the Browser Profile slice."
}
```
