

## Production Validation Checklist Created (20260313)

### Files Created
- `.sisyphus/evidence/task-4-5-production-validation.md` - Complete validation checklist

### Validation Coverage

**Pre-Deployment Checks:**
- Environment configuration (USE_YAML_CONFIGS flag, API keys, URLs)
- YAML file integrity (syntax, required fields, uniqueness)
- Database state (file_path column, data migration, schema cleanup)
- API readiness (list endpoint, detail endpoint, credential resolution, auth)

**Deployment Verification:**
- Container deployment and startup
- Config loading (list and individual)
- Admin panel read-only interface
- Test run execution with file_path metadata
- Redirect functionality

**Post-Deployment Monitoring:**
- Health metrics dashboard thresholds
- Log monitoring patterns
- Database job tracking
- End-to-end test schedule

**Rollback Procedures:**
- Trigger conditions documented
- Step-by-step rollback commands
- Verification steps
- Post-rollback investigation guide

**Success Criteria:**
- Mandatory: 100% config load success, <1% error rate, >=95% test run success
- Optional: <200ms API response, clean logs, stable memory
- Sign-off checklist with 9 items

### Key Validation Points
1. All 20+ YAML configs load successfully from `apps/scraper/scrapers/configs/`
2. API endpoints return `X-Config-Source: yaml` header
3. Test runs include `file_path` and `scraper_slug` in job metadata
4. Admin panel shows read-only view with GitHub links
5. Deprecated routes return 308 permanent redirects
6. Credential resolution endpoint returns encrypted values
7. Rollback can be done by setting `USE_YAML_CONFIGS=false`

### Commands Documented
- YAML syntax validation for all configs
- Docker container status and log checks
- API endpoint testing with curl
- Database verification queries
- Quick rollback procedure




## Archive Script Created (20260313)

### Files Created
- `apps/web/scripts/archive-scraper-runs.ts` - TypeScript archive export script
- `.sisyphus/evidence/task-5-1_Archive_runs.md` - Archive documentation

### Script Features
- Uses `@supabase/supabase-js` with service role key for admin access
- Exports to NDJSON format (one JSON object per line)
- Auto-detects table: tries `scraper_runs`, falls back to `scrape_jobs`
- Streams data in batches (1000 rows) for large datasets
- Computes SHA256 checksum for integrity verification
- Logs progress, row count, and file size
- Includes verification step (validates JSON and row count)

### Usage
```bash
npx tsx apps/web/scripts/archive-scraper-runs.ts
```

### Output
- Archive file: `.sisyphus/archive/scraper_runs_YYYYMMDD.ndjson`
- Includes schema info, sample data, and verification results

### Retention Recommendation
- Keep 90 days of archive files locally
- Move to cold storage after 90 days
- Active data remains in database



## Archive Script for scraper_tests Created (20260313)

### Files Created
- `apps/web/scripts/archive-scraper-tests.ts` - TypeScript archive export script
- `.sisyphus/evidence/task-5-2_archive_tests.md` - Archive documentation

### Script Features
- Uses `@supabase/supabase-js` with service role key for admin access
- Exports to NDJSON format (one JSON object per line)
- Queries `scraper_tests` table directly
- Streams data in batches (1000 rows) for large datasets
- Computes SHA256 checksum for integrity verification
- Logs progress, row count, and file size
- Includes verification step (validates JSON and row count)

### Usage
```bash
npx tsx apps/web/scripts/archive-scraper-tests.ts
```

### Output
- Archive file: `.sisyphus/archive/scraper_tests_YYYYMMDD.ndjson`
- Includes schema info, sample data, and verification results

### Retention Recommendation
- Keep 90 days of archive files locally
- Move to cold storage after 90 days
- Active data remains in database

### Execution Note
- Script created successfully
- Execution pending due to DNS resolution issues in current environment
- Run when network connectivity to Supabase is available



## Drop scraper_config_versions Table Migration Created (20260313)

### Files Created
- `apps/web/supabase/migrations/20260312000002_drop_scraper_config_versions.sql` - Drop table migration

### Migration Details
- Uses `DROP TABLE IF EXISTS` for safe drop (avoids errors if table doesn't exist)
- Includes comment explaining purpose: YAML migration cleanup
- Data has been archived to YAML files in Git, table no longer needed

### Why This Table is Being Dropped
The `scraper_config_versions` table stored version history for scraper configs. Since we've migrated to YAML-based configuration stored in Git, version history is now managed by Git. This table is no longer needed.

### QA Verification
- [x] Migration file exists at correct path
- [x] SQL syntax uses IF EXISTS clause
- [x] Comment explains the purpose
- Follow-up verification: after clearing a stale `.next` build lock from a stray local process, `bun run build` reached type-checking and failed on a pre-existing route signature mismatch in `app/api/scraper/v1/credentials/[id]/route.ts`, unrelated to the studio test endpoint change.

- 2026-03-19 verification: live runners call `/api/scraper/v1/credentials/{slug}` via `ScraperAPIClient.get_credentials()`, so adding `app_settings` fallback in `apps/web/app/api/scraper/v1/credentials/[id]/route.ts` closes the legacy-storage gap that caused `Missing credentials for petfoodex` when `scraper_credentials` had no rows.
- 2026-03-19 verification: current login scraper allowlist in `apps/scraper/daemon.py` matches the fallback key map (`petfoodex`, `phillips`, `orgill`, `shopsite`); targeted Jest route tests pass, but there is still no automated test that exercises the `app_settings` fallback branch directly.
