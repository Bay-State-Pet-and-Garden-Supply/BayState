# Database Migration Application Guide

This guide walks you through applying the product lines and cohort-related database migrations to your Supabase project.

---

## Overview

The migrations add support for **cohort-based product scraping**, which groups products by UPC prefix for efficient distributed processing. This enables the scraper to handle product lines (like "Premium Dog Food" or "Cat Litter") as cohesive batches rather than individual SKUs.

---

## Migration Files

### 1. `20260408120000_create_product_lines_table.sql`
**Purpose:** Creates the foundational `product_lines` table that defines product categories by UPC prefix.

**What It Does:**
- Creates the `product_lines` table with columns for name, UPC prefix, description, status, and product count
- Adds indexes on `status`, `upc_prefix`, and `name` for efficient querying
- Implements an `updated_at` trigger to auto-update timestamps
- Enables Row Level Security (RLS) with public read access and admin-only modifications

**Key Features:**
- UPC prefix is unique (prevents duplicate product lines)
- Status field supports `active` or `inactive` values
- Denormalized `product_count` for performance (avoids counting on every query)

---

### 2. `20260409000000_add_product_line_column.sql`
**Purpose:** Links products to their product line for cohort filtering.

**What It Does:**
- Adds a `product_line` text column to the `products_ingestion` table
- Creates an index on `product_line` for fast lookups
- Adds a database comment explaining the column's purpose

**Why This Matters:**
This column lets you filter products by their product line during ingestion, which powers the cohort batching logic.

---

### 3. `20260409000001_create_cohort_tables.sql`
**Purpose:** Creates the cohort processing infrastructure (the core of distributed scraping).

**What It Does:**
- Creates `cohort_batches` table to track batch processing jobs
- Creates `cohort_members` junction table linking products to cohorts
- Adds indexes for status lookups, UPC prefix filtering, and sort ordering
- Implements `updated_at` triggers on `cohort_batches`
- Enables RLS policies for both tables

**Key Tables:**

| Table | Purpose |
|-------|---------|
| `cohort_batches` | Tracks processing batches with UPC prefix, status, and metadata |
| `cohort_members` | Links individual SKUs to their cohort batch with sort order |

**Statuses Supported:**
- `pending` - Batch created but not yet processing
- `processing` - Actively being scraped
- `completed` - All products in cohort processed successfully
- `failed` - Processing encountered errors

---

### 4. `20260409000002_add_cohort_to_scrape_jobs.sql`
**Purpose:** Integrates cohort tracking into the existing `scrape_jobs` table.

**What It Does:**
- Adds `cohort_id` foreign key (references `cohort_batches`)
- Adds `is_cohort_batch` boolean flag to identify cohort jobs
- Adds `cohort_status` text field with constraint for valid values
- Creates three indexes for efficient cohort queries

**New Columns:**

| Column | Type | Purpose |
|--------|------|---------|
| `cohort_id` | uuid | Links job to its cohort batch |
| `is_cohort_batch` | boolean | True if job processes a cohort vs individual SKUs |
| `cohort_status` | text | Tracks cohort state: pending, claiming, processing, completed, failed |

---

## Application Order

**Important:** Apply migrations in this exact order due to foreign key dependencies:

1. `20260408120000_create_product_lines_table.sql`
2. `20260409000000_add_product_line_column.sql`
3. `20260409000001_create_cohort_tables.sql`
4. `20260409000002_add_cohort_to_scrape_jobs.sql`

---

## Step-by-Step Application Instructions

### Step 1: Access the Supabase Dashboard

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Sign in to your account
3. Select your BayState project

### Step 2: Open the SQL Editor

1. In the left sidebar, click **SQL Editor**
2. Click **New query** (or the `+` button)
3. Give your query a name like "Apply Cohort Migrations"

### Step 3: Apply Migration 1 (Product Lines Table)

1. Copy the contents of `20260408120000_create_product_lines_table.sql`
2. Paste it into the SQL Editor
3. Click **Run**
4. Wait for "Success. No rows returned" message

**Verification:**
```sql
SELECT * FROM information_schema.tables 
WHERE table_name = 'product_lines';
```
You should see one row returned.

### Step 4: Apply Migration 2 (Product Line Column)

1. Copy the contents of `20260409000000_add_product_line_column.sql`
2. Paste it into a new query in the SQL Editor
3. Click **Run**
4. Wait for confirmation

**Verification:**
```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'products_ingestion' 
AND column_name = 'product_line';
```
You should see the `product_line` column listed.

### Step 5: Apply Migration 3 (Cohort Tables)

1. Copy the contents of `20260409000001_create_cohort_tables.sql`
2. Paste it into a new query in the SQL Editor
3. Click **Run**
4. Wait for confirmation

**Verification:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('cohort_batches', 'cohort_members');
```
You should see both tables listed.

### Step 6: Apply Migration 4 (Cohort to Scrape Jobs)

1. Copy the contents of `20260409000002_add_cohort_to_scrape_jobs.sql`
2. Paste it into a new query in the SQL Editor
3. Click **Run**
4. Wait for confirmation

**Verification:**
```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'scrape_jobs' 
AND column_name IN ('cohort_id', 'is_cohort_batch', 'cohort_status');
```
You should see all three new columns listed.

---

## Complete Verification

Run this comprehensive verification query to confirm all migrations applied successfully:

```sql
-- Check all new tables
SELECT 
    'Tables Created' as check_type,
    table_name,
    'OK' as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('product_lines', 'cohort_batches', 'cohort_members')

UNION ALL

-- Check product_line column
SELECT 
    'Column Added' as check_type,
    'products_ingestion.product_line' as table_name,
    'OK' as status
