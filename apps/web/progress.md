# Progress

## Status
Active — post-oracle fixes applied.

## Oracle Fixes Applied
- **20260509200000**: Added `ALTER COLUMN payment_status DROP DEFAULT` before enum type conversion
- **20260509230000**: Added admin/staff guard + `SET LOCAL search_path TO ''` in `get_dashboard_recent_activity()` to prevent customer data exposure via SECURITY DEFINER function
- **integra-sync.ts**: Removed invalid `name`/`price` top-level columns from `products_ingestion.upsert()` — only `sku`, `input` (JSONB), and `pipeline_status` are valid columns. Trace metadata stays inside `input` where Supabase expects it.
- **AdminOrdersClient.tsx**: Modal now fetches full Order via GET `/api/orders/[id]` instead of casting AdminOrderListRow to Order
- **mutations.ts, actions.ts**: All `order_events.insert()` calls now capture and log errors instead of silencing them

## Tasks

## Files Changed
- `components/admin/orders/AdminOrdersClient.tsx` — Added `loadingOrder` state, `handleViewOrder` fetch, removed `as unknown as Order` cast
- `lib/admin/orders/mutations.ts` — All 5 mutation functions log event insert errors
- `app/admin/orders/actions.ts` — `updateOrderStatusAction` logs event insert errors

## Notes
- Pre-existing FilterTab type errors in `components/admin/inventory/sync-run-detail.tsx` remain (PR 5, not related to oracle fixes)
