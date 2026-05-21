# Implementation Plan

## Goal
Fix approved-source distributor extraction so compatibility aliases remain safe, per-distributor identity is preserved as separate reviewable sources, and `distributor_only` runs no longer produce misleading `mixed` retries or duplicate fallback attempts.

## Tasks

### Phase 0 — Required decisions before implementation

1. **Confirm `distributor_only` source scope**
   - File: N/A
   - Changes: Decide the product/API semantics for `distributor_only`.
     - Recommended: if `selectedDistributorSlug` is provided, run only that distributor; if not provided, run all enabled distributors.
     - Keep `forceRefresh` as the explicit way to rerun a recently successful selected distributor.
   - Acceptance: Decision is recorded in the PR and reflected in source-plan tests.

2. **Confirm consolidation source-of-truth after dual-write**
   - File: N/A
   - Changes: Decide whether consolidation should read the `enriched` aggregate, the new per-distributor source records, or both.
     - Recommended: keep `sources.enriched` as the consolidation source-of-truth for now, and mark per-distributor approved-source records as review/UI records to avoid double-counting the same facts.
   - Acceptance: Decision is documented and implemented in `apps/web/lib/product-sources.ts` tests.

3. **Confirm retry policy for approved-source failures**
   - File: N/A
   - Changes: Decide whether approved-source failures should use the generic callback retry loop.
     - Recommended: do not auto-retry approved-source terminal failures (`AUTH_REQUIRED`, `AUTH_FAILED`, `AUTH_EXPIRED`, policy blocked, no match); the executor already walks the full plan once. Reserve future retries for explicitly retryable/transient failures.
   - Acceptance: Callback tests assert terminal approved-source failures do not enqueue duplicate retry attempts.

### Phase 1 — Separate job/request mode from extraction execution mode

4. **Add explicit job mode fields to web contracts**
   - File: `apps/web/lib/enrichment/contracts.ts`
   - Changes:
     - Keep `EnrichmentResultV1.mode` as the execution strategy (`structured | metadata | llm | mixed`). Do not overload it with `distributor_only` or `ai_only`.
     - Add `ExtractionJobMode = "mixed" | "distributor_only" | "ai_only"`.
     - Add optional `job_mode?: ExtractionJobMode` to `EnrichmentResultV1` and `NormalizedEnrichedSourceV1`.
     - Add optional source provenance fields to `NormalizedEnrichedSourceV1`: `source_slug?: string | null`, `source_type?: string | null`, `approved_source_id?: string | null`.
   - File: `apps/web/lib/enrichment/validation.ts`
   - Changes: Accept optional `job_mode` and the new optional provenance fields while keeping existing `mode` validation unchanged.
   - Acceptance: Existing callback payloads without `job_mode` still validate; new payloads with `job_mode: "distributor_only"` validate.

5. **Add explicit job mode fields to scraper models/builders**
   - File: `apps/scraper/scrapers/ai_search/enrichment_models.py`
   - Changes: Add optional `job_mode: Optional[str] = None` to `EnrichmentResultV1`; keep `mode` pattern compatible with existing web validation.
   - File: `apps/scraper/scrapers/approved_sources/result_builder.py`
   - Changes: Add optional `job_mode: str | None = None` to all result builder functions and set it on returned results.
   - File: `apps/scraper/runner/__init__.py`
   - Changes:
     - Derive approved-source `job_mode` from `attempt.mode`, then `job_payload.extraction_mode`, then `job_payload.mode`, falling back to `"mixed"`.
     - Use `job_mode` in runner logs/debug result payloads instead of defaulting approved-source telemetry to `"mixed"`.
     - Pass `job_mode` into approved-source success and error result construction.
   - Acceptance: Scraper unit tests show an approved-source `distributor_only` result has `job_mode == "distributor_only"` and `mode == "mixed"`.

6. **Normalize and persist job mode in callback output**
   - File: `apps/web/lib/enrichment/normalize-result.ts`
   - Changes:
     - Preserve all existing top-level aliases (`title`, `name`, `images`, `image_urls`, `confidence_score`, etc.).
     - Copy `result.job_mode` into `NormalizedEnrichedSourceV1.job_mode`.
     - Populate source provenance from `result.source`.
     - Centralize alias generation in a helper so aliases are always derived from `result.product` and cannot drift from `extracted`.
   - Acceptance: Unit tests assert aliases equal the corresponding `extracted` values and `job_mode` survives normalization.

