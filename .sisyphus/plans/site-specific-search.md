# Work Plan: Site-Specific Product Search Strategy

## TL;DR

> Replace open-web Brave Search with targeted site-specific searches across trusted retailers. Search top retailers in parallel using `site:` operators, aggregate results, and score them for product page relevance.
> 
> **Deliverables:**
> - `SiteSpecificSearchClient` with parallel search capability
> - Updated query builder for site-specific queries  
> - Result aggregation and deduplication logic
> - Telemetry tracking for retailer success rates
> - Configurable retailer selection (top N or specific list)
> 
> **Estimated Effort:** Medium (3-5 tasks)
> **Parallel Execution:** YES - 3 waves
> **Critical Path:** Task 1 → Task 2 → Task 3

---

## Context

### Problem
Current Brave Search implementation searches the open web, returning mixed results (blogs, reviews, aggregators) instead of direct product pages from trusted retailers.

### Current Implementation
- **File:** `apps/scraper/scrapers/ai_discovery/search.py`
- **Approach:** Single open-web search with product SKU/name
- **Post-processing:** Complex scoring to filter out non-product pages
- **Pain point:** Low signal-to-noise ratio

### New Approach
Search each trusted retailer individually using `site:` operators:
```
"ABC123" site:chewy.com
"ABC123" site:petco.com
"ABC123" site:amazon.com
```

### Expected Benefits
1. **Higher precision:** Results only from trusted e-commerce sites
2. **No blog/review filtering needed:** Site operator filters at search level
3. **Better product page detection:** Retailer sites have consistent URL patterns
4. **Parallel discovery:** Search top N retailers simultaneously

---

## Work Objectives

### Core Objective
Implement parallel site-specific search across trusted retailers to improve product page discovery accuracy.

### Concrete Deliverables
- `SiteSpecificSearchClient` class with parallel search across multiple domains
- Modified query builder supporting site-specific search
- Result aggregator handling multiple search results
- Telemetry tracking which retailers yield successful extractions
- Configuration for number of retailers to search per query

### Definition of Done
- Site-specific search finds product pages with >80% success rate (vs current <50%)
- Parallel search completes within 2x single search time (target: <5 seconds for top 5 retailers)
- Telemetry logs show which retailers are most effective
- No regression in existing Brave Search functionality (keep as fallback)

### Must Have
- [ ] Parallel search across multiple retailers
- [ ] Site-specific query using `site:` operator
- [ ] Result aggregation with deduplication
- [ ] Configurable retailer selection (env var or param)
- [ ] Telemetry for retailer effectiveness tracking

### Must NOT Have (Guardrails)
- [ ] Do NOT remove existing Brave Search client (keep as fallback)
- [ ] Do NOT hardcode retailer list (use existing `TRUSTED_RETAILERS`)
- [ ] Do NOT exceed Brave rate limits (max 1 req/sec, implement throttling if needed)
- [ ] Do NOT search ALL retailers by default (limit to top N for performance)

---

## Verification Strategy

### Test Strategy
- **TDD:** NO (this is search optimization, behavior testing via integration)
- **Agent QA:** YES - Each task includes verification scenarios
- **Manual QA:** Run against real product SKUs to measure success rate improvement

### QA Policy
Every task includes agent-executed QA scenarios:
- **Unit tests:** Mock Brave API responses, verify parallel search logic
- **Integration tests:** Real Brave API calls with test queries
- **Performance tests:** Verify parallel execution time vs sequential
- **Evidence:** Screenshots of telemetry logs, timing measurements

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - can start immediately):
├── Task 1: Create SiteSpecificSearchClient
│   └── Parallel search capability
│   └── Site-specific query builder
│   └── Result aggregation
│
Wave 2 (Integration - depends on Task 1):
├── Task 2: Integrate into AIDiscoveryScraper
│   └── Replace single search with parallel site search
│   └── Add configuration options
│   └── Keep Brave fallback
│
Wave 3 (Telemetry & Polish - depends on Task 2):
├── Task 3: Add telemetry and optimization
│   └── Track retailer success rates
│   └── Prioritize effective retailers
│   └── Performance tuning
│
Wave FINAL (Verification):
├── Task F1: Integration testing
├── Task F2: Performance benchmarking  
├── Task F3: Documentation
└── Task F4: Scope compliance check
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | - | 2 |
| 2 | 1 | 3 |
| 3 | 2 | F1-F4 |
| F1-F4 | 3 | - |

