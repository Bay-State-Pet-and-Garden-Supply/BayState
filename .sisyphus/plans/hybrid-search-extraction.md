# Hybrid Search + Extraction System: Two-Step SKU Refinement

## TL;DR

> **Objective**: Implement a two-step search refinement system that searches by SKU, extracts the product name from results, then searches by product name to find better canonical product pages.
> 
> **Deliverables**:
> - `TwoStepSearchRefiner` class for orchestrating the refinement workflow
> - Configuration system for opt-in activation and thresholds
> - Circuit breaker logic to prevent unnecessary second searches
> - Telemetry logging for A/B comparison of single-pass vs two-step
> - Comprehensive test suite with mocked SerpAPI calls
> 
> **Estimated Effort**: Medium (3-4 days)
> **Parallel Execution**: YES - 2 waves (Config + Refiner → Integration + Tests)
> **Critical Path**: Config → Refiner → Integration → Validation Tests → Review

---

## Context

### Original Request
User wants to improve product discovery by implementing a two-step search pattern:
1. Search by SKU to discover product name from search results
2. Search by extracted product name to find better canonical product pages
3. Extract structured product data from the refined results

### Current System State

**Already Implemented (to extend, not replace)**:
- `apps/scraper/scrapers/ai_search/search.py` - `SerpAPISearchClient` with LRU caching and Brave fallback
- `apps/scraper/scrapers/ai_search/scraper.py` - `AISearchScraper` orchestrator with single-pass extraction
- `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py` - `Crawl4AIExtractor` with JSON-LD → Meta → LLM chain
- `apps/scraper/scrapers/ai_search/name_consolidator.py` - `NameConsolidator` for LLM-powered name inference
- `apps/scraper/scrapers/ai_search/query_builder.py` - `QueryBuilder` for query variant generation
- `apps/scraper/scrapers/ai_search/validation.py` - Validation logic with confidence thresholds
- Budget controls: `max_follow_up_queries=2` (env-configurable)

**Coordinator-Runner Pattern**:
- Coordinator (apps/web) dispatches jobs via `GET /api/scraper/v1/poll`
- Runner (apps/scraper daemon) claims chunks, executes, submits via HMAC-signed callback

### Metis Review Findings

**Identified Gaps** (addressed in this plan):
- Cost escalation risk from 2x SerpAPI calls per SKU
- No circuit breaker for high-confidence first passes
- No A/B validation comparing first vs second pass
- No telemetry to measure improvement
- Ambiguous: should extract from single URL or aggregate across results?

**Guardrails Applied**:
- Opt-in only via `AI_SEARCH_ENABLE_TWO_STEP` env var (default: false)
- Second search only triggers when first pass confidence < threshold
- Count second search toward existing `max_follow_up_queries` budget
- Hard limit: max 2 search phases (no recursion)
- Preserve existing single-pass as fallback

---

## Work Objectives

### Core Objective
Implement a two-step search refinement system that improves product page discovery by first searching SKU, using `NameConsolidator` with LLM to construct the canonical product name from search result snippets (no URL crawling needed), then searching by that name to find canonical product pages, while maintaining cost controls and fallback safety.

### Concrete Deliverables
1. `TwoStepSearchRefiner` class in `apps/scraper/scrapers/ai_search/two_step_refiner.py`
2. Configuration updates in `apps/scraper/scrapers/ai_search/config.py` (or existing config)
3. Integration into `AISearchScraper.scrape_product()` method
4. Telemetry logging for two-step metrics in callback payload
5. Test suite: `apps/scraper/tests/test_two_step_refiner.py`

### Definition of Done
- [ ] `TwoStepSearchRefiner` uses `NameConsolidator` to construct canonical name from first-pass search snippets
- [ ] Second search triggers only when first pass confidence < 0.75 (configurable)
- [ ] Circuit breaker skips second search when first pass confidence ≥ 0.85 AND source is trusted
- [ ] A/B validation: second pass accepted only if confidence ≥ first pass + 0.1
- [ ] All tests pass with mocked SerpAPI (no real API calls in tests)
- [ ] Telemetry records both passes for comparison analysis

