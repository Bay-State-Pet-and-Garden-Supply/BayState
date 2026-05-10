# Admin AGENTS.md — Fix Report

**Worker:** admin-fix-worker
**Time:** 2026-05-10
**File:** `apps/web/app/admin/AGENTS.md`

## Changes Applied

### 1. STRUCTURE block — full rewrite
- **Removed** phantom `scraping/` dir (never existed as a route)
- **Removed** phantom `scraper-network/` dir (never existed as a route; only a component dir)
- **Fixed** `b2b/` location (was between quality and scraper-network, now alphabetically sorted)
- **Added** 11 missing modules: `(auth)`, `cohorts`, `design`, `enrichment`, `health`, `inventory`, `pages`, `preorder-groups`, `product-groups`, `reviews`, `settings`, `users`
- **Total entries:** 26 (matches actual route dirs on disk)

### 2. WHERE TO LOOK table — corrections
- **Job Queue:** `app/admin/scraping/` → `app/admin/scrapers/runs/`
- **B2B Sync:** `app/admin/migration/` → `app/admin/b2b/`
- **Added** ShopSite Export → `app/admin/migration/`
- **Added** Scraper Lab (Testing) → `app/admin/scrapers/` → Testing tab
- **Added** B2B Portal Config → `app/admin/b2b/`
- Kept existing rows: Product CRUD, Scraper Config, Analytics, Quality Review

### 3. Auth — path and pattern fix
- `lib/auth/admin.ts` → `lib/auth/roles.ts` (actual RBAC module)
- `middleware redirects to /admin/login` → `layout-level redirect to /admin/(auth)/login` (matches actual pattern — no middleware.ts)

## Validation
- `grep "scraping" app/admin/AGENTS.md` → 0 results (all phantom refs removed)
- `grep "scraper-network" app/admin/AGENTS.md` → 0 results
- Structure tree lists 26 entries, matching `ls -d app/admin/*/` count
- All paths in WHERE TO LOOK table verified against actual filesystem

## Remaining Notes
- The file has a trailing part about PIPELINE (routes, components, status flow, rules) — this was not touched as it was accurate.
- Line `app/admin/scrapers/runs/` exists as route under scrapers with `[id]`, `page.tsx`, `actions.ts`.