### Agent Dispatch Summary

- **Task 1:** `unspecified-high` (Python, async, search logic)
- **Task 2:** `unspecified-high` (Integration with existing scraper)
- **Task 3:** `quick` (Telemetry, configuration)
- **F1-F4:** `unspecified-low` (Testing, docs, verification)

---

## TODOs

- [x] 1. Create SiteSpecificSearchClient with parallel site-specific search

  **What to do:**
  - Create new class `SiteSpecificSearchClient` in `apps/scraper/scrapers/ai_discovery/site_search.py`
  - Implement `search_across_retailers(query, retailers)` method
  - Use `asyncio.gather` for parallel searches
  - Build queries with `site:` operator: `"{query} site:{domain}"`
  - Aggregate results with deduplication by URL
  - Add result ranking based on retailer priority
  - Implement rate limiting (max 3-5 concurrent requests to Brave)
  - Keep existing `BraveSearchClient` as-is for fallback

  **Must NOT do:**
  - Do NOT modify existing `BraveSearchClient` (create new class)
  - Do NOT hardcode retailer list (accept as parameter)
  - Do NOT exceed Brave rate limits (implement semaphore with max 3 concurrent)

  **Recommended Agent Profile:**
  - **Category:** `unspecified-high` - This is Python async work requiring careful concurrency handling
  - **Skills:** None required

  **Parallelization:**
  - **Can Run In Parallel:** NO (foundation task)
  - **Blocks:** Task 2, Task 3

  **References:**
  - **Pattern:** `apps/scraper/scrapers/ai_discovery/search.py` - Study existing BraveSearchClient for API pattern
  - **Pattern:** `apps/scraper/scrapers/ai_discovery/scoring.py` lines 12-37 - `TRUSTED_RETAILERS` set
  - **Pattern:** `apps/scraper/scrapers/ai_discovery/scraper.py` lines 115-147 - Current search usage pattern
  - **External:** Brave Search API `site:` operator docs - https://api.search.brave.com/

  **WHY Each Reference Matters:**
  - `search.py` - Copy API client pattern, headers, error handling
  - `scoring.py` - Import `TRUSTED_RETAILERS` as default retailer list
  - `scraper.py` - Understand how search results are consumed (see lines 130-146)
  - Brave API docs - Confirm `site:` operator syntax

  **Acceptance Criteria:**
  - [ ] File created: `apps/scraper/scrapers/ai_discovery/site_search.py`
  - [ ] Class `SiteSpecificSearchClient` with methods:
    - `__init__(max_results=5, max_concurrent=3, cache_max=500)`
    - `async def search_across_retailers(query: str, retailers: list[str]) -> tuple[list[dict], Optional[str]]`
  - [ ] Queries use format: `"{original_query} site:{domain}"`
  - [ ] Parallel execution with `asyncio.gather` and semaphore limiting
  - [ ] Results aggregated, deduplicated by URL, sorted by domain priority
  - [ ] Unit tests: Mock Brave API, verify parallel execution, verify deduplication
  - [ ] `bun run scraper test` passes (or `python -m pytest` if no bun wrapper)

  **QA Scenarios:**

  ```
  Scenario: Single retailer search
    Tool: Python unit test (pytest)
    Preconditions: Mock Brave API returning 2 results for site:chewy.com
    Steps:
      1. Create SiteSpecificSearchClient
      2. Call search_across_retailers("ABC123", ["chewy.com"])
      3. Verify query sent to API is '"ABC123" site:chewy.com'
      4. Verify results contain only chewy.com URLs
    Expected Result: Returns 2 results with chewy.com URLs
    Evidence: Test output showing pass
  
  Scenario: Multiple retailer parallel search
    Tool: Python unit test with timing
    Preconditions: Mock Brave API with 1s delay per request
    Steps:
      1. Create SiteSpecificSearchClient(max_concurrent=3)
      2. Call search_across_retailers("ABC123", ["chewy.com", "petco.com", "amazon.com"])
      3. Measure total execution time
    Expected Result: Completes in ~1s (parallel) not ~3s (sequential)
    Evidence: Test output with timing logs
  
  Scenario: Rate limiting enforcement
    Tool: Python unit test
    Preconditions: 10 retailers in list
    Steps:
      1. Create SiteSpecificSearchClient(max_concurrent=3)
      2. Call search_across_retailers with 10 retailers
      3. Verify only 3 concurrent requests at any time
    Expected Result: Semaphore limits concurrent requests to 3
    Evidence: Debug logs showing request batching
  
  Scenario: Result deduplication
    Tool: Python unit test
    Preconditions: Mock API returns same URL from different queries
    Steps:
      1. Mock chewy.com and petco.com both returning "https://example.com/product"
      2. Call search_across_retailers
      3. Verify URL appears only once in results
    Expected Result: Duplicates removed, unique URLs only
    Evidence: Test assertion showing len(results) < len(raw_results)
  ```

  **Evidence to Capture:**
  - [ ] Unit test results: `apps/scraper/tests/unit/test_site_specific_search.py`
  - [ ] Timing comparison: sequential vs parallel execution

  **Commit:** YES
  - Message: `feat(scraper): add SiteSpecificSearchClient for parallel retailer search`
  - Files: `apps/scraper/scrapers/ai_discovery/site_search.py`, `apps/scraper/tests/unit/test_site_specific_search.py`
  - Pre-commit: `python -m pytest apps/scraper/tests/unit/test_site_specific_search.py -v`

