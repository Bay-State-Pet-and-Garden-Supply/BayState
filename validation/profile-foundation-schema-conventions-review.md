## Review

**Pass/fail:** **FAIL** for acceptance of a schema-only slice due to working-tree scope contamination. The migration file itself passed the requested static checks for the nine foundation tables, explicit corrections, and non-blanket RLS.

- **Correct:** `apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql` contains all nine requested foundation tables. Static parse found these `CREATE TABLE` entries: `site_extraction_profiles` (line 12), `site_extraction_profile_versions` (line 48), `explicit_extraction_corrections` (line 91), `product_detail_page_seeds` (line 120), `profile_validation_sets` (line 155), `profile_validation_cases` (line 177), `profile_validation_runs` (line 206), `browser_profiles` (line 232), and `browser_profile_setup_requests` (line 271). These align with the implementation plan’s Phase 1.1-1.3 table list in `docs/plans/site-extraction-profiles-implementation-plan.md:64-143`.
- **Correct:** Explicit corrections are included: `explicit_extraction_corrections` is created with brand/source/domain/profile/version linkage, `target_field`, `correction_type` constrained to `accepted`/`rejected`, and `evidence_summary` at `apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql:91-114`. `site_extraction_profile_versions.created_from` also allows `explicit_correction` at lines 57-58.
- **Correct:** RLS is not blanket authenticated read. RLS is enabled for all nine tables at `apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql:358-366`, and the policies are staff-only via `public.is_staff()` at lines 370-411. A non-comment pattern scan found zero `TO authenticated`, zero `auth.role() = 'authenticated'`, and zero `USING (true)` policy clauses.
- **Correct:** Browser Profile coordinator-only convention is reflected in the schema and comments: `browser_profiles.storage_ref` is opaque metadata at `apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql:232-265`, matching ADR 0010’s requirement that actual browser identity data stays in runner runtime storage (`docs/adr/0010-browser-profile-registry-runtime-storage.md:1-5`).
- **Fixed:** None. Review-only; no source files were modified.
- **Blocker:** The current working tree is not schema-only, so I cannot confirm “no admin API/UI/scraper/enrichment changes were made.” `git status --short -- apps/web/app/api apps/web/components apps/web/lib apps/scraper` reports multiple out-of-scope changes, including admin API/enrichment/scraper/UI paths such as `apps/web/app/api/admin/enrichment/jobs/route.ts`, `apps/web/app/api/admin/pipeline/runs/route.ts`, `apps/web/app/api/scraper/v1/enrichment-callback/route.ts`, `apps/web/components/admin/pipeline/extracting-utils.ts`, `apps/web/lib/scraper-callback/enrichment-result.ts`, and many `apps/scraper/**` files. Smallest fix: isolate this review/PR/worktree to the schema migration and allowed ADR/docs, or move/stash/revert the out-of-scope admin API/UI/scraper/enrichment changes into a separate slice.
- **Note:** The root `plan.md` and `progress.md` are unrelated to this profile-foundation migration (`plan.md` describes grouping pipeline work; `progress.md` describes external enrichment research), so I used the profile-specific ADRs and `docs/plans/site-extraction-profiles-implementation-plan.md` for convention/completeness checks.
- **Note:** I did not execute the migration against a database. Static review only. The migration references `public.profile_maintenance_jobs` and `public.profile_maintenance_artifacts`; ensure the prerequisite profile-maintenance migration is included/applied before this timestamped migration.

### Commands run

- `git status --short`
  - Result: passed command execution; found many non-schema working-tree changes.
- `nl -ba apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql | sed -n '1,360p'`
  - Result: inspected migration with line numbers.
- `nl -ba apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql | sed -n '360,430p'`
  - Result: inspected RLS policies with line numbers.
- `python3 - <<'PY' ... create_table_count/tables/policy scan ... PY`
  - Result: `create_table_count 9`; non-comment blanket-auth policy patterns all `0`.
- `git status --short -- apps/web/app/api apps/web/components apps/web/lib apps/scraper | sed -n '1,220p'`
  - Result: found out-of-scope admin API/UI/lib/scraper changes.
