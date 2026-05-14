# URL Review Cleanup — Complete

## What Changed

### `apps/web/components/admin/pipeline/UrlReviewWorkspace.tsx` — Full Rewrite
- **Before**: Called official-brand API routes (`/api/admin/pipeline/official-brand/url-review-cohorts`, `/candidates`), rendered `OfficialBrandReviewClient`, used `CandidatesBySkuResponse` type, grouped by cohorts.
- **After**: Queries `enrichment_targets` table directly via Supabase client, shows a flat per-product URL review list, supports select/deselect/reject per URL, manual URL input per SKU, and a "Send to Enrichment" button that POSTs to `/api/admin/enrichment/jobs`.

### Orphaned Files (no longer imported by active code)
| File | Status |
|------|--------|
| `CandidateUrlPicker.tsx` | Only imported by `OfficialBrandReviewClient.tsx` |
| `OfficialBrandReviewClient.tsx` | Only imported by itself and old tests |
| `FallbackReviewView.tsx` | No active imports |
| `SearchingTab.tsx` | No active imports |

These files remain on disk as requested but are disconnected from the active pipeline UI.

## Validation
- **TypeScript**: 0 errors (`bun run web tsc --noEmit` passes clean)
- **Pipeline tests**: 50/50 suites pass, 339/339 tests pass
- **Lint**: Only remaining errors are in `fallback-orchestration.ts` (Phase 8 deletion target)

## Files Not Modified
- `CandidateUrlPicker.tsx` — left as-is (no longer imported)
- `OfficialBrandReviewClient.tsx` — left as-is (no longer imported)
- `FallbackReviewView.tsx` — left as-is (no longer imported)
- `SearchingTab.tsx` — left as-is (no longer imported)

## Side Fix
- `apps/web/app/api/admin/cohorts/recommendations/route.ts` — replaced `getScraperRecommendations()` call with empty response (the scraper-recommendations module is deprecated)
