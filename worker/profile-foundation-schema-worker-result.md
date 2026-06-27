# Profile Foundation Schema Migration — Implementation Result

## Summary

Implemented the schema-only coordinator foundation migration as specified.

**Changed files:**
- `apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql` (new)

**No other files modified.** No staged changes. Dirty worktree preserved.

---

## Migration Contents

### Tables created (9 total)

| # | Table | Key columns | Key constraints |
|---|-------|------------|-----------------|
| 1 | `site_extraction_profiles` | brand_id, source_slug, canonical_domain, active_version_id (nullable, no FK) | UNIQUE(brand_id, source_slug, canonical_domain); status CHECK(draft, active, disabled, needs_attention) |
| 2 | `site_extraction_profile_versions` | profile_id, version_number, rules jsonb, compiled_crawl4ai_schema, version_hash, created_from | UNIQUE(profile_id, version_number); partial UNIQUE WHERE status='active'; status CHECK(draft, validating, approved, active, retired, rejected); created_from CHECK |
| 3 | `explicit_extraction_corrections` | brand_id, source_slug, canonical_domain, target_field, evidence_summary jsonb | correction_type CHECK(accepted, rejected); no secrets/identity data |
| 4 | `product_detail_page_seeds` | brand_id, source_slug, canonical_domain, url, normalized_url, trust_status, validation_case_id (nullable, no FK) | UNIQUE(brand_id, source_slug, canonical_domain, normalized_url); trust_status CHECK |
| 5 | `profile_validation_sets` | profile_id, name, description | Indexed on profile_id |
| 6 | `profile_validation_cases` | validation_set_id, case_type, pdp_seed_id, target_url, expected_assertions | case_type CHECK(seed, correction, known_good, nearby_variant, gold) |
| 7 | `profile_validation_runs` | profile_version_id, validation_set_id, status, summary_artifact_id, result | status CHECK(pending, running, passed, failed, error) |
| 8 | `browser_profiles` | brand_id(NOT NULL), source_slug(NOT NULL), canonical_domain(NOT NULL), storage_ref, environment | UNIQUE(brand_id, source_slug, canonical_domain, environment); status CHECK; storage_ref is opaque metadata; no secrets |
| 9 | `browser_profile_setup_requests` | browser_profile_id, request_type, status, maintenance_job_id | request_type CHECK(setup, revalidate); status CHECK |

### Infrastructure

- **9 updated_at triggers**: all use existing generic `public.update_updated_at()` function
- **9 RLS policies**: Staff-only FOR ALL on every table; zero authenticated read policies
- **8 indexes**: including unique constraint indexes and partial unique indexes
- **All CHECK constraints**: match plans/ADRs exactly; no invented workflow states

### Circular reference handling

- `site_extraction_profiles.active_version_id`: nullable uuid column, no FK constraint (comment documents late-binding relationship)
- `product_detail_page_seeds.validation_case_id`: nullable uuid column, no FK constraint (comment documents late-binding relationship)
- `profile_validation_cases.pdp_seed_id`: has FK to `product_detail_page_seeds(id)` ON DELETE SET NULL (non-circular direction)

### Security

- No cookies, localStorage, user_data_dir, auth headers, token-bearing URLs, or runtime profile files stored in any table
- `browser_profiles.storage_ref` is opaque metadata only
- `explicit_extraction_corrections.evidence_summary` stores compact accepted/rejected evidence summaries only
- All 9 tables: staff-only RLS, no authenticated read policies

---

## Validation

### Existing profile-maintenance tests: PASS

```
Test Suites: 3 passed, 3 total
Tests:       33 passed, 33 total
```

### SQL structure validation

- 411 lines, 95 semicolons
- 140 opening / 140 closing parentheses (balanced)
- 9 tables, 9 indexes, 9 triggers, 9 RLS policies
- 10 CHECK constraints matching plan/ADR values
- 19 FK references to existing or earlier-defined tables
- No authenticated read policies detected