### Must Have
- Opt-in activation via environment variable
- Cost controls (respects existing budget)
- Circuit breaker for high-confidence first passes
- Fallback to single-pass on any failure
- Telemetry for measuring improvement
- TDD: tests written before implementation

### Must NOT Have (Guardrails)
- No recursion beyond 2 search phases
- No database persistence for intermediate results
- No modification to existing `SearchClient`, `QueryBuilder`, or validation logic
- No retry logic for failed second searches
- No hardcoded thresholds (must be configurable)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (pytest in apps/scraper/tests/)
- **Automated tests**: TDD (tests first, then implementation)
- **Framework**: pytest with asyncio support
- **Mocking**: `unittest.mock` for SerpAPI responses

### QA Policy
Every task MUST include agent-executed QA scenarios with evidence saved to `.sisyphus/evidence/task-{N}-{scenario}.{ext}`.

- **Python/Backend**: Use Bash to run pytest with specific test cases
- **Integration**: Use Bash to run end-to-end scraper test with real credentials (in dev mode)
- **Evidence**: Test output, log files, JSON results

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation + configuration):
├── Task 1: Add environment variables and config system [quick]
├── Task 2: Design TwoStepSearchRefiner interface [quick]
└── Task 3: Write failing tests for all scenarios [unspecified-high]

Wave 2 (After Wave 1 — core implementation, MAX PARALLEL):
├── Task 4: Implement TwoStepSearchRefiner class [unspecified-high]
├── Task 5: Add product name extraction logic [unspecified-high]
├── Task 6: Implement second search orchestration [unspecified-high]
└── Task 7: Add circuit breaker and A/B validation [quick]

Wave 3 (After Wave 2 — integration + telemetry):
├── Task 8: Integrate into AISearchScraper.scrape_product() [unspecified-high]
├── Task 9: Add telemetry logging for two-step metrics [quick]
└── Task 10: Update callback contract if needed [quick]

