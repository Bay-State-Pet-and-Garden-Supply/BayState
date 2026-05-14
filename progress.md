# Progress

## Status
✅ Complete — Full migration to admin API key auth is done.

## What was built

### Phase 1 — Foundation
- `supabase/migrations/20260513180000_create_user_api_keys.sql` — DB table + `validate_user_api_key()` RPC
- `lib/admin-api-key-auth.ts` — `generateAdminApiKey()`, `validateAdminApiKey()`, `validateAdminApiKeyValue()`
- `/api/admin/api-keys` CRUD endpoints (list masked, create, update, revoke)
- 28 passing tests (19 unit + 9 integration)

### Phase 2 — Full API Key Migration
- `lib/admin/api-auth.ts` — rewritten: `requireAdminAuth(request)` uses API-key-only auth (no JWT fallback)
- ~80 admin API routes migrated to use `requireAdminAuth(request)` with `createAdminClient()` for DB ops
- Consolidation webhook — HMAC-only, JWT fallback removed
- Admin layout (`app/admin/layout.tsx`) — generates session-scoped API key, injects via `<script>` tag → `sessionStorage`
- `lib/admin/api-client.ts` — `adminFetch()`, `storeAdminKey()`, `getStoredAdminKey()`, `clearAdminKey()`
- All client-side `fetch("/api/admin/..."` calls replaced with `adminFetch(...)` across 27+ component files
- `SupabaseClient` type import fix in 2 scraper v1 routes (Vercel build fix)

### Legacy Patterns Eliminated
- `auth.getUser()` in admin routes: from 21 files → **0**
- `requireAdminAuth()` without `request` param: from 40+ files → **0**
- `createClient()` (SSR cookie) for admin DB ops: from 40+ files → **0**
- Bare `fetch("/api/admin/..."` from browser components: from 80+ calls → **0**

### Validation
- TypeScript: ✅ Zero errors in all changed files
- Auth unit tests: ✅ 19/19 passing
- API keys integration tests: ✅ 9/9 passing
- Vercel build error fix applied: ✅

## Architecture

```
Admin Browser Page                    Admin API Route
  │                                       │
  │ sessionStorage('bs_admin_api_key')    │
  │       ↓                               │
  │ adminFetch("/api/admin/...")          │
  │       │                               │
  │       └─ X-API-Key: bsa_... ─────────>│ requireAdminAuth(request)
  │                                       │   → validateAdminApiKey(headers)
  │                                       │   → RPC validate_user_api_key()
  │                                       │   → profile role check
  │                                       │   → user_api_keys.last_used_at update
```

## Remaining (optional/low-priority)
- Dead env var removal (`SUPABASE_JWT_SECRET`)
- Env var naming consolidation in `config.ts` (3 overlapping layers)
- GitHub Actions workflow migration (replace service-role keys)
- Python scraper fallback chain simplification
- Admin UI page for key management
