# Rollback Procedure for Database Migrations

**Version**: 1.0.0  
**Last Updated**: April 2026  
**Applies To**: Supabase migrations in `apps/web/supabase/migrations/`

---

## Overview

This document describes the safe rollback procedure for database migrations in the BayState application. Rollbacks should only be executed when a migration causes issues in production and cannot be fixed through forward migrations.

### When to Rollback

Rollbacks are appropriate when:

- A migration introduces data corruption or loss
- Schema changes break critical application functionality
- Performance degradation is severe and immediate
- Migration was applied prematurely or to the wrong environment

### When NOT to Rollback

Do NOT rollback when:

- The issue can be fixed with a forward migration
- Data has already been modified by the new schema
- Other migrations have been applied after the problematic one
- You have not verified backups exist

---

## Prerequisites

Before executing any rollback:

1. **Verify Backups Exist**
   - Check Supabase backup status
   - Contact your database administrator to confirm automated backups ran successfully

2. **Notify the Team**
   - Post in #database-operations Slack channel
   - Tag on-call engineer
   - Document estimated downtime

3. **Prepare Maintenance Window**
   - Schedule during low-traffic hours
   - Have rollback approval from product owner

---

## Rollback Safety Checklist

- [ ] Backup verified (manual or automated within 4 hours)
- [ ] Team notified via #database-operations
- [ ] Maintenance window scheduled and announced
- [ ] Rollback SQL reviewed by 2+ engineers
- [ ] Staging rollback test completed successfully
- [ ] Application version pinned during rollback
- [ ] Monitoring alerts configured for post-rollback
- [ ] Rollback runbook printed/accessible offline

---

## Rollback Types

### Type 1: Column Rollback

For migrations that added columns:

```sql
-- Example: Rolling back a column addition
BEGIN;

-- Step 1: Drop dependent objects first (indexes, constraints)
DROP INDEX IF EXISTS idx_table_column;

-- Step 2: Remove NOT NULL constraints if present
ALTER TABLE public.table_name
ALTER COLUMN column_name DROP NOT NULL;

-- Step 3: Drop the column
ALTER TABLE public.table_name
DROP COLUMN IF EXISTS column_name;

-- Step 4: Drop enum type if applicable
DROP TYPE IF EXISTS column_enum_type;

COMMIT;
```

### Type 2: Table Rollback

For migrations that created new tables:

```sql
-- Example: Rolling back a table creation
BEGIN;

-- Step 1: Drop dependent tables first (respect foreign keys)
DROP TABLE IF EXISTS public.child_table CASCADE;

-- Step 2: Drop the main table
DROP TABLE IF EXISTS public.parent_table CASCADE;

-- Step 3: Drop associated functions
DROP FUNCTION IF EXISTS public.table_related_function();

COMMIT;
```

### Type 3: RLS Policy Rollback

For migrations that added RLS policies:

```sql
-- Example: Rolling back RLS policies
BEGIN;

-- Step 1: Drop the policies
DROP POLICY IF EXISTS "policy_name" ON public.table_name;

-- Step 2: Optionally disable RLS
ALTER TABLE public.table_name DISABLE ROW LEVEL SECURITY;

COMMIT;
```

### Type 4: Function/Trigger Rollback

For migrations that created functions or triggers:

```sql
-- Example: Rolling back triggers and functions
BEGIN;

-- Step 1: Drop triggers first
DROP TRIGGER IF EXISTS trigger_name ON public.table_name;

-- Step 2: Drop the function
DROP FUNCTION IF EXISTS public.function_name();

COMMIT;
```

---

## Rollback Execution Methods

### Method 1: Using the Rollback Script (Recommended)

```bash
# Navigate to scraper directory
cd apps/scraper

# Run rollback with safety checks
python scripts/rollback_migration.py \
  --migration 20260131000000_test_lab_extensions \
  --environment production \
  --dry-run

# If dry-run looks good, execute for real
python scripts/rollback_migration.py \
  --migration 20260131000000_test_lab_extensions \
  --environment production \
  --execute
```

### Method 2: Manual SQL Execution

Connect to Supabase SQL Editor and execute rollback SQL in a transaction. Verify results before committing.

### Method 3: Using Supabase CLI

```bash
# Reset to a specific migration point (destructive)
supabase db reset --version 20260130000000

# Or apply specific rollback migration
supabase db push --include-all
```

---

