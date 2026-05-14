# Test File Status Migrations — Complete

## Summary

Fixed **23 test files** with old pipeline status references, updating them to the new 8-status vocabulary.

## Files Fixed

| File | Changes |
|------|---------|
| `lib/pipeline/core.test.ts` | STATUS_TRANSITIONS assertion + transition tests → new state machine |
| `lib/pipeline/types.test.ts` | Removed `getStageDataStatus` import; updated all status assertions; removed getStageDataStatus test block |
| `lib/pipeline/derivation.test.ts` | `ACTIVE_SCRAPE_JOB_STATUSES` → `ACTIVE_ENRICHMENT_JOB_STATUSES`; `scraping`→`extracting`, `consolidation`→`merging` in ActivePipelineJobs; `scrape_jobs`→`enrichment_jobs` queries |
| `lib/pipeline/queries.test.ts` | `finalizing`→`reviewing`; tab count expectations→8 statuses |
| `__tests__/lib/pipeline-status-validation.test.ts` | Full transition matrix → new simplified transitions |
| `__tests__/lib/pipeline-transition.test.ts` | `scraping`→`url_review`, `scraped`→`processed`, `finalizing`→`reviewing`, `exporting`→`publishing` |
| `__tests__/lib/pipeline.test.ts` | `finalizing`→`reviewing`, `scraped`→`processed` |
| `__tests__/lib/design-tokens.test.ts` | `scraped`→`processed`, `finalizing`→`reviewing`, `exporting`→`publishing`, `scraping`→`extracting` |
| `__tests__/lib/pipeline/run-types.test.ts` | Removed `mapScrapeJobStatusToRunStatus`/`determineScrapeJobKind`/`getScrapeStageLabel`; added `mapEnrichmentJobStatusToRunStatus`/`getEnrichmentStageLabel`; updated run kinds |
| `__tests__/lib/pipeline/finalization-copilot-workspace.test.ts` | `finalizing`→`reviewing` |
| `__tests__/lib/pipeline/finalization-draft.test.ts` | `finalizing`→`reviewing` |
| `__tests__/components/admin/pipeline/StageTabs.test.tsx` | 8 tabs; updated tab names and counts |
| `__tests__/components/admin/pipeline/StatusBadge.test.tsx` | `scraping`→`extracting`, `scraped`→`processed`, `finalizing`→`reviewing`, `exporting`→`publishing` |
| `__tests__/components/admin/pipeline/pipeline-stats.test.tsx` | Updated all counts arrays and expectations |
| `__tests__/components/admin/pipeline/PipelineClient.operational-tabs.test.tsx` | Updated mock imports/stage names/assertions |
| `__tests__/components/admin/pipeline/pipeline-selection.test.tsx` | Updated counts arrays to 8 statuses |
| `__tests__/components/admin/pipeline/published-export-actions.test.tsx` | `exporting`→`publishing` |
| `__tests__/components/admin/pipeline/FloatingActionsBar.test.tsx` | `exporting`→`publishing` |
| `__tests__/components/admin/pipeline/pipeline-product-grid.test.tsx` | `scraped`→`processed` |
| `__tests__/components/admin/pipeline/ScrapedResultsView.test.tsx` | `scraped`→`processed` in mock data |
| `__tests__/pipeline/undo.test.ts` | `scraped`→`url_review` |
| `__tests__/pipeline/filters.test.tsx` | `scraped`→`processed`, `Finalizing`→`Reviewing` |
| `__tests__/performance/benchmarks.test.ts` | `finalizing`→`reviewing` |

## Remaining Errors (21 source errors, not test)

These are implementation bugs in worker-created files, not test references:

1. **ActiveEnrichmentsTab.tsx:176,270** — `PipelineRunStatusLabels` → `PIPELINE_RUN_STATUS_LABELS`
2. **enrichment-callback/route.ts:104-114** — validation result not typed correctly (validation.success doesn't match EnrichmentResultV1.validation)
3. **PipelineClient.tsx:1256-1363** — stage handler type mismatches and `enriching` remnants
4. **ProcessedResultsView.tsx:82,348** — unsafe cast `as Record<string, unknown>`, wrong PipelineSidebarTable props
5. **enrichment/jobs/route.ts:118,190** — `user` not defined, `createClient` not imported  
6. **pipeline/runs/route.ts:38,101** — duplicate `last48Hours` vars, wrong enrichment mapper arg count
7. **fallback-orchestration.ts:231,244** — old statuses (Phase 8 delete)

## Zero test file errors remaining
