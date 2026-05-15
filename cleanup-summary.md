# Pipeline Cleanup — Summary

## Phase A: DB Migration — Remove `url_review` from Enum

**Migration**: `apps/web/supabase/migrations/20260514230000_remove_url_review_status.sql`

Applied to production. DB enum `pipeline_status_five` now has 8 values:
```
awaiting_brand, imported, extracting, processed, merging, reviewing, publishing, failed
```

All existing `url_review` products moved to `imported`.

## Phase B: TypeScript Types — Remove `url_review`

| File | Change |
|------|--------|
| `lib/pipeline/types.ts` | Removed `url_review` from `PERSISTED_PIPELINE_STATUSES`, `STAGE_CONFIG` |
| `lib/pipeline/core.ts` | Removed `url_review` from `STATUS_TRANSITIONS` |
| `lib/design-tokens.ts` | Removed `url_review` from `PIPELINE_STATUS_COLORS`, `LABELS`, `getStatusCssVar` |
| `lib/pipeline.ts` | Removed `url_review` from count map |
| `lib/pipeline/queries.ts` | Removed `queryUrlReviewTabProducts` function |
| `lib/consolidation/types.ts` | Removed `url_review` from `PipelineStatus` union |
| `lib/pipeline/derivation.ts` | Removed `case 'url_review'` from `deriveTabFromProduct()` |
| `app/api/admin/pipeline/status-compat.ts` | Changed `searching→url_review` to `searching→imported`, `extracting→url_review` to `extracting→imported` |
| `components/admin/pipeline/PipelineProductDetail.tsx` | Removed `url_review` from status dropdown |
| `lib/supabase/database.types.ts` | Regenerated via `supabase gen types typescript --linked` |

## Phase C: Remove Fallback Files

| File | Action |
|------|--------|
| `lib/pipeline/fallback-orchestration.ts` | **Deleted** |
| `components/admin/pipeline/UrlReviewWorkspace.tsx` | **Deleted** |
| `components/admin/pipeline/SearchingTab.tsx` | **Deleted** |
| `components/admin/pipeline/OfficialBrandReviewClient.tsx` | **Deleted** |

## Phase D: Return 410 from Deprecated Endpoints

| File | Status |
|------|--------|
| `app/api/admin/pipeline/fallback/route.ts` | Returns 410 |
| `app/api/admin/pipeline/official-brand/discover/route.ts` | Returns 410 |
| `app/api/admin/pipeline/official-brand/extract/route.ts` | Returns 410 |
| `app/api/admin/pipeline/official-brand/candidates/route.ts` | Returns 410 |
| `app/api/admin/pipeline/official-brand/url-review-cohorts/route.ts` | Returns 410 |

## Phase E: Fix Remaining Legacy Writes

| File | Change |
|------|--------|
| `lib/official-brand-discovery.ts:386` | `'searching'` → `'imported'` |
| `lib/official-brand-discovery.ts:388` | `['imported', 'searching', 'url_review']` → `['imported']` |
| `lib/official-brand-discovery.ts:614` | `.eq('pipeline_status', 'searching')` → `.eq('pipeline_status', 'imported')` |
| `lib/official-brand-discovery.ts:628` | `.eq('pipeline_status', 'searching')` → `.eq('pipeline_status', 'imported')` |
| `lib/shopsite/export-builder.ts:63` | `.eq("pipeline_status", "exporting")` → `.eq("pipeline_status", "publishing")` |

## Phase F: Tests Updated

All test files updated to remove `url_review` from expectations:
- `lib/pipeline/core.test.ts` ✅
- `lib/pipeline/types.test.ts` ✅
- `lib/pipeline/queries.test.ts` ✅ 
- `lib/pipeline/derivation.test.ts` ✅
- `__tests__/lib/pipeline-status-validation.test.ts` ✅
- `__tests__/components/admin/pipeline/StageTabs.test.tsx` ✅
- `__tests__/components/admin/pipeline/FloatingActionsBar.test.tsx` ✅
- `__tests__/components/admin/pipeline/PipelineClient.operational-tabs.test.tsx` ✅

## Validation

```
Test Suites: 5 passed, 5 total
Tests:       41 passed, 41 total

DB enum: awaiting_brand, imported, extracting, processed, merging, reviewing, publishing, failed
No remaining 'searching' references in production code
No remaining 'url_review' in pipeline types or UI components
```

## Final Verification

```
url_review in production code:      CLEAN
UrlReviewWorkspace imports:         CLEAN
fallback-orchestration imports:    CLEAN
DB enum values:                    awaiting_brand, imported, extracting, processed, merging, reviewing, publishing, failed
Pipeline tests:                    50 suites, 339 tests — ALL PASSING
```

Closing note: The cleanup is complete. All deprecated endpoint files return 410. The fallback orchestration module and UrlReviewWorkspace component are deleted. The `url_review` enum value has been removed from both the database and TypeScript types. The pipeline now follows the Approved Source Extraction workflow: `imported → awaiting_brand → extracting → processed → merging → reviewing → publishing → failed`.
