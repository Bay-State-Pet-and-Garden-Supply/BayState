# Implementation Plan

## Goal
Fix approved-source distributor extraction so run-mode metadata is separated from extraction-schema metadata, per-distributor identity is preserved in storage and the Processed UI, and `distributor_only` runs do not create misleading mixed-mode retries or duplicate fallback runs.

## Tasks

1. **Confirm two product/API decisions before code changes**
   - File: N/A
   - Changes: Decide and document:
     - Whether `distributor_only` with no `selectedDistributorSlug` means "all enabled distributors" or should require exactly one distributor. Recommended: keep "all enabled distributors" for the current Management Panel multi-toggle, but if `selectedDistributorSlug` is provided, run only that distributor.
     - Which source should populate legacy top-level `sources.enriched` aliases when multiple distributor snapshots exist. Recommended: latest successful accepted callback, while all per-distributor snapshots remain available under a nested map.
   - Acceptance: Decision is recorded in the implementation PR description and reflected in source-plan/UI tests.

2. **Separate request/run mode from enrichment execution mode in contracts**
   - File: `apps/web/lib/enrichment/contracts.ts`
   - Changes:
     - Keep `EnrichmentResultV1.mode` as the worker execution strategy (`structured | metadata | llm | mixed`). Do not use it for `distributor_only` or `ai_only`.
     - Add a separate `ExtractionRequestMode`/`RequestedExtractionMode` type (`mixed | distributor_only | ai_only`).
     - Add optional `requested_extraction_mode?: ExtractionRequestMode` to `EnrichmentResultV1` and `NormalizedEnrichedSourceV1`.
     - Add top-level provenance fields to `NormalizedEnrichedSourceV1`: `source_slug?: string | null`, `source_type?: string | null`, `source_label?: string | null`, `active_source_slug?: string | null`.
     - Add a nested per-source snapshot map, e.g. `approved_sources?: Record<string, ApprovedSourceSnapshotV1>`, where each snapshot preserves aliases, `extracted`, confidence, validation, attempts, `source_results`, and source provenance for one canonical distributor/approved source slug.
   - File: `apps/web/lib/enrichment/validation.ts`
   - Changes: Accept optional `requested_extraction_mode`; keep existing `mode` enum unchanged for backwards compatibility.
   - File: `apps/scraper/scrapers/ai_search/enrichment_models.py`
   - Changes: Add optional `requested_extraction_mode` to the Pydantic model; do not set `mode="distributor_only"` because web validation should continue treating `mode` as execution strategy.
   - Acceptance: Existing v1 callback payloads without `requested_extraction_mode` still validate; new payloads with `requested_extraction_mode: "distributor_only"` validate.

3. **Add source-plan request mode to the coordinator/runner contract**
   - File: `apps/web/lib/approved-sources/types.ts`
   - Changes: Add `extractionMode: ExtractionMode` to `ApprovedSourcePlan`.
   - File: `apps/web/lib/approved-sources/source-plan.ts`
   - Changes: Populate `plan.extractionMode = extractionMode` for every generated plan.
   - File: `apps/scraper/scrapers/approved_sources/types.py`
   - Changes: Add `extractionMode: str = "mixed"` to `ApprovedSourcePlan` and parse it in `parse_source_plan()`.
   - Acceptance: A claimed approved-source job contains the same request mode in `attempt.mode`, `job_config.extraction_mode`, and `source_plan.extractionMode`.

4. **Centralize legacy alias generation instead of letting flat and nested fields drift**
   - File: `apps/web/lib/enrichment/normalize-result.ts`
   - Changes:
     - Add a small helper such as `buildLegacyEnrichedAliases(product, source, confidence)` that derives top-level `title`, `name`, `brand`, `description`, `category`, `weight`, `images`, `image_urls`, `url`, and `confidence_score` only from `result.product`, `result.source`, and `result.confidence`.
     - Update `normalizeEnrichmentResultForSources()` to call that helper and add `requested_extraction_mode`, `source_slug`, `source_type`, `source_label`, and `active_source_slug`.
     - Keep all existing top-level aliases; do not move or remove them.
   - New File: `apps/web/lib/enrichment/merge-enriched-source.ts`
   - Changes: Add pure helpers for merging an incoming normalized enrichment result into an existing `sources.enriched` object.
   - Acceptance: Unit tests can prove aliases equal the nested `extracted` values for new normalized records.

