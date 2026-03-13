# Work Plan: Playwright Scraper Performance Fixes

## TL;DR

> **Objective**: Fix 15 critical performance and reliability issues in the Playwright scraper to reduce timeouts by 83%, eliminate resource leaks, and improve success rate from 70% to 92%.
> 
> **Deliverables**: 
> - Tiered timeout strategy implementation
> - Resource cleanup guarantees with context managers  
> - Intelligent retry policies with circuit breaker tuning
> - Fallback selector system
> - Comprehensive observability and tracing
> 
> **Estimated Effort**: Large (2-3 weeks)
> **Parallel Execution**: YES - 4 waves with 15 parallel tasks
> **Critical Path**: Wave 1 → Wave 2 → Wave 3 → Wave 4

---

## Context

### Original Request
Critical review identified widespread performance degradation in Playwright scrapers: timeouts, slow execution, missing product data. Root causes include timeout chaos, aggressive retry reduction (max 1 retry), resource cleanup gaps, brittle selectors, and missing wait conditions.

### Interview Summary
**Key Findings from Review:**
- Timeout values range from 1.5s to 60s with no coherent strategy
- `SCRAPER_MAX_RETRIES=1` prevents recovery from transient failures
- No context managers for browser lifecycle - cleanup not guaranteed
- Selectors rely on brittle CSS classes without fallbacks
- Optional fields timeout after only 1.5 seconds
- Circuit breaker opens after only 5 failures
- No tracing or detailed debugging information collected

### Research Findings
**Playwright Best Practices (from skill review):**
- Use auto-waiting instead of fixed timeouts
- Implement web-first assertions with retry
- Use role/label-based locators over CSS classes
- Collect traces on failure for debugging
- Block unnecessary resources (images, analytics) for performance

---

## Work Objectives

### Core Objective
Transform the scraper from a "fast failure" system that quickly gives up into a resilient, reliable system that intelligently handles transient failures while maintaining performance.

### Concrete Deliverables
- [ ] Tiered timeout configuration system (critical/important/optional)
- [ ] Context manager-based browser lifecycle management
- [ ] Per-failure-type retry policies with exponential backoff
- [ ] Fallback selector system in YAML configs
- [ ] Request interception to block unnecessary resources
- [ ] Comprehensive tracing and observability
- [ ] Selector health monitoring dashboard

### Definition of Done
- [ ] All scrapers complete with >90% success rate in staging
- [ ] Zero resource leaks detected in 24-hour stress test
- [ ] Timeout rate reduced to <5% from current ~30%
- [ ] Missing data rate reduced to <8% from current ~25%
- [ ] Average scrape time reduced by 20% through resource blocking

### Must Have
- [ ] Fix timeout configuration chaos
- [ ] Implement guaranteed resource cleanup
- [ ] Restore sensible retry policies (3 retries minimum)
- [ ] Add fallback selector support
- [ ] Implement request interception for performance

### Must NOT Have (Guardrails)
- [ ] Do NOT increase global timeouts uniformly (use tiered strategy)
- [ ] Do NOT disable circuit breaker entirely (tune it instead)
- [ ] Do NOT remove existing selector configs (add fallbacks alongside)
- [ ] Do NOT add blocking waits that slow execution
- [ ] Do NOT introduce breaking changes to YAML schema

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES - pytest framework in place
- **Automated tests**: TDD for new components, integration tests for fixes
- **Framework**: pytest with async support
- **Coverage target**: 80% for new code, regression tests for fixes

### QA Policy
Every task includes agent-executed QA scenarios:
- **Performance tests**: Measure before/after timing, timeout rates
- **Resource leak tests**: Monitor memory/context usage over 100+ scrapes
- **Integration tests**: Run full scrapes on real sites in staging
- **Stress tests**: 24-hour continuous operation test

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Start Immediately):
├── Task 1: Create timeout configuration system
├── Task 2: Implement browser context manager
├── Task 3: Add request interception for resource blocking
├── Task 4: Create selector health monitoring framework
└── Task 5: Implement tracing collection system

Wave 2 (Core Reliability - After Wave 1):
├── Task 6: Fix selector resolver timeout logic
├── Task 7: Implement tiered timeouts in extract handlers
├── Task 8: Add retry policies per failure type
├── Task 9: Tune circuit breaker configuration
├── Task 10: Implement fallback selector system
└── Task 11: Add network idle waiting strategies

Wave 3 (Integration - After Wave 2):
├── Task 12: Update all YAML configs with fallback selectors
├── Task 13: Implement progressive timeout escalation
├── Task 14: Add comprehensive error handling with retry hints
└── Task 15: Create observability dashboard

Wave 4 (Optimization - After Wave 3):
├── Task 16: Optimize navigation wait strategies
├── Task 17: Add anti-detection fallback handling
├── Task 18: Implement click action improvements
└── Task 19: Add session timeout management