### Phase 2 — Fix source-plan semantics and no-op dedup behavior

7. **Apply mode/selected filtering before dedup and fallback**
   - File: `apps/web/lib/approved-sources/source-plan.ts`
   - Changes:
     - Build candidate entries first.
     - Apply extraction-mode filtering before dedup:
       - `ai_only`: only `official_brand`.
       - `distributor_only`: only distributors.
       - `distributor_only + selectedDistributorSlug`: only the selected canonical distributor if Phase 0 approves.
     - Apply catalog/enrichment-config fallback before dedup only for missing selected/configured candidates.
     - Apply dedup last so a fresh selected distributor is skipped, not replaced by another distributor or re-added by catalog fallback.
   - Acceptance: Re-running `distributor_only` for fresh Phillips does not produce a Bradley/Orgill fallback plan unless `forceRefresh` is true.

8. **Represent all-fresh source plans as skipped work**
   - File: `apps/web/lib/approved-sources/types.ts`
   - Changes: Extend `SourcePlanResult` with a skipped/no-op outcome, for example `{ ok: false; sku: string; skipped: true; reason: "recent_success"; error: string }`.
   - File: `apps/web/app/api/admin/enrichment/jobs/route.ts`
   - Changes:
     - Treat all-fresh SKUs as skipped, not errors and not runnable attempts.
     - If all requested SKUs are skipped, return a clear success/no-op response or a clear user-facing non-error response per existing UI expectations.
   - Acceptance: No `enrichment_jobs` or `enrichment_attempts` rows are created for all-fresh selected-distributor reruns without `forceRefresh`.

### Phase 3 — Preserve per-distributor source identity in storage

9. **Add approved-source storage helpers for dual-write**
   - New File: `apps/web/lib/enrichment/approved-source-storage.ts`
   - Changes:
     - Add `getApprovedSourceStorageKey(sourceSlug)` to map runner slugs to UI/source keys (`central_pet` → `central-pet`, `pet_food_experts` → `petfoodex`, etc.).
     - Add `buildApprovedSourceRecord(normalized, result, attemptContext)` that returns a flat canonical source record for the accepted source only, with compatibility fields but without the nested `extracted` blob in the top-level review record.
     - Add `_provenance: { source_kind: "approved_source", source_slug, source_type, extracted_at, job_mode, attempt_id, confidence, decision, llm_used, consolidation_excluded: true }`.
     - Add `mergeApprovedSourceResultIntoSources(currentSources, normalized, result, attemptContext)` that:
       - keeps/updates `sources.enriched` as the backward-compatible aggregate,
       - merges `sources.enriched.source_results` by `sourceSlug`,
       - writes the accepted successful/partial distributor to `sources[storageKey]`,
       - never creates top-level distributor records for failed/no-product source attempts.
   - Acceptance: Two callbacks for the same SKU from Phillips then Orgill produce `sources.enriched`, `sources.phillips`, and `sources.orgill` without losing either distributor record.

10. **Use dual-write helper in the enrichment callback**
    - File: `apps/web/app/api/scraper/v1/enrichment-callback/route.ts`
    - Changes:
      - Extend the attempt query to select `mode`, `model`, `source_url`, `attempt_number`, `config_id`, and `enrichment_jobs(config, mode, test_mode)`.
      - Derive `jobMode` from `attemptData.mode`, job mode/config, then `enrichedResult.job_mode`, then `"mixed"`.
      - Pass normalized result and attempt context to `mergeApprovedSourceResultIntoSources()` instead of directly assigning `enriched: normalized`.
      - Preserve current test-job behavior (no `products_ingestion` update).
    - Acceptance: Callback route tests verify dual-write and legacy `sources.enriched` compatibility.

