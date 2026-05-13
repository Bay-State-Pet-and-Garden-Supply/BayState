# Progress: Supabase API Keys Migration

## Phase 1 — Foundation ✅ Complete

Files created:
- `supabase/migrations/20260513180000_create_user_api_keys.sql` — Table + RPC + RLS
- `lib/admin-api-key-auth.ts` — Key generation/validation module
- `app/api/admin/api-keys/route.ts` — GET list + POST create
- `app/api/admin/api-keys/[id]/route.ts` — PATCH update + DELETE revoke
- `__tests__/lib/admin-api-key-auth.test.ts` — 19 unit tests
- `__tests__/app/api/admin/api-keys/route.test.ts` — 9 integration tests

## Phase 2 — API-Key-Only Auth Migration ✅ Complete

### Core change
- Rewrote `lib/admin/api-auth.ts` — `requireAdminAuth(request)` uses ONLY API key auth (no JWT session fallback)

### Route migration (Pattern A — already using requireAdminAuth, needed request param)
~56 files had `requireAdminAuth()` changed to `requireAdminAuth(request)` via sed, with `request: NextRequest` params added to handler signatures where missing (14 files).

### Route migration (Pattern B — inline auth.getUser()) — migrated ~21 files
- `enrichment/defaults/route.ts` — full rewrite
- `enrichment/sources/route.ts` — full rewrite
- `enrichment/[sku]/route.ts` — auth block replaced
- `enrichment/[sku]/override/route.ts` — auth block replaced
- `enrichment/[sku]/scrape/route.ts` — auth block replaced
- `enrichment/[sku]/sources/route.ts` — auth block replaced
- `enrichment/[sku]/conflicts/[field]/route.ts` — auth block replaced
- `scrapers/configs/route.ts` — full rewrite
- `scrapers/configs/[slug]/route.ts` — full rewrite
- `scrapers/discovery/route.ts` — auth block replaced
- `scrapers/studio/test/route.ts` — auth block replaced + user.id fix
- `scrapers/studio/test/[id]/route.ts` — already migrated
- `scrapers/studio/test/[id]/steps/[stepId]/retry/route.ts` — already migrated
- `scrapers/studio/test/[id]/timeline/route.ts` — already migrated
- `scrapers/studio/test/[id]/selectors/route.ts` — already migrated
- `scrapers/[slug]/credentials/route.ts` — full rewrite (custom requireAdmin replaced)
- `settings/shopsite/route.ts` — full rewrite (custom requireAdmin replaced)
- `ai-scraping/credentials/route.ts` — full rewrite (custom requireAdmin replaced)
- `scraper-network/runners/[id]/route.ts` — already migrated
- `runners/accounts/route.ts` — already migrated
- `consolidation/webhook/route.ts` — comment updated (HMAC-only, JWT already removed)

### Validation
- TypeScript: 0 errors in modified files
- Auth unit tests: 19/19 ✅
- API keys integration tests: 9/9 ✅

## Phase 3 — Scoped Permissions 🔲 Not started

## Phase 4 — Legacy Cleanup 🔲 Not started
