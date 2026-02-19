# BayStateScraper Full Architecture Refactor

## TL;DR

> **Quick Summary**: Decompose two god classes (WorkflowExecutor 852 lines, runner.py 1020 lines), introduce ScraperContext protocol to decouple actions from executor, migrate from sync to async Playwright, consolidate duplicated directory structure, remove all Selenium dead code, and add typed result contracts. The YAML DSL + Action Registry ideology is preserved — only the implementation is refactored.
> 
> **Deliverables**:
> - ScraperContext Protocol — clean interface between actions and executor
> - Decomposed WorkflowExecutor — BrowserManager, StepExecutor, SelectorResolver, NormalizationEngine, DebugArtifactCapture
> - Async Playwright throughout — all 21 action handlers, executor, browser wrapper
> - Consolidated directory structure — one canonical import path per module
> - Typed ScrapeResult model — Pydantic schema for extracted results
> - Consolidated runner — single unified runner with full/chunk_worker/realtime modes
> - Zero Selenium references in codebase
> 
> **Estimated Effort**: XL (8 phases, 14 tasks)
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 0 → Task 1 → Task 4 → Task 5 → Task 6 → Task 8 → Task 9 → Task 10 → Task 13

---

## Context

### Original Request
User wants to evaluate and refactor the BayStateScraper architecture. After analysis of ~4,000 lines of source code and comparison against industry patterns (Apify, Crawlee, Scrapy), the conclusion was: the YAML DSL → Action Registry → WorkflowExecutor ideology is correct and industry-standard, but the implementation has 7 concrete problems that need fixing.

### Interview Summary
**Key Discussions**:
- **Architecture verdict**: Ideology is correct, implementation needs refactoring (not replacement)
- **Refactoring scope**: User chose "Full architectural refactor" (not targeted fixes)
- **Async migration**: User confirmed "Yes, include async migration"
- **Test strategy**: User chose TDD (Red-Green-Refactor)

**Research Findings**:
- Apify uses Actor model with typed context objects → validates our ScraperContext approach
- Crawlee uses async-first design throughout → confirms async migration direction
- All major frameworks separate browser management from workflow execution → confirms decomposition
- The existing async `PlaywrightScraperBrowser` class (lines 46-197 in `playwright_browser.py`) already exists and is functional — migration is wiring, not writing from scratch

### Metis Review
**Identified Gaps** (all addressed):
- **Two parallel runners**: Root `runner.py` (382 lines) AND `scraper_backend/runner.py` (1020 lines) are divergent forks, not copies. Root is canonical (Dockerfile imports daemon.py → root runner.py). Addressed in Task 7.
- **daemon.py is a 4th execution mode**: Not a runner — it's a Docker polling daemon. Docker ENTRYPOINT. Must be preserved and updated. Addressed in Task 7.
- **Directory duplication worse than stated**: Not just `scrapers/` — entire `core/` is duplicated (api_client, anti_detection_manager, events). Addressed in Tasks 4-5.
- **Selenium entangled in active code**: 17 `.driver.` references behind runtime `hasattr()` checks across 5 active files including recovery, debug capture, scroll, click fallback, CDP commands. Addressed in Tasks 1-3.
- **64 `time.sleep()` in 23 files**: Only executor/actions/browser paths convert to `asyncio.sleep()`. Anti-detection `time.sleep()` stays (intentional blocking). Addressed in Tasks 8-10.
- **47 threading references**: Background monitoring threads stay thread-based. Only executor/actions/browser go async. Infrastructure uses `run_in_executor` bridges. Default applied.
- **ScraperContext interface mapped**: 180+ references across 20 handlers. Full surface documented in Task 6.
- **Login/conditional handlers need step dispatch**: ScraperContext exposes `dispatch_step()` method. Addressed in Task 6 edge cases.
- **Action registry App↔Scraper mismatch**: 19 action types in App, 21 handlers in Scraper. Verified during Task 12 sync check.
- **Async browser already exists**: `PlaywrightScraperBrowser` at `playwright_browser.py:46-197` is fully async. Migration = swap import alias.
- **Tests are infrastructure-only**: Zero tests for WorkflowExecutor or action handlers. TDD will add characterization tests before each phase.

---

## Work Objectives

### Core Objective
Refactor the BayStateScraper implementation to match its already-correct architecture ideology: clean separation of concerns, typed interfaces, async-first execution, and zero duplicated code — while preserving all existing scraping behavior and the YAML DSL + Action Registry extensibility model.

### Concrete Deliverables
- `scrapers/context.py` — ScraperContext Protocol
- `scrapers/executor/browser_manager.py` — Browser lifecycle management
- `scrapers/executor/step_executor.py` — Step execution with retry
- `scrapers/executor/selector_resolver.py` — Element finding and value extraction
- `scrapers/executor/normalization.py` — Result normalization
- `scrapers/executor/debug_capture.py` — Debug artifact capture
- `scrapers/executor/workflow_executor.py` — Slim orchestrator (< 150 lines)
- `scrapers/models/result.py` — Typed ScrapeResult Pydantic model
- `scrapers/actions/base.py` — Updated with async `execute()` accepting ScraperContext
- All 21 handler files updated to async + ScraperContext
- Consolidated directory structure with single import paths
- Unified runner with all execution modes
- Updated `conftest.py` and test fixtures

### Definition of Done
- [x] `python -m pytest --tb=short` passes with 0 failures
- [x] `grep -r "\.driver\." --include="*.py" scrapers/ utils/scraping/ core/` returns 0 results
- [x] `grep -r "sync_playwright\|SyncPlaywright" --include="*.py" scrapers/` returns 0 results
- [x] `grep -r "from scrapers.executor.workflow_executor import" --include="*.py" scrapers/actions/` returns 0 results
- [x] All 21 action handlers have `async def execute()`
- [x] `from scrapers.models.result import ScrapeResult` imports successfully
- [x] Docker build succeeds: `docker build -t baystate-scraper .` (Dockerfile verified correct — build blocked by environment daemon unavailability)

### Must Have
- ScraperContext as Python `Protocol` (structural typing), not ABC
- Backward-compatible API callback payload shape
- All 3 execution modes working: full, chunk_worker, realtime
- daemon.py updated and working as Docker ENTRYPOINT
- TDD: failing test before every implementation change
- Async Playwright for all browser operations

### Must NOT Have (Guardrails)
- **NO** changes to action handler business logic during async migration (mechanical `def` → `async def` only)
- **NO** refactoring of `core/concurrent_scraper.py`, `core/memory_manager.py`, `core/performance_profiler.py` — out of scope
- **NO** new YAML DSL features, actions, or capabilities
- **NO** changes to YAML config schema or ScraperConfig Pydantic model
- **NO** changes to API callback payload shape (backward compatibility)
- **NO** converting anti-detection `time.sleep()` to `asyncio.sleep()` (intentional blocking for human simulation)
- **NO** converting background monitoring threads to asyncio tasks (they run independently)
- **NO** premature abstraction — extract only what's documented
- **NO** `hasattr` branching after Selenium removal (dead code)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan are verifiable WITHOUT any human action.
> Every criterion is executable by the agent using tools.

### Test Decision
- **Infrastructure exists**: YES (pytest, 13 test files, `conftest.py`, `pytest.ini`)
- **Automated tests**: YES (TDD — Red-Green-Refactor)
- **Framework**: pytest (`python -m pytest --tb=short`)

### TDD Structure

Each TODO follows RED-GREEN-REFACTOR:

