# Source Plan Implementation — ExtractionMode, ForceRefresh, Dedup

## Summary

Implemented the plan builder logic in `source-plan.ts` to support `extractionMode`, `forceRefresh`, and dedup by 48h freshness check.

## Changes Made

### File: `apps/web/lib/approved-sources/source-plan.ts`

#### 1. Import `ExtractionMode` type
- Added `type ExtractionMode` to the import from `./types`.
- Changed `BuildSourcePlanOptions.extractionMode` field type from `"mixed" | "distributor_only" | "ai_only"` to the shared `ExtractionMode` type.

#### 2. Options extraction
- At the start of `buildApprovedSourcePlans`, extracts `extractionMode` (default `"mixed"`) and `forceRefresh` (default `false`) from `options`.

#### 3. Existing-sources query for dedup (step 2b)
- After product loading and branded SKU identification, queries `products_ingestion` (`sku, sources`) for all branded SKUs in a single batch — only when `forceRefresh` is `false`.
- Builds a `Map<sku, sources>` called `existingSourcesBySku` for use in the dedup filter.

#### 4. Helper: `isSourceRecentlySuccessful()`
- Checks `sources.enriched` for the given SKU.
- Returns `true` only if ALL conditions met:
  - `extracted_at` exists and is within 48h.
  - Enriched result has non-empty `name`/`title`.
  - Enriched result has non-empty `images`/`image_urls` array.
  - `source_results[]` contains an entry with matching `sourceSlug` and `confidence >= 0.6`.
- Returns `false` if any condition fails or data is missing.

#### 5. Dedup filtering in plan building (step 5)
- After entries are constructed and ordered, if `existingSourcesBySku` is available, filters entries by removing those where `isSourceRecentlySuccessful()` returns `true`.
- Logs skipped source slugs per SKU via `console.log`.

#### 6. AI-only gate
- After dedup filtering: if `orderedEntries` is empty AND `extractionMode === "ai_only"`, returns:
  `{ ok: false, sku, error: "AI-only mode requested but all sources already enriched within 48h. Use forceRefresh to re-scrape." }`

#### 7. AI-only mode: clear entries
- If `extractionMode === "ai_only"`, clears the `orderedEntries` array to empty (no deterministic extraction).

#### 8. Non-AI-only fallbacks
- The catalog fallback, enrichment config fallback, and empty plan guard are wrapped in `if (extractionMode !== "ai_only")` to skip them when in AI-only mode.

#### 9. ExtractionMode LLM policy overrides
- After the LLM policy is merged (`DEFAULT_LLM_POLICY` + `llmPolicyOverride`), applies extractionMode overrides:
  - `distributor_only`: `llmPolicy.enabled = false`
  - `ai_only`: `llmPolicy.enabled = true`
- `extractionMode` takes precedence over `llmPolicyOverride` for the `enabled` field.

## Backward Compatibility

- When `extractionMode` is not provided (defaults to `"mixed"`), the behavior is identical to before.
- When `forceRefresh` is not provided (defaults to `false`), dedup runs normally (querying existing sources).
- When `forceRefresh` is `true`, the existing-sources query is skipped entirely, and no dedup filtering occurs.

## TypeScript Verification

```
$ cd apps/web && npx tsc --noEmit --pretty
# Only pre-existing errors in __tests__/app/api/admin/pipeline/scrapers/[slug]/credentials/route.test.ts
# No errors in source-plan.ts or any related file
```

## Risks / Open Questions

1. **Time dependency**: `isSourceRecentlySuccessful` uses `Date.now()` which is runtime-dependent. SKUs enriched just under 48h ago will be skipped, potentially missing updates. This is by design.
2. **Graceful degradation**: If the `products_ingestion` query fails (e.g., column doesn't exist or is not JSONB), `existingSourcesBySku` stays `undefined` and dedup is silently skipped — no user-facing error.
3. **Source slug matching**: The `source_results` comparison uses exact `sourceSlug` matching. If the runner stores slugs differently than the plan builder, the dedup check won't match.

## Next Steps

- The `apps/web/app/api/admin/enrichment/jobs/route.ts` caller already passes `extractionMode`/`forceRefresh` through to `buildApprovedSourcePlans` — integration is complete.
- No further code changes needed in this module.