5. **Merge enriched callbacks by source slug instead of overwriting distributor identity**
   - File: `apps/web/lib/enrichment/merge-enriched-source.ts`
   - Changes:
     - Implement `mergeEnrichedSource(existing, incoming)`.
     - Determine canonical slug from `incoming.source_slug`, `incoming.active_source_slug`, or the first `incoming.source_results[].sourceSlug`.
     - Upsert `incoming` into `existing.approved_sources[canonicalSlug]`.
     - Merge `source_results` by `sourceSlug`, preserving successful/high-confidence entries and retaining failure evidence without letting failures satisfy dedup.
     - Preserve previous `approved_sources` entries when a later callback succeeds for another distributor.
     - Preserve legacy top-level aliases on `sources.enriched` using the accepted incoming successful/partial result; for failed terminal callbacks with no product facts, update attempt/evidence metadata without replacing a previous useful top-level product snapshot.
   - File: `apps/web/app/api/scraper/v1/enrichment-callback/route.ts`
   - Changes:
     - Replace `{ ...currentSources, enriched: normalized }` with the merge helper.
     - Extend the attempt query to select `mode`, `attempt_number`, and `enrichment_jobs(config, mode, test_mode)` so the callback can derive the original requested extraction mode.
     - Pass the derived requested mode into normalization/merge.
   - Acceptance: Two callbacks for the same SKU from `phillips` and `bradley` result in one `sources.enriched` key with `approved_sources.phillips` and `approved_sources.bradley`; legacy `sources.enriched.title/images` still exist.

6. **Fix retry mode propagation and terminal retry behavior**
   - File: `apps/web/app/api/scraper/v1/enrichment-callback/route.ts`
   - Changes:
     - Derive `requestedMode` from `attemptData.mode`, then `attemptData.enrichment_jobs.mode`, then `attemptData.enrichment_jobs.config.extraction_mode`, falling back to `enrichedResult.requested_extraction_mode` and finally `"mixed"`.
     - Insert retry attempts with `mode: requestedMode`, not `mode: enrichedResult.mode`.
     - Add a helper such as `shouldRetryEnrichmentResult(result, attempt, requestedMode)`.
     - For approved-source `distributor_only` terminal failures (`AUTH_REQUIRED`, `AUTH_FAILED`, `AUTH_EXPIRED`, `POLICY_BLOCKED`, clear `NO_MATCH`) do not enqueue repeated retries unless there is evidence of a transient extraction/runtime error.
     - Keep the existing max retry budget for transient failures; do not change thresholds without a product decision.
   - Acceptance: A failed `distributor_only` callback never creates a retry row with `mode = "mixed"`; auth/no-match terminal failures do not enqueue three identical retries.

7. **Fix source-plan ordering, filtering, dedup, and fallback sequencing**
   - File: `apps/web/lib/approved-sources/source-plan.ts`
   - Changes:
     - Build all candidate entries first, including catalog/enrichment-config fallbacks when applicable.
     - Apply extraction-mode filtering before dedup:
       - `ai_only`: only `sourceType === "official_brand"`.
       - `distributor_only`: only `sourceType === "distributor"` unless Task 1 decides otherwise.
       - `distributor_only + selectedDistributorSlug`: only the selected canonical distributor slug.
     - Apply dedup after mode/selected filtering so a fresh selected distributor is skipped rather than replaced by another distributor.
     - Prevent catalog fallback from re-adding a source that dedup already skipped as fresh.
     - Add an explicit skipped/fresh outcome to `SourcePlanResult` or a clear error reason consumed by the jobs API so "nothing to run because all requested sources are fresh" is not treated as "run another distributor".
   - File: `apps/web/app/api/admin/enrichment/jobs/route.ts`
   - Changes: Treat all-fresh source-plan outcomes as skipped SKUs with a user-readable response; do not create attempts for those SKUs.
   - Acceptance: Re-running `distributor_only` for a recently successful selected distributor creates no attempt unless `forceRefresh` is true.

8. **Propagate requested extraction mode and aggregate source attempt evidence in the runner**
   - File: `apps/scraper/scrapers/approved_sources/result_builder.py`
   - Changes:
     - Add optional `requested_extraction_mode: str | None = None` to builder functions.
     - Set `requested_extraction_mode` on returned `EnrichmentResultV1`.
     - Leave `mode` as an execution strategy (`mixed` for approved-source orchestration unless a more specific execution strategy is known).
   - File: `apps/scraper/scrapers/approved_sources/executor.py`
   - Changes:
     - Collect `source_results` from every attempted source.
     - When returning the first accepted success/partial, attach the aggregate `source_results` so auth/no-match attempts are visible and the successful source remains identifiable.
     - When all sources fail, return a failed result that includes aggregate source_results rather than an empty generic failure.
     - Pass `self.plan.extractionMode` into builder calls/results.
   - File: `apps/scraper/runner/__init__.py`
   - Changes:
     - When constructing error results for missing/invalid source plans or executor exceptions, set `requested_extraction_mode` from `attempt.mode` or `job_payload.extraction_mode`.
     - Include `requested_extraction_mode` in `results["data"][sku]["enrichment"]` for local/debug visibility.
   - Acceptance: Scraper unit tests show a `distributor_only` approved-source result has `requested_extraction_mode == "distributor_only"`, `mode == "mixed"`, and `source_results` includes all attempted sources.

