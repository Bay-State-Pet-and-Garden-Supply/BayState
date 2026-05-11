# Scout: DB Schema Investigation

**Completed**: 2026-05-11

**Result: No broken schema objects found.**

Investigated 10 views, 2 auth tables, 57 functions, 8 custom enum types.

All 3 reported "errors" (`admin_orders_list`, `dashboard_migration_progress` view scan failures, `dashboard_order_stats` garbled output) are caused by the **`supabase db query` CLI tool (v2.95.4) display bug** — it can't render custom enum types (OID 20057 = `order_source_type`) and garbles numeric display. Direct `psql` via `docker exec` returns correct data.

**Key findings:**
- Auth schema intact: 1 user in `auth.users`, 0 in `auth.identities` (expected), helper functions work
- `products_published` view returns empty because `products_ingestion` table is empty (no data ingested yet)
- All 57 functions compile and execute correctly
- No broken migrations, no missing types/dependencies
- `products_ingestion` empty — that's a data gap, not schema issue

**Report**: `/tmp/scout_db_schema.md`