- [x] 2. Integrate SiteSpecificSearchClient into AIDiscoveryScraper

  **What to do:**
  - Import `SiteSpecificSearchClient` in `apps/scraper/scrapers/ai_discovery/scraper.py`
  - Add `search_mode` parameter: `"site_specific"` or `"open_web"`
  - Default to `"site_specific"` for better results
  - On `"site_specific"` mode:
    - Get top N retailers from `TRUSTED_RETAILERS`
    - Call `site_search_client.search_across_retailers()`
    - Use results for source selection
  - Keep existing Brave Search as fallback when site-specific returns no results
  - Add env var `AI_DISCOVERY_SEARCH_MODE` to control default
  - Add env var `AI_DISCOVERY_MAX_RETAILERS` (default: 5)

  **Must NOT do:**
  - Do NOT remove existing Brave Search fallback
  - Do NOT break backward compatibility
  - Do NOT search more than `max_retailers` by default (performance)

  **Recommended Agent Profile:**
  - **Category:** `unspecified-high` - Integration work, need to understand existing flow
  - **Skills:** None required

  **Parallelization:**
  - **Can Run In Parallel:** NO (depends on Task 1)
  - **Blocked By:** Task 1
  - **Blocks:** Task 3

  **References:**
  - **Pattern:** `apps/scraper/scrapers/ai_discovery/scraper.py` lines 115-147 - Current search logic
  - **Pattern:** `apps/scraper/scrapers/ai_discovery/scraper.py` lines 40-74 - `__init__` config pattern
  - **Pattern:** `apps/scraper/scrapers/ai_discovery/scoring.py` lines 12-37 - TRUSTED_RETAILERS

  **WHY Each Reference Matters:**
  - `scraper.py:115-147` - Replace this search logic with site-specific search
  - `scraper.py:40-74` - Add new config params following this pattern (env vars)
  - `scoring.py:12-37` - Import and use this list of retailers

  **Acceptance Criteria:**
  - [ ] `AIDiscoveryScraper` accepts `search_mode` parameter ("site_specific" | "open_web")
  - [ ] Default mode controlled by env var `AI_DISCOVERY_SEARCH_MODE` (default: "site_specific")
  - [ ] Max retailers controlled by `AI_DISCOVERY_MAX_RETAILERS` (default: 5)
  - [ ] Site-specific search returns results → use them
  - [ ] Site-specific search returns no results → fallback to open-web Brave Search
  - [ ] Existing tests still pass

  **QA Scenarios:**

  ```
  Scenario: Site-specific mode finds results
    Tool: Integration test with mocked search
    Preconditions: SiteSpecificSearchClient returns 3 results
    Steps:
      1. Create AIDiscoveryScraper(search_mode="site_specific")
      2. Call scrape_product() with test SKU
      3. Verify SiteSpecificSearchClient.search_across_retailers was called
      4. Verify results are from site-specific search (not open-web)
    Expected Result: Uses site-specific results, extraction proceeds
    Evidence: Test logs showing "site_specific" mode and retailer domains
  
  Scenario: Fallback to open-web when site-specific fails
    Tool: Integration test
    Preconditions: SiteSpecificSearchClient returns [], open-web returns results
    Steps:
      1. Create AIDiscoveryScraper(search_mode="site_specific")
      2. Call scrape_product() with SKU that site-specific can't find
      3. Verify fallback to BraveSearchClient.search()
    Expected Result: Falls back to open-web search successfully
    Evidence: Logs showing "Site-specific search returned no results, falling back"
  
  Scenario: Backward compatibility with open_web mode
    Tool: Regression test
    Preconditions: search_mode="open_web"
    Steps:
      1. Create AIDiscoveryScraper(search_mode="open_web")
      2. Call scrape_product()
      3. Verify only BraveSearchClient.search() is called
    Expected Result: Behaves exactly like before changes
    Evidence: Test passes with existing assertions
  
  Scenario: Top N retailers respected
    Tool: Unit test
    Preconditions: AI_DISCOVERY_MAX_RETAILERS=3, TRUSTED_RETAILERS has 18 entries
    Steps:
      1. Set env var AI_DISCOVERY_MAX_RETAILERS=3
      2. Create AIDiscoveryScraper
      3. Call scrape_product()
      4. Verify only 3 retailers searched
    Expected Result: Respects max_retailers limit
    Evidence: Mock call count = 3
  ```

  **Evidence to Capture:**
  - [ ] Integration test results
  - [ ] Logs showing mode selection and fallback behavior

  **Commit:** YES (separate from Task 1)
  - Message: `feat(scraper): integrate site-specific search into AIDiscoveryScraper`
  - Files: `apps/scraper/scrapers/ai_discovery/scraper.py`
  - Pre-commit: `python -m pytest apps/scraper/tests/ -k ai_discovery -v`

