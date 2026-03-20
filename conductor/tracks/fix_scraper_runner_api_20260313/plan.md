# Fix Scraper Runner API

The migration to YAML configurations broke the Scraper Runner API because it still relied on the deleted `assemble-config` logic and attempted to query deprecated Supabase tables.

## Changes
- **`apps/web/app/api/scraper/v1/job/route.ts`**: Refactored to use `getLocalScraperConfigs()` and `getLocalScraperConfig(slug)`.
- **`apps/web/app/api/scraper/v1/chunk-callback/route.ts`**: Added additional logging to debug the 500 errors.

## Verification
- [ ] Task: Confirm `GET /api/scraper/v1/job` no longer returns 500.
- [ ] Task: Monitor logs for `chunk-callback` to identify any further issues.