Wave 5 (Validation - After ALL):
├── Task 20: Run 24-hour stress test
├── Task 21: Performance benchmark comparison
├── Task 22: Migration guide and documentation
└── Task FINAL: Production rollout plan
```

### Dependency Matrix

| Task | Blocks | Blocked By |
|------|--------|------------|
| 1 (Timeout Config) | 6, 7, 13 | None |
| 2 (Context Manager) | 8, 9 | None |
| 3 (Request Interception) | 16 | None |
| 4 (Selector Health) | 10, 15 | None |
| 5 (Tracing) | 14, 15 | None |
| 6 (Selector Resolver) | 12 | 1 |
| 7 (Extract Handlers) | 12 | 1 |
| 8 (Retry Policies) | 11 | 2 |
| 9 (Circuit Breaker) | 14 | 2 |
| 10 (Fallback Selectors) | 12 | 4 |
| 11 (Network Idle) | 16 | 8 |
| 12 (YAML Updates) | 20 | 6, 7, 10 |
| 13 (Progressive Timeouts) | 20 | 1 |
| 14 (Error Handling) | 20 | 5, 9 |
| 15 (Dashboard) | 20 | 4, 5 |
| 16-19 | 20 | Previous |
| 20-22 | FINAL | All |

### Agent Dispatch Summary

- **Wave 1**: 5 tasks → `deep` (architecture), `unspecified-high` (implementation)
- **Wave 2**: 6 tasks → `deep` (retry logic), `quick` (configuration), `unspecified-high` (integration)
- **Wave 3**: 4 tasks → `unspecified-high` (YAML updates), `deep` (progressive logic)
- **Wave 4**: 4 tasks → `unspecified-high` (optimization), `quick` (refactoring)
- **Wave 5**: 4 tasks → `deep` (stress testing), `writing` (documentation)

---

## TODOs

- [ ] 1. Create Timeout Configuration System

  **What to do**:
  - Create `core/timeout_config.py` with tiered timeout strategy
  - Define timeout tiers: critical (30s), important (10s), optional (5s), fallback (2s)
  - Implement progressive escalation: base_timeout * (1.5 ^ attempt)
  - Add configuration validation and defaults
  - Create unit tests for all timeout calculations

  **Must NOT do**:
  - Do NOT create a single global timeout
  - Do NOT remove existing timeout parameters (deprecate gradually)
  - Do NOT increase timeouts uniformly for all operations

  **Recommended Agent Profile**:
  - **Category**: `deep` - This requires careful architectural design
  - **Skills**: None needed
  - **Reason**: Core infrastructure change affecting all scrapers

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-5)
  - **Blocks**: Tasks 6, 7, 13
  - **Blocked By**: None

  **References**:
  - Pattern: `core/adaptive_retry_strategy.py` - Similar configuration pattern
  - Current timeouts: `selector_resolver.py:49,80` - 5000ms hardcoded
  - Optional timeout: `scrapers/actions/handlers/extract.py:12` - 1500ms

  **Acceptance Criteria**:
  - [ ] `TimeoutConfig` class with tier definitions
  - [ ] `get_timeout(tier, attempt)` method with progressive escalation
  - [ ] Unit tests: `tests/unit/test_timeout_config.py` with 100% coverage
  - [ ] Documentation in `docs/timeouts.md`

  **QA Scenarios**:
  ```
  Scenario: Critical tier timeout calculation
    Tool: Bash (pytest)
    Steps:
      1. Run: python -m pytest tests/unit/test_timeout_config.py -v
      2. Verify: Critical tier returns 30000ms on attempt 0
      3. Verify: Critical tier returns 45000ms on attempt 1 (1.5x escalation)
    Expected Result: All timeout calculations pass
    Evidence: .sisyphus/evidence/task-1-timeout-calcs.txt
  ```

  **Commit**: YES
  - Message: `feat(core): add tiered timeout configuration system`
  - Files: `core/timeout_config.py`, `tests/unit/test_timeout_config.py`
  - Pre-commit: `pytest tests/unit/test_timeout_config.py`

---

- [ ] 2. Implement Browser Context Manager

  **What to do**:
  - Create `utils/scraping/browser_context.py` with managed browser lifecycle
  - Implement `ManagedBrowser` class with `__aenter__` and `__aexit__`
  - Add guaranteed cleanup with timeout and force cleanup fallback
  - Integrate with existing `PlaywrightScraperBrowser` class
  - Add comprehensive error handling and logging
  - Create unit tests mocking Playwright objects

  **Must NOT do**:
  - Do NOT break existing browser initialization API
  - Do NOT remove existing `quit()` method
  - Do NOT skip cleanup on any exception type

  **Recommended Agent Profile**:
  - **Category**: `deep` - Resource management is critical infrastructure
  - **Skills**: None needed
  - **Reason**: Ensures resource cleanup guarantees across all failure modes

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3-5)
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: None

  **References**:
  - Current implementation: `utils/scraping/playwright_browser.py` - Lines 45-227
  - Cleanup issues: `scrapers/executor/workflow_executor.py:354-356` - Finally block gaps
  - Pattern: `fixtures-hooks.md` from Playwright skill - Fixture cleanup patterns

  **Acceptance Criteria**:
  - [ ] `ManagedBrowser` context manager class
  - [ ] Cleanup timeout of 10 seconds with force cleanup fallback
  - [ ] Unit tests: `tests/unit/test_browser_context.py` with mocked Playwright
  - [ ] Integration with `PlaywrightScraperBrowser`

  **QA Scenarios**:
  ```
  Scenario: Guaranteed cleanup on exception
    Tool: Bash (pytest)
    Steps:
      1. Run: python -m pytest tests/unit/test_browser_context.py::test_cleanup_on_exception -v
      2. Verify: Mock browser.close() called even when exception raised
      3. Verify: Force cleanup called if normal cleanup times out
    Expected Result: 100% cleanup rate in tests
    Evidence: .sisyphus/evidence/task-2-cleanup-test.log
  ```

  **Commit**: YES
  - Message: `feat(utils): add managed browser context manager with guaranteed cleanup`
  - Files: `utils/scraping/browser_context.py`, `tests/unit/test_browser_context.py`
  - Pre-commit: `pytest tests/unit/test_browser_context.py`

---

- [ ] 3. Add Request Interception for Resource Blocking

  **What to do**:
  - Add `block_unnecessary_resources()` method to `PlaywrightScraperBrowser`
  - Block images, CSS, fonts, analytics, tracking scripts
  - Add whitelist configuration for essential resources
  - Implement in `initialize()` method after page creation
  - Add metrics collection for blocked vs allowed requests
  - Create unit tests with mocked route handling

  **Must NOT do**:
  - Do NOT block API calls or essential JavaScript
  - Do NOT break existing navigation behavior
  - Do NOT increase memory usage with request tracking

  **Recommended Agent Profile**:
  - **Category**: `quick` - Straightforward implementation
  - **Skills**: None needed
  - **Reason**: Well-defined scope with clear implementation path

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-2, 4-5)
  - **Blocks**: Task 16
  - **Blocked By**: None

  **References**:
  - Playwright docs: `page.route()` for request interception
  - Pattern: `network-advanced.md` from Playwright skill
  - Current browser: `utils/scraping/playwright_browser.py:118` - Page creation

  **Acceptance Criteria**:
  - [ ] `block_unnecessary_resources()` method
  - [ ] Blocks: images, CSS, fonts, analytics, tracking
  - [ ] Whitelist for essential resources
  - [ ] Metrics: blocked_count, allowed_count
  - [ ] Unit tests: `tests/unit/test_resource_blocking.py`

  **QA Scenarios**:
  ```
  Scenario: Resource blocking reduces page load time
    Tool: Bash (Python script)
    Steps:
      1. Run: python scripts/benchmark_resource_blocking.py --url https://example.com
      2. Verify: Load time with blocking < load time without blocking
      3. Verify: Images are blocked (404 or aborted)
    Expected Result: 20%+ improvement in load time
    Evidence: .sisyphus/evidence/task-3-performance-benchmark.json
  ```

  **Commit**: YES
  - Message: `feat(utils): add request interception to block unnecessary resources`
  - Files: `utils/scraping/playwright_browser.py`, `tests/unit/test_resource_blocking.py`
  - Pre-commit: `pytest tests/unit/test_resource_blocking.py`

---

- [ ] 4. Create Selector Health Monitoring Framework

  **What to do**:
  - Create `core/selector_health.py` with `SelectorHealthTracker` class
  - Track success/failure rates per selector per site
  - Store history in JSON or SQLite for analysis
  - Implement alert mechanism when success rate drops below threshold
  - Add recommendations for alternative selectors
  - Create dashboard data endpoints
  - Add unit tests for tracking logic

  **Must NOT do**:
  - Do NOT modify existing selector configs
  - Do NOT impact scrape performance with tracking
  - Do NOT store excessive data (limit history to 30 days)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` - Requires both tracking and analysis logic
  - **Skills**: None needed
  - **Reason**: Data tracking with analytical components

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-3, 5)
  - **Blocks**: Tasks 10, 15
  - **Blocked By**: None

  **References**:
  - Pattern: `core/failure_analytics.py` - Similar tracking pattern
  - Selectors: `scrapers/configs/*.yaml` - Selector definitions
  - Resolution: `scrapers/executor/selector_resolver.py` - Where tracking hooks

  **Acceptance Criteria**:
  - [ ] `SelectorHealthTracker` class with track_selector_result() method
  - [ ] Success rate calculation per selector per site
  - [ ] JSON persistence with rotation (keep 30 days)
  - [ ] Alert when success rate < 70%
  - [ ] Unit tests: `tests/unit/test_selector_health.py`

  **QA Scenarios**:
  ```
  Scenario: Selector health tracking works correctly
    Tool: Bash (pytest)
    Steps:
      1. Run: python -m pytest tests/unit/test_selector_health.py -v
      2. Verify: Success rate calculated correctly from history
      3. Verify: Alert triggered when threshold breached
    Expected Result: All health tracking tests pass
    Evidence: .sisyphus/evidence/task-4-health-tracking.log
  ```

  **Commit**: YES
  - Message: `feat(core): add selector health monitoring framework`
  - Files: `core/selector_health.py`, `tests/unit/test_selector_health.py`
  - Pre-commit: `pytest tests/unit/test_selector_health.py`

---

