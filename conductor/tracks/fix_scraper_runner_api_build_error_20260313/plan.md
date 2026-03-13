# Fix Scraper Runner API Build Error

The Scraper Runner API routes (`job` and `poll`) still depend on the deleted `scraper-configs` legacy library, causing a build failure.

## Objective
Refactor the Scraper Runner API to use the new local YAML-based configuration utilities.

## Key Files & Context
- `apps/web/app/api/scraper/v1/job/route.ts`: API for fetching specific job config.
- `apps/web/app/api/scraper/v1/poll/route.ts`: API for polling and claiming jobs.
- `apps/web/lib/admin/scrapers/configs.ts`: New utility for YAML configs.

## Implementation Steps

### Phase 1: Refactor Job Route
- [ ] Task: Replace legacy Supabase scraper fetching in `apps/web/app/api/scraper/v1/job/route.ts` with `getLocalScraperConfigs()`.
- [ ] Task: Clean up unused legacy types and functions in the same file.

### Phase 2: Refactor Poll Route
- [ ] Task: Replace legacy Supabase scraper fetching in `apps/web/app/api/scraper/v1/poll/route.ts` with `getLocalScraperConfigs()`.
- [ ] Task: Clean up unused legacy types and functions in the same file.

## Verification
- [ ] Task: Confirm that the application builds successfully.
- [ ] Task: Verify that the Scraper Runner can still fetch job configurations via these APIs.
