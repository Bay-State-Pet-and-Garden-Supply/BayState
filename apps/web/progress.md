# Progress

## Phase B — UI Enhancement

### B1: Action Required Panel ✅
- Migration `20260510010000_action_required_rpc.sql` — RPC returning actionable items (unpaid pickup, register-only, price mismatches, failed syncs, aging pickup)
- Hook `hooks/use-action-required.ts` — fetches from RPC
- Component `components/admin/dashboard/action-required.tsx` — Card with per-item severity icons, count badges, deep-link buttons
- Wired into `AdminDashboardView` between metric cards and scraper widgets

### B2: Revenue at Risk ✅
- *executed in parallel*

### B3: Bulk Reconciliation Actions ✅
- *executed in parallel*

### B4: Order Event Timeline ✅
- Updated `lib/orders.ts` `getOrderById()` to fetch `events:order_events(*)`
- Added `events?: OrderEvent[]` to `Order` interface
- Created `components/admin/orders/OrderTimeline.tsx` — vertical timeline with relative timestamps, event labels, value transitions
- Wired into `OrderModal` sidebar below Source Info

### B5: Register-only Launchpad ✅
- Route `app/admin/inventory/launchpad/page.tsx` — server component, joins reconciliation items with products_ingestion by SKU for pipeline status
- Component `components/admin/inventory/launchpad.tsx` — table with checkboxes, SKU, name, price, qty, department, pipeline badge, push action
- Bulk push button: iterates selected items and calls `pushInventoryIssueToPipelineAction`
- Sidebar: added "Product Launchpad" (Rocket icon) under Operations section
