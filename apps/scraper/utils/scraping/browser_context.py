from __future__ import annotations

import asyncio
import importlib
import inspect
import logging
from types import TracebackType
from typing import Any, Protocol


class _ManagedPlaywright(Protocol):
    page: Any
    context: Any
    browser: Any
    playwright: Any

    async def quit(self) -> None: ...


async def _create_playwright_browser(**kwargs: Any) -> _ManagedPlaywright:
    module = importlib.import_module("utils.scraping.playwright_browser")
    factory = getattr(module, "create_playwright_browser")
    return await factory(**kwargs)


logger = logging.getLogger(__name__)


class ManagedBrowser:
    """Async context manager that guarantees Playwright browser cleanup."""

    def __init__(
        self,
        site_name: str,
        headless: bool = True,
        profile_suffix: str | None = None,
        custom_options: list[str] | None = None,
        timeout: int = 30,
        cleanup_timeout: float = 10.0,
        storage_state_path: str | None = None,
    ) -> None:
        if cleanup_timeout <= 0:
            raise ValueError("cleanup_timeout must be greater than zero")

        self.site_name = site_name
        self.headless = headless
        self.profile_suffix = profile_suffix
        self.custom_options = custom_options
        self.timeout = timeout
        self.cleanup_timeout = cleanup_timeout
        self.storage_state_path = storage_state_path
        self.browser: _ManagedPlaywright | None = None

    async def __aenter__(self) -> _ManagedPlaywright:
        logger.info("[%s] Creating managed Playwright browser", self.site_name)
        self.browser = await _create_playwright_browser(
            site_name=self.site_name,
            headless=self.headless,
            profile_suffix=self.profile_suffix,
            custom_options=self.custom_options,
            timeout=self.timeout,
            storage_state_path=self.storage_state_path,
        )
        if self.browser is None:
            raise RuntimeError(f"[{self.site_name}] Managed browser factory returned no browser")
        logger.info("[%s] Managed Playwright browser ready", self.site_name)
        return self.browser

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> bool:
        if not self.browser:
            logger.warning("[%s] ManagedBrowser exited without an initialized browser", self.site_name)
            return False

        had_exception = exc_type is not None
        try:
            await asyncio.wait_for(self.browser.quit(), timeout=self.cleanup_timeout)
            logger.info(
                "[%s] Browser cleanup completed (exception_during_context=%s)",
                self.site_name,
                had_exception,
            )
        except asyncio.TimeoutError:
            logger.error(
                "[%s] Browser cleanup timed out after %.1fs; running force cleanup",
                self.site_name,
                self.cleanup_timeout,
            )
            await self._run_force_cleanup()
        except Exception:
            logger.exception(
                "[%s] Browser cleanup failed; running force cleanup",
                self.site_name,
            )
            await self._run_force_cleanup()
        finally:
            self.browser = None

        return False

    async def _force_cleanup(self) -> None:
        if not self.browser:
            return

        browser_obj = self.browser
        resources: list[tuple[str, Any, str]] = [
            ("page", getattr(browser_obj, "page", None), "close"),
            ("context", getattr(browser_obj, "context", None), "close"),
            ("browser", getattr(browser_obj, "browser", None), "close"),
            ("playwright", getattr(browser_obj, "playwright", None), "stop"),
        ]

        for resource_name, resource, close_method_name in resources:
            if resource is None:
                continue
            close_method = getattr(resource, close_method_name, None)
            if close_method is None:
                continue

            try:
                close_result = close_method()
                if inspect.isawaitable(close_result):
                    await close_result
                logger.info("[%s] Force cleanup succeeded for %s", self.site_name, resource_name)
            except Exception:
                logger.exception("[%s] Force cleanup failed for %s", self.site_name, resource_name)

        browser_obj.page = None
        browser_obj.context = None
        browser_obj.browser = None
        browser_obj.playwright = None

    async def _run_force_cleanup(self) -> None:
        try:
            await self._force_cleanup()
        except Exception:
            logger.exception("[%s] Force cleanup raised an unexpected error", self.site_name)


def managed_playwright_browser(
    site_name: str,
    headless: bool = True,
    profile_suffix: str | None = None,
    custom_options: list[str] | None = None,
    timeout: int = 30,
    cleanup_timeout: float = 10.0,
    storage_state_path: str | None = None,
) -> ManagedBrowser:
    """Factory helper for a managed Playwright browser context."""
    return ManagedBrowser(
        site_name=site_name,
        headless=headless,
        profile_suffix=profile_suffix,
        custom_options=custom_options,
        timeout=timeout,
        cleanup_timeout=cleanup_timeout,
        storage_state_path=storage_state_path,
    )