WHERE EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products_ingestion' 
    AND column_name = 'product_line'
)

UNION ALL

-- Check scrape_jobs cohort columns
SELECT 
    'Columns Added' as check_type,
    'scrape_jobs.cohort_id, is_cohort_batch, cohort_status' as table_name,
    'OK' as status
WHERE EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scrape_jobs' 
    AND column_name = 'cohort_id'
)
AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scrape_jobs' 
    AND column_name = 'is_cohort_batch'
)
AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scrape_jobs' 
    AND column_name = 'cohort_status'
);
```

**Expected Result:** 5 rows showing all checks passed.

---

## Rollback Instructions

If you need to undo these migrations, apply these rollback statements **in reverse order**:

### Rollback Migration 4 (Cohort from Scrape Jobs)

```sql
ALTER TABLE scrape_jobs 
DROP COLUMN IF EXISTS cohort_status,
DROP COLUMN IF EXISTS is_cohort_batch,
DROP COLUMN IF EXISTS cohort_id;

DROP INDEX IF EXISTS idx_scrape_jobs_cohort_status;
DROP INDEX IF EXISTS idx_scrape_jobs_is_cohort_batch;
DROP INDEX IF EXISTS idx_scrape_jobs_cohort_id;
```

### Rollback Migration 3 (Cohort Tables)

```sql
DROP TABLE IF EXISTS cohort_members CASCADE;
DROP TABLE IF EXISTS cohort_batches CASCADE;
DROP FUNCTION IF EXISTS update_cohort_batches_updated_at();
```

### Rollback Migration 2 (Product Line Column)

```sql
ALTER TABLE products_ingestion 
DROP COLUMN IF EXISTS product_line;

DROP INDEX IF EXISTS idx_products_ingestion_product_line;
```

### Rollback Migration 1 (Product Lines Table)

```sql
DROP TABLE IF EXISTS product_lines CASCADE;
DROP FUNCTION IF EXISTS update_product_lines_updated_at();
```

**Warning:** Dropping tables with `CASCADE` will also delete all data in those tables. Only rollback in development or if you're certain no production data exists.

---

## Safety Precautions

### Before Applying

1. **Backup your database:**
   - Go to Supabase Dashboard → Database → Backups
   - Click "Create backup now"
   - Wait for backup to complete

2. **Test in development first:**
   - Apply migrations to your development/staging project before production

3. **Check for existing data:**
   ```sql
   SELECT COUNT(*) FROM products_ingestion;
   ```
   If you have existing products, the migrations are safe (they only add columns/tables).

### During Application

1. **Apply during low-traffic hours** if this is a production database
2. **Run migrations one at a time** to identify issues quickly
3. **Verify each migration** before proceeding to the next

### After Application

1. **Test the scraper** to ensure cohort processing works correctly
2. **Monitor error logs** for any migration-related issues
3. **Verify data integrity** by spot-checking a few products

---

## Troubleshooting

### Issue: "relation already exists"

**Cause:** The table or column already exists (migration may have been partially applied).

**Solution:**
```sql
-- Check if object exists
SELECT * FROM information_schema.tables WHERE table_name = 'product_lines';

-- If exists and you want to recreate, drop it first (WARNING: DATA LOSS)
DROP TABLE IF EXISTS product_lines CASCADE;
```

### Issue: "column does not exist" when querying

**Cause:** Migration applied but cache hasn't refreshed.

**Solution:** Refresh your Supabase client or restart your application. The schema change takes effect immediately, but some clients cache table schemas.

### Issue: Permission denied on RLS policies

**Cause:** RLS is enabled but policies aren't working as expected.

**Solution:** Verify your JWT role claim includes 'admin' or 'staff':
```sql
-- Check current user role
SELECT auth.jwt() ->> 'role';
```

### Issue: Foreign key constraint fails

**Cause:** Applying migrations out of order.

**Solution:** Apply in the correct order (1-2-3-4). Migration 4 depends on Migration 3's `cohort_batches` table.

### Issue: Migration appears to hang

**Cause:** Large table being altered (adding columns to big tables takes time).

**Solution:** Wait it out. For the `products_ingestion` table with millions of rows, adding a column can take several minutes. Do not cancel the operation.

### Verification Shows Missing Objects

If the verification query shows missing tables or columns:

1. Check the SQL Editor output for error messages
2. Re-run the specific migration that failed
3. Check the exact error in Supabase Dashboard → Database → Logs

---

## Quick Reference

### Migration Summary

| File | Table/Column Created | Approx. Time |
|------|---------------------|--------------|
| `20260408120000_create_product_lines_table.sql` | `product_lines` table | ~1 second |
| `20260409000000_add_product_line_column.sql` | `products_ingestion.product_line` | Depends on table size |
| `20260409000001_create_cohort_tables.sql` | `cohort_batches`, `cohort_members` | ~1 second |
| `20260409000002_add_cohort_to_scrape_jobs.sql` | `scrape_jobs.cohort_*` columns | ~1 second |

### Migration File Locations

All migrations are stored in:
```
apps/web/supabase/migrations/
```

### Related Documentation

- [Supabase Migration Docs](https://supabase.com/docs/guides/database/migrations)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [SQL Editor Guide](https://supabase.com/docs/guides/database/sql-editor)

---

## Support

If you encounter issues not covered here:

1. Check Supabase Dashboard → Database → Logs for error details
2. Review the migration file comments for specific logic explanations
3. Consult the `conductor/workflow.md` for development workflow guidance

---

**Last Updated:** April 2026  
**Applies To:** BayState Database Migrations for Cohort Processing
