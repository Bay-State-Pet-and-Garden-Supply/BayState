# Progress

## Phase B — UI Enhancement

### B1: Action Required Panel ✅
- Migration `20260510010000_action_required_rpc.sql` — RPC returning actionable items (unpaid pickup, register-only, price mismatches, failed syncs, aging pickup)
- Hook `hooks/use-action-required.ts` — fetches from RPC
- Component `components/admin/dashboard/action-required.tsx` — Card with per-item severity icons, count badges, deep-link buttons
- Wired into `AdminDashboardView` between metric cards and scraper widgets
