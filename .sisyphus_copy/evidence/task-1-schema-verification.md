# Task 1: Database Schema Verification

## scraper_config_test_skus Table Schema

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| config_id | uuid | NO | null |
| sku | text | NO | null |
| sku_type | text | NO | null |
| added_by | uuid | YES | null |
| created_at | timestamp with time zone | NO | now() |

### Constraints
- Primary Key: id
- Foreign Key: config_id → scraper_configs(id) ON DELETE CASCADE
- Check: sku_type IN ('test', 'fake', 'edge_case')
- Unique: (config_id, sku)

### RLS Policies (5 total)
1. Admin and staff can view test SKUs (SELECT)
2. Admin and staff can add test SKUs (INSERT)
3. Admin and staff can update test SKUs (UPDATE)
4. Admin and staff can delete test SKUs (DELETE)
5. Service role can manage test SKUs (ALL)

---

## scraper_health_metrics Table Schema

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| config_id | uuid | NO | null |
| metric_date | date | NO | null |
| total_runs | integer | NO | 0 |
| passed_runs | integer | NO | 0 |
| failed_runs | integer | NO | 0 |
| avg_duration_ms | integer | YES | null |
| top_failing_step | text | YES | null |
| selector_health | jsonb | YES | '{}' |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### Constraints
- Primary Key: id
- Foreign Key: config_id → scraper_configs(id) ON DELETE CASCADE
- Unique: (config_id, metric_date)

### RLS Policies (5 total)
1. Admin and staff can view health metrics (SELECT)
2. Admin and staff can add health metrics (INSERT)
3. Admin and staff can update health metrics (UPDATE)
4. Admins can delete health metrics (DELETE)
5. Service role can manage health metrics (ALL)

---

## Functions Created

### update_health_metrics()
- Returns: void
- Security: DEFINER
- Purpose: Aggregates daily health metrics from scraper_test_runs for trend analysis
- Aggregates: Last 30 days of test runs, grouped by config_id and date
- Updates: total_runs, passed_runs, failed_runs, avg_duration_ms, top_failing_step, selector_health

### update_health_metrics_updated_at()
- Returns: trigger
- Purpose: Auto-updates updated_at column on row modification

---

## Verification Status: ✅ PASSED

All tables, RLS policies, constraints, and functions created successfully.
Migration: 20260212000100_add_scraper_studio_tables.sql
