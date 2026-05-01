# Task 2: Cost Tracking Implementation

## Summary

Implemented nominal cost tracking for the AI Search E2E benchmark using Option A (estimated costs).

## Changes Made

### 1. `benchmarks/ai_search/metrics.py`
- Added `estimated_cost_usd: float = 0.0` field to `ExtractionMetadata` dataclass

### 2. `benchmarks/ai_search/runner.py`
- Added `_EXTRACTION_COST_ESTIMATES` dict with nominal per-method USD costs:
  - `"fixture"`: $0.00
  - `"json-ld"`: $0.00
  - `"meta-tags"`: $0.00
  - `"llm"`: $0.01 (GPT-4o-mini estimate)
  - `"fallback"`: $0.01 (also uses LLM)
  - `"unknown"`: $0.00
- Added `_estimate_extraction_cost(method)` helper function
- Modified `_run_single_entry()` to:
  - Calculate extraction cost based on method (only for successful extractions)
  - Track search_cost_usd (= $0.0 — Serper is free; FixtureSearchClient also costs $0)
  - Sum search + extraction costs into `cost_usd`
  - **Removed the `# TODO: track actual costs` comment**
- Failed extractions (missing fixtures, crawl errors) are correctly costed at $0.00

### 3. `benchmarks/ai_search/report.py`
- Added per-entry cost line in Markdown report: `- **Cost:** $0.0000`
- Added `estimated_cost_usd` to `extraction_metadata` in JSON report

### 4. `benchmarks/ai_search/README.md`
- Documented cost behavior:
  - Fixture mode: **$0.00** — no live API calls
  - Live mode: estimated costs (Serper $0.00/search, LLM $0.01/extraction)

## Verification

- Fixture mode: `total_cost_usd == 0.0` ✅ (all costs correctly $0)
- No TODO comments remain in `runner.py` ✅
- All 46 tests pass ✅

## Future Work

For true search cost tracking (if search provider changes from Serper to a billable provider):
- Instrument `OfficialBrandScraper.identify_official_url()` to use `SearchClient.search_with_cost()`
- Pass accumulated search cost back through the scraper interface
