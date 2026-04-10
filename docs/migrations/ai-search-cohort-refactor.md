# AI Search Cohort Refactor Migration Guide

## Summary

This change set fixes the AI Search batch path so it no longer defaults to a broken SKU-first placeholder flow and so cohort-aware behavior is connected to the production implementation instead of orphaned in dead code.

## Problems Addressed

- Fixed the SKU-first production bug where batches returned `success=False` with `"Extraction not implemented in SKU-first mode"`.
- Removed dead duplicate batch-processing code and unused cohort helper methods.
- Moved `_BatchCohortState` into a dedicated module for reuse.
- Added extraction validation to the production batch path.
- Added context-aware URL ranking using brand and product name.
- Added dominant-domain retry support so cohort members can converge on a successful source.
- Fixed the runner call site to match the current scraper batch signature.

## Key Files Changed

### Scraper implementation
- `apps/scraper/scrapers/ai_search/scraper.py`
- `apps/scraper/scrapers/ai_search/batch_search.py`
- `apps/scraper/scrapers/ai_search/validation.py`
- `apps/scraper/scrapers/ai_search/cohort_state.py`

### Runner
- `apps/scraper/runner/__init__.py`

### Tests added
- `apps/scraper/tests/unit/test_sku_first_mode.py`
- `apps/scraper/tests/unit/test_cohort_validation.py`
- `apps/scraper/tests/unit/test_context_ranking.py`
- `apps/scraper/tests/unit/test_domain_retry.py`

## Behavior Changes

### SKU-first mode

Before this refactor, `AI_SEARCH_SKU_FIRST=true` produced search results but never executed extraction. It now:

- ranks candidate URLs,
- extracts product data,
- validates the extraction result,
- falls back across candidates when needed,
- returns a normal `AISearchResult` instead of a hardcoded failure.

### Batch validation

The production batch path now uses extraction validation checks that were previously only available in the single-product flow. This improves:

- brand matching,
- product-name matching,
- blocked URL filtering,
- rejection of invalid low-quality extractions.

### Cohort learning

Batch execution now has access to cohort state so successful domains can influence later ranking and retry behavior across related products.

### Runner compatibility

The AI Search runner call was updated to remove the unsupported `max_concurrency` argument when invoking `scrape_products_batch(...)`.

## Validation Performed

### Targeted tests verified
- `python -m pytest tests/unit/test_sku_first_mode.py -q`
- `python -m pytest tests/unit/test_cohort_validation.py -q`
- `python -m pytest tests/unit/test_context_ranking.py -q`
- `python -m pytest tests/unit/test_domain_retry.py -q`

### Full-suite status

The broader scraper suite was started, but additional AI Search regressions still need follow-up before Task 15 can be marked complete. Benchmark and pilot failures were also present in the broader run and need triage for in-scope vs pre-existing failures.

## Key Commits

- `67abbf0` `refactor(scraper): remove dead scrape_products_batch method`
- `a12485f` `refactor(scraper): extract _BatchCohortState to cohort_state.py`
- `a7145e4` `refactor(scraper): remove dead cohort helper methods`
- `165e0f3` `fix(scraper): implement extraction in SKU-first mode`
- `dc1827a` `feat(batch): pass product context to URL ranking`
- `8b35b5d` `feat(batch): integrate cohort state into BatchSearchOrchestrator`
- `c01afe5` `feat(batch): add extraction validation to BatchSearchOrchestrator`
- `d8b3bab` `feat(batch): implement dominant domain retry mechanism`
- `f446058` `test(scraper): add comprehensive SKU-first mode tests`
- `b0a051f` `test(batch): add cohort validation integration tests`
- `b479380` `test(batch): add context-aware URL ranking tests`
- `6827c0a` `test(batch): add dominant domain retry tests`
- `1ea6a6d` `refactor(runner): update imports for cohort refactor`

## Remaining Blockers

### Task 13 user scenarios

User-provided SKU/product scenarios and expected outputs are still required for the planned integration validation step. That task is intentionally still blocked.

### Task 15 regression follow-up

The refactor still needs final regression cleanup for the broader AI Search test set before the final verification wave can begin.

## Rollback Guidance

If this refactor needs to be rolled back:

1. Revert the AI Search refactor commits in reverse order.
2. Restore the prior runner invocation if the older scraper implementation is also restored.
3. Re-run targeted AI Search tests after rollback.
4. If rolling back only part of the stack, make sure the runner call and scraper batch signature stay aligned.

## Notes

This migration document reflects the implementation state of the current branch. Final acceptance still depends on completing Task 15, Task 13, and the final verification wave in `.sisyphus/plans/ai-search-cohort-refactor.md`.
