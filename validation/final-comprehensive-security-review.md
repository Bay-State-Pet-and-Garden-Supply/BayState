## Review

- **Correct:** ADR 0010/0011 establish the right boundary: Browser Profile cookies, local storage, `user_data_dir`, and session files must stay in runner runtime storage, and maintenance artifacts must exclude cookies, storage contents, auth headers, Browser Profile files, and raw token-bearing request headers (`docs/adr/0010-browser-profile-registry-runtime-storage.md:3`, `docs/adr/0011-dedicated-profile-maintenance-jobs.md:5`).
- **Correct:** The foundation Browser Profile table describes `storage_ref` as an opaque runner-local key and forbids secrets in `metadata`; the foundation profile tables have staff-only RLS policies (`apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql:232-265`, `:370-411`).
- **Correct:** Runner claim/progress/result routes validate runner API auth and lease/ownership before updates; result/progress use conditional updates with matching `lease_token`, `claimed_by`, non-terminal status, and unexpired lease (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:59-73`, `:166-175`; `apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route.ts:29-50`, `:114-128`).
- **Correct:** Profile-maintenance worker polling is feature-flagged in both the API client and daemon (`apps/scraper/core/api_client.py:787-791`; `apps/scraper/daemon.py:710-714`, `:832-856`).
- **Correct:** The activation RPC has explicit execute grants hardened to `service_role` only (`apps/web/supabase/migrations/20260627000000_activate_profile_version_rpc.sql:85-86`).
- **Correct:** Focused automated checks pass: web profile-maintenance/browser-profile Jest suites passed 174 tests; source-plan profile snapshot Jest passed 8 tests; scraper profile-maintenance pytest passed 31 tests; focused Ruff passed.

- **Fixed:** None. Per instruction, no implementation files were modified; only this review artifact was written.

- **Blocker:** Admin UI auth is bypassed while the Profile Maintenance page reads sensitive tables through a service-role client. `apps/web/app/admin/layout.tsx:64-66` unconditionally sets `role = 'staff'` instead of redirecting unauthenticated/non-staff users, and `apps/web/app/admin/profile-maintenance/page.tsx:78-113` calls `createAdminClient()` and reads jobs, seeds, profiles, browser profiles, and corrections. This violates the service-role-client-auth-gated/admin boundary even though the API routes themselves are guarded.

- **Blocker:** `profile_maintenance_jobs` and `profile_maintenance_artifacts` are readable by every authenticated user, not just staff/admin. The migration adds staff `FOR ALL` policies but then also adds `FOR SELECT TO authenticated USING (true)` on both tables (`apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql:325-339`). These rows contain job payloads, results, artifact payloads/evidence refs, profile/browser scope, and runner provenance; this conflicts with the requested admin-only RLS boundary.

- **Blocker:** Secret-bearing artifact/job payloads are not rejected or redacted on ingestion. The result route persists `body.result` directly to `profile_maintenance_jobs.result` (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:151-160`) and inserts `body.artifact.payload` / `body.artifact.evidence_refs` directly into `profile_maintenance_artifacts` (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:201-222`). A runner callback containing `cookies`, `localStorage`, `user_data_dir`, `Authorization`, or token-bearing request headers would be stored in Supabase despite ADR 0011. The explicit-corrections API has the same unsanitized JSON evidence pattern for `evidence_summary` (`apps/web/app/api/admin/explicit-corrections/route.ts:75-94`) and later carries that JSON into profile-version rules (`apps/web/lib/profile-maintenance/explicit-correction-helpers.ts:75-82`).

- **Blocker:** Browser Profile runtime paths can still leak into persisted job logs. The runner logs the local registry mapping and profile filesystem path (`apps/scraper/runner/profile_maintenance.py:78-85`, `:1320-1322`); `JobLoggingSession` injects the job context and captures messages (`apps/scraper/utils/logging_handlers.py:998-1004`, `:343-363`), then ships them through `api_client.post_logs()` (`apps/scraper/utils/logging_handlers.py:606-610`) to the web logs API, which persists logs (`apps/web/app/api/scraper/v1/logs/route.ts:74-96`). That stores Browser Profile runtime-storage paths in Supabase logs, violating ADR 0010’s “runtime storage owns actual profile data” boundary.

- **Blocker:** `storage_ref` opacity is not enforced at the revalidation boundary. The admin revalidation route loads and embeds `storage_ref` into the profile-maintenance job payload and response (`apps/web/app/api/admin/browser-profiles/[id]/revalidate/route.ts:35-40`, `:93-101`, `:149-156`), and the runner explicitly falls back to treating `storage_ref` as a direct filesystem path or BrowserProfiler profile name (`apps/scraper/runner/profile_maintenance.py:1517-1531`). Setup results validate opaque UUID/hash refs, but revalidation can still accept/path-resolve a non-opaque stored value.

- **Blocker:** Required Browser Profile fail-closed behavior is not wired into extraction job creation. The helper says callers should use `getRequiredBrowserProfileStatus()` and notes the integration is “not yet wired” (`apps/web/lib/profile-maintenance/browser-profile-update.ts:345-357`); static search found no call sites outside that file. `scrapeProducts()` only embeds site-extraction profile snapshots behind `SITE_EXTRACTION_PROFILES_IN_ENRICHMENT_ENABLED` and does not check required Browser Profile usability before creating enrichment jobs (`apps/web/lib/pipeline-scraping.ts:603-608`). Required missing/stale/failed Browser Profiles can therefore fall through to no-profile crawling, contrary to ADR 0010.

- **Blocker:** The scraper still contains direct Supabase access for credential lookup. `apps/scraper/core/api_client.py:1141-1203` resolves `SUPABASE_URL`/`SUPABASE_SECRET_KEY` and calls `supabase.create_client(...).table("scraper_credentials")`; `get_credentials()` falls back to that direct DB path when the API URL is absent or API credential fetch fails (`apps/scraper/core/api_client.py:1296-1301`, `:1348-1351`). This violates the runner API-only boundary and “no direct DB from runner” requirement.

- **Note:** The signed evidence upload stub is public and returns 501 without runner auth (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/evidence-upload-url/route.ts:8-26`). It does not disclose or mutate data today, but every `/api/scraper/v1/*` endpoint should still enforce runner auth for a consistent boundary.
- **Note:** `activate_profile_version` is granted only to `service_role`, which is good, but it is `SECURITY DEFINER` without an explicit `SET search_path` clause (`apps/web/supabase/migrations/20260627000000_activate_profile_version_rpc.sql:10-17`). Because the function fully qualifies table names this is lower risk, but add a fixed `search_path` as standard hardening.
- **Note:** `plan.md` and `progress.md` were read but are stale/unrelated to this profile-maintenance audit.