- [ ] 5. Implement Tracing Collection System

  **What to do**:
  - Create `utils/scraping/tracing.py` with `TracingCollector` class
  - Integrate with Playwright's tracing API (start/stop)
  - Collect screenshots, DOM snapshots, network logs on failure
  - Store traces in configurable location (local or cloud storage)
  - Add configuration for trace retention policy
  - Implement trace upload mechanism for debugging
  - Create unit tests for trace collection

  **Must NOT do**:
  - Do NOT collect traces for successful scrapes by default (performance)
  - Do NOT store traces indefinitely (implement cleanup)
  - Do NOT impact scrape performance when disabled

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` - File handling and Playwright integration
  - **Skills**: None needed
  - **Reason**: Complex integration with Playwright APIs

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-4)
  - **Blocks**: Tasks 14, 15
  - **Blocked By**: None

  **References**:
  - Playwright docs: `context.tracing.start()` and `stop()`
  - Pattern: `debugging.md` from Playwright skill - Trace viewer usage
  - Current error handling: `scrapers/actions/handlers/extract.py:175-177` - Add tracing here

  **Acceptance Criteria**:
  - [ ] `TracingCollector` class with start/stop methods
  - [ ] Integration with workflow executor on failure
  - [ ] Configurable retention (default: 7 days)
  - [ ] Unit tests: `tests/unit/test_tracing.py`
  - [ ] Documentation for viewing traces

  **QA Scenarios**:
  ```
  Scenario: Trace collected on scrape failure
    Tool: Bash (Python script)
    Steps:
      1. Run: python scripts/test_trace_collection.py --fail-on-purpose
      2. Verify: Trace file created in traces/ directory
      3. Verify: Trace contains screenshots and network logs
    Expected Result: Trace file > 100KB with complete data
    Evidence: .sisyphus/evidence/task-5-trace-collection/
  ```

  **Commit**: YES
  - Message: `feat(utils): add Playwright tracing collection for debugging`
  - Files: `utils/scraping/tracing.py`, `tests/unit/test_tracing.py`
  - Pre-commit: `pytest tests/unit/test_tracing.py`

---

- [ ] 6. Fix Selector Resolver Timeout Logic

  **What to do**:
  - Modify `scrapers/executor/selector_resolver.py` to use tiered timeouts
  - Update `find_element_safe()` to use `TimeoutConfig`
  - Change default timeout from 5000ms to tier-based (required: 10s, optional: 5s)
  - Add parameter for custom timeout override
  - Maintain backward compatibility with existing calls
  - Update unit tests to verify tiered behavior

  **Must NOT do**:
  - Do NOT change function signatures (add optional parameters only)
  - Do NOT break existing timeout parameter usage
  - Do NOT remove the 5000ms default entirely (deprecate gracefully)

  **Recommended Agent Profile**:
  - **Category**: `quick` - Straightforward refactoring
  - **Skills**: None needed
  - **Reason**: Clear integration point, well-defined changes

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7-11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:
  - Current implementation: `scrapers/executor/selector_resolver.py:49,80`
  - Timeout config: `core/timeout_config.py` (from Task 1)
  - Usage examples: `scrapers/actions/handlers/extract.py:58-61`

  **Acceptance Criteria**:
  - [ ] `find_element_safe()` uses tiered timeouts
  - [ ] Required fields use 10s, optional fields use 5s
  - [ ] Backward compatibility maintained
  - [ ] Unit tests updated: `tests/unit/test_selector_resolver.py`

  **QA Scenarios**:
  ```
  Scenario: Required field gets longer timeout
    Tool: Bash (pytest)
    Steps:
      1. Run: python -m pytest tests/unit/test_selector_resolver.py::test_required_field_timeout -v
      2. Verify: Required field timeout is 10000ms
      3. Verify: Optional field timeout is 5000ms
    Expected Result: Timeout differentiation works
    Evidence: .sisyphus/evidence/task-6-timeout-logic.log
  ```

  **Commit**: YES
  - Message: `refactor(executor): use tiered timeouts in selector resolver`
  - Files: `scrapers/executor/selector_resolver.py`, `tests/unit/test_selector_resolver.py`
  - Pre-commit: `pytest tests/unit/test_selector_resolver.py`

---

- [ ] 7. Implement Tiered Timeouts in Extract Handlers

  **What to do**:
  - Update `scrapers/actions/handlers/extract.py` to use `TimeoutConfig`
  - Change `DEFAULT_OPTIONAL_FIELD_TIMEOUT_MS` from 1500ms to 5000ms
  - Add `resolve_timeout_for_field()` helper function
  - Use required vs optional field status to determine tier
  - Update `ExtractAction`, `ExtractSingleAction`, `ExtractMultipleAction`
  - Maintain integration with selector health tracker (Task 4)
  - Update unit tests in `tests/unit/test_optional_field_timeouts.py`

  **Must NOT do**:
  - Do NOT change the 1500ms constant directly (use new config)
  - Do NOT break existing field extraction behavior
  - Do NOT remove support for custom timeout_ms parameter

  **Recommended Agent Profile**:
  - **Category**: `quick` - Handler updates
  - **Skills**: None needed
  - **Reason**: Handler logic updates with clear patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 8-11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:
  - Current implementation: `scrapers/actions/handlers/extract.py:12,55-56`
  - Timeout config: `core/timeout_config.py` (from Task 1)
  - Tests: `tests/unit/test_optional_field_timeouts.py`

  **Acceptance Criteria**:
  - [ ] Optional field timeout increased to 5000ms
  - [ ] Required fields use 10000ms timeout
  - [ ] All extract handlers updated
  - [ ] Unit tests updated and passing

  **QA Scenarios**:
  ```
  Scenario: Extract action uses correct timeout
    Tool: Bash (pytest)
    Steps:
      1. Run: python -m pytest tests/unit/test_optional_field_timeouts.py -v
      2. Verify: Optional field timeout is 5000ms
      3. Verify: Required field timeout is 10000ms
    Expected Result: All extract timeout tests pass
    Evidence: .sisyphus/evidence/task-7-extract-timeouts.log
  ```

  **Commit**: YES
  - Message: `fix(handlers): increase optional field timeout to 5s, implement tiered timeouts`
  - Files: `scrapers/actions/handlers/extract.py`, `tests/unit/test_optional_field_timeouts.py`
  - Pre-commit: `pytest tests/unit/test_optional_field_timeouts.py`

---

- [ ] 8. Add Retry Policies Per Failure Type

  **What to do**:
  - Modify `core/adaptive_retry_strategy.py` to restore sensible defaults
  - Change default `SCRAPER_MAX_RETRIES` from 1 to 3
  - Implement per-failure-type retry counts:
    - Network errors: 3 retries
    - Rate limited: 2 retries with longer delays
    - Element missing: 2 retries (timing issues)
    - Timeout: 1 retry (already waited)
    - Access denied: 0 retries (don't retry auth failures)
  - Update `AdaptiveRetryConfig` defaults
  - Update unit tests for new retry policies

  **Must NOT do**:
  - Do NOT remove the SCRAPER_MAX_RETRIES env var (just change default)
  - Do NOT break existing adaptive retry logic
  - Do NOT disable circuit breaker (tune it separately)

  **Recommended Agent Profile**:
  - **Category**: `deep` - Retry logic is core infrastructure
  - **Skills**: None needed
  - **Reason**: Critical reliability component

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6-7, 9-11)
  - **Blocks**: Task 11
  - **Blocked By**: Task 2 (context manager for retry cleanup)

  **References**:
  - Current implementation: `core/adaptive_retry_strategy.py:153-227`
  - Retry executor: `core/retry_executor.py:336-354` - Delay calculation
  - Tests: `tests/unit/crawl4ai_engine/test_retry.py`

  **Acceptance Criteria**:
  - [ ] Default max retries changed to 3
  - [ ] Per-failure-type retry policies implemented
  - [ ] Backoff delays appropriate for each failure type
  - [ ] Unit tests updated: `tests/unit/crawl4ai_engine/test_retry.py`

  **QA Scenarios**:
  ```
  Scenario: Retry policies applied correctly per failure type
    Tool: Bash (pytest)
    Steps:
      1. Run: python -m pytest tests/unit/crawl4ai_engine/test_retry.py -v
      2. Verify: Network errors get 3 retries
      3. Verify: Access denied gets 0 retries
      4. Verify: Backoff delays increase appropriately
    Expected Result: Retry policies match specification
    Evidence: .sisyphus/evidence/task-8-retry-policies.log
  ```

  **Commit**: YES
  - Message: `feat(core): implement per-failure-type retry policies, increase default to 3`
  - Files: `core/adaptive_retry_strategy.py`, `tests/unit/crawl4ai_engine/test_retry.py`
  - Pre-commit: `pytest tests/unit/crawl4ai_engine/test_retry.py`

---

- [ ] 9. Tune Circuit Breaker Configuration

  **What to do**:
  - Update `core/retry_executor.py` CircuitBreakerConfig
  - Increase `failure_threshold` from 5 to 10
  - Add `failure_rate_threshold` of 0.5 (50% failure rate)
  - Increase `timeout_seconds` from 60 to 300 (5 minutes)
  - Add `window_size` of 20 attempts for failure rate calculation
  - Update circuit breaker logic to use both thresholds
  - Add unit tests for new threshold behavior

  **Must NOT do**:
  - Do NOT disable circuit breaker entirely
  - Do NOT remove existing circuit breaker state tracking
  - Do NOT change state transition logic (closed → open → half-open)

  **Recommended Agent Profile**:
  - **Category**: `deep` - Circuit breaker is critical for stability
  - **Skills**: None needed
  - **Reason**: Prevents cascading failures

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6-8, 10-11)
  - **Blocks**: Task 14
  - **Blocked By**: Task 2

  **References**:
  - Current implementation: `core/retry_executor.py:56-63`
  - State management: `core/retry_executor.py:418-493`
  - Usage: `core/retry_executor.py:172-179` - Check before execution

  **Acceptance Criteria**:
  - [ ] `failure_threshold` increased to 10
  - [ ] `failure_rate_threshold` of 0.5 implemented
  - [ ] `timeout_seconds` increased to 300
  - [ ] Circuit opens on EITHER threshold breach
  - [ ] Unit tests updated

  **QA Scenarios**:
  ```
  Scenario: Circuit breaker respects new thresholds
    Tool: Bash (pytest)
    Steps:
      1. Run: python -m pytest tests/unit/test_circuit_breaker.py -v
      2. Verify: Circuit opens after 10 failures
      3. Verify: Circuit opens when failure rate > 50%
      4. Verify: 5-minute cooldown before half-open
    Expected Result: All circuit breaker tests pass
    Evidence: .sisyphus/evidence/task-9-circuit-breaker.log
  ```

  **Commit**: YES
  - Message: `feat(core): tune circuit breaker thresholds for better resilience`
  - Files: `core/retry_executor.py`, `tests/unit/test_circuit_breaker.py`
  - Pre-commit: `pytest tests/unit/test_circuit_breaker.py`

---

- [ ] 10. Implement Fallback Selector System

  **What to do**:
  - Update `scrapers/models/config.py` to support fallback selectors
  - Add `fallback_selectors: List[str]` field to SelectorConfig
  - Modify `scrapers/executor/selector_resolver.py` to try fallbacks
  - Implement fallback chain: primary → fallback[0] → fallback[1] → ...
  - Add logging for which selector succeeded
  - Integrate with selector health tracker (Task 4)
  - Update YAML parser to load fallback_selectors
  - Create unit tests for fallback resolution

  **Must NOT do**:
  - Do NOT require fallback_selectors (keep optional)
  - Do NOT change existing selector config format
  - Do NOT impact performance when no fallbacks defined

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` - Config + resolver changes
  - **Skills**: None needed
  - **Reason**: Multi-file changes with config schema update

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6-9, 11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 4

  **References**:
  - Config model: `scrapers/models/config.py`
  - Resolver: `scrapers/executor/selector_resolver.py`
  - YAML parser: `src/crawl4ai_engine/transpiler/yaml_parser.py`
  - Health tracking: `core/selector_health.py` (from Task 4)

  **Acceptance Criteria**:
  - [ ] `SelectorConfig` supports `fallback_selectors` list
  - [ ] Resolver tries primary then fallbacks in order
  - [ ] Successful selector logged for debugging
  - [ ] YAML configs can specify fallbacks
  - [ ] Unit tests: `tests/unit/test_fallback_selectors.py`

  **QA Scenarios**:
  ```
  Scenario: Fallback selector used when primary fails
    Tool: Bash (pytest)
    Steps:
      1. Run: python -m pytest tests/unit/test_fallback_selectors.py::test_fallback_used -v
      2. Verify: Primary selector attempted first
      3. Verify: Fallback selector used when primary fails
      4. Verify: Result returned from successful fallback
    Expected Result: Fallback resolution works correctly
    Evidence: .sisyphus/evidence/task-10-fallback-selectors.log
  ```

  **Commit**: YES
  - Message: `feat(executor): implement fallback selector system for reliability`
  - Files: `scrapers/models/config.py`, `scrapers/executor/selector_resolver.py`, `tests/unit/test_fallback_selectors.py`
  - Pre-commit: `pytest tests/unit/test_fallback_selectors.py`