11. **Prevent consolidation double-counting dual-written records**
    - File: `apps/web/lib/product-sources.ts`
    - Changes:
      - In `buildConsolidationSourcesPayload()`, filter out per-distributor records whose `_provenance.source_kind === "approved_source"` and `_provenance.consolidation_excluded === true` when `sources.enriched` is present.
      - Leave normalization, image extraction, and Processed UI source display unaffected.
    - Acceptance: Consolidation payload contains `enriched` once and does not include duplicate `phillips`/`orgill` review records unless Phase 0 chooses per-distributor consolidation instead.

### Phase 4 — Fix retry and attempt evidence behavior

12. **Use original job mode for retry rows and suppress approved-source terminal retries**
    - File: `apps/web/app/api/scraper/v1/enrichment-callback/route.ts`
    - Changes:
      - Change retry insertion from `mode: enrichedResult.mode` to `mode: jobMode`.
      - Add `isApprovedSourceJob()` based on job config/source URL/result provenance.
      - Add `shouldRetryEnrichmentResult(result, attempt, context)`; for approved-source terminal failures return `false` unless a future explicit retryable marker is present.
      - Keep existing confidence thresholds and retry budget for non-approved-source URL extraction.
    - Acceptance: A failed `distributor_only` approved-source callback does not enqueue a `mixed` retry and does not enqueue duplicate terminal attempts.

13. **Aggregate all attempted source evidence in the scraper executor**
    - File: `apps/scraper/scrapers/approved_sources/result_builder.py`
    - Changes:
      - Add optional status/error fields to `SourceResultInfo` where supported by the models.
      - Populate source result status for success, partial, auth, no-match, policy-blocked, and failed results.
      - Let `build_failed_result()` accept optional accumulated `source_results`.
    - File: `apps/scraper/scrapers/approved_sources/executor.py`
    - Changes:
      - Accumulate `source_results` from every attempted source.
      - Attach accumulated evidence to the accepted success/partial result before returning.
      - On total failure, return a failed result containing all accumulated source evidence instead of an empty generic failure.
    - File: `apps/web/lib/enrichment/contracts.ts`
    - Changes: Add optional `status?: string` and `error?: string | null` to `SourceResultInfo`.
    - File: `apps/web/lib/enrichment/validation.ts`
    - Changes: Accept optional `status` and `error` on `source_results[]`.
    - Acceptance: Phillips auth failure followed by Bradley success returns Bradley as the accepted source and includes both Phillips and Bradley in `source_results`.

### Phase 5 — Make Processed UI show canonical output and separate sources

14. **Render approved-source distributor tabs as separate sources**
    - File: `apps/web/components/admin/pipeline/ProcessedResultsView.tsx`
    - Changes:
      - Stop labeling `sources.enriched` as `Enriched (Phillips, Orgill, ...)`.
      - Label `sources.enriched` as `Enriched Summary` or `Enriched Aggregate`.
      - Let top-level dual-written keys (`phillips`, `orgill`, `central-pet`, `petfoodex`, `bradley`) render as normal separate tabs with friendly names.
      - Prefer the first top-level approved-source tab over `enriched` as the default active tab when present, or keep `enriched` default if Phase 0 chooses aggregate-first UX.
      - Keep delete disabled for `enriched`; existing delete behavior may remain enabled for top-level distributor records.
    - Acceptance: A product with `sources.phillips` and `sources.orgill` displays separate `Phillips Pet` and `Orgill` tabs instead of one collapsed `Enriched (...)` tab.

15. **Show canonical JSON in the Processed technical block**
    - File: `apps/web/components/admin/pipeline/ProcessedResultsView.tsx`
    - Changes:
      - Add a local helper or extracted helper to build review JSON.
      - For `enriched`, show a grouped object such as `{ canonical: extracted, source_results, confidence, validation, metadata, compatibility_aliases }` so aliases are not interleaved with nested product facts.
      - For dual-written distributor records, show the flat canonical record plus provenance.
      - Do not change persisted `sources.enriched` aliases.
    - Acceptance: Raw/technical view no longer appears to mix two schemas at the same level, while DB compatibility fields still exist.

### Phase 6 — Tests and validation

