from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from utils.scraping.browser_context import ManagedBrowser


def test_cleanup_timeout_must_be_positive() -> None:
    with pytest.raises(ValueError, match="greater than zero"):
        ManagedBrowser("coastal", cleanup_timeout=0)


@pytest.mark.asyncio
async def test_managed_browser_returns_playwright_browser() -> None:
    browser = AsyncMock()

    with patch("utils.scraping.browser_context._create_playwright_browser", AsyncMock(return_value=browser)) as create_browser:
        async with ManagedBrowser("coastal") as managed:
            assert managed is browser

    create_browser.assert_awaited_once_with(
        site_name="coastal",
        headless=True,
        profile_suffix=None,
        custom_options=None,
        timeout=30,
    )
    browser.quit.assert_awaited_once()


@pytest.mark.asyncio
async def test_cleanup_on_exception() -> None:
    browser = AsyncMock()

    with patch("utils.scraping.browser_context._create_playwright_browser", AsyncMock(return_value=browser)):
        with pytest.raises(RuntimeError, match="boom"):
            async with ManagedBrowser("coastal"):
                raise RuntimeError("boom")

    browser.quit.assert_awaited_once()


@pytest.mark.asyncio
async def test_timeout_triggers_force_cleanup() -> None:
    browser = AsyncMock()

    async def slow_quit() -> None:
        await asyncio.sleep(0.2)

    browser.quit.side_effect = slow_quit
    manager = ManagedBrowser("coastal", cleanup_timeout=0.01)

    with patch("utils.scraping.browser_context._create_playwright_browser", AsyncMock(return_value=browser)):
        with patch.object(manager, "_force_cleanup", AsyncMock()) as force_cleanup:
            async with manager:
                pass

    force_cleanup.assert_awaited_once()


@pytest.mark.asyncio
async def test_force_cleanup_errors_are_swallowed_in_exit() -> None:
    browser = AsyncMock()
    browser.quit.side_effect = RuntimeError("close failed")
    manager = ManagedBrowser("coastal")

    with patch("utils.scraping.browser_context._create_playwright_browser", AsyncMock(return_value=browser)):
        with patch.object(manager, "_force_cleanup", AsyncMock(side_effect=RuntimeError("forced cleanup failure"))):
            async with manager:
                pass


@pytest.mark.asyncio
async def test_cleanup_failure_triggers_force_cleanup() -> None:
    browser = AsyncMock()
    browser.quit.side_effect = RuntimeError("close failed")
    manager = ManagedBrowser("coastal", cleanup_timeout=0.5)

    with patch("utils.scraping.browser_context._create_playwright_browser", AsyncMock(return_value=browser)):
        with patch.object(manager, "_force_cleanup", AsyncMock()) as force_cleanup:
            async with manager:
                pass

    force_cleanup.assert_awaited_once()


@pytest.mark.asyncio
async def test_force_cleanup_closes_all_resources_even_with_errors() -> None:
    browser_obj = MagicMock()
    browser_obj.page = AsyncMock()
    browser_obj.context = AsyncMock()
    browser_obj.browser = AsyncMock()
    browser_obj.playwright = AsyncMock()
    browser_obj.context.close.side_effect = RuntimeError("context close failed")

    manager = ManagedBrowser("coastal")
    manager.browser = browser_obj

    page = browser_obj.page
    context = browser_obj.context
    playwright_browser = browser_obj.browser
    playwright = browser_obj.playwright

    await manager._force_cleanup()

    page.close.assert_awaited_once()
    context.close.assert_awaited_once()
    playwright_browser.close.assert_awaited_once()
    playwright.stop.assert_awaited_once()
    assert manager.browser is browser_obj
    assert browser_obj.page is None
    assert browser_obj.context is None
    assert browser_obj.browser is None
    assert browser_obj.playwright is None
