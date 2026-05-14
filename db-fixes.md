# Database Migration Fixes

All 5 problems resolved.

## Problems Fixed

### ✅ Problem 1: Missing enum migration
**Created:** `apps/web/supabase/migrations/20260514040000_migrate_pipeline_status_enum.sql`
Creates `pipeline_status_six` enum with 8 values (imported, url_review, extracting, processed, merging, reviewing, publishing, failed), maps all 11 old statuses to the 8 new ones with explicit case statements, renames old enum to `pipeline_status_five_legacy`, then renames new enum to the canonical `pipeline_status_five` so existing RPCs remain compatible.

### ✅ Problem 2: Duplicate enrichment table migrations
**Deleted:** `apps/web/supabase/migrations/20260514030000_add_enrichment_tables.sql`
This was a duplicate of `20260514000000_simplify_pipeline_enrichment.sql`.

### ✅ Problem 3: RPC references missing columns
**Fixed:** Added `claimed_by text`, `lease_token uuid`, `lease_expires_at timestamptz` to `enrichment_attempts` in `20260514000000_simplify_pipeline_enrichment.sql`.
The RPC `claim_next_pending_enrichment_attempt` in `20260514200000_add_enrichment_rpcs.sql` now has all three columns available.

### ✅ Problem 4: Policy idempotency
**Fixed:** Wrapped all 3 `create policy` statements in `20260514000000_simplify_pipeline_enrichment.sql` with `do $$ ... if not exists (select 1 from pg_policies where policyname = '...' and tablename = '...')` guards.

### ✅ Problem 5: enrichment_targets.status check inconsistency
**Fixed:** Removed `'processing'` from `enrichment_targets.status` check constraint. The allowed values are now: `'candidate', 'selected', 'rejected', 'processed', 'failed'`.

## Migration Execution Order

1. `20260514000000` — Create enrichment tables (additive, no enum dependency)
2. `20260514023502` — Existing unrelated migration  
3. `20260514040000` — **NEW** Create new 8-value enum, map data, rename
4. `20260514200000` — Create RPCs (references the now-correct 8-value `pipeline_status_five`)

## Status Mapping (old → new)

| Old Status | New Status |
|-----------|------------|
| imported | imported |
| searching | url_review |
| url_review | url_review |
| extracting | extracting |
| scraping | extracting |
| needs_fallback_review | url_review |
| scraped | processed |
| consolidating | merging |
| finalizing | reviewing |
| exporting | publishing |
| failed | failed |
