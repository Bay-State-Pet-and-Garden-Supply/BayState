# Implementation Plan

## Goal
Fix Automated Source Cascade outcome classification so products with usable source data advance to `processed`, while true no-found source errors still surface in `needs_attention`.

## Tasks

1. **Restore the extraction glossary context**: Replace the current consolidation-focused `CONTEXT.md` with the Automated Source Cascade glossary.
   - File: `CONTEXT.md`
   - Changes: Restore terms for **Source Cascade**, **Distributor Source**, **SERP Fallback**, **Source Error**, **Not Stocked**, **Needs Attention**, and **Extraction Run**; revise **Needs Attention** to mean no usable source found data and one or more genuine source errors prevented a clean cascade.
   - Acceptance: `CONTEXT.md` no longer describes consolidation field mapping and matches the extraction terms used by ADR 0002.

2. **Update the source-error ADR to separate fallback blocking from final status**: Clarify that source errors block fallback/exhaustiveness, not successful processing.
   - File: `docs/adr/0002-source-errors-block-serp.md`
   - Changes:
     - Keep rule: genuine distributor source errors block SERP fallback when no source has found data.
     - Change final status rule: if any source found usable product data, the UPC advances to `processed`; if no source found data and any genuine source error occurred, it goes to `needs_attention`; if all sources are clean `not_stocked`, it advances to `processed` for later manual-entry flow.
   - Acceptance: ADR no longer says every source error forces `Needs Attention` unconditionally.

3. **Extract callback source-outcome normalization into a testable helper**: Add pure helper functions that normalize source outcomes before status calculation and persistence.
   - New File: `apps/web/app/api/scraper/v1/enrichment-callback/source-outcomes.ts`
   - Changes:
     - Add `normalizeSourceResultOutcome(sourceResult)`:
       - preserves explicit `found`, `not_stocked`, `source_error`, `skipped`
       - infers `found` when outcome is null/missing and the result has usable product evidence, e.g. non-empty `product`, `confidence >= 0.7`, `matchedFields.length > 0`, or a product/core name
       - infers `not_stocked` for known clean no-match messages such as `No matching product card found`, `No match found`, `No product match found`, `No result(s) found`
       - otherwise falls back to `source_error`
     - Add `normalizeSourceResults(sourceResults)` returning normalized records without mutating the validated payload.
     - Add `determineSourceOutcomeStatus(normalizedResults)`:
       - any `found` -> `processed`
       - else any `source_error` -> `needs_attention`
       - else -> `processed`
   - Acceptance: Helper unit tests cover the production Amazon-null-outcome case, Bradley no-match message, genuine error, all not-stocked, and found-plus-error.

4. **Use normalized source outcomes in the enrichment callback**: Change callback status and source-attempt persistence to consume normalized outcomes.
   - File: `apps/web/app/api/scraper/v1/enrichment-callback/route.ts`
   - Changes:
     - Import the new helper functions.
     - Replace existing `determineSourceOutcomeStatus()` with helper-based logic.
     - Normalize `sourceResults` immediately after validation.
     - Use normalized outcomes for:
       - deciding `nextStatus`
       - `enrichment_source_attempts.outcome`
       - `error_message` generation
       - `sources.enriched.source_results` if needed to keep persisted enriched data consistent
     - If an approved-source result has no `source_results` but top-level result is a usable success, treat it as `processed`; if it is failed with no source details, treat it as `needs_attention`.
   - Acceptance: UPC-like payload with Amazon product data + Bradley source error returns `next_status: "processed"`; no-found + source_error returns `needs_attention`.

5. **Fix Bradley clean no-match classification at the adapter level**: Make Bradley classify missing product cards from search pages as `NO_MATCH`, not `EXTRACTION_FAILED`.
   - File: `apps/scraper/scrapers/approved_sources/adapters/bradley.py`
   - Changes:
     - In search-result parsing, change `No matching product card found on search page for UPC ...` from `FailureCode.EXTRACTION_FAILED` to `FailureCode.NO_MATCH`.
     - Review the regex fallback and PDP paths; only change cases that mean search executed but the product was not present. Leave true parser/network/HTML failures as `EXTRACTION_FAILED`.
   - Acceptance: Bradley no-card search result is converted through `BaseDistributorCrawl4AIAdapter` into `build_no_match_result(... outcome="not_stocked")`.

6. **Ensure found source results always emit `outcome: "found"`**: Fix adapter/executor/result-builder gaps where successful results, especially marketplace/Amazon-like results, emit `outcome: null`.
   - Files:
     - `apps/scraper/scrapers/approved_sources/result_builder.py`
     - `apps/scraper/scrapers/approved_sources/executor.py`
     - Relevant Amazon/marketplace adapter file if found during implementation
   - Changes:
     - Confirm `build_success_result()` and `build_partial_result()` always produce source results with `outcome="found"`.
     - In executor fallback classification, when `result.status in ("success", "partial")` and a `SourceResultInfo` has no outcome, set or infer `found` before combined result is returned.
     - Locate the adapter path that produced `sourceType: "marketplace"`, `sourceSlug: "amazon"`, `confidence: 0.95`, `outcome: null`; set `outcome="found"` at the source.
   - Acceptance: Scraper unit test for Amazon/marketplace found result asserts `source_results[0].outcome == "found"`.