9. **Update Processed UI to show per-distributor enriched snapshots**
   - File: `apps/web/components/admin/pipeline/ProcessedResultsView.tsx`
   - Changes:
     - Build source tabs from a display view model instead of raw `Object.keys(sources)` only.
     - Keep legacy `enriched` support; if `sources.enriched.approved_sources` exists, add virtual tab keys such as `enriched:phillips`, `enriched:bradley`.
     - Resolve `currentSourceData` for virtual tabs from `sources.enriched.approved_sources[slug]`.
     - Label virtual tabs with `formatSourceSlug(slug)` plus an enriched marker (for example, `Phillips Pet (Enriched)`) instead of one collapsed `Enriched (A, B, C)` tab.
     - Keep the aggregate `enriched` tab as `Enriched Summary` or hide it behind a small summary tab, per Task 1 UX decision.
     - Disable existing source deletion for nested enriched virtual tabs unless a nested-delete endpoint is added.
   - New File: `apps/web/components/admin/pipeline/enriched-source-view-model.ts` (or equivalent local helper)
   - Changes: Extract display-source-key construction and resolution into a testable helper.
   - Acceptance: A product with `approved_sources.phillips` and `approved_sources.orgill` displays separate Processed tabs; a legacy product with only `sources.enriched.source_results` still displays a usable `Enriched` tab.

10. **Add/extend web unit tests**
   - File: `apps/web/__tests__/lib/approved-sources/source-plan-modes.test.ts`
   - Changes: Add cases for `distributor_only + selectedDistributorSlug` including only that slug, and `distributor_only` excluding `official_brand`, `internal`, and `licensed_feed` unless Task 1 decides otherwise.
   - File: `apps/web/__tests__/lib/approved-sources/source-plan-dedup.test.ts`
   - Changes: Add cases proving a fresh selected distributor is skipped and not replaced by another distributor or catalog fallback; `forceRefresh` still includes it.
   - New File: `apps/web/__tests__/lib/enrichment/merge-enriched-source.test.ts`
   - Changes: Cover per-source map upsert, source_results merge, failed terminal callback preserving previous useful aliases, and legacy record compatibility.
   - New File: `apps/web/__tests__/app/api/scraper/v1/enrichment-callback-route.test.ts` (or extend an existing callback-route test if one is added by the implementer)
   - Changes: Mock Supabase calls to assert retry rows use original requested mode and terminal distributor-only failures do not retry.
   - New File: `apps/web/__tests__/components/admin/pipeline/enriched-source-view-model.test.ts`
   - Changes: Verify virtual tab keys and labels for `approved_sources` plus fallback for old collapsed enriched data.
   - Acceptance: Focused web tests pass with `bun run web test -- --testPathPatterns="approved-sources|enrichment|ProcessedResultsView|enriched-source"`.

11. **Add/extend scraper unit tests**
   - File: `apps/scraper/tests/unit/test_approved_sources_result_builder.py`
   - Changes: Assert every builder preserves `requested_extraction_mode` when supplied and still uses a valid execution `mode`.
   - File: `apps/scraper/tests/unit/test_approved_sources_executor.py`
   - Changes: Add multi-source attempt tests where Phillips auth fails then Bradley succeeds; final result should identify Bradley as the accepted source and include both Phillips failure and Bradley success in `source_results`.
   - File: `apps/scraper/tests/unit/test_api_client_claim.py`
   - Changes: Assert claimed approved-source payload preserves `mode` and `source_plan.extractionMode`.
   - Acceptance: `cd apps/scraper && python -m pytest tests/unit/test_approved_sources_result_builder.py tests/unit/test_approved_sources_executor.py tests/unit/test_api_client_claim.py` passes.

12. **Add a safe backfill/inspection script for existing rows**
   - New File: `apps/web/scripts/backfill-enriched-approved-sources.ts`
   - Changes:
     - Dry-run by default.
     - Find `products_ingestion.sources.enriched` records with `source_results[]` but missing `approved_sources`.
     - If a single source slug is present, copy the current enriched object into `approved_sources[slug]` and set `source_slug`/`active_source_slug`.
     - If multiple source slugs are present in old collapsed data, do not invent per-source product facts; only populate `approved_sources[activeSlug]` from the current snapshot and report unrecoverable historical ambiguity.
     - Include counts for updated, skipped, ambiguous, and invalid rows.
   - Acceptance: Dry-run prints counts and sample SKUs; write mode requires an explicit flag and leaves top-level aliases unchanged.

