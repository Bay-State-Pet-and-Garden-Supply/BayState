"""
Playwright browser utility for scrapers.
Parallel to ScraperBrowser but using Playwright's async API.
Includes both Async and Sync implementations to support migration.
"""

from __future__ import annotations


import asyncio
import logging
import time
import inspect
from pathlib import Path
from typing import Any

from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    Response,
    async_playwright,
)
from playwright.sync_api import (
    Browser as SyncBrowser,
)
from playwright.sync_api import (
    BrowserContext as SyncBrowserContext,
)
from playwright.sync_api import (
    Page as SyncPage,
)
from playwright.sync_api import (
    Playwright as SyncPlaywright,
)
from playwright.sync_api import (
    Response as SyncResponse,
)
from playwright.sync_api import (
    sync_playwright,
)
# playwright_stealth imports are done lazily in initialize() to avoid hard dependency

logger = logging.getLogger(__name__)


class PlaywrightScraperBrowser:
    """
    Async Playwright-based browser implementation.
    """

    def __init__(
        self,
        site_name: str,
        headless: bool = True,
        profile_suffix: str | None = None,
        custom_options: list[str] | None = None,
        timeout: int = 30,
        block_resources: bool = False,
        use_stealth: bool = True,
        storage_state_path: str | None = None,
    ) -> None:
        """
        Initialize browser for scraping.

        Args:
            site_name: Name of the site
            headless: Whether to run in headless mode
            profile_suffix: Optional suffix for profile directory (unused in ephemeral context)
            custom_options: Additional Chrome args to add
            timeout: Default timeout in seconds
            block_resources: Whether to block images/css/etc.
            use_stealth: Whether to apply stealth measures
        """
        self.site_name = site_name
        self.headless = headless
        self.profile_suffix = profile_suffix
        self.timeout = timeout * 1000  # Convert to ms
        self.custom_options = custom_options or []
        # Whether to enable resource blocking (disabled by default)
        self.block_resources = block_resources
        self.use_stealth = use_stealth
        self.storage_state_path = storage_state_path
        self.is_stealth_active = False

        self.playwright: Playwright | None = None
        self.browser: Browser | None = None
        self.context: BrowserContext | None = None
        self.page: Page | None = None
        self._last_response: Response | None = None
        self._last_request_url: str | None = None
        self._last_request_method: str | None = None
        self._last_failed_request: dict[str, str] | None = None
        # Metrics for resource blocking
        self.blocked_count: int = 0
        self.allowed_count: int = 0
        self._requests_total: int = 0

    async def initialize(self) -> None:
        """Async initialization of Playwright resources."""
        start_time = time.time()
        logger.info("[WEB] [%s] Initializing Playwright (Async)...", self.site_name)

        try:
            self.playwright = await async_playwright().start()

            # Construct launch arguments
            args = [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote",
                "--disable-gpu",
                "--window-size=1920,1080",
                "--disable-blink-features=AutomationControlled",
            ]

            # Add custom options
            if self.custom_options:
                args.extend(self.custom_options)

            self.browser = await self.playwright.chromium.launch(
                headless=self.headless,
                args=args,
            )

            # Create context with standard viewport and user agent
            context_options = {
                "viewport": {"width": 1920, "height": 1080},
                "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "device_scale_factor": 1,
            }

            if self.storage_state_path:
                storage_state_file = Path(self.storage_state_path)
                if storage_state_file.is_file():
                    context_options["storage_state"] = str(storage_state_file)
                    logger.info(
                        "[WEB] [%s] Reusing browser state from %s",
                        self.site_name,
                        storage_state_file,
                    )

            try:
                self.context = await self.browser.new_context(
                    **context_options,
                )
            except Exception as e:
                if "storage_state" not in context_options:
                    raise

                logger.warning("[WEB] [%s] Failed to reuse browser state: %s", self.site_name, e)
                context_options.pop("storage_state", None)
                self.context = await self.browser.new_context(
                    **context_options,
                )

            # Create context with standard viewport and user agent
            # State reuse is optional and only applied when a saved storage_state exists.
            # Initialize page
            self.page = await self.context.new_page()
 
            # Configure resource blocking after page creation if requested
            if self.block_resources:
                try:
                    await self.block_unnecessary_resources()
                except Exception as e:
                    logger.warning("[WEB] [%s] Failed to enable resource blocking: %s", self.site_name, e)

            # Apply stealth (best-effort)
            if self.use_stealth:
                try:
                    # Import lazily and call whichever entrypoint exists. Be permissive
                    # because playwright_stealth may expose different callables.
                    import importlib

                    mod = importlib.import_module("playwright_stealth")
                    stealth_async = getattr(mod, "stealth_async", None)
                    stealth_sync = getattr(mod, "stealth", None)
                    stealth_class = getattr(mod, "Stealth", None)

                    applied = False
                    if stealth_class and inspect.isclass(stealth_class):
                        # Version 2.0.2+ uses a Stealth class
                        instance = stealth_class()
                        if hasattr(instance, "apply_stealth_async"):
                            await instance.apply_stealth_async(self.page)
                            applied = True
                        elif hasattr(instance, "apply_stealth_sync"):
                            instance.apply_stealth_sync(self.page)
                            applied = True

                    if not applied:
                        if callable(stealth_async):
                            # Some implementations return coroutines, others are sync.
                            res = stealth_async(self.page)
                            if asyncio.iscoroutine(res):
                                await res
                            applied = True
                        elif callable(stealth_sync) and not inspect.ismodule(stealth_sync):
                            # sync variant expects a page; call it directly
                            stealth_sync(self.page)
                            applied = True
                        elif hasattr(mod, "stealth") and callable(getattr(mod, "stealth")) and not inspect.ismodule(getattr(mod, "stealth")):
                            getattr(mod, "stealth")(self.page)
                            applied = True
                    
                    if applied:
                        self.is_stealth_active = True
                        logger.info("[WEB] [%s] Stealth measures applied", self.site_name)
                    else:
                        logger.warning(
                            "[WEB] [%s] No valid stealth method found in playwright_stealth module",
                            self.site_name,
                        )
                except Exception as e:
                    # If stealth import or call fails, log and continue.
                    logger.warning(
                        "[WEB] [%s] playwright_stealth not available or failed: %s",
                        self.site_name,
                        e,
                    )

            # Set timeouts
            self.page.set_default_timeout(self.timeout)
            self.page.set_default_navigation_timeout(self.timeout)

            init_time = time.time() - start_time
            logger.info(
                "[WEB] [%s] Playwright initialized in %.2fs (stealth=%s)",
                self.site_name,
                init_time,
                self.is_stealth_active,
            )

        except Exception as e:
            init_time = time.time() - start_time
            logger.error(
                "[WEB] [%s] Initialization failed after %.2fs: %s",
                self.site_name,
                init_time,
                e,
            )
            await self.quit()
            raise

    async def reinitialize_with_stealth(self) -> None:
        """Force a restart with stealth measures enabled."""
        logger.info("[WEB] [%s] Re-initializing with full stealth fallback...", self.site_name)
        await self.quit()
        self.use_stealth = True
        # Add some extra "human-like" arguments
        if "--disable-blink-features=AutomationControlled" not in self.custom_options:
            self.custom_options.append("--disable-blink-features=AutomationControlled")
        await self.initialize()

    async def get(self, url: str, wait_until: str | list[str] | None = None) -> None:
        """
        Navigate to URL with intelligent wait strategies.

        Args:
            url: The URL to navigate to
            wait_until: Strategy or list of strategies to try ('networkidle', 'load', 'domcontentloaded', 'commit')
        """
        if not self.page:
            raise RuntimeError("Browser not initialized")

        strategies = []
        if wait_until:
            strategies = [wait_until] if isinstance(wait_until, str) else wait_until
        else:
            # Default sequence: try to wait for network to settle, then load event, 
            # then finally DOM content loaded as a last resort.
            strategies = ["networkidle", "load", "domcontentloaded"]

        last_exception = None
        for strategy in strategies:
            try:
                # Use a slightly shorter timeout for intermediate strategies if multiple exist
                current_timeout = self.timeout if len(strategies) == 1 else self.timeout * 0.7
                self._last_request_url = url
                self._last_request_method = "GET"
                
                self._last_response = await self.page.goto(
                    url, 
                    wait_until=strategy, # type: ignore
                    timeout=current_timeout
                )
                return  # Success
            except Exception as e:
                last_exception = e
                logger.warning(
                    "[WEB] [%s] Navigation with '%s' failed: %s",
                    self.site_name,
                    strategy,
                    e,
                )
                # Continue to next strategy

        # If we get here, all strategies failed
        if last_exception:
            raise last_exception

    async def check_http_status(self) -> int | None:
        """Check the HTTP status code of the last response."""
        if self._last_response:
            return self._last_response.status
        return None

    async def quit(self) -> None:
        """Close the browser and cleanup resources."""
        try:
            if self.context and self.storage_state_path:
                try:
                    storage_state_file = Path(self.storage_state_path)
                    storage_state_file.parent.mkdir(parents=True, exist_ok=True)
                    await self.context.storage_state(path=str(storage_state_file))
                    logger.info(
                        "[WEB] [%s] Saved browser state to %s",
                        self.site_name,
                        storage_state_file,
                    )
                except Exception as e:
                    logger.warning("[WEB] [%s] Failed to save browser state: %s", self.site_name, e)
            if self.context:
                await self.context.close()
            if self.browser:
                await self.browser.close()
            if self.playwright:
                await self.playwright.stop()
            logger.info("[LOCK] [%s] Playwright browser closed", self.site_name)
        except Exception as e:
            logger.warning("[WEB] [%s] Error closing browser: %s", self.site_name, e)
        finally:
            self.page = None
            self.context = None
            self.browser = None
            self.playwright = None

    @property
    def current_url(self) -> str:
        if self.page:
            return self.page.url
        return ""

    async def __aenter__(self):
        """Async context manager entry."""
        await self.initialize()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.quit()

    def __getattr__(self, name: str) -> Any:
        """Delegate methods to the underlying page object."""
        if self.page:
            return getattr(self.page, name)
        raise AttributeError(f"'PlaywrightScraperBrowser' object has no attribute '{name}' and page is not initialized")

    async def block_unnecessary_resources(self) -> None:
        """Block unnecessary resources to improve performance.

        This method is opt-in (self.block_resources must be True). It registers
        route handlers to abort requests for common static assets and analytics
        endpoints while whitelisting essential resources such as API calls and
        main JS bundles.
        """
        if not self.page:
            return

        # Reset metrics
        self.blocked_count = 0
        self.allowed_count = 0
        self._requests_total = 0

        # File extensions to block
        ext_pattern = "**/*.{png,jpg,jpeg,gif,svg,webp,css,woff,woff2,ttf,otf}"

        analytics_tokens = [
            "google-analytics",
            "gtag",
            "analytics",
            "amplitude",
            "segment",
            "hotjar",
            "mixpanel",
            "googlesyndication",
            "doubleclick",
            "facebook",
            "taboola",
            "ads",
            "adservice",
        ]

        async def _abort(route):
            try:
                await route.abort()
            except Exception:
                # ignore abort errors
                pass

        async def _conditional(route):
            req = route.request
            url = (req.url or "").lower()

            # Whitelist API calls and JS bundles (do not block essential JS)
            if "/api/" in url or url.endswith(".js"):
                try:
                    await route.continue_()
                except Exception:
                    pass
                return

            # Block analytics/tracking by token
            for token in analytics_tokens:
                if token in url:
                    await _abort(route)
                    return

            # Default: allow
            try:
                await route.continue_()
            except Exception:
                pass

        # Register routes
        await self.page.route(ext_pattern, _abort)
        # Broad catch-all for analytics/tracking/ads
        await self.page.route("**/*", _conditional)

        # Attach lightweight request listeners for metrics
        def _on_request(request):
            try:
                self._requests_total += 1
                self._last_request_url = request.url
                self._last_request_method = request.method
            except Exception:
                pass

        def _on_request_finished(request):
            try:
                self.allowed_count += 1
            except Exception:
                pass

        def _on_request_failed(request):
            try:
                failure = None
                try:
                    failure = request.failure()
                except Exception:
                    # Some mock objects may not implement failure()
                    failure = None

                failure_text = ""
                if failure:
                    failure_text = getattr(failure, "errorText", None) or (failure.get("errorText") if isinstance(failure, dict) else "") or ""
                self._last_failed_request = {
                    "url": request.url,
                    "method": request.method,
                    "error": failure_text,
                }

                # Many blocked requests surface as aborted network failures
                if failure:
                    # Playwright's failure() often returns a dict-like object
                    err = getattr(failure, "errorText", None) or (failure.get("errorText") if isinstance(failure, dict) else None)
                    if err and "aborted" in err.lower():
                        self.blocked_count += 1
                        return

                # Fallback: treat as blocked if not finished
                self.blocked_count += 1
            except Exception:
                pass

        # Register events
        self.page.on("request", _on_request)
        self.page.on("requestfinished", _on_request_finished)
        self.page.on("requestfailed", _on_request_failed)

    def get_debug_snapshot(self) -> dict[str, Any]:
        page_title = None
        current_url = None
        if self.page is not None:
            current_url = self.page.url
            title_callable = getattr(self.page, "title", None)
            if callable(title_callable) and not inspect.iscoroutinefunction(title_callable):
                try:
                    page_title = title_callable()
                except Exception:
                    page_title = None

        status_code = None
        if self._last_response is not None:
            try:
                status_code = self._last_response.status
            except Exception:
                status_code = None

        return {
            "site_name": self.site_name,
            "current_url": current_url,
            "page_title": page_title,
            "last_request": {
                "url": self._last_request_url,
                "method": self._last_request_method,
                "status": status_code,
            },
            "last_failed_request": self._last_failed_request,
            "request_totals": {
                "total": self._requests_total,
                "allowed": self.allowed_count,
                "blocked": self.blocked_count,
            },
            "storage_state_path": self.storage_state_path,
            "stealth_active": self.is_stealth_active,
        }


async def create_playwright_browser(
    site_name: str,
    headless: bool = True,
    profile_suffix: str | None = None,
    custom_options: list[str] | None = None,
    timeout: int = 30,
    block_resources: bool = False,
    use_stealth: bool = True,
    storage_state_path: str | None = None,
) -> PlaywrightScraperBrowser:
    """Factory for Async Browser."""
    browser = PlaywrightScraperBrowser(
        site_name,
        headless,
        profile_suffix,
        custom_options,
        timeout,
        block_resources=block_resources,
        use_stealth=use_stealth,
        storage_state_path=storage_state_path,
    )
    await browser.initialize()
    return browser
