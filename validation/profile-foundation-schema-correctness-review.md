## Review
- **Correct:** The slice stays schema-only in the inspected implementation file: `apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql` creates the nine requested foundation tables and does not add API/UI/scraper/enrichment behavior. The tables are present at lines 12, 48, 91, 120, 155, 177, 206, 232, and 271, matching the guardrails table list (`handoff/profile-foundation-next-slice-guardrails.md:22-41`) and implementation plan table list (`docs/plans/site-extraction-profiles-implementation-plan.md:68-140`).
- **Correct:** SQL apply sanity passed in an isolated Supabase Postgres 17 container after applying the referenced queue migration. The validation query returned `foundation_tables=9`, `updated_at_triggers=9`, `rls_enabled_tables=9`, and `staff_policies=9`.
- **Correct:** FK ordering is safe for this slice. Non-circular FKs point to pre-existing/prior tables or earlier-created foundation tables, including `brands`/`brand_sources` at lines 14-15, profile versions to profiles at line 50, validation cases to validation sets/seeds/artifacts at lines 179/182/187, validation runs to versions/sets/artifacts at lines 208-212, browser profiles to brands/artifacts at lines 234/246, and setup requests to browser profiles/profile-maintenance jobs at lines 273/278. The circular/late-binding references are intentionally nullable without FKs at `site_extraction_profiles.active_version_id` and `product_detail_page_seeds.validation_case_id` (lines 22 and 130), which matches the handoff risk guidance (`handoff/profile-foundation-next-slice-guardrails.md:72`).
- **Correct:** Update triggers use the existing generic baseline function `public.update_updated_at_column()` for all nine new tables (lines 299-351). That function exists in the baseline migration (`apps/web/supabase/migrations/20250101000000_baseline.sql:1770-1778`).
- **Correct:** Required uniqueness/indexes are present: profile owner uniqueness at lines 31-33, `(profile_id, version_number)` uniqueness plus one-active-version partial index at lines 65 and 70-73, PDP seed normalized URL uniqueness at lines 140-142, and Browser Profile scope uniqueness at lines 254-256.
- **Correct:** RLS is enabled for all nine new tables and each new policy is staff-gated through `public.is_staff()` (lines 358-411). I did not find any blanket `TO authenticated USING (true)` read policy in the new migration. The `is_staff()` helper checks `profiles.role in ('admin', 'staff')` in the baseline (`apps/web/supabase/migrations/20250101000000_baseline.sql:1216-1224`).
- **Correct:** Browser Profile registry columns are metadata-only: `browser_profiles` contains scope/status/runner/environment/opaque `storage_ref`/validation metadata fields (lines 232-249), and comments explicitly exclude cookies, localStorage, `user_data_dir`, auth headers, token-bearing URLs, and runtime profile files (lines 262-265). This aligns with ADR 0010 (`docs/adr/0010-browser-profile-registry-runtime-storage.md:1-5`) and the plan non-goal (`docs/plans/site-extraction-profiles-implementation-plan.md:55`).
- **Fixed:** None — review-only; no source files were modified by this reviewer. This report artifact was written to the requested validation path.
- **Blocker:** None found in the inspected schema-only slice.
- **Note:** `supabase db lint --workdir apps/web/supabase --local --fail-on error` could not run because no local database was listening on `127.0.0.1:54322`. I used an isolated Supabase Postgres 17 container with minimal baseline stubs plus the referenced `20260625000000_profile_maintenance_jobs.sql` to validate SQL syntax, FK order, triggers, RLS, and policy creation.
- **Note:** `site_extraction_profiles.profile_setup_completed_at` (lines 24 and 41-42) bakes in future Brand Source Setup wizard semantics that are not in the Phase 1 table bullet list. I do not consider this blocking because it is inert schema metadata and no API/UI behavior was added, but it is the only minor scope-creep risk I saw.
- **Note:** `browser_profile_setup_requests.target_pdp_seed_ids` is a `uuid[]` column (line 279), so the database cannot enforce FK integrity for each seed ID. That is acceptable for an inert foundation if future APIs validate the IDs, but it remains a follow-up integrity consideration.
- **Note:** The requested `plan.md` and `progress.md` were read. They are unrelated to this profile-foundation slice (`plan.md` describes grouping pipeline workflow; `progress.md` describes external enrichment research), so the profile plan/ADRs/guardrails were used as the source of truth.