---

- [ ] 11. Add Network Idle Waiting Strategies

  **What to do**:
  - Create `utils/scraping/wait_strategies.py` with intelligent wait functions
  - Implement `wait_for_content_stable()` that waits for networkidle then domcontentloaded
  - Add `wait_for_lazy_loaded_images()` using JavaScript evaluation
  - Update `scrapers/actions/handlers/wait_for.py` to use new strategies
  - Add configuration for wait strategy per workflow step
  - Create unit tests for wait strategies
  - Update existing `wait_for` action to support strategy parameter

  **Must NOT do**:
  - Do NOT remove existing wait_for behavior (add as option)
  - Do NOT use arbitrary sleep times
  - Do NOT wait indefinitely for any condition

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` - Complex wait logic
  - **Skills**: None needed
  - **Reason**: Requires JavaScript evaluation and Playwright integration

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6-10)
  - **Blocks**: Task 16
  - **Blocked By**: Task 8

  **References**:
  - Current wait_for: `scrapers/actions/handlers/wait_for.py`
  - Playwright patterns: `assertions-waiting.md` from skill
  - Browser: `utils/scraping/playwright_browser.py` - Page access

  **Acceptance Criteria**:
  - [ ] `wait_for_content_stable()` function
  - [ ] `wait_for_lazy_loaded_images()` function
  - [ ] Integration with wait_for action
  - [ ] Configurable timeout for each strategy
  - [ ] Unit tests: `tests/unit/test_wait_strategies.py`

  **QA Scenarios**:
  ```
  Scenario: Content stable wait handles dynamic loading
    Tool: Bash (Python script)
    Steps:
      1. Run: python scripts/test_wait_strategies.py --url https://example-spa.com
      2. Verify: Waits for networkidle then domcontentloaded
      3. Verify: Lazy loaded images complete before returning
    Expected Result: All content loaded before extraction
    Evidence: .sisyphus/evidence/task-11-wait-strategies.log
  ```

  **Commit**: YES
  - Message: `feat(utils): add intelligent wait strategies for dynamic content`
  - Files: `utils/scraping/wait_strategies.py`, `scrapers/actions/handlers/wait_for.py`, `tests/unit/test_wait_strategies.py`
  - Pre-commit: `pytest tests/unit/test_wait_strategies.py`

---

- [ ] 12. Update All YAML Configs with Fallback Selectors

  **What to do**:
  - Audit all YAML configs in `scrapers/configs/` for brittle selectors
  - Add fallback selectors to critical fields (Name, Price, UPC, Image)
  - Use data-attributes where available (data-testid, data-product-*)
  - Add CSS class fallbacks with multiple options
  - Use semantic selectors (h1, h2[itemprop="name"]) as last resort
  - Update at least: mazuri.yaml, coastal.yaml, and 5 other major configs
  - Validate all configs pass schema validation after changes

  **Must NOT do**:
  - Do NOT remove existing selectors (add fallbacks alongside)
  - Do NOT change required/optional status of fields
  - Do NOT modify workflow logic, only selector definitions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` - Requires YAML expertise and testing
  - **Skills**: None needed
  - **Reason**: Multiple file updates with validation requirements

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13-15)
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 6, 7, 10

  **References**:
  - Configs to update: `scrapers/configs/mazuri.yaml`, `scrapers/configs/coastal.yaml`
  - Fallback system: Task 10 implementation
  - Validation: `scripts/validate_configs.py`

  **Acceptance Criteria**:
  - [ ] mazuri.yaml has fallback selectors for all critical fields
  - [ ] coastal.yaml has fallback selectors for all critical fields
  - [ ] At least 5 other major configs updated
  - [ ] All configs pass validation: `python scripts/validate_configs.py`
  - [ ] Integration tests pass with new selectors

  **QA Scenarios**:
  ```
  Scenario: Fallback selectors work in production configs
    Tool: Bash (Python script)
    Steps:
      1. Run: python scripts/test_config_selectors.py --config scrapers/configs/mazuri.yaml --sku 5E5L
      2. Verify: At least one fallback selector resolves for each field
      3. Run: python scripts/validate_configs.py
      4. Verify: All configs pass validation
    Expected Result: All configs valid, selectors resolve
    Evidence: .sisyphus/evidence/task-12-config-updates/
  ```

  **Commit**: YES (group all config updates)
  - Message: `feat(configs): add fallback selectors to all scraper configs`
  - Files: `scrapers/configs/*.yaml`
  - Pre-commit: `python scripts/validate_configs.py`

