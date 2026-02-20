# Task 3.2: Migrate features to canonical editor

## Context
Now that Editor A (scraper-configs/) is selected as canonical, we need to:
1. Remove AI config panels from scraper level (Discovery now at job level)
2. Ensure Editor A can handle all scraper types
3. Update form schema if needed

## Key Changes Needed

### Remove AI Config from Scraper Level
- Discovery is now a job-level enrichment option (not scraper config)
- Remove AI config fields from scraper config schema
- Keep only static scraper configuration

### Files to Modify
- `lib/admin/scraper-configs/form-schema.ts` - Remove AI-related fields
- `components/admin/scraper-configs/` - Remove AI config panels

### What to Keep
- Static scraper configuration (selectors, workflows)
- Test SKUs
- Validation logic
- All existing functionality for YAML-based scrapers

## Completed Changes

### Modified: `lib/admin/scraper-configs/form-schema.ts`
- Removed `scraper_type` field (was: `z.enum(['static', 'ai', 'discovery'])`)
- Removed `ai_config` object field entirely
- Removed `discovery_config` object field entirely
- Removed `.refine()` validation for AI scrapers
- Schema now only supports static scraper configuration
- No components needed updating (none referenced these fields)

## Acceptance Criteria
- [x] Canonical editor can edit all scraper types
- [x] AI config removed from scraper level
- [x] Form validation works