16. **Add web tests for source-plan behavior**
    - File: `apps/web/__tests__/lib/approved-sources/source-plan-modes.test.ts`
    - Changes: Add `distributor_only + selectedDistributorSlug` selected-only tests and no-selected all-distributors tests.
    - File: `apps/web/__tests__/lib/approved-sources/source-plan-dedup.test.ts`
    - Changes: Add tests proving fresh selected distributors are skipped and not replaced or re-added by fallback; `forceRefresh` still runs them.
    - Acceptance: `bun run web test -- --testPathPatterns="approved-sources"` passes.

17. **Add web tests for normalization, storage, callback, and consolidation filtering**
    - New File: `apps/web/__tests__/lib/enrichment/approved-source-storage.test.ts`
    - Changes: Test storage-key mapping, aggregate `source_results` merge, dual-write per distributor, and failed-result no-op for top-level source records.
    - New File: `apps/web/__tests__/lib/enrichment/normalize-result.test.ts`
    - Changes: Test alias/canonical consistency and `job_mode` preservation.
    - New File: `apps/web/__tests__/app/api/scraper/v1/enrichment-callback-route.test.ts`
    - Changes: Mock Supabase to assert callback uses original job mode for retries, suppresses approved-source terminal retries, and dual-writes sources.
    - File: `apps/web/__tests__/lib/product-sources.test.ts`
    - Changes: Add coverage that consolidation payload excludes `_provenance.consolidation_excluded` approved-source records when `enriched` exists.
    - Acceptance: `bun run web test -- --testPathPatterns="enrichment|product-sources"` passes.

18. **Add UI/view-model tests or manual UI validation**
    - File: `apps/web/components/admin/pipeline/ProcessedResultsView.tsx` or new helper if extracted.
    - Changes: If component testing is available, add tests for tab labels and canonical JSON helper. If not, document manual UI QA steps in the PR.
    - Acceptance: UI validation confirms separate distributor tabs and canonical technical JSON for legacy and new records.

19. **Add scraper unit tests**
    - File: `apps/scraper/tests/unit/test_approved_sources_result_builder.py`
    - Changes: Assert all builder functions preserve `job_mode` when provided and include source result status/error metadata.
    - File: `apps/scraper/tests/unit/test_approved_sources_executor.py`
    - Changes: Add multi-source test for auth/no-match followed by success; final result has accepted source plus accumulated source evidence.
    - File: `apps/scraper/tests/unit/test_enrichment_submission.py` or a new runner-focused test if existing patterns fit better.
    - Changes: Assert approved-source runner logs/results use `job_mode` rather than defaulting to `mixed`.
    - Acceptance: `cd apps/scraper && python -m pytest tests/unit/test_approved_sources_result_builder.py tests/unit/test_approved_sources_executor.py tests/unit/test_enrichment_submission.py` passes.

20. **Run focused validation before rollout**
    - File: N/A
    - Changes:
      - Web: `bun run web test -- --testPathPatterns="approved-sources|enrichment|product-sources"`.
      - Scraper: `cd apps/scraper && python -m pytest tests/unit/test_approved_sources_result_builder.py tests/unit/test_approved_sources_executor.py tests/unit/test_enrichment_submission.py`.
      - Manual: start a `distributor_only` run with a selected distributor, verify the Active badge remains `distributor_only`, Processed shows a distributor tab, immediate rerun without `forceRefresh` is skipped/no-op, and no retry row appears with `mode = "mixed"`.
    - Acceptance: Focused tests and one manual approved-source QA scenario pass.

## Files to Modify