- [x] 3. Add telemetry tracking and retailer prioritization

  **What to do:**
  - Track which retailers yield successful extractions
  - Store success/failure per retailer in telemetry
  - Implement retailer priority based on historical success rates
  - Add `get_prioritized_retailers()` method that sorts by effectiveness
  - Log retailer success rates periodically
  - Make telemetry storage lightweight (in-memory with optional persistence)

  **Must NOT do:**
  - Do NOT add database dependencies
  - Do NOT block search on telemetry writes
  - Do NOT store PII or sensitive data in telemetry

  **Recommended Agent Profile:**
  - **Category:** `quick` - This is straightforward tracking logic
  - **Skills:** None required

  **Parallelization:**
  - **Can Run In Parallel:** NO (depends on Task 2)
  - **Blocked By:** Task 2
  - **Blocks:** F1-F4

  **References:**
  - **Pattern:** `apps/scraper/scrapers/ai_metrics.py` - Existing telemetry patterns
  - **Pattern:** `apps/scraper/scrapers/ai_discovery/scraper.py` lines 246-270 - record_ai_extraction usage

  **WHY Each Reference Matters:**
  - `ai_metrics.py` - Follow existing telemetry patterns for consistency
  - `scraper.py:246-270` - Add retailer tracking alongside existing metrics

  **Acceptance Criteria:**
  - [ ] Telemetry tracks: retailer domain, search success, extraction success
  - [ ] Retailers sorted by historical success rate for future searches
  - [ ] Logs show top-performing retailers periodically
  - [ ] No performance impact on search (<10ms overhead)

  **QA Scenarios:**

  ```
  Scenario: Track retailer success
    Tool: Unit test
    Preconditions: Extraction succeeds from chewy.com
    Steps:
      1. Mock successful extraction from "chewy.com"
      2. Verify telemetry records: domain="chewy.com", success=true
    Expected Result: Telemetry contains success entry
    Evidence: Telemetry log assertion
  
  Scenario: Prioritize successful retailers
    Tool: Unit test
    Preconditions: chewy.com has 80% success, petco.com has 20%
    Steps:
      1. Mock success rates
      2. Call get_prioritized_retailers(limit=2)
      3. Verify first result is chewy.com
    Expected Result: Higher success rate retailers prioritized
    Evidence: Assertion showing order
  ```

  **Evidence to Capture:**
  - [ ] Telemetry output samples
  - [ ] Performance benchmark showing <10ms overhead

  **Commit:** YES
  - Message: `feat(scraper): add retailer effectiveness telemetry`
  - Files: `apps/scraper/scrapers/ai_discovery/telemetry.py`, updates to `scraper.py`

