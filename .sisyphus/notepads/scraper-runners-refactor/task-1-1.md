# Task 1.1: Extend job creation API for Discovery-first workflow

## Context
The current `scrapeProducts()` function already supports discovery jobs via `jobType: 'discovery'` parameter, but we need to add a more explicit `enrichment_method` parameter for the new unified enrichment workflow.

## Key Points from Code Review
- Current implementation uses `jobType?: 'standard' | 'discovery'` (line 20)
- When discovery: sets `scrapers: ['ai_discovery']` (lines 54-55)
- Stores discovery config in job (lines 79-80)
- Creates chunks correctly (lines 92-110)

## Required Changes
1. Add `enrichment_method?: 'scrapers' | 'discovery'` to ScrapeOptions
2. When `enrichment_method='discovery'`, use same logic as `jobType='discovery'`
3. Maintain backward compatibility with existing `jobType` parameter
4. Priority: `enrichment_method` takes precedence over `jobType` if both provided

## Acceptance Criteria
- [x] `scrapeProducts(skus, { enrichment_method: 'discovery', discoveryConfig: {...} })` creates discovery job
- [x] `scrapeProducts(skus, { scrapers: ['amazon'] })` still works (backward compat)
- [x] Job record has correct `type`, `scrapers`, and `config` columns

## Notes
- Do NOT change chunk creation logic
- Do NOT modify runner claiming API
- Keep existing scraper selection logic as alternative

---

## Implementation Notes (2026-02-19)

### Changes Made
1. **Added `enrichment_method` parameter** to `ScrapeOptions` interface (line 21-22)
   - Type: `'scrapers' | 'discovery'`
   - JSDoc: "Explicit enrichment method - takes precedence over jobType"

2. **Updated `scrapeProducts` logic** (lines 55-58)
   - New logic: `const enrichmentMethod = options?.enrichment_method ?? (options?.jobType === 'discovery' ? 'discovery' : 'scrapers');`
   - `enrichment_method` takes precedence over `jobType`
   - Falls back to `'scrapers'` for standard jobs when neither parameter is provided
   - `jobType` is computed from `enrichmentMethod` for database storage: `const jobType = isDiscovery ? 'discovery' : 'standard';`

### Backward Compatibility
- Existing calls with `scrapers: ['name']` still work (falls through to `effectiveScrapers = scrapers`)
- Existing calls with `jobType: 'discovery'` still work (backward mapping preserved)
- Priority ensures new code using `enrichment_method` takes precedence over old code using `jobType`

### Verification
- ✅ TypeScript compilation: No errors in modified file
- ✅ Tests: All 7 tests pass (`__tests__/lib/pipeline-scraping.test.ts`)
- ✅ Commit: `8101f92 feat(scrapers): extend job creation API for unified enrichment workflow`

### Key Design Decision
Instead of removing `jobType`, we compute it from `enrichmentMethod`. This maintains database compatibility (the `type` column in `scrape_jobs` still gets 'discovery' or 'standard') while providing the new explicit API.
