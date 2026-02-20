# Task 3.4: Consolidate test lab interfaces

## Audit Results

### Test Lab A: `/admin/scrapers/test-lab/` - CANONICAL
- **Route**: `/app/admin/scrapers/test-lab/`
- **Component**: `components/admin/scrapers/TestLabClient.tsx`
- **Status**: ✅ Canonical - actively used
- **Links**: 
  - Sidebar navigation
  - ScraperDashboardClient
  - ConfigsClient
  - ConfigListClient
- **Data Source**: `scrapers` table (legacy)

### Test Lab B: `/admin/scrapers/lab/` - DEPRECATED
- **Route**: `/app/admin/scrapers/lab/`
- **Component**: `components/admin/scraper-lab/TestLabClient.tsx`
- **Status**: ⚠️ Deprecated
- **Links**: 
  - ScraperDashboardClient (one link - now updated)
- **Data Source**: `scraper_configs` table (new)

## Actions Completed

1. **Selected Test Lab A as canonical** - More usage, sidebar navigation
2. **Updated ScraperDashboardClient.tsx** - Changed link from `/lab` to `/test-lab`
3. **Added deprecation marker** - Created `.DEPRECATED` in `/app/admin/scrapers/lab/`
4. **Commit**: `d0dd51d refactor(scrapers): consolidate test lab interfaces`

## Remaining

### Task 3.5 (completed together):
- ✅ Deprecated test lab routes marked
- ✅ Navigation links updated
- ✅ Physical deletion deferred to Phase 4

### Note on Test Lab C
The `components/admin/scraper-lab/` directory contains both:
1. TestLabClient.tsx (deprecated - Test Lab B)
2. Config editor components (already deprecated in Task 3.3)

The entire `scraper-lab/` component directory should be removed in Phase 4.