## Validation commands run
- `pwd && git status --short && git diff --name-only && git diff --cached --name-only && which psql || true && which supabase || true && which bun || true` — inspected worktree/tooling; no staged files were reported at review start; `supabase` and `bun` are available, `psql` is not installed on the host.
- `supabase db lint --workdir apps/web/supabase --local --fail-on error` — failed because local Supabase Postgres was not running (`127.0.0.1:54322` connection refused).
- Isolated Docker/Supabase Postgres validation: bootstrapped minimal baseline anchors, applied `apps/web/supabase/migrations/20260625000000_profile_maintenance_jobs.sql`, then applied `apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql` with `ON_ERROR_STOP=1` — passed; validation query returned `foundation_tables=9`, `updated_at_triggers=9`, `rls_enabled_tables=9`, `staff_policies=9`.
- `python3` static guardrail scan of the migration — passed; required unique indexes/constraints were present, blanket authenticated read policy was absent, and Browser Profile secret-named columns were absent.
- `git diff --cached --name-only && git status --short validation/profile-foundation-schema-correctness-review.md apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql` — passed; staged diff output was empty, and both the reviewed migration plus this report are untracked.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Reviewed only the schema-only foundation migration plus referenced prior migrations/docs. No API/UI/scraper/enrichment behavior was found in apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql; no source edits were made by the reviewer."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "Report cites file/line evidence for tables, FK ordering, trigger function, constraints/indexes, RLS, Browser Profile metadata boundaries, and validation command outputs."
    }
  ],
  "changedFiles": [
    "apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql",
    "validation/profile-foundation-schema-correctness-review.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "pwd && git status --short && git diff --name-only && git diff --cached --name-only && which psql || true && which supabase || true && which bun || true",
      "result": "passed",
      "summary": "Inspected worktree/tooling; no staged files were reported at review start; host has supabase and bun but no psql."
    },
    {
      "command": "supabase db lint --workdir apps/web/supabase --local --fail-on error",
      "result": "failed",
      "summary": "Local Supabase database was not running; connection to 127.0.0.1:54322 was refused."
    },
    {
      "command": "Docker Supabase Postgres 17 apply sanity: bootstrap minimal baseline anchors, apply 20260625000000_profile_maintenance_jobs.sql, then apply 20260626000000_site_extraction_profile_foundation.sql with ON_ERROR_STOP=1",
      "result": "passed",
      "summary": "Migration applied successfully after the referenced prior migration; validation query returned foundation_tables=9, updated_at_triggers=9, rls_enabled_tables=9, staff_policies=9."
    },
    {
      "command": "python3 static guardrail scan of 20260626000000_site_extraction_profile_foundation.sql",
      "result": "passed",
      "summary": "Required unique indexes/constraints were present; blanket authenticated read policy was absent; Browser Profile secret-named columns were absent."
    },
    {
      "command": "git diff --cached --name-only && git status --short validation/profile-foundation-schema-correctness-review.md apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql",
      "result": "passed",
      "summary": "No staged files; reviewed migration and validation report are untracked."
    }
  ],
  "validationOutput": [
    "Docker/Supabase Postgres apply sanity: PASS after referenced profile-maintenance migration.",
    "Schema validation query: foundation_tables=9; updated_at_triggers=9; rls_enabled_tables=9; staff_policies=9.",
    "Static scan: unique_profile_owner_index=True; unique_version_number=True; unique_active_version_partial=True; unique_pdp_seed_url=True; unique_browser_scope=True; blanket_auth_read_absent=True; browser_secret_named_columns_absent=True.",
    "Local supabase db lint was not available because the local database was not running.",
    "Final staged-file check: git diff --cached --name-only produced no output."
  ],
  "residualRisks": [
    "No full supabase db reset/lint against the complete project was possible because local Supabase was not running and apps/web/supabase/config.toml is not present outside .archived; Docker validation used minimal baseline stubs for referenced existing tables/functions.",
    "profile_setup_completed_at is inert but encodes future Brand Source Setup wizard semantics not listed in the Phase 1 table bullets.",
    "browser_profile_setup_requests.target_pdp_seed_ids is a uuid[] and cannot enforce per-element FK integrity; future APIs should validate seed IDs."
  ],
  "noStagedFiles": true,
  "diffSummary": "Reviewed one untracked schema-only migration that creates nine Site Extraction Profile/Browser Profile foundation tables with constraints, indexes, updated_at triggers, and staff-only RLS; reviewer wrote only this validation report artifact.",
  "reviewFindings": [
    "no blockers",
    "note: apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql:24 - profile_setup_completed_at is minor inert scope-creep risk because it encodes future setup wizard semantics.",
    "note: apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql:279 - target_pdp_seed_ids uuid[] cannot enforce per-element FK integrity."
  ],
  "manualNotes": "Review-only. The requested plan.md/progress.md are unrelated to this profile-foundation slice, so guardrails, the implementation plan, ADRs 0007-0011, baseline, and profile-maintenance migration were used for correctness checks."
}
```
