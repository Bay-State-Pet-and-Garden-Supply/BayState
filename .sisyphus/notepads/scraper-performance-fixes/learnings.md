## Task 2 - Managed browser context cleanup

- Added `ManagedBrowser` async context manager in `apps/scraper/utils/scraping/browser_context.py` to guarantee browser teardown through `__aexit__` for both success and exception paths.
- Normal cleanup now runs with a hard timeout (`cleanup_timeout`, default 10s) via `asyncio.wait_for` to prevent hung teardown calls from leaking resources.
- Added force cleanup fallback that independently attempts `page.close()`, `context.close()`, `browser.close()`, and `playwright.stop()` and logs success/failure per resource.
- Kept integration non-breaking by reusing existing `create_playwright_browser(...)` factory and returning the existing browser object type from context enter.
- Added focused unit coverage in `apps/scraper/tests/unit/test_browser_context.py` for success, exception, timeout fallback, cleanup failure fallback, and partial-force-cleanup-failure scenarios.
- QA evidence captured in `.sisyphus/evidence/task-2-cleanup-test.log` from `python -m pytest tests/unit/test_browser_context.py -v`.

## Task 3 - Resource blocking (Playwright)

- Added `block_unnecessary_resources()` to `PlaywrightScraperBrowser` (opt-in via `block_resources=True`).
- Blocks by extension: png, jpg, jpeg, gif, svg, webp, css, woff, woff2, ttf, otf.
- Blocks analytics/tracking/ad URLs by token matching (google-analytics, gtag, amplitude, segment, hotjar, mixpanel, googlesyndication, doubleclick, facebook, taboola, ads, adservice).
- Whitelists `/api/` paths and `.js` bundles to avoid breaking essential API calls and JavaScript.
- Registers lightweight metrics: `blocked_count`, `allowed_count`, `_requests_total` using Playwright request events.
- Integration: called during `initialize()` after page creation when `block_resources=True`.
- Added unit tests `apps/scraper/tests/unit/test_resource_blocking.py` that mock Playwright's page routing and events.

Notes / caveats:
- The stealth dependency (`playwright_stealth`) is imported lazily and is best-effort; failures do not abort initialization.
- Blocking is opt-in to avoid surprising behavior for existing scrapers.
- Metrics are approximate (Playwright request failure semantics vary by driver); use as trend indicators only.