---

## Final Verification Wave

- [ ] F1. **Integration Testing** — `unspecified-high`
  Run 50 real product searches using site-specific mode, measure success rate vs baseline. Verify:
  - Success rate improved from baseline (target: >80% vs current <50%)
  - Average response time <5 seconds for top 5 retailers
  - Fallback to open-web works when site-specific fails
  Output: `Success Rate [X%] | Avg Time [Xs] | Fallback Used [N times] | VERDICT`

- [ ] F2. **Performance Benchmarking** — `unspecified-low`
  Compare sequential vs parallel execution:
  - Sequential: Search 5 retailers one-by-one, measure time
  - Parallel: Search 5 retailers concurrently, measure time
  - Verify parallel is significantly faster (target: <2x single search time)
  Output: `Sequential [Xs] | Parallel [Xs] | Speedup [Xx] | VERDICT`

- [ ] F3. **Documentation** — `writing`
  Update:
  - `apps/scraper/README.md` - Document site-specific search feature
  - `apps/scraper/docs/ai-discovery.md` - Explain configuration options
  - Add example: How to enable/disable site-specific mode
  Output: `Docs Updated [YES/NO] | Examples Provided [YES/NO] | VERDICT`

- [ ] F4. **Scope Compliance Check** — `deep`
  Verify:
  - Existing BraveSearchClient not modified (still exists)
  - Backward compatibility maintained (open_web mode works)
  - No database dependencies added
  - Rate limits respected
  Output: `Backward Compatible [YES/NO] | No Breaking Changes [YES/NO] | VERDICT`

---

## Commit Strategy

- **Task 1:** `feat(scraper): add SiteSpecificSearchClient for parallel retailer search`
- **Task 2:** `feat(scraper): integrate site-specific search into AIDiscoveryScraper`
- **Task 3:** `feat(scraper): add retailer effectiveness telemetry`
- **F1-F4:** Grouped under `test(scraper): verify site-specific search implementation`

---

## Success Criteria

### Verification Commands
```bash
# Unit tests
python -m pytest apps/scraper/tests/unit/test_site_specific_search.py -v

# Integration tests
python -m pytest apps/scraper/tests/ -k ai_discovery -v

# Performance test (manual)
python apps/scraper/scripts/benchmark_search.py  # Create this script

# Real-world test
python -c "
from scrapers.ai_discovery.scraper import AIDiscoveryScraper
import asyncio

scraper = AIDiscoveryScraper(search_mode='site_specific')
result = asyncio.run(scraper.scrape_product('TEST-SKU-123'))
print(f'Success: {result.success}')
print(f'URL: {result.url}')
"
```

### Final Checklist
- [ ] Site-specific search implemented and working
- [ ] Parallel execution faster than sequential
- [ ] Success rate improved from baseline
- [ ] Fallback to open-web functional
- [ ] Telemetry tracking retailer effectiveness
- [ ] Documentation updated
- [ ] No breaking changes to existing API

---

## Notes

### Rate Limiting Considerations
Brave Search API has rate limits. The implementation uses `max_concurrent=3` to stay within safe limits while still achieving parallelism.

### Retailer Selection Strategy
By default, search top 5 retailers. Priority order:
1. Historical success rate (if telemetry available)
2. Brand domain match (if brand provided)
3. Alphabetical (stable ordering)

### Future Enhancements (Out of Scope)
- Dynamic retailer discovery (add new retailers found in successful extractions)
- Per-retailer query optimization (different query patterns for different sites)
- Smart retry (if chewy.com blocks, try petco.com with same query)
- Caching across retailers (don't search same SKU across all retailers if already found)

---

**Plan Generated:** 2026-03-12
**Ready to execute:** Run `/start-work` to begin