Wave 4 (After Wave 3 — validation + docs):
├── Task 11: Integration tests with mocked APIs [unspecified-high]
├── Task 12: Documentation and usage examples [writing]
└── Task 13: Cost analysis telemetry validation [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA with test SKUs (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 → Task 4 → Task 5 → Task 6 → Task 8 → Task 11 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 4 (Wave 2)
```

### Dependency Matrix

- **1**: — — 2, 3
- **2**: 1 — 4
- **3**: 1 — 4, 5, 6, 7
- **4**: 2, 3 — 8
- **5**: 3 — 8
- **6**: 3 — 8
- **7**: 3 — 8
- **8**: 4, 5, 6, 7 — 9, 10, 11
- **9**: 8 — 13
- **10**: 8 — 13
- **11**: 8 — 13
- **12**: — — 13 (can run parallel with 11)
- **13**: 9, 10, 11, 12 — F1-F4

### Agent Dispatch Summary

- **1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `unspecified-high`
- **2**: **4** — T4 → `unspecified-high`, T5 → `unspecified-high`, T6 → `unspecified-high`, T7 → `quick`
- **3**: **3** — T8 → `unspecified-high`, T9 → `quick`, T10 → `quick`
- **4**: **3** — T11 → `unspecified-high`, T12 → `writing`, T13 → `unspecified-high`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add environment variables and configuration system

  **What to do**:
  - Add `AI_SEARCH_ENABLE_TWO_STEP` boolean env var (default: false)
  - Add `AI_SEARCH_SECONDARY_THRESHOLD` float (default: 0.75)
  - Add `AI_SEARCH_CIRCUIT_BREAKER_THRESHOLD` float (default: 0.85)
  - Add `AI_SEARCH_CONFIDENCE_DELTA` float (default: 0.1)
  - Update config loading in `AISearchScraper.__init__()`

  **Must NOT do**:
  - Do not modify existing env vars
  - Do not change default behavior (must be opt-in)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple configuration additions, no complex logic
  - **Skills**: []
    - No special skills needed
  - **Skills Evaluated but Omitted**:
    - N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 2, Task 3
  - **Blocked By**: None

  **References**:
  - `apps/scraper/scrapers/ai_search/scraper.py:83` - Existing env var loading pattern
  - `apps/scraper/.env.example` - Add new vars here

  **Acceptance Criteria**:
  - [ ] New env vars load correctly with defaults
  - [ ] `AISearchScraper` has access to config
  - [ ] Tests verify config loading

  **QA Scenarios**:
  ```
  Scenario: Configuration loads with defaults
    Tool: Bash (python)
    Preconditions: Clean environment, no env vars set
    Steps:
      1. cd apps/scraper && python -c "
         import os
         from scrapers.ai_search.scraper import AISearchScraper
         scraper = AISearchScraper()
         assert scraper.enable_two_step == False
         assert scraper.secondary_threshold == 0.75
         assert scraper.circuit_breaker_threshold == 0.85
         print('Config defaults OK')
      "
    Expected Result: All assertions pass
    Evidence: .sisyphus/evidence/task-1-config-defaults.txt
  ```

  **Commit**: YES
  - Message: `feat(ai_search): add two-step search configuration`
  - Files: `apps/scraper/scrapers/ai_search/scraper.py`, `apps/scraper/.env.example`

- [x] 2. Design TwoStepSearchRefiner interface

  **What to do**:
  - Create `apps/scraper/scrapers/ai_search/two_step_refiner.py`
  - Define `TwoStepSearchRefiner` class with interface:
    - `__init__(search_client, query_builder, config)`
    - `async refine(sku: str, first_pass_results: list, first_pass_confidence: float) -> RefinementResult`
  - Define `RefinementResult` dataclass with:
    - `success: bool`
    - `second_pass_results: list | None`
    - `second_pass_confidence: float | None`
    - `product_name_extracted: str | None`
    - `cost_usd: float`

  **Must NOT do**:
  - Do not implement logic yet (interface only)
  - Do not modify existing classes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Interface design, type definitions only
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 4, 5, 6, 7
  - **Blocked By**: Task 1

  **References**:
  - `apps/scraper/scrapers/ai_search/search.py:303-384` - `SearchClient` interface pattern
  - `apps/scraper/scrapers/ai_search/models.py` - Dataclass patterns

  **Acceptance Criteria**:
  - [ ] Interface defined with type hints
  - [ ] Docstrings for all public methods
  - [ ] Imports resolve correctly

  **QA Scenarios**:
  ```
  Scenario: Interface can be imported without errors
    Tool: Bash (python)
    Preconditions: Python environment set up
    Steps:
      1. cd apps/scraper && python -c "
         from scrapers.ai_search.two_step_refiner import TwoStepSearchRefiner, RefinementResult
         print('Import successful')
      "
    Expected Result: No ImportError
    Evidence: .sisyphus/evidence/task-2-interface-import.txt
  ```

  **Commit**: YES (group with Task 1)
  - Message: `feat(ai_search): add TwoStepSearchRefiner interface`
  - Files: `apps/scraper/scrapers/ai_search/two_step_refiner.py`

- [x] 3. Write failing tests for all scenarios

  **What to do**:
  - Create `apps/scraper/tests/test_two_step_refiner.py`
  - Write tests for:
    1. Second search triggers when confidence < threshold
    2. Circuit breaker skips when confidence ≥ threshold AND trusted source
    3. Product name extraction from first-pass results
    4. A/B validation (second pass accepted only if confidence delta met)
    5. Fallback to single-pass on name extraction failure
    6. Budget enforcement (counts toward max_follow_up_queries)
    7. Telemetry recording for both passes
  - Use `unittest.mock` to mock SerpAPI responses

  **Must NOT do**:
  - Do not write implementation to make tests pass (TDD)
  - Do not hit real SerpAPI in tests

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive test design requires understanding full system
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 4, 5, 6, 7 (tests guide implementation)
  - **Blocked By**: Task 1

  **References**:
  - `apps/scraper/tests/test_ai_search_search_client.py` - Existing test patterns
  - `apps/scraper/scrapers/ai_search/scraper.py:170-291` - `_collect_search_candidates` behavior

  **Acceptance Criteria**:
  - [ ] All 7 test cases written
  - [ ] Tests fail as expected (no implementation yet)
  - [ ] Mock fixtures for SerpAPI responses
  - [ ] Test coverage ≥ 90% for new code

  **QA Scenarios**:
  ```
  Scenario: All tests exist and fail appropriately
    Tool: Bash (pytest)
    Preconditions: Test file created
    Steps:
      1. cd apps/scraper && python -m pytest tests/test_two_step_refiner.py -v 2>&1 | head -50
    Expected Result: Tests are collected, run, and fail (no implementation yet)
    Evidence: .sisyphus/evidence/task-3-failing-tests.txt
  ```

  **Commit**: YES
  - Message: `test(ai_search): add TDD tests for two-step refiner`
  - Files: `apps/scraper/tests/test_two_step_refiner.py`

- [x] 4. Implement TwoStepSearchRefiner class skeleton

  **What to do**:
  - Implement `__init__` with dependency injection:
    - `search_client: SearchClient`
    - `query_builder: QueryBuilder`
    - `config: dict` (thresholds)
  - Implement `refine()` method skeleton with:
    - Circuit breaker check
    - Decision logic for triggering second search
    - Placeholder for name extraction
    - Placeholder for second search execution

  **Must NOT do**:
  - Do not implement name extraction logic yet (Task 5)
  - Do not implement second search yet (Task 6)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Core orchestration logic, needs careful design
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 2, 3)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 5, 6, 7, 8
  - **Blocked By**: Task 1, 2, 3

  **References**:
  - `apps/scraper/scrapers/ai_search/scraper.py:170-291` - `_collect_search_candidates` pattern
  - `apps/scraper/scrapers/ai_search/search.py:303-384` - `SearchClient` usage

  **Acceptance Criteria**:
  - [ ] Class skeleton compiles
  - [ ] Circuit breaker logic implemented
  - [ ] Decision logic for second search
  - [ ] Tests start passing (skeleton only)

  **QA Scenarios**:
  ```
  Scenario: Circuit breaker works
    Tool: Bash (pytest)
    Preconditions: Implementation started
    Steps:
      1. cd apps/scraper && python -m pytest tests/test_two_step_refiner.py::test_circuit_breaker -v
    Expected Result: Test passes
    Evidence: .sisyphus/evidence/task-4-circuit-breaker.txt
  ```

  **Commit**: YES
  - Message: `feat(ai_search): implement TwoStepSearchRefiner skeleton`
  - Files: `apps/scraper/scrapers/ai_search/two_step_refiner.py`

- [x] 5. Add product name extraction logic

  **What to do**:
  - Implement `_extract_product_name(sku, first_pass_results)` method:
    - Use existing `NameConsolidator.consolidate_name()` from `name_consolidator.py:24-89`
    - Pass: `sku`, abbreviated name (from first result title), search snippets
    - Returns: `(canonical_name: str, cost_usd: float)` via LLM
    - Much faster than crawling - extracts from search snippets only
  - Handle edge cases:
    - NameConsolidator returns original name (no improvement found)
    - Empty search snippets (no results to consolidate)
    - LLM API failure (graceful fallback to first-pass results)

  **Must NOT do**:
  - Do not modify `NameConsolidator` (use as-is or extend via composition)
  - Do not persist intermediate results to database

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex extraction logic, multiple strategies
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Task 1, 2, 3, 4

  **References**:
  - `apps/scraper/scrapers/ai_search/name_consolidator.py` - Existing name consolidation
  - `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py:111-200` - Extraction patterns

  **Acceptance Criteria**:
  - [ ] Product name extracted from first-pass results
  - [ ] Confidence score assigned
  - [ ] Fallback when extraction fails
  - [ ] Test passes: `test_name_extraction_success`
  - [ ] Test passes: `test_name_extraction_failure_fallback`

  **QA Scenarios**:
  ```
  Scenario: Name extraction succeeds
    Tool: Bash (pytest)
    Preconditions: Mocked search results with clear product name
    Steps:
      1. cd apps/scraper && python -m pytest tests/test_two_step_refiner.py::test_name_extraction_success -v
    Expected Result: Test passes, product name extracted correctly
    Evidence: .sisyphus/evidence/task-5-name-extraction.txt
  ```

  **Commit**: YES
  - Message: `feat(ai_search): add product name extraction logic`
  - Files: `apps/scraper/scrapers/ai_search/two_step_refiner.py`

- [x] 6. Implement second search orchestration

  **What to do**:
  - Implement `_execute_second_search(product_name, brand)` method:
    - Use `QueryBuilder.build_search_query()` to build refined query
    - Use `SearchClient.search()` to execute second search
    - Return: `(results: list, confidence: float)`
  - Respect budget: increment query counter, check against max

  **Must NOT do**:
  - Do not exceed `max_follow_up_queries` budget
  - Do not retry failed second searches

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Orchestration with external API
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Task 1, 2, 3, 4

  **References**:
  - `apps/scraper/scrapers/ai_search/query_builder.py:76-120` - Query building
  - `apps/scraper/scrapers/ai_search/search.py:303-384` - Search execution

  **Acceptance Criteria**:
  - [ ] Second search executes correctly
  - [ ] Query built with product name + brand
  - [ ] Budget enforcement works
  - [ ] Test passes: `test_second_search_triggers`
  - [ ] Test passes: `test_budget_enforcement`

  **QA Scenarios**:
  ```
  Scenario: Second search executes with correct query
    Tool: Bash (pytest)
    Preconditions: Mocked QueryBuilder and SearchClient
    Steps:
      1. cd apps/scraper && python -m pytest tests/test_two_step_refiner.py::test_second_search_triggers -v
    Expected Result: Test passes, correct query constructed
    Evidence: .sisyphus/evidence/task-6-second-search.txt
  ```

  **Commit**: YES
  - Message: `feat(ai_search): implement second search orchestration`
  - Files: `apps/scraper/scrapers/ai_search/two_step_refiner.py`

- [x] 7. Add circuit breaker and A/B validation

  **What to do**:
  - Implement `_select_best_result(first_pass, second_pass)`:
    - If second pass confidence ≥ first pass + delta → use second pass
    - Else → use first pass
  - Return the better result with metadata about which pass won

  **Must NOT do**:
  - Do not always prefer second pass (must beat threshold)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple comparison logic
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Task 1, 2, 3, 4

  **References**:
  - `apps/scraper/scrapers/ai_search/validation.py:142-148` - Confidence thresholds

  **Acceptance Criteria**:
  - [ ] A/B comparison implemented
  - [ ] Delta threshold configurable
  - [ ] Test passes: `test_ab_validation_prefers_second_when_better`
  - [ ] Test passes: `test_ab_validation_keeps_first_when_better`

  **QA Scenarios**:
  ```
  Scenario: A/B validation prefers better result
    Tool: Bash (pytest)
    Preconditions: Mocked results with different confidence scores
    Steps:
      1. cd apps/scraper && python -m pytest tests/test_two_step_refiner.py -k "ab_validation" -v
    Expected Result: Both tests pass
    Evidence: .sisyphus/evidence/task-7-ab-validation.txt
  ```

  **Commit**: YES
  - Message: `feat(ai_search): add A/B validation for result selection`
  - Files: `apps/scraper/scrapers/ai_search/two_step_refiner.py`

- [ ] 8. Integrate into AISearchScraper.scrape_product()

  **What to do**:
  - Modify `scrape_product()` in `scraper.py`:
    - Check `enable_two_step` config
    - If enabled and first pass confidence < threshold:
      - Instantiate `TwoStepSearchRefiner`
      - Call `refine()` with first-pass results
      - Use refined results if better
    - Always fallback to single-pass on any error
  - Ensure backward compatibility (existing behavior unchanged when disabled)

  **Must NOT do**:
  - Do not modify existing single-pass logic (wrap it)
  - Do not break existing tests

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration with existing orchestrator, requires careful testing
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 4-7)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 9, 10, 11
  - **Blocked By**: Task 1, 2, 3, 4, 5, 6, 7

  **References**:
  - `apps/scraper/scrapers/ai_search/scraper.py:400-550` - `scrape_product()` method
  - `apps/scraper/scrapers/ai_search/scraper.py:170-291` - `_collect_search_candidates`

  **Acceptance Criteria**:
  - [ ] Integration works when two-step enabled
  - [ ] Existing behavior preserved when disabled
  - [ ] Fallback on error works correctly
  - [ ] All existing tests still pass
  - [ ] New integration tests pass

  **QA Scenarios**:
  ```
  Scenario: Integration works end-to-end
    Tool: Bash (pytest)
    Preconditions: Full implementation complete
    Steps:
      1. cd apps/scraper && python -m pytest tests/test_ai_search_scraper.py -k "two_step" -v
      2. cd apps/scraper && python -m pytest tests/test_two_step_refiner.py -v
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-8-integration.txt
  ```

  **Commit**: YES
  - Message: `feat(ai_search): integrate two-step refiner into AISearchScraper`
  - Files: `apps/scraper/scrapers/ai_search/scraper.py`

- [ ] 9. Add telemetry logging for two-step metrics

  **What to do**:
  - Add telemetry fields to `AISearchResult`:
    - `first_pass_confidence: float`
    - `second_pass_confidence: float | None`
    - `two_step_triggered: bool`
    - `two_step_improved: bool | None`
    - `product_name_extracted: str | None`
  - Log to callback payload
  - Add to callback contract if needed

  **Must NOT do**:
  - Do not break existing callback contract

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding fields to existing structures
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 10)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 13
  - **Blocked By**: Task 8

  **References**:
  - `apps/scraper/scrapers/ai_search/models.py` - AISearchResult dataclass
  - `apps/web/lib/scraper-callback/contract.ts` - Callback contract

  **Acceptance Criteria**:
  - [ ] Telemetry fields added
  - [ ] Data flows through callback
  - [ ] Test passes: `test_telemetry_records_two_step`

  **QA Scenarios**:
  ```
  Scenario: Telemetry is recorded
    Tool: Bash (pytest)
    Preconditions: Integration complete
    Steps:
      1. cd apps/scraper && python -m pytest tests/test_two_step_refiner.py::test_telemetry_records_two_step -v
    Expected Result: Test passes, telemetry verified
    Evidence: .sisyphus/evidence/task-9-telemetry.txt
  ```

  **Commit**: YES (group with Task 8)
  - Message: `feat(ai_search): add two-step telemetry metrics`
  - Files: `apps/scraper/scrapers/ai_search/models.py`, `apps/scraper/scrapers/ai_search/scraper.py`

- [ ] 10. Update callback contract if needed

  **What to do**:
  - Check `apps/web/lib/scraper-callback/contract.ts`
  - Add new fields to `ScraperResultsSchema` if not already covered
  - Ensure TypeScript types match Python dataclass

  **Must NOT do**:
  - Do not make breaking changes to contract

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: TypeScript schema updates
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 9)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 13
  - **Blocked By**: Task 8

  **References**:
  - `apps/web/lib/scraper-callback/contract.ts` - Zod schemas
  - `apps/scraper/scrapers/ai_search/models.py` - Python dataclass

  **Acceptance Criteria**:
  - [ ] TypeScript types updated
  - [ ] Zod schema validates new fields
  - [ ] No TypeScript errors

  **QA Scenarios**:
  ```
  Scenario: Contract compiles without errors
    Tool: Bash (npx tsc)
    Preconditions: TypeScript types updated
    Steps:
      1. cd apps/web && npx tsc --noEmit lib/scraper-callback/contract.ts
    Expected Result: No TypeScript errors
    Evidence: .sisyphus/evidence/task-10-contract.txt
  ```

  **Commit**: YES (group with Task 8, 9)
  - Message: `feat(ai_search): update callback contract for two-step metrics`
  - Files: `apps/web/lib/scraper-callback/contract.ts`

- [ ] 11. Integration tests with mocked APIs

  **What to do**:
  - Create comprehensive integration tests:
    - Test with realistic SKU scenarios (ambiguous, clear, no results)
    - Mock SerpAPI responses for both passes
    - Verify cost tracking
    - Verify telemetry accuracy
  - Use pytest fixtures for test data

  **Must NOT do**:
  - Do not hit real SerpAPI
  - Do not use real API keys in tests

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex integration testing
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 8-10)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 13, F1-F4
  - **Blocked By**: Task 1, 2, 3, 4, 5, 6, 7, 8, 9, 10

  **References**:
  - `apps/scraper/tests/test_ai_search_search_client.py` - Mock patterns
  - `apps/scraper/tests/` - Existing test structure

  **Acceptance Criteria**:
  - [ ] Integration tests for 3+ SKU scenarios
  - [ ] All tests pass
  - [ ] Coverage ≥ 90%
  - [ ] No real API calls in tests

  **QA Scenarios**:
  ```
  Scenario: All integration tests pass
    Tool: Bash (pytest)
    Preconditions: Full implementation complete
    Steps:
      1. cd apps/scraper && python -m pytest tests/test_two_step_refiner.py -v --cov=scrapers.ai_search.two_step_refiner --cov-report=term-missing
    Expected Result: 100% tests pass, ≥90% coverage
    Evidence: .sisyphus/evidence/task-11-integration-tests.txt
  ```

  **Commit**: YES
  - Message: `test(ai_search): add integration tests for two-step refiner`
  - Files: `apps/scraper/tests/test_two_step_refiner.py`

- [ ] 12. Documentation and usage examples

  **What to do**:
  - Document in `apps/scraper/scrapers/ai_search/README.md` (or create):
    - How two-step refinement works
    - Configuration options
    - When to enable vs disable
    - Cost implications
  - Add code examples for common use cases
  - Document telemetry fields

  **Must NOT do**:
  - Do not duplicate existing documentation

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation task
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 11)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 13
  - **Blocked By**: Task 1-10

  **References**:
  - `apps/scraper/README.md` - Existing docs
  - `apps/scraper/scrapers/ai_search/scraper.py` - Implementation details

  **Acceptance Criteria**:
  - [ ] README created/updated
  - [ ] Configuration documented
  - [ ] Examples provided
  - [ ] Cost implications explained

  **QA Scenarios**:
  ```
  Scenario: Documentation is complete
    Tool: Bash (cat)
    Preconditions: README created
    Steps:
      1. cat apps/scraper/scrapers/ai_search/README.md | grep -E "(two.step|configuration|cost)" | wc -l
    Expected Result: ≥10 matches (documentation covers key topics)
    Evidence: .sisyphus/evidence/task-12-documentation.txt
  ```

  **Commit**: YES (group with Task 11)
  - Message: `docs(ai_search): document two-step search refinement`
  - Files: `apps/scraper/scrapers/ai_search/README.md`

- [ ] 13. Cost analysis telemetry validation

  **What to do**:
  - Validate cost tracking is accurate:
    - First pass cost
    - Second pass cost (when triggered)
    - Total cost per SKU
  - Ensure costs flow through to callback correctly
  - Verify cost delta is measurable (should see ~2x cost when two-step triggers)

  **Must NOT do**:
  - Do not let costs exceed budget unnoticed

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding of cost tracking system
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 8-12)
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12

  **References**:
  - `apps/scraper/scrapers/ai_search/scraper.py` - Cost tracking
  - `apps/web/lib/scraper-callback/contract.ts` - Cost fields

  **Acceptance Criteria**:
  - [ ] Cost tracking validated
  - [ ] Test passes: `test_cost_tracking_accurate`
  - [ ] Cost delta measurable
  - [ ] Budget enforcement verified

  **QA Scenarios**:
  ```
  Scenario: Cost tracking is accurate
    Tool: Bash (pytest)
    Preconditions: Full implementation complete
    Steps:
      1. cd apps/scraper && python -m pytest tests/test_two_step_refiner.py::test_cost_tracking_accurate -v
    Expected Result: Test passes, costs match expected
    Evidence: .sisyphus/evidence/task-13-cost-tracking.txt
  ```

  **Commit**: YES
  - Message: `test(ai_search): validate cost tracking for two-step search`
  - Files: `apps/scraper/tests/test_two_step_refiner.py`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. Verify:
  - All "Must Have" items implemented (opt-in, circuit breaker, A/B validation, telemetry)
  - All "Must NOT Have" items absent (no recursion, no DB persistence, no breaking changes)
  - Evidence files exist in .sisyphus/evidence/
  - Tests cover all scenarios
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `ruff check apps/scraper/scrapers/ai_search/` and `python -m pytest apps/scraper/tests/`.
  Review for:
  - No `any` types without justification
  - Proper async/await usage
  - No hardcoded values (use config)
  - Docstrings on public methods
  Output: `Lint [PASS/FAIL] | Tests [N pass/N fail] | Type Check [PASS/FAIL] | VERDICT`

- [ ] F3. **Real Manual QA with Test SKUs** — `unspecified-high`
  Run end-to-end test with real SKUs (in dev mode):
  ```bash
  cd apps/scraper
  AI_SEARCH_ENABLE_TWO_STEP=true python -c "
  import asyncio
  from scrapers.ai_search.scraper import AISearchScraper
  scraper = AISearchScraper()
  result = asyncio.run(scraper.scrape_product(
      sku='YOUR_TEST_SKU',
      product_name='Test Product',
      brand='Test Brand'
  ))
  print(f'Success: {result.success}')
  print(f'Confidence: {result.confidence}')
  print(f'Two-step triggered: {result.two_step_triggered}')
  print(f'Cost: ${result.cost_usd:.4f}')
  "
  ```
  Save results and logs to `.sisyphus/evidence/final-qa/`.
  Output: `Real SKUs [N/N pass] | Cost Valid [YES/NO] | Telemetry Valid [YES/NO] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Verify:
  - Only two search phases (no recursion)
  - Circuit breaker works as specified
  - A/B validation uses correct delta
  - Telemetry records all required fields
  - No modifications to existing SearchClient/QueryBuilder
  Output: `Phases [2 max] | Circuit [WORKING] | AB [CORRECT] | Telemetry [COMPLETE] | VERDICT`

---

## Commit Strategy

- **1**: `feat(ai_search): add two-step search configuration` — scraper.py, .env.example
- **2**: `feat(ai_search): add TwoStepSearchRefiner interface` — two_step_refiner.py
- **3**: `test(ai_search): add TDD tests for two-step refiner` — test_two_step_refiner.py
- **4**: `feat(ai_search): implement TwoStepSearchRefiner skeleton` — two_step_refiner.py
- **5**: `feat(ai_search): add product name extraction logic` — two_step_refiner.py
- **6**: `feat(ai_search): implement second search orchestration` — two_step_refiner.py
- **7**: `feat(ai_search): add A/B validation for result selection` — two_step_refiner.py
- **8**: `feat(ai_search): integrate two-step refiner into AISearchScraper` — scraper.py
- **9**: `feat(ai_search): add two-step telemetry metrics` — models.py, scraper.py
- **10**: `feat(ai_search): update callback contract for two-step metrics` — contract.ts
- **11**: `test(ai_search): add integration tests for two-step refiner` — test_two_step_refiner.py
- **12**: `docs(ai_search): document two-step search refinement` — README.md
- **13**: `test(ai_search): validate cost tracking for two-step search` — test_two_step_refiner.py

---

## Success Criteria

### Verification Commands
```bash
# Run all tests
cd apps/scraper && python -m pytest tests/test_two_step_refiner.py -v

# Check coverage
cd apps/scraper && python -m pytest tests/test_two_step_refiner.py --cov=scrapers.ai_search.two_step_refiner --cov-report=term-missing

# TypeScript validation
cd apps/web && npx tsc --noEmit lib/scraper-callback/contract.ts

# Lint Python code
cd apps/scraper && ruff check scrapers/ai_search/

# Integration test (with real API in dev mode)
cd apps/scraper && AI_SEARCH_ENABLE_TWO_STEP=true python -m pytest tests/test_two_step_refiner.py::test_end_to_end -v -s
```

### Final Checklist
- [ ] All "Must Have" present (opt-in, circuit breaker, A/B validation, telemetry)
- [ ] All "Must NOT Have" absent (no recursion, no DB persistence, no breaking changes)
- [ ] All tests pass (≥90% coverage)
- [ ] TypeScript types valid
- [ ] Documentation complete
- [ ] Cost tracking validated
- [ ] Real SKU test successful
