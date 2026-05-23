# Progress — Merging Tab Implementation

## Status
✅ Phase 1 (Backend): Complete
✅ Phase 2 (UI — Settings + Consolidation Tab): Complete
✅ Phase 3 (Pipeline UI): Complete

## Tasks
- ✅ Migration: `is_active_for_consolidation` column on `ai_provider_configs`
- ✅ Backend: Independent consolidation provider profile resolution in `credentials.ts`
- ✅ Auto-apply: `direct_chat_chunks` now auto-applies via `applyResults()` in submit route
- ✅ Settings UI: `AIProviderProfilesCard` updated with consolidation toggle
- ✅ Settings UI: New `ConsolidationAISettingsCard` with runtime config display
- ✅ UI: Split `ConsolidationJobCard` into `DirectConsolidationJobView` + `BatchConsolidationJobView`
- ✅ UI: Realtime subscription + connection indicator in `ActiveConsolidationsTab`
- ✅ UI: `ConsolidationHistorySection` replaces `BatchHistorySection` with mode-aware display
- ✅ PipelineClient: `consolidationConfig` state + fetch + lazy-load on 'processed' stage
- ✅ PipelineClient: `handleConsolidate` passes `auto_apply: true`, updated toasts
- ✅ FloatingActionsBar: shows model/provider chip near "Merge selected"

## Files Changed

### Created
- `apps/web/supabase/migrations/20260523130000_add_consolidation_provider_selection.sql`
- `apps/web/app/api/admin/ai-providers/[id]/activate-consolidation/route.ts`
- `apps/web/app/api/admin/ai-providers/[id]/deactivate-consolidation/route.ts`
- `apps/web/components/admin/pipeline/consolidation/DirectConsolidationJobView.tsx`
- `apps/web/components/admin/pipeline/consolidation/BatchConsolidationJobView.tsx`
- `apps/web/components/admin/settings/ConsolidationAISettingsCard.tsx`

### Modified
- `apps/web/lib/ai-scraping/credentials.ts`
- `apps/web/lib/consolidation/batch-service.ts`
- `apps/web/lib/consolidation/prompt-builder.ts`
- `apps/web/lib/consolidation/types.ts`
- `apps/web/app/api/admin/consolidation/settings/route.ts`
- `apps/web/app/api/admin/consolidation/submit/route.ts`
- `apps/web/app/api/admin/ai-providers/route.ts`
- `apps/web/app/admin/settings/page.tsx`
- `apps/web/components/admin/settings/AIProviderProfilesCard.tsx`
- `apps/web/components/admin/pipeline/ActiveConsolidationsTab.tsx`
- `apps/web/components/admin/pipeline/consolidation/ConsolidationJobCard.tsx`
- `apps/web/components/admin/pipeline/consolidation/BatchHistorySection.tsx`
- `apps/web/components/admin/pipeline/consolidation/shared.tsx`
- `apps/web/components/admin/pipeline/consolidation/index.ts`
- `apps/web/components/admin/pipeline/FloatingActionsBar.tsx`
- `apps/web/components/admin/pipeline/PipelineClient.tsx`
- `apps/web/app/api/admin/consolidation/submit/route.ts`
- `apps/web/__tests__/lib/consolidation/batch-service.test.ts`

## Validation
- `bun run typecheck` — PASS (zero errors)
- `bun run test -- --testPathPatterns="credentials.test"` — PASS (7/7 tests)
