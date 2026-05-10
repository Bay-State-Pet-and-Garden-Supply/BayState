# Progress

## Status
Completed

## Tasks

### Phase 4: Cleanup
- [x] Delete orphan workflows at `apps/web/apps/scraper/.github/workflows/`
- [x] Update Quick Actions: replace `Sync Products → /admin/migration` with `Integra Sync` + `Data Health`
- [x] Remove stale `RefreshCw` import, add `Database` + `HeartPulse`

### Phase 0-3: Sync Trigger Infrastructure
- [ ] Secure `/api/sync/trigger` with admin auth and allowlist
- [ ] Add `queued` status to `integration_sync_runs`
- [ ] Update register/shopsite scripts/workflows for sync_run correlation
- [ ] Add Data Health trigger buttons

### Phase 3: Frontend integration — Data Health trigger buttons

Added sync trigger buttons to `components/admin/health/data-health.tsx`:
- "Run Register Preview" — calls `/api/sync/trigger` with `syncType: 'register_inventory'`
- "Run ShopSite Orders" — calls `/api/sync/trigger` with `syncType: 'shopsite_orders'`
- "Run ShopSite Products" — calls `/api/sync/trigger` with `syncType: 'shopsite_products'`

Each button:
- Shows spinner while in-flight
- Shows success toast with "View run" link on completion
- Shows error toast on failure
- Disabled while any trigger is running

## Files Changed
- `components/admin/health/data-health.tsx`

## Notes
\n## 2026-05-10 — Phase 0+1: Secure sync trigger + queued status
\n- Migration: added 'queued' status to integration_sync_runs
- Rewrote /api/sync/trigger with admin auth, typed syncType allowlist, sync_run creation, env-configured repo/ref
