# Pipeline Core Rewrite Complete

## Files Modified (Phase 1 - Pipeline Core)

### 1. `apps/web/lib/pipeline/types.ts` — Complete Rewrite
- `PERSISTED_PIPELINE_STATUSES`: 8 statuses (removed searching, extracting, scraping, needs_fallback_review, scraped, consolidating, finalizing, exporting)
- `PIPELINE_TABS`: 7 tabs (imported, url_review, enriching, processed, merging, reviewing, publishing)
- Removed `FALLBACK_OPERATIONAL_STATUSES`
- Updated `STAGE_CONFIG` with new labels, colors, descriptions
- Updated `LEGACY_PIPELINE_STAGE_ALIASES` to map old→new: finalized→reviewing, export→publishing, scraped→processed, consolidating→merging, exporting→publishing
- All helper functions (isPersistedStatus, isDerivedTab, isPipelineStage, normalizePipelineStage) updated

### 2. `apps/web/lib/pipeline/core.ts` — Complete Rewrite
New state machine:
```
imported → url_review → enriching → processed → merging → reviewing → publishing
Any → failed
failed → imported | url_review | enriching
url_review → imported
enriching → url_review
processed → importing (reprocess)
merging → processed (re-merge)
reviewing → processed (re-merge)
publishing → reviewing
```

### 3. `apps/web/lib/pipeline/derivation.ts` — Full Update
- `WORKFLOW_PIPELINE_TABS`: 7 new tabs
- `deriveTabFromProduct`: Maps all 8 statuses to correct tabs (failed→imported for retry)
- `ACTIVE_SCRAPE_JOB_STATUSES` → `ACTIVE_ENRICHMENT_JOB_STATUSES` (queued, running)
- `getActiveJobsForProduct`: Queries `enrichment_jobs` instead of `scrape_jobs`
- `ActivePipelineJobs`: `scraping`→`enriching`, `consolidation`→`merging`

### 4. `apps/web/lib/pipeline/run-types.ts` — Full Update
- `PipelineRunKind`: Removed serp_search, page_scrape. Added enrichment.
- `PIPELINE_RUN_KIND_LABELS`: enrichment, consolidation, apply_results
- `mapScrapeJobStatusToRunStatus` → `mapEnrichmentJobStatusToRunStatus`
- Removed `determineScrapeJobKind`
- Removed `getScrapeStageLabel`
- Added `getEnrichmentStageLabel`

## What's Next
See `progress.md` for remaining phases.