---

- [ ] 13. Implement Progressive Timeout Escalation

  **What to do**:
  - Create `utils/timeout_escalation.py` with progressive retry logic
  - Implement escalation formula: timeout * (1.5 ^ attempt_number)
  - Update retry executor to apply escalating timeouts on each retry
  - Add configuration for escalation multiplier (default: 1.5)
  - Add max timeout cap (e.g., 60s) to prevent excessive waits
  - Integrate with circuit breaker to reset escalation on state change
  - Create unit tests for escalation logic
  - Update integration with Task 1's TimeoutConfig

  **Must NOT do**:
  - Do NOT escalate timeouts indefinitely (use cap)
  - Do NOT escalate for non-retryable errors
  - Do NOT affect first attempt timeout

  **Recommended Agent Profile**:
  - **Category**: `deep` - Complex retry logic integration
  - **Skills**: None needed
  - **Reason**: Core reliability infrastructure

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 12, 14-15)
  - **Blocks**: Task 20
  - **Blocked By**: Task 1

  **References**:
  - Retry executor: `core/retry_executor.py:141-334`
  - Timeout config: `core/timeout_config.py` (Task 1)
  - Adaptive strategy: `core/adaptive_retry_strategy.py`

  **Acceptance Criteria**:
  - [ ] `calculate_escalated_timeout(base, attempt)` function
  - [ ] Integration with retry executor
  - [ ] Configurable multiplier and cap
  - [ ] Unit tests: `tests/unit/test_timeout_escalation.py`
  - [ ] Documentation for escalation strategy

  **QA Scenarios**:
  ```
  Scenario: Timeout escalates correctly on retry
    Tool: Bash (pytest)
    Steps:
      1. Run: python -m pytest tests/unit/test_timeout_escalation.py -v
      2. Verify: Attempt 0 uses base timeout
      3. Verify: Attempt 1 uses 1.5x base
      4. Verify: Attempt 2 uses 2.25x base
      5. Verify: Cap prevents exceeding max timeout
    Expected Result: Escalation formula works correctly
    Evidence: .sisyphus/evidence/task-13-escalation.log
  ```

  **Commit**: YES
  - Message: `feat(utils): implement progressive timeout escalation for retries`
  - Files: `utils/timeout_escalation.py`, `core/retry_executor.py`, `tests/unit/test_timeout_escalation.py`
  - Pre-commit: `pytest tests/unit/test_timeout_escalation.py`

---