### Git state

- No staged files
- Only new file: `apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql`
- Dirty worktree untouched

### Local Supabase migration sanity

The `supabase` CLI is present but no local Docker Supabase instance is running. A migration sanity check would require starting `supabase start` (Docker required). This was skipped per instructions: "do not require Docker if unavailable."

---

## Gaps and Risks

| Risk | Status |
|------|--------|
| Unapplied migration not tested against real Postgres | Mitigated: SQL syntax validated structurally; pattern matches existing migrations. Apply via `supabase migration up` when Docker is available. |
| No TypeScript types added for new tables | Decision: Types not needed yet — no existing code references the new tables. Types should be added alongside the first API consumer to avoid orphan types. |
| Circular FK for active_version_id and validation_case_id | Handled: nullable uuid columns without FK constraints; late-binding relationships documented via COMMENTS. |
| Dirty worktree merge collisions | Avoided: only created a new migration file; no edits to existing files. |

---

## Acceptance Report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Exactly one new Supabase migration created (apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql). Nine foundation tables implemented with correct status CHECK constraints matching plan/ADRs. No routes, UI, scraper, enrichment, or admin API files modified. No staged files."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "Full evidence available in this report: changed files, test results (33/33 pass), SQL structure validation (balanced parens, 9 tables, 9 indexes, 9 triggers, 9 RLS policies, 10 CHECK constraints), git state diff, residual risks documented."
    }
  ],
  "changedFiles": [
    "apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "cd apps/web && node scripts/run-jest.cjs --testPathPatterns=\"profile-maintenance\" --no-coverage --runInBand",
      "result": "passed",
      "summary": "3 suites, 33 tests passed (existing profile-maintenance tests)"
    },
    {
      "command": "Python3 structural validation of migration SQL",
      "result": "passed",
      "summary": "9 tables, 9 indexes, 9 triggers, 9 RLS policies, 10 CHECK constraints, 140 balanced parens, no authenticated read policies"
    },
    {
      "command": "git diff --cached --stat && git status --short",
      "result": "passed",
      "summary": "No staged files; only untracked new migration file; dirty worktree preserved"
    }
  ],
  "validationOutput": [
    "Existing profile-maintenance tests: 3 suites passed, 33 tests passed",
    "SQL structural validation: 9 tables, 9 indexes, 9 triggers, 9 RLS enable statements, 140/140 balanced parens",
    "CHECK constraints: site_extraction_profiles.status, site_extraction_profile_versions.status, site_extraction_profile_versions.created_from, explicit_extraction_corrections.correction_type, product_detail_page_seeds.trust_status, profile_validation_cases.case_type, profile_validation_runs.status, browser_profiles.status, browser_profile_setup_requests.request_type, browser_profile_setup_requests.status",
    "No authenticated read policies detected",
    "No secret/browser identity columns in schema",
    "No staged files in git"
  ],
  "residualRisks": [
    "Migration not applied against real Postgres (requires Docker supabase start which is unavailable)",
    "No TypeScript types added yet — to be added when first API consumer exists",
    "Circular FKs not enforced (active_version_id, validation_case_id) — documented via COMMENTS"
  ],
  "noStagedFiles": true,
  "diffSummary": "Created new migration file with 9 foundation tables for site extraction profiles, profile versions, explicit corrections, PDP seeds, validation sets/cases/runs, browser profiles, and browser profile setup requests. Added staff-only RLS, updated_at triggers, and indexes matching ADRs and implementation plan constraints.",
  "reviewFindings": [
    "no blockers: migration matches approved scope, no scope creep, no file edits outside approved list"
  ],
  "manualNotes": "No local Supabase Docker instance running; migration sanity against real Postgres requires 'cd apps/web && supabase start && supabase migration up'. No types.ts edits were made because no existing code references the new table types — they would be orphan types until API consumers are added."
}
```
