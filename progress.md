# Pipeline Simplification Migration — Progress

## Phase 1 ✅ — Contracts & Foundation
- `contracts.ts`, `validation.ts`, `normalize-result.ts`, `metrics.ts` created
- `enrichment/types.ts` updated with new fields
- DB migration: `enrichment_targets`, `enrichment_jobs`, `enrichment_attempts` tables

## Phase 2 ✅ — UI Restore & New Tabs
- `ActiveEnrichmentsTab.tsx`, `ProcessedResultsView.tsx`, `ReviewingResultsView.tsx` created
- `PipelineClient.tsx`, `StageTabs.tsx`, `StatusBadge.tsx`, `PipelineStats.tsx` updated

## Phase 3 ✅ — v2 API Routes
- `POST /api/admin/enrichment/jobs` — create enrichment jobs
- `POST /api/scraper/v1/claim-enrichment` — worker claim endpoint
- `POST /api/scraper/v1/enrichment-callback` — v2 result callback
- Updated bulk/transition/pipeline routes

## Phase 4 ✅ — Slim Python Worker
- `enrichment_models.py` — Pydantic v1 models matching TS contract
- `_run_enrichment_job()` — AI extraction via Crawl4AIEngine
- CLI `--mode enrichment` — local dev mode
- Daemon enrichment loop

## Phase 5 ✅ — Consolidation Normalization
- `sources.enriched` backward-compatible aliases
- Prompt builder trusts `enriched`
- Status transitions: `processed→merging→reviewing`

## Phase 6 ✅ — State Machine & Queries
- 8-status pipeline (`imported→url_review→extracting→processed→merging→reviewing→publishing`)
- New state machine with failed recovery paths
- Updated derivation, run-types, queries, publishing

## Phase 7 ✅ — DB Migration
- Migration SQL for new tables and enum changes
- Fixes for RPC columns and duplicate migrations

## Phase 8 ✅ — Source Fixes
- 65 TypeScript source errors fixed
- 160 test errors fixed
- publish.ts, derivation.ts, design-tokens fixed

## Phase 9 ✅ — Monitoring
- Metrics helpers in `metrics.ts`
- Contracts include confidence scoring

## Phase 10 ✅ — Legacy Code Out
- Moved 15 YAML configs, 24 action handlers, executor, parser, etc. to `apps/scraper/legacy/`
- Deactivated legacy import paths in runner, API client, CLI
- All active Python imports verified
- TypeScript: 0 errors, Pipeline tests: 339/339 pass