- [ ] 14. Add Comprehensive Error Handling with Retry Hints

  **What to do**:
  - Update all action handlers to catch exceptions with full context
  - Add error classification (retryable vs non-retryable)
  - Include retry hints in error messages
  - Update `extract.py` to log errors at ERROR level (not WARNING)
  - Add structured error results with metadata:
    - error_type: Exception class name
    - retryable: Boolean
    - attempts_made: Number
    - suggested_action: String hint
  - Integrate with tracing system (Task 5) for debugging
  - Update all handlers: extract, wait_for, click, navigate
  - Create unit tests for error handling

  **Must NOT do**:
  - Do NOT swallow exceptions silently
  - Do NOT break existing error message format (extend it)
  - Do NOT add excessive logging that impacts performance

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` - Cross-cutting concern
  - **Skills**: None needed
  - **Reason**: Touches multiple handlers

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 12-13, 15)
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 5, 9

  **References**:
  - Current error handling: `scrapers/actions/handlers/extract.py:175-177`
  - Exceptions: `scrapers/exceptions.py`
  - Tracing: `utils/scraping/tracing.py` (Task 5)
  - Classification: `core/failure_classifier.py`

  **Acceptance Criteria**:
  - [ ] Structured error results with retry hints
  - [ ] All handlers updated with comprehensive try/except
  - [ ] Error level logging (not warning)
  - [ ] Integration with tracing on failure
  - [ ] Unit tests: `tests/unit/test_error_handling.py`

  **QA Scenarios**:
  ```
  Scenario: Error handling provides retry hints
    Tool: Bash (pytest)
    Steps:
      1. Run: python -m pytest tests/unit/test_error_handling.py -v
      2. Verify: TimeoutError marked as retryable
      3. Verify: AccessDeniedError marked as non-retryable
      4. Verify: Error result includes suggested_action
    Expected Result: Errors properly classified with hints
    Evidence: .sisyphus/evidence/task-14-error-handling.log
  ```

  **Commit**: YES
  - Message: `feat(handlers): add comprehensive error handling with retry hints`
  - Files: `scrapers/actions/handlers/*.py`, `tests/unit/test_error_handling.py`
  - Pre-commit: `pytest tests/unit/test_error_handling.py`

---

- [ ] 15. Create Observability Dashboard

  **What to do**:
  - Create `scripts/dashboard_server.py` for metrics visualization
  - Implement API endpoints for:
    - Selector health by site
    - Timeout rates over time
    - Circuit breaker status
    - Retry statistics
    - Resource usage (memory, contexts)
  - Add WebSocket support for real-time updates
  - Create simple HTML/JavaScript frontend
  - Integrate with selector health tracker (Task 4)
  - Add authentication if deployed externally
  - Create systemd service file for deployment

  **Must NOT do**:
  - Do NOT require dashboard for scraper operation
  - Do NOT store sensitive data in dashboard
  - Do NOT impact scrape performance with monitoring

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` - Full-stack feature
  - **Skills**: None needed
  - **Reason**: API + frontend + integration

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 12-14)
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 4, 5

  **References**:
  - Health tracker: `core/selector_health.py` (Task 4)
  - Circuit breaker: `core/retry_executor.py`
  - Failure analytics: `core/failure_analytics.py`
  - Metrics: `src/crawl4ai_engine/metrics.py`

  **Acceptance Criteria**:
  - [ ] Dashboard server with REST API
  - [ ] WebSocket real-time updates
  - [ ] HTML frontend with charts
  - [ ] Displays: selector health, timeouts, circuit status
  - [ ] Systemd service file
  - [ ] Documentation: `docs/dashboard.md`

  **QA Scenarios**:
  ```
  Scenario: Dashboard displays selector health correctly
    Tool: Bash (curl)
    Steps:
      1. Run: python scripts/dashboard_server.py --port 8080 &
      2. curl http://localhost:8080/api/selector-health
      3. Verify: JSON response with selector success rates
      4. curl http://localhost:8080/api/circuit-status
      5. Verify: Circuit breaker states for all sites
    Expected Result: Dashboard API returns valid data
    Evidence: .sisyphus/evidence/task-15-dashboard/
  ```

  **Commit**: YES
  - Message: `feat(tools): add observability dashboard for monitoring`
  - Files: `scripts/dashboard_server.py`, `templates/dashboard.html`, `docs/dashboard.md`
  - Pre-commit: Manual testing of dashboard

---

- [ ] 16. Optimize Navigation Wait Strategies

  **What to do**:
  - Update `utils/scraping/playwright_browser.py` navigation logic
  - Implement triple fallback: networkidle → load → domcontentloaded
  - Add timeout per wait stage (divide total timeout by 3)
  - Add `navigate_with_fallbacks()` method
  - Update `get()` method to use new strategy
  - Add logging for which wait state succeeded
  - Add configuration for preferred wait state per site
  - Create unit tests for navigation strategies
  - Integrate with request blocking (Task 3) for faster loads

  **Must NOT do**:
  - Do NOT remove existing navigation method (deprecate)
  - Do NOT change default timeout without testing
  - Do NOT wait indefinitely for any state

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` - Complex navigation logic
  - **Skills**: None needed
  - **Reason**: Core navigation behavior change

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 17-19)
  - **Blocks**: Task 20
  - **Blocked By**: Tasks 3, 11

  **References**:
  - Current navigation: `utils/scraping/playwright_browser.py:148-162`
  - Request blocking: Task 3 implementation
  - Wait strategies: `utils/scraping/wait_strategies.py` (Task 11)

  **Acceptance Criteria**:
  - [ ] `navigate_with_fallbacks()` method with triple fallback
  - [ ] Timeout divided equally among wait states
  - [ ] Logging for successful wait state
  - [ ] Per-site wait state configuration
  - [ ] Unit tests: `tests/unit/test_navigation.py`

  **QA Scenarios**:
  ```
  Scenario: Navigation falls back correctly
    Tool: Bash (Python script)
    Steps:
      1. Run: python scripts/test_navigation.py --url https://analytics-heavy-site.com
      2. Verify: networkidle attempted first
      3. Verify: Falls back to load when networkidle times out
      4. Verify: Falls back to domcontentloaded if load fails
    Expected Result: Navigation succeeds with appropriate fallback
    Evidence: .sisyphus/evidence/task-16-navigation.log
  ```

  **Commit**: YES
  - Message: `feat(utils): implement intelligent navigation with triple fallback`
  - Files: `utils/scraping/playwright_browser.py`, `tests/unit/test_navigation.py`
  - Pre-commit: `pytest tests/unit/test_navigation.py`

---

- [ ] 17. Add Anti-Detection Fallback Handling

  **What to do**:
  - Update `scrapers/executor/workflow_executor.py` anti-detection handling
  - Make anti-detection initialization failure configurable (required vs optional)
  - Add fallback to stealth mode when full anti-detection fails
  - Add retry logic for anti-detection initialization (2 attempts)
  - Log anti-detection failures at ERROR level (not WARNING)
  - Add metrics for anti-detection success/failure rates
  - Add configuration option to continue without anti-detection
  - Update YAML schema for anti_detection.required field
  - Create unit tests for fallback behavior

  **Must NOT do**:
  - Do NOT make anti-detection required by default (keep backward compatible)
  - Do NOT fail silently when anti-detection is required
  - Do NOT add long delays for anti-detection retries

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` - Error handling + config
  - **Skills**: None needed
  - **Reason**: Multi-file changes with fallback logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 16, 18-19)
  - **Blocks**: Task 20
  - **Blocked By**: None

  **References**:
  - Current handling: `scrapers/executor/workflow_executor.py:204-211`
  - Anti-detection: `core/anti_detection_manager.py`
  - Stealth: `utils/scraping/playwright_browser.py:121-133`

  **Acceptance Criteria**:
  - [ ] `anti_detection.required` config option
  - [ ] Fallback to stealth mode on failure
  - [ ] Retry logic for initialization (2 attempts)
  - [ ] ERROR level logging for failures
  - [ ] Metrics for success/failure rates
  - [ ] Unit tests: `tests/unit/test_antidetection_fallback.py`

  **QA Scenarios**:
  ```
  Scenario: Anti-detection fallback works when full system fails
    Tool: Bash (pytest)
    Steps:
      1. Run: python -m pytest tests/unit/test_antidetection_fallback.py::test_stealth_fallback -v
      2. Verify: Full anti-detection attempted first
      3. Verify: Falls back to stealth mode on failure
      4. Verify: Scraping continues with reduced protection
    Expected Result: Fallback protection activated
    Evidence: .sisyphus/evidence/task-17-antidetection.log
  ```

  **Commit**: YES
  - Message: `feat(executor): add anti-detection fallback handling`
  - Files: `scrapers/executor/workflow_executor.py`, `scrapers/models/config.py`, `tests/unit/test_antidetection_fallback.py`
  - Pre-commit: `pytest tests/unit/test_antidetection_fallback.py`

---

- [ ] 18. Implement Click Action Improvements

  **What to do**:
  - Refactor `scrapers/actions/handlers/click.py` to remove duplicate retry logic
  - Remove hardcoded `asyncio.sleep(1)` between retries
  - Use executor-level retry instead of inline retry
  - Add proper wait_for_visible before clicking
  - Implement click retry with scroll-into-view retry
  - Add force click as final fallback (not first retry)
  - Add logging for which click method succeeded
  - Update to use wait strategies from Task 11
  - Create unit tests for click behavior

  **Must NOT do**:
  - Do NOT remove force click entirely (keep as last resort)
  - Do NOT change click action signature
  - Do NOT reduce click reliability

  **Recommended Agent Profile**:
  - **Category**: `quick` - Handler refactoring
  - **Skills**: None needed
  - **Reason**: Well-defined refactoring task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 16-17, 19)
  - **Blocks**: Task 20
  - **Blocked By**: Task 11

  **References**:
  - Current click: `scrapers/actions/handlers/click.py:28-104`
  - Wait strategies: `utils/scraping/wait_strategies.py` (Task 11)
  - Retry executor: `core/retry_executor.py`

  **Acceptance Criteria**:
  - [ ] Remove inline retry loop (lines 36-42)
  - [ ] Use executor-level retry
  - [ ] Wait for visibility before click
  - [ ] Force click as final fallback only
  - [ ] Unit tests: `tests/unit/test_click_action.py`

  **QA Scenarios**:
  ```
  Scenario: Click action uses proper retry strategy
    Tool: Bash (pytest)
    Steps:
      1. Run: python -m pytest tests/unit/test_click_action.py -v
      2. Verify: No hardcoded asyncio.sleep calls
      3. Verify: Uses wait_for_visible before clicking
      4. Verify: Force click only after normal click fails
    Expected Result: Click action refactored correctly
    Evidence: .sisyphus/evidence/task-18-click-action.log
  ```

  **Commit**: YES
  - Message: `refactor(handlers): improve click action with proper retry strategy`
  - Files: `scrapers/actions/handlers/click.py`, `tests/unit/test_click_action.py`
  - Pre-commit: `pytest tests/unit/test_click_action.py`

---

- [ ] 19. Add Session Timeout Management

  **What to do**:
  - Update `scrapers/executor/workflow_executor.py` session handling
  - Reduce default session timeout from 1800s (30min) to 600s (10min)
  - Add proactive session refresh at 80% of timeout (8 minutes)
  - Implement `refresh_session()` method
  - Add session health check before each scrape
  - Add logging for session refresh events
  - Add configuration for session timeout per site
  - Update unit tests for session management
  - Add metrics for session refresh frequency

  **Must NOT do**:
  - Do NOT break existing session authentication
  - Do NOT remove session entirely
  - Do NOT add excessive session checks (check before each workflow)

  **Recommended Agent Profile**:
  - **Category**: `quick` - Configuration and timeout changes
  - **Skills**: None needed
  - **Reason**: Well-defined scope

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 16-18)
  - **Blocks**: Task 20
  - **Blocked By**: None

  **References**:
  - Current timeout: `scrapers/executor/workflow_executor.py:169`
  - Session handling: `scrapers/executor/workflow_executor.py:166-197`
  - Config: `scrapers/models/config.py`

  **Acceptance Criteria**:
  - [ ] Default session timeout: 600s (10min)
  - [ ] Proactive refresh at 8 minutes
  - [ ] Session health check before each scrape
  - [ ] Per-site session timeout configuration
  - [ ] Unit tests: `tests/unit/test_session_management.py`

  **QA Scenarios**:
  ```
  Scenario: Session refreshes proactively before timeout
    Tool: Bash (pytest)
    Steps:
      1. Run: python -m pytest tests/unit/test_session_management.py::test_proactive_refresh -v
      2. Verify: Session refreshed at 8-minute mark
      3. Verify: Scrape continues after refresh
      4. Verify: Old session properly terminated
    Expected Result: Session management works correctly
    Evidence: .sisyphus/evidence/task-19-session-management.log
  ```

  **Commit**: YES
  - Message: `feat(executor): implement proactive session timeout management`
  - Files: `scrapers/executor/workflow_executor.py`, `scrapers/models/config.py`, `tests/unit/test_session_management.py`
  - Pre-commit: `pytest tests/unit/test_session_management.py`

---

- [ ] 20. Run 24-Hour Stress Test

  **What to do**:
  - Create `scripts/stress_test.py` for continuous operation testing
  - Implement test that runs scrapers continuously for 24 hours
  - Monitor: memory usage, context leaks, timeout rates, success rates
  - Collect metrics every hour
  - Test with at least 3 different scrapers (mazuri, coastal, +1)
  - Generate report with: success rate trend, memory growth, error distribution
  - Validate no resource leaks (contexts, pages, memory)
  - Validate timeout rate < 5% throughout test
  - Validate success rate > 90% throughout test
  - Document any issues found

  **Must NOT do**:
  - Do NOT run against production sites (use staging/test data)
  - Do NOT ignore failures during test (document all issues)
  - Do NOT skip the full 24 hours (run overnight)

  **Recommended Agent Profile**:
  - **Category**: `deep` - Long-running test with analysis
  - **Skills**: None needed
  - **Reason**: Critical validation step

  **Parallelization**:
  - **Can Run In Parallel**: NO (must run after all other tasks)
  - **Parallel Group**: Wave 5 (sequential)
  - **Blocks**: Task 22
  - **Blocked By**: Tasks 12, 13, 14, 15, 16, 17, 18, 19

  **References**:
  - Test patterns: `tests/pilot/test_mazuri.py`, `tests/pilot/test_coastal.py`
  - Metrics: `core/failure_analytics.py`
  - Health: `core/selector_health.py`

  **Acceptance Criteria**:
  - [ ] 24-hour continuous operation completed
  - [ ] Memory usage stable (no leaks detected)
  - [ ] No zombie browser contexts
  - [ ] Timeout rate < 5% average
  - [ ] Success rate > 90% average
  - [ ] Report generated: `reports/stress_test_24h.md`

  **QA Scenarios**:
  ```
  Scenario: 24-hour stress test validates stability
    Tool: Bash (Python script)
    Steps:
      1. Run: python scripts/stress_test.py --duration 24h --scrapers mazuri,coastal,petfoodex
      2. Wait: 24 hours
      3. Verify: Report shows success rate > 90%
      4. Verify: Memory usage did not grow unbounded
      5. Verify: No resource leak errors in logs
    Expected Result: All stability criteria met
    Evidence: .sisyphus/evidence/task-20-stress-test/
  ```

  **Commit**: YES
  - Message: `test(tools): add 24-hour stress test for validation`
  - Files: `scripts/stress_test.py`, `reports/stress_test_24h.md`
  - Pre-commit: Manual review of stress test script

---

- [ ] 21. Performance Benchmark Comparison

  **What to do**:
  - Create `scripts/benchmark_comparison.py` for before/after metrics
  - Run benchmarks BEFORE changes (baseline)
  - Run benchmarks AFTER all changes (comparison)
  - Measure: average scrape time, timeout rate, success rate, memory usage
  - Run 50 scrapes per major site (mazuri, coastal, phillips)
  - Generate comparison report with: 
    - Percentage improvement in each metric
    - Statistical significance tests
    - Visual charts (matplotlib or similar)
  - Document findings in `reports/performance_comparison.md`
  - Validate > 20% improvement in average scrape time
  - Validate > 50% reduction in timeout rate

  **Must NOT do**:
  - Do NOT run benchmarks against production (use staging)
  - Do NOT cherry-pick best results (run full suite)
  - Do NOT skip statistical significance testing

  **Recommended Agent Profile**:
  - **Category**: `deep` - Statistical analysis
  - **Skills**: None needed
  - **Reason**: Rigorous performance validation

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 20)
  - **Parallel Group**: Wave 5 (sequential)
  - **Blocks**: Task 22
  - **Blocked By**: Task 20

  **References**:
  - Test pilots: `tests/pilot/test_mazuri.py`, `tests/pilot/test_coastal.py`
  - Performance: `core/performance_profiler.py`
  - Metrics: `src/crawl4ai_engine/metrics.py`

  **Acceptance Criteria**:
  - [ ] Baseline benchmark run (before changes)
  - [ ] Post-change benchmark run
  - [ ] Comparison report with statistical analysis
  - [ ] > 20% improvement in average scrape time
  - [ ] > 50% reduction in timeout rate
  - [ ] Report: `reports/performance_comparison.md`

  **QA Scenarios**:
  ```
  Scenario: Performance benchmarks show improvement
    Tool: Bash (Python script)
    Steps:
      1. Run: python scripts/benchmark_comparison.py --mode baseline
      2. Apply all fixes
      3. Run: python scripts/benchmark_comparison.py --mode comparison
      4. Verify: Report shows > 20% time improvement
      5. Verify: Report shows > 50% timeout reduction
    Expected Result: Performance goals achieved
    Evidence: .sisyphus/evidence/task-21-benchmark/
  ```

  **Commit**: YES
  - Message: `test(tools): add performance benchmark comparison`
  - Files: `scripts/benchmark_comparison.py`, `reports/performance_comparison.md`
  - Pre-commit: Manual review of benchmark script

---

- [ ] 22. Migration Guide and Documentation

  **What to do**:
  - Create `docs/migration_guide.md` for upgrading to new system
  - Document: new timeout configuration, fallback selectors, dashboard usage
  - Update `README.md` with new features and configuration options
  - Create `docs/architecture.md` explaining new timeout/retry systems
  - Document troubleshooting guide for common issues
  - Create example YAML configs with all new features
  - Document environment variables and their effects
  - Add changelog entry for v2.0 (or appropriate version)
  - Create quick-start guide for new developers
  - Ensure all public APIs have docstrings

  **Must NOT do**:
  - Do NOT break backward compatibility without documenting migration path
  - Do NOT skip documenting new configuration options
  - Do NOT remove old documentation (mark as deprecated)

  **Recommended Agent Profile**:
  - **Category**: `writing` - Documentation creation
  �� **Skills**: None needed
  - **Reason**: Comprehensive documentation needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (must include all changes)
  - **Parallel Group**: Wave 5 (final task)
  - **Blocks**: None (final task)
  - **Blocked By**: All previous tasks

  **References**:
  - Current docs: `docs/` directory
  - Config examples: `scrapers/configs/*.yaml`
  - Code: All modified files from Tasks 1-21

  **Acceptance Criteria**:
  - [ ] `docs/migration_guide.md` complete
  - [ ] `docs/architecture.md` explaining new systems
  - [ ] `README.md` updated with new features
  - [ ] Troubleshooting guide created
  - [ ] Example configs with new features
  - [ ] Changelog updated
  - [ ] All public APIs documented

  **QA Scenarios**:
  ```
  Scenario: Documentation is complete and accurate
    Tool: Manual review
    Steps:
      1. Review: docs/migration_guide.md
      2. Verify: All new features documented
      3. Verify: Migration path clear for existing users
      4. Verify: Example configs are valid YAML
      5. Review: All docstrings present
    Expected Result: Documentation complete
    Evidence: .sisyphus/evidence/task-22-documentation/
  ```

  **Commit**: YES (multiple commits for different docs)
  - Message: `docs: add migration guide, architecture docs, and updated README`
  - Files: `docs/*.md`, `README.md`, `CHANGELOG.md`
  - Pre-commit: Manual documentation review

---

## Final Verification Wave (MANDATORY)

After ALL implementation tasks complete, run these 4 parallel verification tasks:

- [ ] F1. Plan Compliance Audit - `oracle`
  
  **What to verify**:
  - All 15 critical issues from review are addressed
  - Timeout configuration system exists and is used
  - Resource cleanup guarantees are implemented
  - Retry policies restored to sensible defaults
  - Fallback selector system is operational
  - Tracing collection is working
  - Dashboard is accessible and showing data
  
  **Verification method**:
  - Read each issue from critical review
  - Check corresponding fix is implemented
  - Run unit tests for each component
  - Verify evidence files exist
  
  **Output**: `reports/compliance_audit.md` with checklist
  
  **Success criteria**: All 15 issues marked RESOLVED

---

- [ ] F2. Code Quality Review - `unspecified-high`
  
  **What to verify**:
  - `tsc --noEmit` passes (if TypeScript)
  - `ruff check` or `flake8` passes for Python
  - All unit tests pass: `pytest tests/unit/`
  - No `print()` statements (use logging)
  - No `except Exception:` without logging
  - Proper docstrings on public functions
  - Type hints where appropriate
  
  **Commands**:
  ```bash
  cd apps/scraper
  ruff check .
  pytest tests/unit/ -v --tb=short
  ```
  
  **Output**: `reports/code_quality.md`
  
  **Success criteria**: Zero quality violations

---

- [ ] F3. Real Integration QA - `unspecified-high` + `playwright` skill
  
  **What to verify**:
  - Run 50 real scrapes on mazuri.com
  - Run 50 real scrapes on coastalpet.com
  - Measure success rate, timeout rate, average time
  - Verify no resource leaks (check process list)
  - Verify tracing files created on failures
  - Verify dashboard shows data
  
  **Commands**:
  ```bash
  cd apps/scraper
  python scripts/integration_qa.py --scrapers mazuri,coastal --count 50
  ```
  
  **Output**: `reports/integration_qa.md` with metrics
  
  **Success criteria**:
  - Success rate > 90%
  - Timeout rate < 5%
  - No memory growth > 10%
  - Average time reduced by > 10%

---

- [ ] F4. Scope Fidelity Check - `deep`
  
  **What to verify**:
  - Compare implemented features against plan
  - Verify no scope creep (extra features not in plan)
  - Verify all TODO acceptance criteria are met
  - Check evidence files exist for all QA scenarios
  - Verify no breaking changes to public API
  - Verify backward compatibility maintained
  
  **Method**:
  - Read each task's acceptance criteria
  - Verify implementation matches
  - Check git diff for unexpected changes
  - Review commit messages for scope
  
  **Output**: `reports/scope_fidelity.md`
  
  **Success criteria**: 100% scope adherence

---

## Commit Strategy

### Commit Grouping

| Group | Tasks | Message Pattern |
|-------|-------|-----------------|
| Wave 1 | 1-5 | `feat(core/utils): foundation improvements` |
| Wave 2 | 6-11 | `feat(executor/handlers): reliability improvements` |
| Wave 3 | 12-15 | `feat(configs/tools): integration and observability` |
| Wave 4 | 16-19 | `feat(utils/executor): optimization and polish` |
| Wave 5 | 20-22 | `test/docs: validation and documentation` |

### Pre-commit Checklist

```bash
cd apps/scraper

# Run all unit tests
pytest tests/unit/ -v --tb=short

# Run linter
ruff check .

# Validate configs
python scripts/validate_configs.py

# Check for debug code
grep -r "print(" scrapers/ core/ utils/ --include="*.py" | grep -v "^scrapers/actions/handlers/"

# Verify no secrets
grep -r "password\|secret\|key" scrapers/ core/ utils/ --include="*.py" | grep -v "test_"
```

---

## Success Criteria

### Verification Commands

```bash
# 1. All unit tests pass
cd apps/scraper && pytest tests/unit/ -v

# 2. Integration tests pass
pytest tests/integration/ -v --scrapers mazuri,coastal

# 3. Performance benchmarks meet targets
python scripts/benchmark_comparison.py --verify-targets

# 4. Stress test passed
cat reports/stress_test_24h.md | grep "PASSED"

# 5. Documentation complete
ls docs/migration_guide.md docs/architecture.md README.md

# 6. No resource leaks
python scripts/check_resource_leaks.py --verify-clean

# 7. Dashboard accessible
curl http://localhost:8080/api/health
```

### Final Checklist

- [ ] All 22 implementation tasks complete
- [ ] All 4 verification tasks complete (F1-F4)
- [ ] 24-hour stress test PASSED
- [ ] Performance benchmarks show > 20% improvement
- [ ] Success rate > 90% in integration tests
- [ ] Timeout rate < 5% in integration tests
- [ ] No resource leaks detected
- [ ] Documentation complete
- [ ] Migration guide published
- [ ] Team review completed

### Rollout Plan

**Phase 1: Staging (1 week)**
- Deploy to staging environment
- Run stress test for 7 days
- Monitor metrics daily
- Fix any issues found

**Phase 2: Canary (1 week)**
- Deploy to 10% of production scrapers
- Monitor error rates closely
- Rollback if error rate increases > 5%

**Phase 3: Full Rollout (1 week)**
- Deploy to 100% of production
- Monitor for 1 week
- Generate post-rollout report

**Rollback Plan**
- Keep old code in `legacy/` directory during rollout
- Environment variable to disable new features: `USE_LEGACY_SCRAPER=true`
- 30-minute rollback procedure documented

---

## Appendix: Issue Tracking

| Issue # | Description | Task | Status |
|---------|-------------|------|--------|
| 1.1 | Timeout Configuration Chaos | 1, 6, 7, 13 | ⏳ |
| 1.2 | Resource Cleanup Gaps | 2, F3 | ⏳ |
| 1.3 | Aggressive Retry Reduction | 8, 9 | ⏳ |
| 1.4 | Selector Resolver 5s Timeout | 6 | ⏳ |
| 1.5 | Brittle Selectors | 10, 12 | ⏳ |
| 1.6 | Missing Dynamic Content Waits | 11, 16 | ⏳ |
| 1.7 | Error Handling Swallows Exceptions | 14 | ⏳ |
| 1.8 | Navigation Fallback Limited | 16 | ⏳ |
| 1.9 | Circuit Breaker Too Aggressive | 9 | ⏳ |
| 1.10 | Optional Field Timeout 1.5s | 7 | ⏳ |
| 1.11 | Anti-Detection Silent Failure | 17 | ⏳ |
| 1.12 | Click Action Retry Conflict | 18 | ⏳ |
| 1.13 | Session Timeout 30min | 19 | ⏳ |
| 1.14 | No Request Interception | 3 | ⏳ |
| 1.15 | Missing Data vs Empty Data | 14 | ⏳ |

---

## Resources

### Documentation
- Original Critical Review: `.sisyphus/plans/scraper-performance-review.md`
- Playwright Best Practices: Available via skill system
- Migration Guide: `docs/migration_guide.md` (to be created)

### Test Data
- Test SKUs: mazuri: 5E5L, coastal: 73355, phillips: various
- Staging environment: staging.baystate.example.com

### Monitoring
- Dashboard: http://localhost:8080 (after Task 15)
- Logs: `logs/scraper.log`
- Metrics: `reports/` directory

---

**Plan Version**: 1.0  
**Created**: 2026-03-13  
**Estimated Duration**: 2-3 weeks  
**Parallel Tasks**: 19 of 22  
**Total Tasks**: 22 implementation + 4 verification = 26 tasks

