# Phase 10 — Legacy Import Cleanup

## Summary
Removed all active imports from deprecated modules across the web app. No files were deleted. All code is retained on disk for archival reference.

## Deprecated Modules Neutralized

| Module | Status |
|--------|--------|
| `@/lib/pipeline/scrape-quality` | Imports removed from chunk-callback route |
| `@/lib/pipeline/fallback-orchestration` | Already only had commented-out imports |
| `@/lib/official-brand-discovery` | Imports removed from official-brand page |
| `@/lib/official-brand-review` | Imports removed from official-brand page |
| `@/lib/official-brand-review-types` | Types inlined in 3 UI components |
| `@/lib/official-brand-scoring` | Imports removed (was only imported by official-brand-discovery) |
| `@/lib/official-brand-workflow` | Constants inlined in 3 routes |
| `@/lib/scraper-callback/official-brand-validation` | Imports removed from 2 callback routes |
| `@/lib/pipeline/scraper-recommendations` | Import removed from cohorts/recommendations route |

## Files Fixed (11 files)

### Scraper Runner API Routes (old runner paths — neutered)
| File | Changes |
|------|---------|
| `apps/web/app/api/scraper/v1/chunk-callback/route.ts` | Removed evaluateScrapeQuality, filterOfficialBrandResultsForPersistence, official-brand-workflow imports; stripped all official-brand processing and quality evaluation from POST handler (~200 lines removed); functions stubbed as no-op |
| `apps/web/app/api/scraper/v1/job/route.ts` | Removed official-brand-workflow import; inlined 2 constants + isOfficialBrandJobType function |
| `apps/web/app/api/scraper/v1/poll/route.ts` | Same as job/route.ts |
| `apps/web/app/api/admin/scraping/callback/route.ts` | Removed filterOfficialBrandResultsForPersistence + official-brand-workflow imports; stripped all official-brand processing from POST handler |

### Admin Pipeline Routes
| File | Changes |
|------|---------|
| `apps/web/app/api/admin/pipeline/active-runs/route.ts` | Removed official-brand-workflow import; inlined constants |
| `apps/web/app/api/admin/pipeline/fallback/route.ts` | Already clean (commented-out imports) |
| `apps/web/app/api/admin/cohorts/recommendations/route.ts` | Removed getScraperRecommendations import; returns empty recommendations |

### UI Components
| File | Changes |
|------|---------|
| `apps/web/components/admin/pipeline/CandidateUrlPicker.tsx` | Removed official-brand-review-types import; inlined all needed type definitions locally |
| `apps/web/components/admin/pipeline/OfficialBrandReviewClient.tsx` | Same as CandidateUrlPicker |
| `apps/web/components/admin/pipeline/UrlReviewWorkspace.tsx` | Already using local EnrichmentTarget types — no change needed |

### Pages
| File | Changes |
|------|---------|
| `apps/web/app/admin/pipeline/official-brand/page.tsx` | Removed loadOfficialBrandCandidates import; page rendered with empty data (deprecated) |

## Legacy Scraper Files Moved
- `apps/scraper/scrapers/configs/` → `legacy/scraper/scrapers/configs/`

Other legacy directories (actions, executor, parser) and files (config_validation.py, result_collector.py, etc.) had already been removed by earlier Phase 4/8 worker work.

## Verification
- **TypeScript**: 0 errors (`bun run web tsc --noEmit`)
- **Pipeline tests**: 50/50 pass (339 tests)
- **Lint**: Only pre-existing errors in fallback-orchestration.ts (Phase 8 deletion target)