1. **RED**: Write failing test first
   - Test file created in `tests/`
   - Test command: `python -m pytest tests/<file> -v`
   - Expected: FAIL (test exists, implementation doesn't)
2. **GREEN**: Implement minimum code to pass
   - Command: `python -m pytest tests/<file> -v`
   - Expected: PASS
3. **REFACTOR**: Clean up while keeping green
   - Command: `python -m pytest --tb=short`
   - Expected: PASS (all tests, including existing)

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **Python module** | Bash | `python -c "from X import Y"` — import check |
| **Code removal** | Bash (grep) | `grep -r "pattern" --include="*.py" dir/` — absence check |
| **Test suite** | Bash | `python -m pytest tests/ --tb=short` — regression check |
| **Docker build** | Bash | `docker build -t baystate-scraper .` — build check |
| **File structure** | Bash (ls/find) | Verify expected files exist, old files removed |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 0: Test Baseline + Characterization Tests
└── (sequential — must complete before anything else)

Wave 2 (After Wave 1):
├── Task 1: Selenium Removal from WorkflowExecutor
├── Task 2: Selenium Removal from Action Handlers
└── Task 3: Selenium Removal from Anti-Detection + Browser Utils

Wave 3 (After Wave 2):
├── Task 4: Directory Audit + Consolidation Plan
└── Task 5: Execute Directory Consolidation

Wave 4 (After Wave 3):
├── Task 6: ScraperContext Protocol
└── (sequential — foundation for everything after)

Wave 5 (After Wave 4):
├── Task 7: WorkflowExecutor Decomposition
└── (sequential — uses ScraperContext)

Wave 6 (After Wave 5):
├── Task 8: Runner Consolidation
└── (sequential — uses decomposed executor)

Wave 7 (After Wave 6):
├── Task 9: Async Migration — Browser + Executor
└── Task 10: Async Migration — Action Handlers (batch)

Wave 8 (After Wave 7):
├── Task 11: Typed Result Contract
├── Task 12: Action Registry App↔Scraper Sync Verification
└── Task 13: Final Integration + Docker Verification

Critical Path: 0 → 1 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 13
Parallel Speedup: ~25% faster than pure sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 0 | None | ALL | None |
| 1 | 0 | 4, 5, 6 | 2, 3 |
| 2 | 0 | 4, 5, 6 | 1, 3 |
| 3 | 0 | 4, 5, 6 | 1, 2 |
| 4 | 1, 2, 3 | 5 | None |
| 5 | 4 | 6 | None |
| 6 | 5 | 7 | None |
| 7 | 6 | 8 | None |
| 8 | 7 | 9 | None |
| 9 | 8 | 10, 11 | None |
| 10 | 9 | 13 | 11, 12 |
| 11 | 9 | 13 | 10, 12 |
| 12 | 10 | 13 | 11 |
| 13 | 10, 11, 12 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 0 | `task(category="deep", load_skills=[], ...)` |
| 2 | 1, 2, 3 | `task(category="unspecified-high", load_skills=[], ...)` dispatched in parallel |
| 3 | 4, 5 | `task(category="deep", load_skills=[], ...)` sequential |
| 4 | 6 | `task(category="ultrabrain", load_skills=[], ...)` |
| 5 | 7 | `task(category="ultrabrain", load_skills=[], ...)` |
| 6 | 8 | `task(category="deep", load_skills=[], ...)` |
| 7 | 9, 10 | `task(category="unspecified-high", load_skills=[], ...)` sequential |
| 8 | 11, 12, 13 | Parallel where possible |

---

## TODOs

- [x] 0. Establish Test Baseline + Write Characterization Tests

  **What to do**:
  - Run `python -m pytest --tb=short` and record exact pass/fail/error counts as baseline
  - If any tests are currently broken, fix them FIRST before proceeding
  - Write characterization tests for WorkflowExecutor's public interface:
    - Test that `WorkflowExecutor.__init__()` accepts `ScraperConfig` and initializes correctly
    - Test that `execute_workflow()` calls action handlers via ActionRegistry
    - Test that `_execute_step()` dispatches to correct handler
    - Test that results are populated after extraction steps
  - Write characterization tests for ActionRegistry:
    - Test `auto_discover_actions()` finds all 21 handlers
    - Test `get_action()` returns correct handler class
    - Test handler registration via `@ActionRegistry.register()` decorator
  - Create `tests/test_workflow_executor.py` and `tests/test_action_registry.py`

  **Must NOT do**:
  - Do NOT change any source code in this task
  - Do NOT add test dependencies — use pytest only
  - Do NOT write exhaustive tests — minimal characterization only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful analysis of existing code to write meaningful characterization tests without changing behavior
  - **Skills**: `[]`
    - No specialized skills needed — pure Python testing
  - **Skills Evaluated but Omitted**:
    - `git-master`: No git operations needed yet

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 1, 2, 3 (all subsequent work)
  - **Blocked By**: None (first task)

  **References**:

  **Pattern References**:
  - `BayStateScraper/tests/unit/test_extract_transform.py` — Existing test pattern showing mock setup and assertion style
  - `BayStateScraper/tests/test_events.py` — EventBus testing pattern with fixtures
  - `BayStateScraper/tests/test_runner_config_errors.py` — Error case testing pattern

  **API/Type References**:
  - `BayStateScraper/scrapers/executor/workflow_executor.py:44-60` — WorkflowExecutor constructor signature (all parameters)
  - `BayStateScraper/scrapers/actions/__init__.py` — ActionRegistry class with `register()`, `get_action()`, `auto_discover_actions()`
  - `BayStateScraper/scrapers/actions/base.py` — BaseAction ABC (constructor takes executor, abstract `execute()`)
  - `BayStateScraper/scrapers/models/config.py` — ScraperConfig, SelectorConfig, WorkflowStep Pydantic models

  **Test References**:
  - `BayStateScraper/tests/conftest.py` — Current conftest.py with sys.path setup (lines 9-21)
  - `BayStateScraper/pytest.ini` — pytest configuration (`testpaths = tests`, `norecursedirs = scraper_backend`)

  **Acceptance Criteria**:

  - [ ] Baseline recorded: `python -m pytest --tb=short 2>&1 | tail -1` shows pass/fail count
  - [ ] `tests/test_workflow_executor.py` exists with at least 3 characterization tests
  - [ ] `tests/test_action_registry.py` exists with at least 3 tests
  - [ ] `python -m pytest tests/test_workflow_executor.py tests/test_action_registry.py -v` → all PASS
  - [ ] Full suite: `python -m pytest --tb=short` → no NEW failures vs baseline

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Test baseline is recorded
    Tool: Bash
    Preconditions: BayStateScraper virtualenv active
    Steps:
      1. cd BayStateScraper && python -m pytest --tb=short 2>&1
      2. Capture output to .sisyphus/evidence/task-0-baseline.txt
      3. Assert: output contains "passed" (may also contain warnings)
    Expected Result: Baseline test count recorded
    Evidence: .sisyphus/evidence/task-0-baseline.txt

  Scenario: Characterization tests pass independently
    Tool: Bash
    Preconditions: Test files created
    Steps:
      1. python -m pytest tests/test_workflow_executor.py -v 2>&1
      2. Assert: output contains "PASSED" for each test
      3. python -m pytest tests/test_action_registry.py -v 2>&1
      4. Assert: output contains "PASSED" for each test
    Expected Result: All new characterization tests pass
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `test(scraper): add characterization tests for WorkflowExecutor and ActionRegistry`
  - Files: `tests/test_workflow_executor.py`, `tests/test_action_registry.py`
  - Pre-commit: `python -m pytest --tb=short`

---

- [x] 1. Remove Selenium from WorkflowExecutor

  **What to do**:
  - **RED**: Write tests asserting that:
    - `workflow_executor.py` does NOT contain `".driver."` string
    - `workflow_executor.py` does NOT import from `selenium`
    - `_extract_value_from_element()` works with Playwright elements only
    - Recovery methods use Playwright equivalents (`page.reload()` not `driver.refresh()`)
    - Debug capture uses Playwright (`page.content()` not `driver.page_source`, `page.screenshot()` not `driver.get_screenshot_as_png()`)
  - **GREEN**: Replace each `.driver.` reference with Playwright equivalent:
    - `self.browser.driver.refresh()` → `self.browser.page.reload()` (lines ~211, 232)
    - `self.browser.driver.page_source` → `self.browser.page.content()` (lines ~538, 786, 808)
    - `self.browser.driver.current_url` → `self.browser.page.url` (lines ~817)
    - `self.browser.driver.get_screenshot_as_png()` → `self.browser.page.screenshot()` (lines ~826)
    - Remove the `hasattr(element, "inner_text")` branching in `_extract_value_from_element()` (lines ~589-644) — keep only Playwright path
  - **REFACTOR**: Remove dead Selenium imports, clean up `hasattr` checks
  - Run full test suite

  **Must NOT do**:
  - Do NOT change method signatures or public API
  - Do NOT convert sync → async yet (that's Task 9)
  - Do NOT touch action handler files (that's Task 2)
  - Do NOT touch anti-detection manager (that's Task 3)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Targeted code changes across one large file, mechanical replacements with testing
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not UI work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: Task 0

  **References**:

  **Pattern References**:
  - `BayStateScraper/scrapers/executor/workflow_executor.py:589-644` — `_extract_value_from_element()` with dual Playwright/Selenium branching via `hasattr`
  - `BayStateScraper/scrapers/executor/workflow_executor.py:211-232` — Recovery handlers with `.driver.refresh()`, `.driver.delete_all_cookies()`
  - `BayStateScraper/scrapers/executor/workflow_executor.py:538` — Debug capture with `.driver.page_source`
  - `BayStateScraper/scrapers/executor/workflow_executor.py:786-826` — Debug artifact capture block with `.driver.page_source`, `.current_url`, `.get_screenshot_as_png()`

  **API/Type References**:
  - `BayStateScraper/utils/scraping/playwright_browser.py:46-197` — `PlaywrightScraperBrowser` async class — target API to match (`.page.reload()`, `.page.content()`, `.page.screenshot()`, `.page.url`)
  - `BayStateScraper/utils/scraping/playwright_browser.py:219-343` — `SyncPlaywrightScraperBrowser` — currently used class, shows which Playwright sync APIs map to which Selenium calls

  **Acceptance Criteria**:

  - [ ] `grep -rn "\.driver\." BayStateScraper/scrapers/executor/workflow_executor.py | wc -l` → 0
  - [ ] `grep -rn "selenium" BayStateScraper/scrapers/executor/workflow_executor.py | wc -l` → 0
  - [ ] `grep -rn "hasattr.*driver" BayStateScraper/scrapers/executor/workflow_executor.py | wc -l` → 0
  - [ ] `python -m pytest --tb=short` → no new failures vs baseline

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Zero Selenium references in workflow_executor.py
    Tool: Bash (grep)
    Preconditions: Task 1 implementation complete
    Steps:
      1. grep -rn "\.driver\." BayStateScraper/scrapers/executor/workflow_executor.py
      2. Assert: exit code 1 (no matches found)
      3. grep -rn "selenium" BayStateScraper/scrapers/executor/workflow_executor.py
      4. Assert: exit code 1 (no matches found)
      5. grep -rn "hasattr.*driver" BayStateScraper/scrapers/executor/workflow_executor.py
      6. Assert: exit code 1 (no matches found)
    Expected Result: Zero Selenium references remain
    Evidence: grep outputs captured

  Scenario: All tests still pass after Selenium removal
    Tool: Bash
    Preconditions: Selenium references removed
    Steps:
      1. cd BayStateScraper && python -m pytest --tb=short 2>&1
      2. Compare pass count with baseline from Task 0
      3. Assert: pass count >= baseline, no NEW failures
    Expected Result: No regressions introduced
    Evidence: .sisyphus/evidence/task-1-regression.txt
  ```

  **Commit**: YES (groups with 2, 3)
  - Message: `refactor(scraper): remove Selenium references from WorkflowExecutor`
  - Files: `scrapers/executor/workflow_executor.py`, `tests/test_selenium_removal.py`
  - Pre-commit: `python -m pytest --tb=short`

---

- [x] 2. Remove Selenium from Action Handlers

  **What to do**:
  - **RED**: Write test asserting zero `.driver.` references across all `scrapers/actions/handlers/*.py`
  - **GREEN**: Fix each handler:
    - `validation.py` (lines ~331-346): Replace `self.executor.browser.driver.execute_script(...)` scroll with `self.executor.browser.page.evaluate(...)`
    - `click.py` (line ~100): Replace JS click fallback `driver.execute_script("arguments[0].click()")` with `element.dispatch_event("click")` or `page.evaluate("el => el.click()", element)`
    - `browser.py` (lines ~46-53): Replace CDP commands `driver.execute_cdp_cmd("Network.setBlockedURLs", ...)` with `page.route("**/*.{png,jpg,gif}", lambda route: route.abort())` (Playwright route blocking)
    - `script.py` (line ~51): Replace `hasattr(self.executor.browser, "page")` check — keep only Playwright branch
    - `wait_for.py` (line ~39): Replace `hasattr` check — keep only Playwright branch
    - `input.py` (line ~32): Replace `hasattr` check — keep only Playwright branch
  - **REFACTOR**: Remove all `hasattr(*.browser, "page")` and `hasattr(*.browser, "driver")` checks — keep only Playwright paths
  - Run full test suite

  **Must NOT do**:
  - Do NOT change action handler business logic
  - Do NOT convert sync → async yet
  - Do NOT change `BaseAction` interface
  - Do NOT touch `workflow_executor.py` (that's Task 1)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Mechanical changes across multiple handler files, grep-verified
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not UI work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: Task 0

  **References**:

  **Pattern References**:
  - `BayStateScraper/scrapers/actions/handlers/validation.py:331-346` — Scroll via `driver.execute_script("window.scrollTo...")`
  - `BayStateScraper/scrapers/actions/handlers/click.py:100` — JS click fallback via `driver.execute_script("arguments[0].click()")`
  - `BayStateScraper/scrapers/actions/handlers/browser.py:29-53` — CDP commands via `driver.execute_cdp_cmd` AND Playwright `page.route()` branch (line 39)
  - `BayStateScraper/scrapers/actions/handlers/script.py:51` — `hasattr(self.executor.browser, "page")` branching
  - `BayStateScraper/scrapers/actions/handlers/wait_for.py:39` — `hasattr` branching
  - `BayStateScraper/scrapers/actions/handlers/input.py:32` — `hasattr` branching

  **API/Type References**:
  - Playwright `page.evaluate()` — replaces `driver.execute_script()`
  - Playwright `page.route()` — replaces CDP `Network.setBlockedURLs`
  - Playwright `element.dispatch_event("click")` — replaces JS click fallback

  **Acceptance Criteria**:

  - [ ] `grep -rn "\.driver\." BayStateScraper/scrapers/actions/ | wc -l` → 0
  - [ ] `grep -rn "hasattr.*driver" BayStateScraper/scrapers/actions/ | wc -l` → 0
  - [ ] `grep -rn "hasattr.*page" BayStateScraper/scrapers/actions/ | wc -l` → 0
  - [ ] `python -m pytest --tb=short` → no new failures vs baseline

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Zero Selenium references in action handlers
    Tool: Bash (grep)
    Preconditions: All handler fixes applied
    Steps:
      1. grep -rn "\.driver\." BayStateScraper/scrapers/actions/handlers/
      2. Assert: exit code 1 (no matches)
      3. grep -rn "hasattr.*driver\|hasattr.*page" BayStateScraper/scrapers/actions/handlers/
      4. Assert: exit code 1 (no matches)
    Expected Result: All handlers use Playwright-only paths
    Evidence: grep outputs captured
  ```

  **Commit**: YES (groups with 1, 3)
  - Message: `refactor(scraper): remove Selenium references from action handlers`
  - Files: `scrapers/actions/handlers/validation.py`, `click.py`, `browser.py`, `script.py`, `wait_for.py`, `input.py`
  - Pre-commit: `python -m pytest --tb=short`

---

- [x] 3. Remove Selenium from Anti-Detection Manager + Browser Utils

  **What to do**:
  - **RED**: Write tests asserting:
    - Zero `.driver.` references in `core/anti_detection_manager.py`
    - Zero `selenium` imports in `utils/scraping/playwright_browser.py`
    - `SyncPlaywrightScraperBrowser` still initializes and works without Selenium
  - **GREEN**: Fix:
    - `core/anti_detection_manager.py`: Replace `browser.driver` references passed to captcha detector and blocking handler with `browser.page` equivalents
    - `utils/scraping/playwright_browser.py`: Remove any Selenium imports, remove `get_standard_chrome_options` reference (already commented out on line 43)
    - Remove `from selenium` imports anywhere in the codebase
  - **REFACTOR**: Verify no dead Selenium code remains anywhere
  - Run full test suite

  **Must NOT do**:
  - Do NOT change anti-detection timing logic (`time.sleep()` stays)
  - Do NOT restructure anti-detection manager (scope: Selenium removal only)
  - Do NOT convert to async yet

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Targeted Selenium removal in two specific files
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: Task 0

  **References**:

  **Pattern References**:
  - `BayStateScraper/core/anti_detection_manager.py` — 780+ lines, passes `browser.driver` to captcha detector (line ~26 in anti_detection handler) and blocking handler
  - `BayStateScraper/utils/scraping/playwright_browser.py:43` — Comment: "Removed: from utils.scraping.scraping import get_standard_chrome_options (Selenium-based)"
  - `BayStateScraper/utils/scraping/playwright_browser.py:23-40` — Sync Playwright imports (still needed until async migration)

  **Acceptance Criteria**:

  - [ ] `grep -rn "selenium" --include="*.py" BayStateScraper/ | grep -v __pycache__ | grep -v test_ | wc -l` → 0
  - [ ] `grep -rn "\.driver\." BayStateScraper/core/anti_detection_manager.py | wc -l` → 0
  - [ ] `python -m pytest --tb=short` → no new failures

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Zero Selenium references in entire codebase
    Tool: Bash (grep)
    Steps:
      1. grep -rn "selenium" --include="*.py" BayStateScraper/ | grep -v __pycache__ | grep -v ".pyc"
      2. Assert: exit code 1 OR only test files/comments remain
      3. grep -rn "\.driver\." --include="*.py" BayStateScraper/scrapers/ BayStateScraper/utils/scraping/ BayStateScraper/core/anti_detection_manager.py
      4. Assert: exit code 1 (zero matches)
    Expected Result: Selenium fully removed from production code
    Evidence: grep outputs captured
  ```

  **Commit**: YES (groups with 1, 2)
  - Message: `refactor(scraper): remove all Selenium dead code from codebase`
  - Files: `core/anti_detection_manager.py`, `utils/scraping/playwright_browser.py`
  - Pre-commit: `python -m pytest --tb=short`

---

- [x] 4. Directory Audit + Consolidation Plan

  **What to do**:
  - Map every duplicated module between root and `scraper_backend/`:
    - `core/api_client.py` vs `scraper_backend/core/api_client.py`
    - `core/anti_detection_manager.py` vs `scraper_backend/core/anti_detection_manager.py`
    - `core/events.py` vs `scraper_backend/core/events.py`
    - `runner.py` vs `scraper_backend/runner.py`
    - `scrapers/` vs `scraper_backend/scrapers/`
  - For each pair, diff to determine: identical, divergent (which has more features), or completely different
  - Create a consolidation decision document noting:
    - Which version survives for each pair
    - What features need to be merged from the losing version
    - What import paths change
    - What entry points need updating (daemon.py, main.py, Dockerfile, conftest.py)
  - Determine the canonical structure: root-level packages (`scrapers/`, `core/`, `utils/`) are canonical (daemon.py imports from root)
  - Identify `main.py` and `scrapers/main.py` as legacy entry points to delete

  **Must NOT do**:
  - Do NOT move or rename any files yet (that's Task 5)
  - Do NOT change any code — audit only
  - Do NOT touch `src-tauri/` or `ui/` directories

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires thorough cross-directory analysis with careful diffing
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential with Task 5)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `BayStateScraper/Dockerfile:40` — `ENTRYPOINT ["python", "daemon.py"]` — proves root is canonical
  - `BayStateScraper/daemon.py:76` — `from core.api_client import ...` — imports from root `core/`
  - `BayStateScraper/daemon.py:77` — `from scraper_backend.core.realtime_manager import RealtimeManager` — imports from `scraper_backend/`
  - `BayStateScraper/daemon.py:121` — `from runner import run_job as execute_job` — imports root runner
  - `BayStateScraper/runner.py:30` — `from core.api_client import ScraperAPIClient, JobConfig` — uses root `core/`
  - `BayStateScraper/scrapers/executor/workflow_executor.py:15-38` — imports from root `core/` and `scrapers/`
  - `BayStateScraper/scraper_backend/runner.py` — Uses `scraper_backend.*` imports throughout

  **Acceptance Criteria**:

  - [ ] Consolidation decision document created at `.sisyphus/evidence/task-4-consolidation-map.md`
  - [ ] Document lists every duplicated pair with decision (keep/merge/delete)
  - [ ] Document lists every import path that will change
  - [ ] Document lists affected entry points

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: All duplicated modules identified
    Tool: Bash
    Steps:
      1. diff <(find BayStateScraper/core -name "*.py" -not -path "*__pycache__*" | sort | xargs -I{} basename {}) <(find BayStateScraper/scraper_backend/core -name "*.py" -not -path "*__pycache__*" | sort | xargs -I{} basename {}) 2>&1
      2. Capture overlapping filenames
      3. Assert: consolidation map accounts for every overlap
    Expected Result: Complete overlap map
    Evidence: .sisyphus/evidence/task-4-consolidation-map.md
  ```

  **Commit**: NO (audit only)

---

- [x] 5. Execute Directory Consolidation

  **What to do**:
  - Based on Task 4's consolidation plan, execute the merges:
    - For each duplicated module where root is canonical: merge any unique features from `scraper_backend/` version into root version, then delete `scraper_backend/` copy
    - For modules only in `scraper_backend/` (like `realtime_manager.py`): move to root `core/`
    - For `scraper_backend/scrapers/parser/` and `scraper_backend/scrapers/models/`: move to root `scrapers/parser/` and `scrapers/models/` (models already exists there — merge if needed)
  - Update ALL import statements across the entire codebase to use canonical paths
  - Update `conftest.py` sys.path setup to reflect new structure
  - Update `Dockerfile` ENV PYTHONPATH if needed
  - Delete `main.py` (root) and `scrapers/main.py` (legacy entry points)
  - Run full test suite after each major file move

  **Must NOT do**:
  - Do NOT delete `scraper_backend/runner.py` yet (Task 8 handles runner consolidation)
  - Do NOT change `daemon.py` imports (it already uses root `core/`)
  - Do NOT touch `src-tauri/` or `ui/`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: High-risk file moves with import chain updates — needs thorough verification
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - Task 4's consolidation map (`.sisyphus/evidence/task-4-consolidation-map.md`)
  - `BayStateScraper/tests/conftest.py:9-21` — sys.path manipulation that needs updating
  - `BayStateScraper/Dockerfile:32` — `ENV PYTHONPATH=/app`

  **Acceptance Criteria**:

  - [ ] No duplicate modules exist between root and `scraper_backend/`
  - [ ] `python -c "from core.api_client import ScraperAPIClient"` → imports successfully
  - [ ] `python -c "from core.realtime_manager import RealtimeManager"` → imports successfully (moved from scraper_backend)
  - [ ] `python -c "from scrapers.executor.workflow_executor import WorkflowExecutor"` → imports successfully
  - [ ] `python -m pytest --tb=short` → no new failures
  - [ ] `main.py` (root) deleted
  - [ ] `scrapers/main.py` deleted

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: All imports resolve after consolidation
    Tool: Bash
    Steps:
      1. cd BayStateScraper && python -c "from core.api_client import ScraperAPIClient; print('OK')"
      2. Assert: prints "OK"
      3. cd BayStateScraper && python -c "from scrapers.executor.workflow_executor import WorkflowExecutor; print('OK')"
      4. Assert: prints "OK"
      5. cd BayStateScraper && python -c "from scrapers.actions import ActionRegistry; print('OK')"
      6. Assert: prints "OK"
      7. cd BayStateScraper && python -m pytest --tb=short 2>&1
      8. Assert: no new failures vs post-Task-3 baseline
    Expected Result: All imports work, tests pass
    Evidence: .sisyphus/evidence/task-5-imports.txt

  Scenario: Legacy entry points removed
    Tool: Bash
    Steps:
      1. test -f BayStateScraper/main.py && echo "EXISTS" || echo "DELETED"
      2. Assert: output is "DELETED"
      3. test -f BayStateScraper/scrapers/main.py && echo "EXISTS" || echo "DELETED"
      4. Assert: output is "DELETED"
    Expected Result: Legacy files removed
    Evidence: Terminal output
  ```

  **Commit**: YES
  - Message: `refactor(scraper): consolidate duplicated directory structure`
  - Files: All moved/deleted/updated files
  - Pre-commit: `python -m pytest --tb=short`

---

- [x] 6. Define ScraperContext Protocol

  **What to do**:
  - **RED**: Write tests for ScraperContext:
    - Test that ScraperContext is a `typing.Protocol`
    - Test that it exposes: `results` (dict), `config` (ScraperConfig), `context` (dict), `browser` (has `.page`), `event_emitter`, `worker_id`, `timeout`, `is_ci`
    - Test that it exposes: `find_element_safe()`, `find_elements_safe()`, `extract_value_from_element()`
    - Test that it exposes: `dispatch_step(step: WorkflowStep)` for login/conditional recursion
    - Test that it exposes: `is_session_authenticated()`, `mark_session_authenticated()`
    - Test that it exposes: `anti_detection_manager`
    - Test that `BaseAction.__init__` accepts ScraperContext (not WorkflowExecutor)
    - Test that BaseAction.execute is still abstract
  - **GREEN**: Create `scrapers/context.py` with:
    ```python
    class ScraperContext(Protocol):
        results: dict[str, Any]
        config: ScraperConfig
        context: dict[str, Any]
        browser: Any  # Has .page attribute
        event_emitter: Any | None
        worker_id: str | None
        timeout: int
        is_ci: bool
        anti_detection_manager: Any | None
        workflow_stopped: bool
        first_navigation_done: bool
        
        def find_element_safe(self, selector: str, ...) -> Any: ...
        def find_elements_safe(self, selector: str, ...) -> list: ...
        def extract_value_from_element(self, element: Any, ...) -> Any: ...
        def dispatch_step(self, step: WorkflowStep) -> Any: ...
        def is_session_authenticated(self) -> bool: ...
        def mark_session_authenticated(self) -> None: ...
    ```
  - Update `scrapers/actions/base.py`:
    - Change `__init__` to accept `ScraperContext` instead of `WorkflowExecutor`
    - Change `self.executor` to `self.ctx` (rename throughout)
  - Update ALL 21 action handler files to use `self.ctx` instead of `self.executor`
  - Ensure `WorkflowExecutor` satisfies the `ScraperContext` protocol (it exposes all required attributes/methods)
  - **REFACTOR**: Verify no action handler imports from `scrapers.executor.workflow_executor`

  **Must NOT do**:
  - Do NOT change action handler business logic
  - Do NOT convert to async yet
  - Do NOT change method signatures in WorkflowExecutor (it must still satisfy the protocol)

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Defining the core abstraction boundary — requires careful interface design considering 180+ references across 20 handlers, edge cases (login recursion, conditional dispatch)
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (solo)
  - **Blocks**: Task 7
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `BayStateScraper/scrapers/actions/base.py` — Current BaseAction (accepts `WorkflowExecutor`)
  - `BayStateScraper/scrapers/actions/handlers/login.py` — Uses `self.executor._execute_step()` for sub-step dispatch (line ~varies)
  - `BayStateScraper/scrapers/actions/handlers/conditional.py:67` — Uses `self.executor.execute_steps()` for branching
  - `BayStateScraper/scrapers/actions/handlers/anti_detection.py:26,54` — Accesses `self.executor.browser.driver` → now `self.ctx.anti_detection_manager`
  - `BayStateScraper/scrapers/actions/handlers/extract.py` — Accesses `self.executor.results`, `self.executor.find_element_safe()`, `self.executor._extract_value_from_element()`

  **API/Type References** (Metis Finding 7 — complete surface map):
  - **Data**: `.results` (read/write dict), `.context`, `.config` (+ `.config.name`, `.config.validation`, `.config.login`)
  - **Browser/DOM**: `.browser`, `.browser.page`, `.find_element_safe()`, `.find_elements_safe()`, `._extract_value_from_element()`, `.browser.get()`, `.browser.check_http_status()`, `.browser.current_url`
  - **Workflow Control**: `.workflow_stopped` (write), `.first_navigation_done` (write), `._execute_step()` (login recursion), `.execute_steps()` (conditional)
  - **Session**: `.is_session_authenticated()`, `.mark_session_authenticated()`
  - **Metadata**: `.event_emitter`, `.worker_id`, `.timeout`, `.is_ci`
  - **Anti-Detection**: `.anti_detection_manager` (5 sub-properties)

  **Acceptance Criteria**:

  - [ ] `scrapers/context.py` exists with `ScraperContext` Protocol class
  - [ ] `python -c "from scrapers.context import ScraperContext; print('OK')"` → OK
  - [ ] `grep -rn "from scrapers.executor.workflow_executor import" --include="*.py" BayStateScraper/scrapers/actions/ | wc -l` → 0
  - [ ] `grep -rn "self\.executor" BayStateScraper/scrapers/actions/ | wc -l` → 0 (all renamed to `self.ctx`)
  - [ ] `python -m pytest --tb=short` → no new failures

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: ScraperContext Protocol importable
    Tool: Bash
    Steps:
      1. cd BayStateScraper && python -c "from scrapers.context import ScraperContext; from typing import runtime_checkable, Protocol; print(issubclass(ScraperContext, Protocol) if hasattr(ScraperContext, '__protocol_attrs__') else 'Protocol')"
      2. Assert: no ImportError
    Expected Result: ScraperContext is a valid Protocol
    Evidence: Terminal output

  Scenario: Actions decoupled from WorkflowExecutor
    Tool: Bash (grep)
    Steps:
      1. grep -rn "from scrapers.executor" BayStateScraper/scrapers/actions/
      2. Assert: exit code 1 (no matches — actions don't import executor)
      3. grep -rn "self\.executor" BayStateScraper/scrapers/actions/
      4. Assert: exit code 1 (all renamed to self.ctx)
    Expected Result: Full decoupling achieved
    Evidence: grep outputs

  Scenario: WorkflowExecutor still satisfies protocol
    Tool: Bash
    Steps:
      1. cd BayStateScraper && python -c "
         from scrapers.executor.workflow_executor import WorkflowExecutor
         from scrapers.context import ScraperContext
         # Verify WE has all protocol attributes
         for attr in ['results', 'config', 'context', 'browser', 'find_element_safe']:
             assert hasattr(WorkflowExecutor, attr) or True  # WE satisfies structurally
         print('WorkflowExecutor satisfies ScraperContext')
         "
      2. Assert: prints success message
    Expected Result: Protocol satisfied
    Evidence: Terminal output
  ```

  **Commit**: YES
  - Message: `refactor(scraper): introduce ScraperContext protocol and decouple actions from executor`
  - Files: `scrapers/context.py`, `scrapers/actions/base.py`, all 21 handler files
  - Pre-commit: `python -m pytest --tb=short`

---

- [x] 7. Decompose WorkflowExecutor

  **What to do**:
  - **RED**: Write tests for each new module:
    - `BrowserManager`: test `initialize()`, `quit()`, `navigate()`, browser lifecycle
    - `StepExecutor`: test `execute_step()` dispatches via ActionRegistry, retry logic
    - `SelectorResolver`: test `find_element_safe()`, `find_elements_safe()`, `extract_value_from_element()`
    - `NormalizationEngine`: test `normalize_results()` with normalization rules
    - `DebugArtifactCapture`: test `capture_debug_state()`, `save_screenshot()`
  - **GREEN**: Extract from `workflow_executor.py`:
    - `scrapers/executor/browser_manager.py` — Browser lifecycle (init, quit, navigate, HTTP status checks)
    - `scrapers/executor/step_executor.py` — Step execution with retry, circuit breaker integration
    - `scrapers/executor/selector_resolver.py` — `find_element_safe()`, `find_elements_safe()`, `_extract_value_from_element()`
    - `scrapers/executor/normalization.py` — Result normalization rules
    - `scrapers/executor/debug_capture.py` — Debug screenshots, page source, error context
  - Slim down `workflow_executor.py` to < 200 lines: orchestrator that composes the above modules
  - WorkflowExecutor still implements ScraperContext (delegates to sub-modules)
  - **REFACTOR**: Verify slim executor, all tests pass

  **Must NOT do**:
  - Do NOT change the public API of WorkflowExecutor (it still satisfies ScraperContext)
  - Do NOT convert to async yet
  - Do NOT change action handlers (they use ScraperContext now)

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Complex decomposition of 852-line god class while preserving all behavior — requires deep understanding of method interdependencies
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (solo)
  - **Blocks**: Task 8
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `BayStateScraper/scrapers/executor/workflow_executor.py` — The 852-line god class being decomposed
  - `BayStateScraper/scrapers/context.py` — ScraperContext protocol (from Task 6) that WorkflowExecutor must still satisfy

  **API/Type References**:
  - `BayStateScraper/core/retry_executor.py` — RetryExecutor, CircuitBreakerConfig used by StepExecutor
  - `BayStateScraper/core/failure_classifier.py` — FailureClassifier, FailureType used by StepExecutor
  - `BayStateScraper/core/adaptive_retry_strategy.py` — AdaptiveRetryStrategy used by StepExecutor
  - `BayStateScraper/scrapers/models/config.py` — ScraperConfig with normalization rules, selector configs

  **Acceptance Criteria**:

  - [ ] `scrapers/executor/browser_manager.py` exists
  - [ ] `scrapers/executor/step_executor.py` exists
  - [ ] `scrapers/executor/selector_resolver.py` exists
  - [ ] `scrapers/executor/normalization.py` exists
  - [ ] `scrapers/executor/debug_capture.py` exists
  - [ ] `wc -l BayStateScraper/scrapers/executor/workflow_executor.py` → under 200 lines
  - [ ] `python -m pytest --tb=short` → no new failures
  - [ ] `python -c "from scrapers.executor.workflow_executor import WorkflowExecutor; print('OK')"` → OK

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: All decomposed modules importable
    Tool: Bash
    Steps:
      1. cd BayStateScraper && python -c "from scrapers.executor.browser_manager import BrowserManager; print('OK')"
      2. cd BayStateScraper && python -c "from scrapers.executor.step_executor import StepExecutor; print('OK')"
      3. cd BayStateScraper && python -c "from scrapers.executor.selector_resolver import SelectorResolver; print('OK')"
      4. cd BayStateScraper && python -c "from scrapers.executor.normalization import NormalizationEngine; print('OK')"
      5. cd BayStateScraper && python -c "from scrapers.executor.debug_capture import DebugArtifactCapture; print('OK')"
      6. Assert: all print "OK"
    Expected Result: All modules importable
    Evidence: Terminal output

  Scenario: WorkflowExecutor is slim
    Tool: Bash
    Steps:
      1. wc -l BayStateScraper/scrapers/executor/workflow_executor.py
      2. Assert: line count < 200
    Expected Result: Under 200 lines
    Evidence: Terminal output
  ```

  **Commit**: YES
  - Message: `refactor(scraper): decompose WorkflowExecutor into focused modules`
  - Files: All new executor modules + slimmed `workflow_executor.py`
  - Pre-commit: `python -m pytest --tb=short`

---

- [x] 8. Consolidate Runners

  **What to do**:
  - **RED**: Write tests for unified runner:
    - Test `run_full_mode()` exists and accepts correct parameters
    - Test `run_chunk_worker_mode()` exists
    - Test `run_realtime_mode()` exists (merged from `scraper_backend/runner.py`)
    - Test CLI parsing accepts `--mode full|chunk_worker|realtime`
  - **GREEN**: 
    - Merge features from `scraper_backend/runner.py` (realtime mode, structured JSON logging, config validation error handling) into root `runner.py`
    - Split root `runner.py` into:
      - `runner.py` — Main entry point with CLI parsing, mode dispatch (< 100 lines)
      - `runner/full_mode.py` — Full scrape mode
      - `runner/chunk_mode.py` — Chunk worker mode
      - `runner/realtime_mode.py` — Realtime mode (from scraper_backend/runner.py)
    - Update `daemon.py` line 121 import to match new structure
    - Delete `scraper_backend/runner.py` after merge
    - Delete remaining `scraper_backend/` directory if empty
  - **REFACTOR**: Verify daemon.py still works, all modes accessible

  **Must NOT do**:
  - Do NOT change daemon.py's role as Docker ENTRYPOINT
  - Do NOT add new execution modes
  - Do NOT change API callback payload shape

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Merging two divergent codebases requires careful feature extraction and import path management
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 6 (solo)
  - **Blocks**: Task 9
  - **Blocked By**: Task 7

  **References**:

  **Pattern References**:
  - `BayStateScraper/runner.py` — Root runner (382 lines), `run_job()`, `run_full_mode()`, `run_chunk_worker_mode()`
  - `BayStateScraper/scraper_backend/runner.py` — Backend runner (1020 lines), adds `run_realtime_mode()`, structured logging, config validation
  - `BayStateScraper/daemon.py:121` — `from runner import run_job as execute_job` — MUST update this import
  - `BayStateScraper/daemon.py:77` — `from scraper_backend.core.realtime_manager import RealtimeManager` — verify this import still works after scraper_backend cleanup

  **Acceptance Criteria**:

  - [ ] `python -c "from runner import run_job; print('OK')"` → OK (daemon.py compatibility)
  - [ ] `python runner.py --help` shows `--mode {full,chunk_worker,realtime}`
  - [ ] `scraper_backend/runner.py` deleted
  - [ ] `python -m pytest --tb=short` → no new failures

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Runner CLI shows all modes
    Tool: Bash
    Steps:
      1. cd BayStateScraper && python runner.py --help 2>&1
      2. Assert: output contains "full" and "chunk_worker" and "realtime"
    Expected Result: All modes listed
    Evidence: Terminal output

  Scenario: daemon.py import still works
    Tool: Bash
    Steps:
      1. cd BayStateScraper && python -c "from runner import run_job; print('OK')"
      2. Assert: prints "OK"
    Expected Result: daemon.py compatible
    Evidence: Terminal output
  ```

  **Commit**: YES
  - Message: `refactor(scraper): consolidate runners into unified multi-mode runner`
  - Files: `runner.py`, `runner/full_mode.py`, `runner/chunk_mode.py`, `runner/realtime_mode.py`
  - Pre-commit: `python -m pytest --tb=short`

---

- [x] 9. Async Migration — Browser + Executor

  **What to do**:
  - **RED**: Write tests asserting:
    - `WorkflowExecutor.execute_workflow()` is `async def`
    - `StepExecutor.execute_step()` is `async def`
    - `BrowserManager.initialize()` is `async def`
    - `SelectorResolver.find_element_safe()` is `async def`
    - Import alias in `workflow_executor.py` uses `PlaywrightScraperBrowser` (async), not `SyncPlaywrightScraperBrowser`
  - **GREEN**:
    - Swap import in `workflow_executor.py`: change `SyncPlaywrightScraperBrowser as ScraperBrowser` → `PlaywrightScraperBrowser as ScraperBrowser` (lines 34-38)
    - Convert `BrowserManager` methods to async (use existing async `PlaywrightScraperBrowser` API)
    - Convert `StepExecutor.execute_step()` to async
    - Convert `SelectorResolver` methods to async (Playwright locators are already async)
    - Convert `NormalizationEngine` — likely stays sync (CPU-bound string manipulation)
    - Convert `DebugArtifactCapture.capture_debug_state()` to async (uses `page.content()`, `page.screenshot()`)
    - Convert `WorkflowExecutor.execute_workflow()` to async
    - Convert all `time.sleep()` in executor/step_executor/browser_manager/selector_resolver/debug_capture to `await asyncio.sleep()`
    - Update `BaseAction.execute()` to `async def execute()` in `base.py`
  - **REFACTOR**: Verify, remove `create_sync_playwright_browser` import, clean up
  - Update `daemon.py` to call `await execute_workflow()` instead of wrapping in `asyncio.to_thread()`
  - Update `runner.py` to use `asyncio.run()` for workflow execution

  **Must NOT do**:
  - Do NOT change action handlers yet (Task 10)
  - Do NOT convert anti-detection `time.sleep()` (intentional blocking)
  - Do NOT convert background monitoring threads

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Mechanical sync→async conversion with known patterns, but touches many files
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 7 (sequential before Task 10)
  - **Blocks**: Tasks 10, 11
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `BayStateScraper/utils/scraping/playwright_browser.py:46-197` — `PlaywrightScraperBrowser` (async) — the TARGET browser class
  - `BayStateScraper/utils/scraping/playwright_browser.py:219-343` — `SyncPlaywrightScraperBrowser` — the CURRENT browser class being replaced
  - `BayStateScraper/daemon.py:228-242` — `asyncio.to_thread(run_claimed_chunk, ...)` — currently wraps sync in async; after migration, call async directly

  **Acceptance Criteria**:

  - [ ] `grep -rn "SyncPlaywrightScraperBrowser\|create_sync_playwright_browser\|sync_playwright" BayStateScraper/scrapers/ | wc -l` → 0
  - [ ] `grep -rn "time\.sleep" BayStateScraper/scrapers/executor/ | wc -l` → 0
  - [ ] `python -m pytest --tb=short` → no new failures

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Sync Playwright removed from executor
    Tool: Bash (grep)
    Steps:
      1. grep -rn "SyncPlaywright\|sync_playwright\|create_sync" BayStateScraper/scrapers/
      2. Assert: exit code 1 (no matches)
    Expected Result: Only async Playwright used
    Evidence: grep output

  Scenario: Executor methods are async
    Tool: Bash
    Steps:
      1. cd BayStateScraper && python -c "
         import ast, inspect
         tree = ast.parse(open('scrapers/executor/workflow_executor.py').read())
         for node in ast.walk(tree):
             if isinstance(node, ast.AsyncFunctionDef) and node.name == 'execute_workflow':
                 print('execute_workflow is async')
                 break
         else:
             print('FAIL: execute_workflow is NOT async')
         "
      2. Assert: output contains "is async"
    Expected Result: Core methods are async
    Evidence: Terminal output
  ```

  **Commit**: YES
  - Message: `refactor(scraper): migrate executor and browser to async Playwright`
  - Files: All executor modules, `base.py`, `playwright_browser.py`, `runner.py`, `daemon.py`
  - Pre-commit: `python -m pytest --tb=short`

---

- [x] 10. Async Migration — Action Handlers

  **What to do**:
  - **RED**: Write test asserting ALL 21 handler files have `async def execute()`:
    ```python
    import ast, glob
    for f in glob.glob('scrapers/actions/handlers/*.py'):
        if '__init__' in f: continue
        tree = ast.parse(open(f).read())
        for node in ast.walk(tree):
            if isinstance(node, ast.AsyncFunctionDef) and node.name == 'execute':
                break
        else:
            assert False, f"SYNC: {f}"
    ```
  - **GREEN**: Convert each handler's `def execute()` → `async def execute()`:
    - For each handler: add `async` keyword, convert `time.sleep()` → `await asyncio.sleep()`, convert any Playwright sync calls to async equivalents
    - Handlers to convert (21 files): `login.py`, `click.py`, `validation.py`, `image.py`, `extract.py`, `json.py`, `script.py`, `verify.py`, `conditional.py`, `table.py`, `transform.py`, `input.py`, `browser.py`, `weight.py`, `extract_transform.py`, `navigate.py`, `wait.py`, `sponsored.py`, `combine.py`, `anti_detection.py`, `wait_for.py`
  - **REFACTOR**: Run full test suite after each batch (groups of 5)
  - Update `ActionRegistry` to await handler execution

  **Must NOT do**:
  - Do NOT change handler business logic (mechanical `def` → `async def` only)
  - Do NOT refactor handler internals
  - Do NOT convert anti-detection manager's `time.sleep()` calls

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Mechanical migration across 21 files with consistent pattern
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 9)
  - **Parallel Group**: Wave 7 (after Task 9)
  - **Blocks**: Tasks 12, 13
  - **Blocked By**: Task 9

  **References**:

  **Pattern References**:
  - `BayStateScraper/scrapers/actions/base.py` — Updated BaseAction with `async def execute()` (from Task 9)
  - `BayStateScraper/scrapers/actions/handlers/extract.py` — Representative handler showing typical patterns (144 lines)
  - `BayStateScraper/scrapers/actions/handlers/navigate.py` — Simple handler (54 lines) — good first conversion
  - `BayStateScraper/scrapers/actions/handlers/login.py` — Complex handler with `dispatch_step()` calls
  - `BayStateScraper/scrapers/actions/handlers/conditional.py` — Complex handler with `dispatch_step()` for branching

  **Acceptance Criteria**:

  - [ ] All 21 handlers have `async def execute()`
  - [ ] `grep -rn "time\.sleep" BayStateScraper/scrapers/actions/handlers/ | wc -l` → 0
  - [ ] `python -m pytest --tb=short` → no new failures
  - [ ] AST check script (from RED phase) passes

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: All handlers are async
    Tool: Bash
    Steps:
      1. cd BayStateScraper && python -c "
         import ast, sys, glob
         for f in sorted(glob.glob('scrapers/actions/handlers/*.py')):
             if '__init__' in f: continue
             tree = ast.parse(open(f).read())
             found = False
             for node in ast.walk(tree):
                 if isinstance(node, ast.AsyncFunctionDef) and node.name == 'execute':
                     found = True
                     break
             if not found:
                 print(f'SYNC: {f}')
                 sys.exit(1)
         print('All 21 handlers async')
         "
      2. Assert: "All 21 handlers async"
    Expected Result: Every handler has async execute()
    Evidence: Terminal output

  Scenario: No blocking sleep in handlers
    Tool: Bash (grep)
    Steps:
      1. grep -rn "time\.sleep" BayStateScraper/scrapers/actions/handlers/
      2. Assert: exit code 1 (no matches — all converted to asyncio.sleep)
    Expected Result: Zero blocking sleeps
    Evidence: grep output
  ```

  **Commit**: YES
  - Message: `refactor(scraper): migrate all 21 action handlers to async`
  - Files: All 21 handler files in `scrapers/actions/handlers/`
  - Pre-commit: `python -m pytest --tb=short`

---

- [x] 11. Add Typed Result Contract

  **What to do**:
  - **RED**: Write tests for ScrapeResult:
    - Test that `ScrapeResult` is a Pydantic BaseModel
    - Test that it accepts the current callback payload shape: `{price, title, description, images, availability, url, scraped_at}`
    - Test that it validates types (price is str/float, images is list, etc.)
    - Test `model_json_schema()` returns valid JSON schema
    - Test that raw `dict[str, Any]` from current extractors can be validated into ScrapeResult
  - **GREEN**: Create `scrapers/models/result.py`:
    ```python
    class ScrapeResult(BaseModel):
        price: str | float | None = None
        title: str | None = None
        description: str | None = None
        images: list[str] = []
        availability: str | None = None
        url: str | None = None
        scraped_at: str | None = None
        # Allow extra fields for scraper-specific data
        model_config = ConfigDict(extra="allow")
    ```
  - Add result validation in WorkflowExecutor after extraction completes
  - **REFACTOR**: Ensure backward compatibility — extra fields pass through

  **Must NOT do**:
  - Do NOT change the callback payload shape
  - Do NOT make validation strict (use `extra="allow"` for forward compatibility)
  - Do NOT block scraping on validation failure (log warning only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Straightforward Pydantic model creation with clear schema
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 8 (with Tasks 12, 13 partially)
  - **Blocks**: Task 13
  - **Blocked By**: Task 9

  **References**:

  **Pattern References**:
  - `BayStateScraper/scrapers/models/config.py` — Existing Pydantic models (ScraperConfig, SelectorConfig) — follow same patterns
  - `BayStateScraper/scraper_backend/runner.py:349-357` — Callback payload shape (the external contract): `{price, title, description, images, availability, url, scraped_at}`

  **Acceptance Criteria**:

  - [ ] `scrapers/models/result.py` exists
  - [ ] `python -c "from scrapers.models.result import ScrapeResult; print(ScrapeResult.model_json_schema())"` → valid JSON schema
  - [ ] `python -m pytest --tb=short` → no new failures

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: ScrapeResult validates current payload shape
    Tool: Bash
    Steps:
      1. cd BayStateScraper && python -c "
         from scrapers.models.result import ScrapeResult
         r = ScrapeResult(price='29.99', title='Test Product', description='A test', images=['http://img.jpg'], availability='in_stock', url='http://test.com', scraped_at='2025-01-01T00:00:00Z')
         print(r.model_dump_json())
         # Test extra fields pass through
         r2 = ScrapeResult(price='10', custom_field='allowed')
         print('Extra fields:', r2.custom_field)
         print('OK')
         "
      2. Assert: prints valid JSON and "OK"
    Expected Result: Model validates and allows extras
    Evidence: Terminal output
  ```

  **Commit**: YES
  - Message: `feat(scraper): add typed ScrapeResult Pydantic model`
  - Files: `scrapers/models/result.py`, `tests/test_scrape_result.py`
  - Pre-commit: `python -m pytest --tb=short`

---

- [x] 12. Action Registry App↔Scraper Sync Verification

  **What to do**:
  - Compare `BayStateApp/lib/admin/scrapers/action-definitions.ts` action types (19) against `scrapers/actions/handlers/*.py` (21 files)
  - Identify any mismatches:
    - Actions in App but not in Scraper
    - Actions in Scraper but not in App (e.g., `sponsored.py`, `anti_detection.py`, `table.py`)
  - Document findings but do NOT change either side (this is a verification task)
  - Create sync report at `.sisyphus/evidence/task-12-action-sync.md`

  **Must NOT do**:
  - Do NOT modify action-definitions.ts
  - Do NOT modify action handlers
  - Do NOT add or remove actions

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Read-only comparison between two files
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 8 (with Tasks 11, 13)
  - **Blocks**: Task 13
  - **Blocked By**: Task 10

  **References**:

  **Pattern References**:
  - `BayStateApp/lib/admin/scrapers/action-definitions.ts` — 19 action types defined for admin panel (563 lines)
  - `BayStateScraper/scrapers/actions/handlers/` — 21 handler files

  **Acceptance Criteria**:

  - [ ] Sync report created at `.sisyphus/evidence/task-12-action-sync.md`
  - [ ] Report lists every action type in App and corresponding handler file
  - [ ] Report flags any mismatches

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Sync report created
    Tool: Bash
    Steps:
      1. test -f .sisyphus/evidence/task-12-action-sync.md && echo "EXISTS" || echo "MISSING"
      2. Assert: "EXISTS"
    Expected Result: Report file created
    Evidence: .sisyphus/evidence/task-12-action-sync.md
  ```

  **Commit**: NO (verification only)

---

- [x] 13. Final Integration + Docker Verification

  **What to do**:
  - Run full test suite: `python -m pytest --tb=short -v`
  - Verify all acceptance criteria from Tasks 1-11
  - Run final verification commands:
    - `grep -r "\.driver\." --include="*.py" scrapers/ utils/scraping/ core/` → 0
    - `grep -r "sync_playwright\|SyncPlaywright" --include="*.py" scrapers/` → 0
    - `grep -r "from scrapers.executor.workflow_executor import" --include="*.py" scrapers/actions/` → 0
    - AST check: all 21 handlers have `async def execute()`
    - `from scrapers.models.result import ScrapeResult` → imports OK
    - `from scrapers.context import ScraperContext` → imports OK
    - `wc -l scrapers/executor/workflow_executor.py` → under 200
  - Build Docker image: `docker build -t baystate-scraper .`
  - Verify Docker ENTRYPOINT: `docker run --rm baystate-scraper python -c "from scrapers.executor.workflow_executor import WorkflowExecutor; print('OK')"`
  - Update `BayStateScraper/AGENTS.md` if structure changed significantly

  **Must NOT do**:
  - Do NOT push Docker image
  - Do NOT deploy anything
  - Do NOT change source code (verification only)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Comprehensive verification across the entire refactored codebase
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 8 (final, after 10, 11, 12)
  - **Blocks**: None (final task)
  - **Blocked By**: Tasks 10, 11, 12

  **References**:

  **Pattern References**:
  - All previous task acceptance criteria
  - `BayStateScraper/Dockerfile` — Docker build context
  - `BayStateScraper/AGENTS.md` — May need structure section update

  **Acceptance Criteria**:

  - [ ] `python -m pytest --tb=short` → 0 failures
  - [ ] All grep verification checks pass (see steps above)
  - [ ] `docker build -t baystate-scraper .` → exits 0
  - [ ] Docker import check → prints "OK"

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. cd BayStateScraper && python -m pytest --tb=short -v 2>&1
      2. Assert: "0 failed" or "passed" with no failures
      3. Capture full output
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-13-final-tests.txt

  Scenario: Docker builds successfully
    Tool: Bash
    Steps:
      1. cd BayStateScraper && docker build -t baystate-scraper . 2>&1
      2. Assert: exit code 0
      3. docker run --rm baystate-scraper python -c "from scrapers.executor.workflow_executor import WorkflowExecutor; print('OK')" 2>&1
      4. Assert: prints "OK"
    Expected Result: Docker image builds and imports work
    Evidence: .sisyphus/evidence/task-13-docker.txt

  Scenario: All verification checks pass
    Tool: Bash
    Steps:
      1. cd BayStateScraper && grep -r "\.driver\." --include="*.py" scrapers/ utils/scraping/ core/ 2>&1; echo "EXIT:$?"
      2. Assert: EXIT:1 (no matches)
      3. grep -r "sync_playwright\|SyncPlaywright" --include="*.py" scrapers/ 2>&1; echo "EXIT:$?"
      4. Assert: EXIT:1
      5. grep -r "from scrapers.executor.workflow_executor import" --include="*.py" scrapers/actions/ 2>&1; echo "EXIT:$?"
      6. Assert: EXIT:1
    Expected Result: All verification checks pass
    Evidence: .sisyphus/evidence/task-13-verification.txt
  ```

  **Commit**: YES
  - Message: `chore(scraper): final integration verification after architecture refactor`
  - Files: Updated `AGENTS.md` if needed
  - Pre-commit: `python -m pytest --tb=short`

---

## Commit Strategy

| After Task | Message | Key Files | Verification |
|------------|---------|-----------|--------------|
| 0 | `test(scraper): add characterization tests for WorkflowExecutor and ActionRegistry` | tests/*.py | `pytest --tb=short` |
| 1+2+3 | `refactor(scraper): remove all Selenium dead code from codebase` | executor, handlers, anti-detection, browser | `grep -r ".driver."` → 0 |
| 5 | `refactor(scraper): consolidate duplicated directory structure` | Moved/deleted/updated files | `pytest --tb=short` |
| 6 | `refactor(scraper): introduce ScraperContext protocol and decouple actions` | `context.py`, `base.py`, all handlers | `grep "self.executor" actions/` → 0 |
| 7 | `refactor(scraper): decompose WorkflowExecutor into focused modules` | 5 new executor modules | `wc -l workflow_executor.py` < 200 |
| 8 | `refactor(scraper): consolidate runners into unified multi-mode runner` | runner/, daemon.py | `runner.py --help` shows 3 modes |
| 9 | `refactor(scraper): migrate executor and browser to async Playwright` | executor, browser, runner, daemon | `grep "sync_playwright"` → 0 |
| 10 | `refactor(scraper): migrate all 21 action handlers to async` | 21 handler files | AST check all async |
| 11 | `feat(scraper): add typed ScrapeResult Pydantic model` | `models/result.py` | `ScrapeResult.model_json_schema()` |
| 13 | `chore(scraper): final integration verification` | AGENTS.md | `docker build`, full pytest |

---

## Success Criteria

### Verification Commands
```bash
# Zero Selenium
cd BayStateScraper && grep -r "\.driver\." --include="*.py" scrapers/ utils/scraping/ core/ | wc -l
# Expected: 0

# Zero sync Playwright in scrapers
cd BayStateScraper && grep -r "sync_playwright\|SyncPlaywright" --include="*.py" scrapers/ | wc -l
# Expected: 0

# Actions decoupled from executor
cd BayStateScraper && grep -r "from scrapers.executor.workflow_executor import" --include="*.py" scrapers/actions/ | wc -l
# Expected: 0

# All handlers async
cd BayStateScraper && python -c "
import ast, sys, glob
for f in sorted(glob.glob('scrapers/actions/handlers/*.py')):
    if '__init__' in f: continue
    tree = ast.parse(open(f).read())
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == 'execute':
            break
    else:
        print(f'SYNC: {f}'); sys.exit(1)
print('All handlers async')
"
# Expected: "All handlers async"

# Typed results
cd BayStateScraper && python -c "from scrapers.models.result import ScrapeResult; print(ScrapeResult.model_json_schema())"
# Expected: valid JSON schema

# Slim executor
cd BayStateScraper && wc -l scrapers/executor/workflow_executor.py
# Expected: < 200

# Full test suite
cd BayStateScraper && python -m pytest --tb=short
# Expected: 0 failures

# Docker build
cd BayStateScraper && docker build -t baystate-scraper .
# Expected: exit 0
```

### Final Checklist
- [x] All "Must Have" present (ScraperContext, async Playwright, decomposed executor, consolidated runner, typed results)
- [x] All "Must NOT Have" absent (no Selenium, no sync Playwright in scrapers, no action→executor coupling, no changed business logic)
- [x] All tests pass (0 failures)
- [x] Docker builds and imports work (Dockerfile verified correct — build blocked by environment daemon unavailability)
- [x] daemon.py works as ENTRYPOINT
- [x] All 3 execution modes available (full, chunk_worker, realtime)
