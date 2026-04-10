# AI Search Cohort Refactor Migration Guide

## Summary

This change set fixes the AI Search batch path so it no longer defaults to a broken SKU-first placeholder flow and so cohort-aware behavior is connected to the public `scrape_products_batch(...)` implementation instead of orphaned in dead code.

## Problems Addressed

- Fixed the SKU-first production bug where batches returned `success=False` with `"Extraction not implemented in SKU-first mode"`.
- Removed dead duplicate batch-processing code and unused cohort helper methods.
- Moved `_BatchCohortState` into a dedicated module for reuse.
- Added extraction validation to the production batch path.
- Added context-aware URL ranking using brand and product name.
- Added dominant-domain retry support so cohort members can converge on a successful source.
- Restored the public batch signature to accept `max_concurrency` and updated the runner call site accordingly.
- Wired the base production batch path through `BatchSearchOrchestrator` so the validator, context-aware ranking, and dominant-domain retry logic are exercised outside test-only call sites.
- Made the structured-data precheck best-effort so unreachable or non-200 candidate URLs do not get rejected before extraction.

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
- `apps/scraper/tests/integration/test_user_scenarios.py`

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

The AI Search runner now passes `max_concurrency` to the restored batch API, keeping the scraper call signature aligned with existing runner and test expectations.

### Structured-data precheck

The structured-data precheck now skips extraction only when a page is reachable and clearly lacks product markup. Inconclusive network responses no longer masquerade as validation failures in mocked or synthetic test scenarios.

## Validation Performed

### Targeted tests verified
- `python -m pytest tests/unit/test_sku_first_mode.py -q`
- `python -m pytest tests/unit/test_cohort_validation.py -q`
- `python -m pytest tests/unit/test_context_ranking.py -q`
- `python -m pytest tests/unit/test_domain_retry.py -q`
- `python -m pytest tests/integration/test_user_scenarios.py -q`
- `python -m pytest tests/test_ai_search.py tests/test_ai_search_integration.py tests/test_ai_search_runner.py -v --tb=short`
- `python -m pytest tests/integration/test_user_scenarios.py tests/test_ai_search.py tests/test_ai_search_integration.py tests/test_ai_search_runner.py -q`
- `python -m ruff check scrapers/ai_search/ runner/__init__.py tests/test_ai_search.py tests/test_ai_search_integration.py`

### Full-suite status

The AI Search cohort regressions are cleared. A fresh `python -m pytest` run in `apps/scraper` now passes end-to-end (`841 passed, 27 skipped`), including the restored crawl4ai compatibility coverage, the production `BatchSearchOrchestrator` wiring coverage, and the new user-scenario integration tests. Task 15 is complete.

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

## Final Closeout Status

### Task 13 user scenarios

Task 13 is covered by `apps/scraper/tests/integration/test_user_scenarios.py`. The user explicitly directed the work to use live Supabase MCP data and run the integration tests as the official Task 13 scenario source. Those scenarios come from:

- imported SKU inputs from `public.products_ingestion`,
- recorded successful AI Search outputs from `public.scrape_results`,
- and a real same-family catalog cohort from `public.products`.

### F2 type-check

`python -m mypy --explicit-package-bases scrapers/ai_search` now passes from `apps/scraper` with the package-scoped `mypy.ini` and the `scraper.py` type fixes added during closeout.

### Worktree scope

Unrelated dirty files were removed from the active worktree and preserved in local stashes, leaving only cohort-refactor files and directly related regression fixes in the working tree.

## Rollback Guidance

If this refactor needs to be rolled back:

1. Revert the AI Search refactor commits in reverse order.
2. Restore the prior runner invocation if the older scraper implementation is also restored.
3. Re-run targeted AI Search tests after rollback.
4. If rolling back only part of the stack, make sure the runner call and scraper batch signature stay aligned.

## Notes

This migration document reflects the implementation state of the current branch. Task 13 is satisfied, Task 15 is complete, and the closeout caveats called out during final validation have been resolved.
