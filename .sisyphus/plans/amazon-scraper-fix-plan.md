# Amazon Scraper Fix Plan

## Problem
- The Amazon enrichment path is accepting unrelated matches.
- The concrete failure is a ShopSite product named `BENTLEY SEED BROCCOL I GREEN SPROUTING` with input price `2.49` being accepted as an unrelated Amazon shipping-label product.
- Current AI Search validation does not use the original ShopSite price, and the web job creation path does not pass original per-SKU context into the scraper job.

## Root Cause
1. `apps/web/lib/pipeline-scraping.ts` creates AI Search jobs from SKUs only, even though `products_ingestion.input` stores the original `name` and `price`.
2. `apps/scraper/runner/__init__.py` supports per-item AI Search context, but only forwards `product_name`, `brand`, and `category`.
3. `apps/scraper/scrapers/ai_search/scraper.py` and `apps/scraper/scrapers/ai_search/validation.py` do not accept or validate against an expected price.
4. `apps/scraper/scrapers/schemas/product.py`, `apps/scraper/scrapers/utils/ai_utils.py`, and `apps/scraper/scrapers/ai_search/extraction.py` omit price from extracted AI Search product data, so price cannot be used as a rejection signal.

## Chosen Fix
- Thread original per-SKU ShopSite context (`name`, `price`) from the web app into the AI Search job payload.
- Extend AI Search extraction to capture price when present.
- Extend validation to reject severe price mismatches while tolerating missing extracted price.
- Keep matching heuristics otherwise intact to minimize regression risk.

## TDD Plan

### Task 1 - Web job payload includes per-SKU context
- Files:
  - `apps/web/lib/pipeline-scraping.ts`
  - `apps/web/__tests__/lib/pipeline-scraping.test.ts`
- Changes:
  - Load `sku`, `input`, and any useful product context from `products_ingestion` for requested SKUs when `enrichment_method === 'ai_search'`.
  - Add `items` to the stored AI Search job config with `sku`, `product_name`, and `price` per SKU.
- QA:
  - Add/update Jest coverage asserting AI Search job config includes per-SKU `items` with `product_name` and `price`.

### Task 2 - Runner forwards expected price into AI Search batch items
- Files:
  - `apps/scraper/runner/__init__.py`
- Changes:
  - Preserve `price` from job `items` / `sku_context` when building AI Search batch items.
- QA:
  - Covered indirectly through scraper unit/integration tests using batch item input shape.

### Task 3 - AI Search supports expected price end-to-end
- Files:
  - `apps/scraper/scrapers/ai_search/scraper.py`
  - `apps/scraper/scrapers/ai_search/models.py` if result price exposure is needed
- Changes:
  - Accept `expected_price` in batch and single-item flow.
  - Pass `expected_price` through extraction validation calls.
- QA:
  - Existing integration tests continue to pass after signature updates.

### Task 4 - Extraction captures price when available
- Files:
  - `apps/scraper/scrapers/schemas/product.py`
  - `apps/scraper/scrapers/utils/ai_utils.py`
  - `apps/scraper/scrapers/ai_search/extraction.py`
  - `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py`
- Changes:
  - Add optional `price` to the extraction schema and fallback extraction paths.
  - Preserve extracted price in JSON-LD/meta/LLM outputs when present.
- QA:
  - Validation tests can pass extracted price strings/numbers through the real extraction result shape.

### Task 5 - Validation rejects severe price mismatches
- Files:
  - `apps/scraper/scrapers/ai_search/validation.py`
  - `apps/scraper/tests/test_ai_search_validation.py`
  - `apps/scraper/tests/test_ai_search.py`
  - `apps/scraper/tests/test_ai_search_integration.py`
- Changes:
  - Parse expected/extracted price safely from string or numeric input.
  - Reject results when extracted price is wildly outside the expected range.
  - Do not reject when extracted price is missing.
  - Keep current confidence/brand/name checks intact.
- QA:
  - RED test: broccoli seed item at `2.49` with extracted shipping-label product at a much higher price fails validation.
  - GREEN test: legitimate same-product match with close price still passes.
  - GREEN test: missing extracted price does not fail by itself.

## Test Plan

### Objective
- Verify the Amazon/AI Search flow uses original ShopSite context and rejects false positives like the broccoli-to-shipping-label mismatch.

### Prerequisites
- Python test environment for `apps/scraper`
- Jest test environment for `apps/web`

### Test Cases
1. Web job payload includes per-SKU name and price
   - Input: `scrapeProducts(['SKU-1'], { enrichment_method: 'ai_search' })` with `products_ingestion.input = { name, price }`
   - Expected: inserted job config contains `items[0].product_name` and `items[0].price`
   - Verify: Jest assertions in `apps/web/__tests__/lib/pipeline-scraping.test.ts`
2. Validation rejects wrong Amazon match by price
   - Input: expected name broccoli seeds, expected price `2.49`, extracted title shipping labels, extracted price far higher
   - Expected: validation returns `(False, <price mismatch reason>)`
   - Verify: pytest assertion in `apps/scraper/tests/test_ai_search_validation.py`
3. Validation accepts reasonable match with close price
   - Input: expected name/price aligned with extracted product
   - Expected: validation returns `(True, 'ok')`
   - Verify: pytest assertion
4. Missing extracted price is tolerated
   - Input: expected price present, extracted price missing, other signals strong
   - Expected: validation result still depends on non-price signals only
   - Verify: pytest assertion
5. Existing AI Search happy path still passes
   - Input: current integration fixtures
   - Expected: success remains unchanged
   - Verify: existing integration tests

### Success Criteria
- All new tests pass.
- Existing AI Search validation/integration tests still pass.
- Inserted AI Search job payload demonstrably includes source `name` and `price` from `products_ingestion.input`.
- The broccoli/label mismatch is rejected rather than accepted as a valid result.

### How To Execute
```bash
bun test -- --runTestsByPath apps/web/__tests__/lib/pipeline-scraping.test.ts
python -m pytest tests/test_ai_search_validation.py tests/test_ai_search.py tests/test_ai_search_integration.py
```

## Manual QA
- Construct a validation scenario using the provided broccoli input and the bad Amazon extraction payload.
- Confirm the validator rejects it with an explicit mismatch reason.
- Confirm a normal product match with a nearby price still passes.

## Scope Guardrails
- Do not refactor source selection or scoring broadly.
- Do not change enrichment ownership of canonical price; price remains protected in the web app.
- Do not require extracted price to exist on every page.

## Atomic Commit Strategy
1. Web context propagation + Jest coverage.
2. Scraper expected-price plumbing + extraction/validation tests.
3. Final verification pass only after both test suites are green.
