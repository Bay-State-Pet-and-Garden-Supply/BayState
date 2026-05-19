# Progress

## Status
In Progress

## Tasks
- [x] Add early check in executor.py for ai_only mode with no official domains
- [x] Parse `extractionMode` and `forceRefresh` in enrichment jobs API route
- [x] Validate `extractionMode` against allowed values
- [x] Pass `extractionMode`/`forceRefresh` to `buildApprovedSourcePlans`
- [x] Add extraction-mode-specific error messages for all-fail scenarios
- [x] Store `extraction_mode`/`force_refresh` in `jobConfig` for audit traceability
- [x] ManagementPanel: Add extractionMode + forceRefresh states, UI controls in footer, POST body params
- [x] PipelineClient: Remove handleStartApprovedExtraction callback, isApprovedExtracting state, FloatingActionsBar prop
- [x] FloatingActionsBar: Remove onStartApprovedExtraction prop, button, Sparkles import, BULK_ACTIONS secondaryAction
- [x] TypeScript compiles clean (no new errors)
- [x] `source-plan.ts`: Implement plan builder logic — extractionMode, forceRefresh, dedup with 48h freshness check, AI-only gate

## Files Changed
- `apps/scraper/scrapers/approved_sources/executor.py` — Added early check in `execute()` before `_try_official_fallback()`, returning clear error when `plan.priority` is empty and no official domains exist
- `apps/web/app/api/admin/enrichment/jobs/route.ts` — Added `extractionMode`/`forceRefresh` support (parse, validate, pass to plan builder, mode-specific errors, store in jobConfig)
- `apps/web/components/admin/pipeline/management/ManagementPanel.tsx` — Added extractionMode/forceRefresh state, UI controls in footer, POST body params
- `apps/web/components/admin/pipeline/PipelineClient.tsx` — Removed handleStartApprovedExtraction, isApprovedExtracting state, FloatingActionsBar prop
- `apps/web/components/admin/pipeline/FloatingActionsBar.tsx` — Removed onStartApprovedExtraction prop, button, Sparkles import, BULK_ACTIONS secondaryAction
- `apps/web/lib/approved-sources/source-plan.ts` — Implemented extractionMode/forceRefresh/dedup logic: `ExtractionMode` import, option extraction, 48h dedup query, per-source freshness check, AI-only gate, mode-specific llmPolicy overrides

## New Files
- `handoff/source-plan-impl.md` — Detailed implementation handoff for source-plan.ts

## Notes
- Scaffolder mode selector (select dropdown with 3 options) and force-refresh checkbox added to ManagementPanel footer above "Save and start scraper"
- Approved extraction initiation removed from FloatingActionsBar; extraction is now kicked off per-cohort from ManagementPanel
- Only pre-existing test file errors remain (unrelated credentials route test)
