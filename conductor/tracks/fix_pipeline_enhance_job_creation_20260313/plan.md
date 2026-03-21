# Fix Pipeline Enhance Job Creation

The migration to YAML-based scraper configurations broke the pipeline enhancement job creation because several backend utilities were still attempting to query the deprecated `scraper_configs` table in Supabase.

## Objective
Update the enrichment sources and pipeline scraping logic to use the new local YAML configuration system.

## Key Files & Context
- `apps/web/lib/enrichment/sources.ts`: Registry of enrichment sources, currently queries Supabase.
- `apps/web/lib/pipeline-scraping.ts`: Logic for creating scrape jobs, currently queries Supabase for slug resolution.
- `apps/web/lib/admin/scrapers/configs.ts`: Utility for fetching local YAML configs.

## Implementation Steps

### Phase 1: Update Enrichment Sources
- [ ] Task: Modify `getScraperSources` in `apps/web/lib/enrichment/sources.ts` to use `getLocalScraperConfigs()` instead of querying the `scraper_configs` table.
- [ ] Task: Remove unused Supabase queries from `getScraperSources`.

### Phase 2: Update Pipeline Scraping
- [ ] Task: Modify `scrapeProducts` in `apps/web/lib/pipeline-scraping.ts` to use `getLocalScraperConfigs()` for resolving scraper display names to slugs.
- [ ] Task: Remove unused Supabase queries from `scrapeProducts`.

## Verification & Testing
- [ ] Task: Verify that the Batch Enhance dialog in the pipeline UI correctly lists all scrapers defined in YAML.
- [ ] Task: Verify that starting an enhancement job correctly creates `scrape_jobs` and `scrape_job_chunks` in Supabase with the correct scraper slugs.