### Commands run

- `git status --short` — completed; worktree already dirty/untracked, no staged output observed separately.
- `git diff --cached --name-only` — passed; no staged files.
- `bun run web test -- --testPathPatterns="profile-maintenance|browser-profiles" --no-coverage` — passed; 17 suites / 174 tests.
- `bun run web test -- --testPathPatterns="source-plan-profile-snapshots" --no-coverage` — passed; 1 suite / 8 tests.
- `cd apps/scraper && uv run pytest tests/unit/test_profile_maintenance.py -q` — passed; 31 tests, local Python/pytest warnings only.
- `cd apps/scraper && uv run ruff check runner/profile_maintenance.py core/api_client.py daemon.py tests/unit/test_profile_maintenance.py` — passed.
- Static inspections with `nl -ba`/`grep` over ADRs, migrations, admin/profile-maintenance routes, runner code, and Supabase-access patterns — completed; blockers above cite concrete line refs.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Review-only task completed without widening implementation scope; no source files were edited, and findings are limited to the requested profile-maintenance security/boundary audit."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "Findings cite ADRs, migrations, admin routes/pages, scraper routes, runner code, and validation commands with file/line references sufficient for independent review."
    }
  ],
  "changedFiles": [
    "validation/final-comprehensive-security-review.md (review artifact only)"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git status --short",
      "result": "passed",
      "summary": "Worktree already contained many unrelated dirty/untracked files; no source edits were made by this review."
    },
    {
      "command": "git diff --cached --name-only",
      "result": "passed",
      "summary": "No staged files."
    },
    {
      "command": "bun run web test -- --testPathPatterns=\"profile-maintenance|browser-profiles\" --no-coverage",
      "result": "passed",
      "summary": "17 suites passed; 174 tests passed."
    },
    {
      "command": "bun run web test -- --testPathPatterns=\"source-plan-profile-snapshots\" --no-coverage",
      "result": "passed",
      "summary": "1 suite passed; 8 tests passed."
    },
    {
      "command": "cd apps/scraper && uv run pytest tests/unit/test_profile_maintenance.py -q",
      "result": "passed",
      "summary": "31 tests passed; local dependency/deprecation warnings only."
    },
    {
      "command": "cd apps/scraper && uv run ruff check runner/profile_maintenance.py core/api_client.py daemon.py tests/unit/test_profile_maintenance.py",
      "result": "passed",
      "summary": "Ruff passed."
    },
    {
      "command": "grep -RIn \"from supabase import create_client\\|create_client(url, key)\\|client.table(\\\"scraper_credentials\\\")\" apps/scraper --include='*.py'",
      "result": "completed",
      "summary": "Confirmed direct Supabase credential lookup in apps/scraper/core/api_client.py."
    }
  ],
  "validationOutput": [
    "Web focused tests passed: profile-maintenance/browser-profiles 174/174, source-plan profile snapshots 8/8.",
    "Scraper focused tests passed: 31/31 profile-maintenance tests; Ruff passed.",
    "Static audit found remaining blockers: admin layout auth bypass, broad authenticated RLS on profile-maintenance evidence, unsanitized runner/evidence JSON persistence, Browser Profile path leakage via logs/revalidation fallback, fail-closed check not wired, and direct Supabase access from scraper."
  ],
  "residualRisks": [
    "No live database/RLS execution test was run; RLS findings are static migration review.",
    "No live BrowserProfiler interactive setup or real Supabase deployment was exercised.",
    "Full repo typecheck/build were not run because this was a security review of a dirty worktree with unrelated changes."
  ],
  "noStagedFiles": true,
  "diffSummary": "Review-only: wrote the required validation report. No implementation/source files were modified by this reviewer.",
  "reviewFindings": [
    "blocker: apps/web/app/admin/layout.tsx:64-66 plus apps/web/app/admin/profile-maintenance/page.tsx:78-113 - admin UI auth is bypassed while service-role reads sensitive profile-maintenance tables.",
    "blocker: apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql:329-339 - profile_maintenance_jobs/artifacts are SELECTable by all authenticated users.",
    "blocker: apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:151-160 and :201-222 - result/artifact payloads are persisted without secret redaction or allowlist validation.",
    "blocker: apps/scraper/runner/profile_maintenance.py:78-85 and :1320-1322 with apps/scraper/utils/logging_handlers.py:606-610 - Browser Profile filesystem paths can be shipped to persisted job logs.",
    "blocker: apps/web/app/api/admin/browser-profiles/[id]/revalidate/route.ts:93-101 and apps/scraper/runner/profile_maintenance.py:1517-1531 - revalidation can carry and resolve non-opaque storage_ref paths.",
    "blocker: apps/web/lib/profile-maintenance/browser-profile-update.ts:345-357 plus apps/web/lib/pipeline-scraping.ts:603-608 - required Browser Profile fail-closed check is not wired into extraction scheduling.",
    "blocker: apps/scraper/core/api_client.py:1141-1203 and :1296-1351 - scraper runner still has direct Supabase credential DB fallback."
  ],
  "manualNotes": "plan.md/progress.md are unrelated to this profile-maintenance audit; ADR 0010/0011 and current code define the relevant security contract."
}
```