- `apps/web/lib/enrichment/contracts.ts` - add `job_mode`, source provenance fields, and optional source-result status/error metadata.
- `apps/web/lib/enrichment/validation.ts` - accept additive callback fields while keeping execution `mode` validation unchanged.
- `apps/web/lib/enrichment/normalize-result.ts` - centralize alias generation and preserve `job_mode`/source provenance.
- `apps/web/lib/approved-sources/types.ts` - add skipped/no-op source-plan result shape if needed.
- `apps/web/lib/approved-sources/source-plan.ts` - reorder filtering/dedup/fallback and implement selected-distributor exclusivity.
- `apps/web/app/api/admin/enrichment/jobs/route.ts` - handle all-fresh skipped plans without creating attempts.
- `apps/web/app/api/scraper/v1/enrichment-callback/route.ts` - derive original job mode, dual-write approved-source records, and fix retry behavior.
- `apps/web/lib/product-sources.ts` - avoid consolidation double-counting of review-only approved-source records.
- `apps/web/components/admin/pipeline/ProcessedResultsView.tsx` - show separate distributor tabs and canonical technical JSON.
- `apps/scraper/scrapers/ai_search/enrichment_models.py` - add optional `job_mode` and source-result metadata.
- `apps/scraper/scrapers/approved_sources/result_builder.py` - propagate `job_mode` and richer source evidence.
- `apps/scraper/scrapers/approved_sources/executor.py` - aggregate source evidence across attempted sources.
- `apps/scraper/runner/__init__.py` - derive/log/pass approved-source `job_mode`.
- Test files listed in Tasks 16-19.

## New Files

- `apps/web/lib/enrichment/approved-source-storage.ts` - pure helpers for source-key mapping, aggregate merge, and per-distributor dual-write records.
- `apps/web/__tests__/lib/enrichment/approved-source-storage.test.ts` - storage and merge behavior tests.
- `apps/web/__tests__/lib/enrichment/normalize-result.test.ts` - alias/canonical and `job_mode` normalization tests.
- `apps/web/__tests__/app/api/scraper/v1/enrichment-callback-route.test.ts` - callback retry/mode/dual-write tests if no existing callback test is extended.
- Optional: `apps/web/components/admin/pipeline/processed-source-review.ts` - extracted UI helper for tab ordering and canonical review JSON if keeping this logic out of `ProcessedResultsView.tsx` improves testability.
- Optional: `apps/web/scripts/backfill-approved-source-records.ts` - dry-run-first backfill script for existing collapsed `sources.enriched` rows.

## Dependencies

- Phase 0 decisions gate source-plan behavior, consolidation filtering, and retry policy.
- Phase 1 should land before scraper deployment so web accepts new additive fields.
- Phase 2 should land before retry/storage QA, otherwise reruns may still switch distributors.
- Phase 3 depends on Phase 1 normalization fields and should land before Phase 5 UI changes.
- Phase 4 retry fixes depend on callback context loaded in Phase 3.
- Phase 6 tests should be added with or immediately after each implementation phase.

## Migration / Backfill Strategy

- No required database schema migration: all changes are additive within existing JSONB `products_ingestion.sources` and existing attempt/job columns.
- Roll out as dual-read/dual-write:
  1. Deploy web validation/normalization/callback changes that accept both old and new runner payloads.
  2. Deploy scraper changes that send `job_mode` and richer source evidence.
  3. Keep `sources.enriched` aliases indefinitely for compatibility.
- Optional backfill:
  - Dry-run scan rows where `sources.enriched.source_results[]` exists but no top-level approved-source key exists.
  - If exactly one confident source slug is present, copy the current enriched snapshot into the mapped top-level source key with `_provenance.source_kind = "approved_source"` and `consolidation_excluded = true`.
  - If multiple source slugs are present in old collapsed data, do not invent per-distributor facts; report the SKU as ambiguous and leave it aggregate-only until re-extracted.

## Risks

- Historical distributor facts already overwritten in `sources.enriched` cannot be fully recovered; backfill can only copy the current snapshot.
- Dual-writing top-level source keys can duplicate consolidation evidence unless `product-sources.ts` filters review-only approved-source records or Phase 0 chooses a different consolidation strategy.
- Callback updates remain application-side last-writer-wins; the merge helper reduces sequential data loss but does not fully solve concurrent callback races.
- Retry classification based on warning strings is brittle; a future improvement should add explicit retryable/terminal failure codes.
- Changing `distributor_only + selectedDistributorSlug` semantics may surprise anyone relying on selected-first-but-try-all behavior; make the UI label and PR notes explicit.

## Non-Goals

- Do not remove or rename `sources.enriched`.
- Do not remove legacy aliases from persisted `sources.enriched`.
- Do not change confidence thresholds, retry budget, or source trust ranking without a separate product decision.
- Do not make the scraper access the database directly.
- Do not attempt to reconstruct old per-distributor facts that were already collapsed or overwritten.
