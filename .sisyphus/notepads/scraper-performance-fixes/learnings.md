## Task 2 - Managed browser context cleanup

- Added `ManagedBrowser` async context manager in `apps/scraper/utils/scraping/browser_context.py` to guarantee browser teardown through `__aexit__` for both success and exception paths.
- Normal cleanup now runs with a hard timeout (`cleanup_timeout`, default 10s) via `asyncio.wait_for` to prevent hung teardown calls from leaking resources.
- Added force cleanup fallback that independently attempts `page.close()`, `context.close()`, `browser.close()`, and `playwright.stop()` and logs success/failure per resource.
- Kept integration non-breaking by reusing existing `create_playwright_browser(...)` factory and returning the existing browser object type from context enter.
- Added focused unit coverage in `apps/scraper/tests/unit/test_browser_context.py` for success, exception, timeout fallback, cleanup failure fallback, and partial-force-cleanup-failure scenarios.
- QA evidence captured in `.sisyphus/evidence/task-2-cleanup-test.log` from `python -m pytest tests/unit/test_browser_context.py -v`.