7. **Add callback regression tests for final status rules**: Cover the exact production failure modes.
   - File: `apps/web/__tests__/app/api/scraper/v1/enrichment-callback-route.test.ts`
   - Changes:
     - Capture inserted rows for `enrichment_source_attempts` in the test mock so assertions can inspect persisted outcomes.
     - Add tests:
       - Amazon-like found result with `outcome: null` + Bradley no-match/source-error message -> product update `pipeline_status: "processed"`; persisted Amazon outcome `found`; Bradley normalized to `not_stocked` when message is clean no-match.
       - Explicit `found` + genuine `source_error` -> `processed`, with source error still persisted in `enrichment_source_attempts`.
       - All sources `not_stocked` -> `processed`.
       - No found + genuine `source_error` -> `needs_attention` and concise `error_message`.
       - Approved-source failed payload with no `source_results` -> `needs_attention`.
   - Acceptance: Focused Jest file passes and fails on the current buggy callback logic before the fix.

8. **Add scraper regression tests for Bradley and null found outcomes**: Prevent adapter/result-builder drift.
   - Files:
     - `apps/scraper/tests/unit/test_bradley_card_matching.py`
     - `apps/scraper/tests/unit/test_approved_sources_executor.py`
     - `apps/scraper/tests/unit/test_approved_sources_result_builder.py`
   - Changes:
     - Add/adjust Bradley fixture test where search page has no matching card but no parser crash; assert `FailureCode.NO_MATCH` and final source result outcome `not_stocked`.
     - Add executor test where a successful adapter result with missing source-result outcome is normalized to `found` and does not become a source error.
     - Keep existing genuine exception/no-adapter tests asserting `source_error`.
   - Acceptance: Scraper unit tests pass with `python3 -m pytest` for the targeted files.

9. **Prepare a production remediation query/script for already-stuck products**: Correct rows created by the bad classification after code is fixed.
   - New File: `docs/runbooks/repair-source-cascade-status.md`
   - Changes:
     - Document a read-only verification query listing `needs_attention` products with usable enriched data or source attempts whose `raw_result.product` is non-null / confidence >= 0.7.
     - Document a controlled repair SQL plan:
       - update `enrichment_source_attempts.outcome` to `found` when `raw_result` shows product data/confidence but outcome is `source_error`
       - update Bradley clean no-match source attempts to `not_stocked` when `error_message ILIKE '%No matching product card found%'
       - update `products_ingestion.pipeline_status` from `needs_attention` to `processed` only for rows with a found source attempt or high-confidence enriched data
     - Include transaction and rollback notes; do not auto-run the repair from app code.
   - Acceptance: Runbook includes SELECT-before-UPDATE queries and a validation query showing affected UPC counts.

10. **Run focused validation**: Validate both code behavior and current production symptom.
   - Files: test/validation commands only
   - Changes: None beyond prior tasks.
   - Acceptance:
     - `cd apps/web && bun run tsc --noEmit` has no new errors beyond known pre-existing Recharts issue, if still present.
     - `node apps/web/scripts/run-jest.cjs --testPathPatterns="enrichment-callback-route"` passes.
     - Targeted scraper tests pass with `python3 -m pytest apps/scraper/tests/unit/test_bradley_card_matching.py apps/scraper/tests/unit/test_approved_sources_executor.py apps/scraper/tests/unit/test_approved_sources_result_builder.py`.
     - Manual/Supabase verification: a payload shaped like UPC `850067859918` computes `processed`, not `needs_attention`.

## Files to Modify

- `CONTEXT.md` - restore Automated Source Cascade glossary and corrected Needs Attention definition.
- `docs/adr/0002-source-errors-block-serp.md` - clarify source errors block fallback/exhaustiveness, not products with found data.
- `apps/web/app/api/scraper/v1/enrichment-callback/route.ts` - consume normalized source results and apply found-wins status logic.
- `apps/web/__tests__/app/api/scraper/v1/enrichment-callback-route.test.ts` - add regression tests and source-attempt insert assertions.
- `apps/scraper/scrapers/approved_sources/adapters/bradley.py` - classify no matching product card as `NO_MATCH`.
- `apps/scraper/scrapers/approved_sources/result_builder.py` - verify/adjust found outcome emission for success/partial source results.
- `apps/scraper/scrapers/approved_sources/executor.py` - normalize missing source-result outcomes from successful adapter results to `found`.
- `apps/scraper/tests/unit/test_bradley_card_matching.py` - Bradley no-match regression coverage.
- `apps/scraper/tests/unit/test_approved_sources_executor.py` - executor outcome normalization coverage.
- `apps/scraper/tests/unit/test_approved_sources_result_builder.py` - result-builder outcome coverage.

## New Files

- `apps/web/app/api/scraper/v1/enrichment-callback/source-outcomes.ts` - pure source outcome normalization and final status helpers.
- `docs/runbooks/repair-source-cascade-status.md` - manual production data repair/verification runbook for already-stuck products.

## Dependencies

- Task 1 and Task 2 should happen before implementation or in the same PR so docs match the new final-status semantics.
- Task 3 must happen before Task 4 and Task 7 because callback code/tests should use the same pure helper.
- Task 5 and Task 6 can be implemented in parallel with Task 4, but validation depends on all three.
- Task 9 should be written after Tasks 3-6 so the remediation rules match the final code behavior.
- Task 10 depends on all code/test changes.

## Risks

- The original ADR intentionally said any source error creates `needs_attention`; this plan deliberately revises that rule based on production behavior and Oracle's recommendation. Confirm this product decision remains accepted.
- Outcome inference in the callback must be conservative: infer `found` only from clear product evidence/confidence, not from arbitrary partial metadata.
- Clean no-match message matching should not hide genuine parser failures. Prefer fixing Bradley's `FailureCode` first and use callback message normalization only as a backward-compatibility safety net.
- Existing production rows were already persisted with incorrect outcomes; code changes alone will not move them to `processed` unless callbacks are replayed or the repair runbook is applied.
- Amazon/marketplace is currently being used as source data. If Amazon should not be allowed long-term, that is a separate source-policy decision and should not be mixed into this status bug fix.
