# Project Learnings - BayState Workspace

## Migration Rollback Procedure - April 2026

### Patterns Discovered

1. **Migration Location**: All Supabase migrations are stored in `apps/web/supabase/migrations/` with timestamp-based naming (YYYYMMDDHHMMSS_description.sql)

2. **Rollback Pattern**: Rollback migrations follow the naming convention:
   - Original: `20260131000000_test_lab_extensions.sql`
   - Rollback: `20260131000001_rollback_test_lab_extensions.sql`

3. **Existing Rollback Example**: Found `20260314120001_rollback_pipeline_status_new.sql` which demonstrates:
   - Using `BEGIN/COMMIT` transactions
   - Dropping constraints before columns
   - Dropping indexes before columns
   - Cleaning up enum types

### Rollback Safety Principles

1. **Always backup first**: Create backup tables or exports before destructive operations
2. **Reverse order of creation**: Drop dependent objects before their parents
3. **Use CASCADE carefully**: Only use when intentional
4. **Transaction safety**: Wrap everything in BEGIN/COMMIT

### Key Files Created

- `apps/scraper/docs/ROLLBACK.md` - Comprehensive rollback documentation
- `apps/scraper/scripts/rollback_migration.py` - Executable rollback script with safety checks

### Rollback Types Documented

1. **Column Rollback**: Drop indexes -> Remove constraints -> Drop column -> Drop enum
2. **Table Rollback**: Drop child tables -> Drop parent tables -> Drop functions
3. **RLS Policy Rollback**: Drop policies -> Optionally disable RLS
4. **Function/Trigger Rollback**: Drop triggers -> Drop functions

### Testing Approach

- Use `--dry-run` first to preview SQL
- Use `--list` to see available migrations
- Script checks for later migrations that might be affected
- Interactive confirmation for destructive operations