13. **Validate end-to-end and roll out in a backward-compatible order**
   - File: N/A
   - Changes:
     - Deploy web contract/validation/merge/UI changes before deploying scraper changes so old and new runner payloads are both accepted.
     - Deploy scraper changes after web accepts `requested_extraction_mode`.
     - Run the backfill script in dry-run mode, review ambiguous rows, then run write mode only if needed.
     - Manual QA: start a `distributor_only` run for a SKU with multiple enabled distributors, verify the Active job badge remains `distributor_only`, callback stores per-source identity, Processed UI shows separate enriched distributor tabs, and an immediate rerun without `forceRefresh` does not enqueue a misleading mixed-mode duplicate.
   - Acceptance: Focused web tests, scraper tests, and one manual QA run pass before enabling broadly.

## Files to Modify

- `apps/web/lib/enrichment/contracts.ts` - add requested extraction mode and per-source snapshot contract while preserving aliases.
- `apps/web/lib/enrichment/validation.ts` - accept optional requested extraction mode in callback payloads.
- `apps/web/lib/enrichment/normalize-result.ts` - centralize alias generation and source provenance normalization.
- `apps/web/lib/approved-sources/types.ts` - include extraction mode on source plans and optionally richer skip reasons.
- `apps/web/lib/approved-sources/source-plan.ts` - fix mode filtering, selected-distributor exclusivity, dedup, and fallback ordering.
- `apps/web/app/api/admin/enrichment/jobs/route.ts` - handle all-fresh/skipped source-plan outcomes and preserve mode metadata.
- `apps/web/app/api/scraper/v1/enrichment-callback/route.ts` - derive requested mode from the attempt/job, merge enriched data by source slug, and fix retry insertion.
- `apps/web/components/admin/pipeline/ProcessedResultsView.tsx` - render per-source enriched snapshots instead of a collapsed distributor list.
- `apps/scraper/scrapers/ai_search/enrichment_models.py` - add optional requested extraction mode to the Pydantic payload model.
- `apps/scraper/scrapers/approved_sources/types.py` - parse source-plan extraction mode.
- `apps/scraper/scrapers/approved_sources/result_builder.py` - accept/pass requested extraction mode while leaving execution `mode` valid.
- `apps/scraper/scrapers/approved_sources/executor.py` - aggregate source_results and preserve accepted-source identity.
- `apps/scraper/runner/__init__.py` - propagate requested extraction mode for approved-source success and error paths.
- Test files listed in Tasks 10 and 11.

## New Files

- `apps/web/lib/enrichment/merge-enriched-source.ts` - pure merge helper for `sources.enriched` per-source snapshots.
- `apps/web/components/admin/pipeline/enriched-source-view-model.ts` - testable helper for Processed UI virtual enriched source tabs.
- `apps/web/__tests__/lib/enrichment/merge-enriched-source.test.ts` - merge contract tests.
- `apps/web/__tests__/components/admin/pipeline/enriched-source-view-model.test.ts` - Processed UI view-model tests.
- `apps/web/__tests__/app/api/scraper/v1/enrichment-callback-route.test.ts` - retry/mode callback tests if no existing route test is extended.
- `apps/web/scripts/backfill-enriched-approved-sources.ts` - dry-run-first JSONB backfill/inspection script.

## Dependencies

- Task 1 decisions should be made before Tasks 7 and 9.
- Tasks 2 and 3 should land before scraper propagation in Task 8.
- Task 4 should land before Task 5 because callback merge depends on normalized provenance fields.
- Task 5 should land before Task 9 so the UI has stable `approved_sources` data to render.
- Task 6 depends on callback query changes from Task 5.
- Task 12 should run only after Tasks 2, 4, and 5 define the final storage shape.
- Rollout in Task 13 depends on all tests in Tasks 10 and 11.

## Risks

- Existing data cannot reconstruct overwritten distributor facts. Backfill can only preserve the current collapsed snapshot under the best-known slug.
- Removing top-level `sources.enriched` aliases would break consolidation, image selection, dedup, and admin UI; this plan intentionally keeps them.
- `products_ingestion.sources` updates are still last-writer-wins. The merge helper reduces data loss for sequential callbacks but does not fully solve concurrent callback races; consider a later RPC/transaction if races are observed.
- Changing `distributor_only` semantics without a UX decision can surprise users who currently enable multiple distributors in the Management Panel.
- Nested enriched virtual tabs should not reuse the existing source-delete action until a nested deletion contract exists.
- Retry classification based on warning strings is brittle; a later improvement should add explicit source-level failure codes to `SourceResultInfo`.

## Non-Goals

- Do not remove or rename `sources.enriched`.
- Do not remove top-level legacy aliases (`title`, `name`, `images`, `image_urls`, `confidence_score`, etc.).
- Do not introduce direct database access in the scraper runner.
- Do not change confidence thresholds, retry budgets, or consolidation trust ranking unless a separate product decision is made.
- Do not attempt to fully recover historical per-distributor product facts that were already overwritten by prior collapsed callbacks.