## Data Preservation During Rollback

### Strategy 1: Backup Before Drop

```sql
-- Create backup table before dropping
CREATE TABLE public.table_name_backup AS
SELECT * FROM public.table_name;

-- Add metadata columns
ALTER TABLE public.table_name_backup
ADD COLUMN backup_created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN backup_reason TEXT DEFAULT 'Pre-rollback backup';

-- Now safe to proceed with rollback
DROP TABLE IF EXISTS public.table_name CASCADE;
```

### Strategy 2: Export Critical Data

```bash
# Export data before rollback
pg_dump \
  --table=public.table_name \
  --data-only \
  --file=table_name_$(date +%Y%m%d_%H%M%S).sql
```

### Strategy 3: Soft Delete Pattern

Instead of DROP TABLE, consider:

```sql
-- Rename instead of drop
ALTER TABLE public.table_name
RENAME TO table_name_deprecated;

-- Add deprecation marker
ALTER TABLE public.table_name_deprecated
ADD COLUMN deprecated_at TIMESTAMPTZ DEFAULT NOW();

-- Remove from app queries after confirmation period
```

---

## Post-Rollback Verification

### Step 1: Schema Verification

```sql
-- Verify table structure
\d public.table_name

-- Verify indexes
\di public.table_name*

-- Verify constraints
\d public.table_name
```

### Step 2: Data Verification

```sql
-- Count rows match expectations
SELECT COUNT(*) FROM public.table_name;

-- Verify critical data integrity
SELECT * FROM public.table_name
WHERE id IN (select critical_ids);
```

### Step 3: Application Verification

```bash
# Run automated tests
npm test

# Verify API endpoints
curl https://api.baystatepet.com/health

# Check application logs for errors
tail -f /var/log/baystate/app.log
```

---

## Common Rollback Scenarios

### Scenario 1: Test Lab Extensions Rollback

Migration: `20260131000000_test_lab_extensions.sql`

```sql
-- rollback_test_lab_extensions.sql
BEGIN;

-- Drop tables in reverse order of creation
DROP TABLE IF EXISTS public.scraper_extraction_results CASCADE;
DROP TABLE IF EXISTS public.scraper_login_results CASCADE;
DROP TABLE IF EXISTS public.scraper_selector_results CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS public.calculate_selector_health(UUID);
DROP FUNCTION IF EXISTS public.get_test_run_summary(UUID);
DROP FUNCTION IF EXISTS public.update_scraper_test_runs_timestamp();

-- Drop trigger
DROP TRIGGER IF EXISTS trigger_scraper_test_runs_updated ON public.scraper_test_runs;

-- Drop columns from scraper_test_runs
ALTER TABLE public.scraper_test_runs
DROP COLUMN IF EXISTS updated_at,
DROP COLUMN IF EXISTS duration_ms,
DROP COLUMN IF EXISTS extraction_results,
DROP COLUMN IF EXISTS login_results,
DROP COLUMN IF EXISTS selector_results;

COMMIT;
```

### Scenario 2: Pipeline Status Rollback

Migration: `20260314120000_add_pipeline_status_new.sql`

See: `20260314120001_rollback_pipeline_status_new.sql`

```sql
BEGIN;

ALTER TABLE public.products_ingestion
ALTER COLUMN pipeline_status_new DROP NOT NULL;

DROP INDEX IF EXISTS idx_products_ingestion_pipeline_status_new;

ALTER TABLE public.products_ingestion
DROP COLUMN IF EXISTS pipeline_status_new;

DROP TYPE IF EXISTS pipeline_status_new_enum;

COMMIT;
```

---

## Rollback Naming Convention

When creating rollback migrations:

Format: `YYYYMMDDhhmmss_rollback_<original_migration_description>.sql`

Examples:
- Original: `20260131000000_test_lab_extensions.sql`
- Rollback: `20260131000001_rollback_test_lab_extensions.sql`

---

## Emergency Contacts

| Role | Contact Method |
|------|----------------|
| DBA On-Call | pagerduty:database |
| Engineering Lead | slack:@eng-lead |
| Infrastructure | slack:@infrastructure |

---

## Related Documentation

- [Migration Guide](migration-guide.md) - General migration instructions
- [Crawl4AI Config](crawl4ai-config.md) - Crawl4AI specific configuration
- [Test Database Migration](../tests/test_database_migration.py) - Automated migration tests
