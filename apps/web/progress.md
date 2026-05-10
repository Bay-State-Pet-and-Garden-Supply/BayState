# Progress

## Status
In Progress

## Completed
- Added `recommended_action` column to inventory reconciliation issues table in `SyncRunDetail` (between Issue Type and Register columns)
- Added saved view preset buttons to `AdminOrdersClient` (Needs Attention, Ready for Pickup, Unpaid Pickup, Legacy, Register, Cancelled)

## Files Changed
- `components/admin/inventory/sync-run-detail.tsx` — added 8th column "Recommendation" with truncated text + tooltip; bumped empty-state colspan from 7→8
- `app/admin/analytics/analytics-dashboard.tsx` — added New Website channel filter, renamed labels (Online→ShopSite Legacy, In-Store→In-Store Register), added web segment to ChannelComparison bar + AOV column
- `app/admin/analytics/page.tsx` — added `web` source fetch alongside `shopsite`/`integra` for channel comparison metrics

## Notes

## A1 — Sidebar reorganization ✓

- Added ShoppingBag (Orders), ClipboardList (Inventory), RefreshCw (Sync Runs) icon imports
- Added "Operations" section: Orders, Inventory, Sync Runs (all staff-visible)
- Renamed "Storefront" to "Catalog"
- Orders, Inventory, Sync Runs positioned after Analytics, before Catalog
- All existing adminOnly visibility unchanged
- TypeScript: clean
- File: `components/admin/sidebar.tsx`
