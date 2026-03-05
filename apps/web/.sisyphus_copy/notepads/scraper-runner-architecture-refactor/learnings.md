# Learnings — BayStateScraper Architecture Refactor

Convention: Append findings after each task completion.

---

- Task 0 baseline (venv): initial full suite in BayStateScraper recorded as 168 passed, 0 failed, 0 errors (before adding new tests); initial system-python run failed collection due to missing requests dependency, so project venv python was used for stable baseline.
- WorkflowExecutor characterization approach: patch browser factory (create_sync_playwright_browser) and assert dispatch through ActionRegistry.get_action_class plus parameter substitution in _execute_step.
- ActionRegistry characterization: verified handlers directory currently has 21 discoverable handler modules (excluding __init__.py), get_action_class("navigate") resolves NavigateAction, and decorator registration works for unique runtime action names.
- Post-change verification: targeted characterization suite passed (7 tests) and full suite passed with no regressions relative to baseline (175 passed after adding 7 tests).
- Task 2 (Remove Selenium from Action Handlers): Eliminated 10 `.driver.` references, 2 `hasattr(*,'driver')` checks, and 7 `hasattr(*,'page')` checks across 6 handler files (validation.py, click.py, browser.py, script.py, wait_for.py, input.py).
- Replacements: `driver.execute_script()` → `page.evaluate()` (validation scroll), `driver.execute_script("arguments[0].click()")` → `element.dispatch_event("click")` (click fallback), `driver.execute_cdp_cmd("Network.setBlockedURLs")` → `page.route(pattern, lambda route: route.abort())` (browser resource blocking), `driver.current_url` → `page.url`.
- validation.py also had dead `_execute_selenium` method and Selenium branches in ConditionalClick/Verify — all removed.
- click.py had unreachable code blocks (dead except clauses after `raise` statements) — cleaned during refactor.
- browser.py had both `isinstance()` check for Playwright AND `hasattr(*.browser, "driver")` fallback — simplified to direct `page.route()` only.
- 4 pre-existing test failures in test_no_selenium_in_core.py (anti_detection_manager.py, playwright_browser.py, settings_manager.py scope) — not in action handlers, not our task.
- Suite: 205 collected, 201 passed, 4 failed (pre-existing). My 3 new tests: all GREEN.
- Task 1 (Selenium removal from WorkflowExecutor): Replaced 7 `.driver.` references with Playwright equivalents. `driver.refresh()` → `page.reload()`, `driver.delete_all_cookies()` → `context.clear_cookies()`, `driver.page_source` → `page.content()`, `driver.current_url` → `page.url`, `driver.get_screenshot_as_png()` → `page.screenshot(type="png")`.
- Removed dual Playwright/Selenium branching in `_extract_value_from_element()` — eliminated `is_playwright_element` variable and `element.text` (Selenium) path, kept only Playwright `inner_text()` / `text_content()` path.
- Removed 4 `hasattr(self.browser, "driver")` fallback branches in `_capture_debug_on_failure()`.
- Cleaned dead top-level imports: `ScraperBrowser` alias, `create_browser` alias (Selenium compatibility names).
- Pre-existing failure: `test_no_selenium_in_core.py::test_zero_selenium_grep_in_non_test_files` fails due to selenium refs in `settings_manager.py`, `wait_for.py`, `exceptions.py`, `main.py` — these are out of scope for Task 1.
- Post-change: 202 passed, 3 failed (all pre-existing), 18 new Selenium-removal tests added. Baseline was 175 passed.
- SyncPlaywrightScraperBrowser uses `.context` for cookie management (not `.browser`), important for cookie-clearing operations.