- `git diff --cached --name-only`
  - Result: no output; no staged files.

### Validation output

```text
create_table_count 9
tables
site_extraction_profiles:12
site_extraction_profile_versions:48
explicit_extraction_corrections:91
product_detail_page_seeds:120
profile_validation_sets:155
profile_validation_cases:177
profile_validation_runs:206
browser_profiles:232
browser_profile_setup_requests:271
non-comment RLS blanket-auth patterns:
TO authenticated: 0
authenticated: 0
USING (true): 0
auth.role() = 'authenticated': 0
```

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "not_satisfied",
      "evidence": "Migration file itself is schema-only and contains the requested nine tables, but the working tree also contains out-of-scope admin API/UI/scraper/enrichment changes, so the schema-only/no-scope-widening gate fails."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "Report cites migration line numbers for all nine tables, explicit corrections, RLS policies, docs/ADR alignment, command outputs, and scope-contamination evidence from git status."
    }
  ],
  "changedFiles": [
    "validation/profile-foundation-schema-conventions-review.md (review artifact written)",
    "apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql (reviewed untracked migration; not modified by reviewer)",
    "docs/adr/0009-first-class-site-extraction-profile-tables.md (reviewed)",
    "docs/adr/0010-browser-profile-registry-runtime-storage.md (reviewed)",
    "docs/adr/0011-dedicated-profile-maintenance-jobs.md (reviewed)",
    "docs/plans/site-extraction-profiles-implementation-plan.md (reviewed)"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git status --short",
      "result": "passed",
      "summary": "Command ran; showed many non-schema working-tree changes."
    },
    {
      "command": "nl -ba apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql | sed -n '1,360p'",
      "result": "passed",
      "summary": "Inspected table definitions and comments with line numbers."
    },
    {
      "command": "nl -ba apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql | sed -n '360,430p'",
      "result": "passed",
      "summary": "Inspected RLS enablement and policies with line numbers."
    },
    {
      "command": "python3 static SQL scan for CREATE TABLE and blanket-auth policy patterns",
      "result": "passed",
      "summary": "Found 9 CREATE TABLE entries and zero non-comment blanket-auth policy patterns."
    },
    {
      "command": "git status --short -- apps/web/app/api apps/web/components apps/web/lib apps/scraper | sed -n '1,220p'",
      "result": "passed",
      "summary": "Found out-of-scope admin API/UI/lib/scraper changes."
    },
    {
      "command": "git diff --cached --name-only",
      "result": "passed",
      "summary": "No staged files."
    }
  ],
  "validationOutput": [
    "Static parse found exactly 9 foundation tables at migration lines 12, 48, 91, 120, 155, 177, 206, 232, and 271.",
    "Explicit corrections table present at migration lines 91-114; version created_from includes explicit_correction at lines 57-58.",
    "RLS enabled on all nine tables at lines 358-366; 9 staff-only public.is_staff() policies at lines 370-411; no non-comment blanket authenticated read patterns found.",
    "Scope check failed: git status shows out-of-scope changes under apps/web/app/api, apps/web/components, apps/web/lib, and apps/scraper."
  ],
  "residualRisks": [
    "Migration was not applied against a live/local database in this review.",
    "Migration has FK references to profile_maintenance_jobs/profile_maintenance_artifacts; prerequisite migration must be included/applied before this file.",
    "Out-of-scope working-tree changes may be unrelated, but they prevent confirming a schema-only slice from the current checkout."
  ],
  "noStagedFiles": true,
  "diffSummary": "Reviewed untracked profile-foundation migration creates the requested nine schema tables with staff-only RLS. Acceptance fails because the working tree also contains admin API/UI/scraper/enrichment changes outside the schema-only slice.",
  "reviewFindings": [
    "blocker: working tree scope - out-of-scope admin API/UI/scraper/enrichment changes are present; isolate or remove them before accepting this as schema-only.",
    "no SQL-content blocker found in apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql for the requested nine-table/RLS/explicit-correction checks."
  ],
  "manualNotes": "Root plan.md/progress.md are unrelated to this migration; profile-specific ADRs/docs were used for validation. Review-only except for the required validation artifact output."
}
```
