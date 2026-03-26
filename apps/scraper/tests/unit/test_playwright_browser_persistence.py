from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from utils.scraping.playwright_browser import PlaywrightScraperBrowser


@pytest.mark.asyncio
async def test_initialize_loads_existing_storage_state(tmp_path) -> None:
    storage_state_path = tmp_path / "state.json"
    storage_state_path.write_text('{"cookies": [], "origins": []}', encoding="utf-8")

    mock_page = MagicMock()
    mock_page.set_default_timeout = MagicMock()
    mock_page.set_default_navigation_timeout = MagicMock()

    mock_context = AsyncMock()
    mock_context.new_page = AsyncMock(return_value=mock_page)

    mock_browser = AsyncMock()
    mock_browser.new_context = AsyncMock(return_value=mock_context)

    mock_playwright = MagicMock()
    mock_playwright.chromium.launch = AsyncMock(return_value=mock_browser)

    playwright_manager = MagicMock()
    playwright_manager.start = AsyncMock(return_value=mock_playwright)

    with patch("utils.scraping.playwright_browser.async_playwright", return_value=playwright_manager):
        browser = PlaywrightScraperBrowser(
            site_name="portal",
            storage_state_path=str(storage_state_path),
            use_stealth=False,
        )
        await browser.initialize()

    context_kwargs = mock_browser.new_context.await_args.kwargs
    assert context_kwargs["storage_state"] == str(storage_state_path)
    assert browser.context is mock_context
    assert browser.page is mock_page


@pytest.mark.asyncio
async def test_quit_saves_storage_state_before_closing(tmp_path) -> None:
    storage_state_path = tmp_path / "nested" / "state.json"

    browser = PlaywrightScraperBrowser(
        site_name="portal",
        storage_state_path=str(storage_state_path),
        use_stealth=False,
    )

    mock_context = AsyncMock()
    mock_browser = AsyncMock()
    mock_playwright = AsyncMock()

    browser.context = mock_context
    browser.browser = mock_browser
    browser.playwright = mock_playwright

    await browser.quit()

    mock_context.storage_state.assert_awaited_once_with(path=str(storage_state_path))
    mock_context.close.assert_awaited_once()
    mock_browser.close.assert_awaited_once()
    mock_playwright.stop.assert_awaited_once()


@pytest.mark.asyncio
async def test_initialize_skips_missing_storage_state_file() -> None:
    mock_page = MagicMock()
    mock_page.set_default_timeout = MagicMock()
    mock_page.set_default_navigation_timeout = MagicMock()

    mock_context = AsyncMock()
    mock_context.new_page = AsyncMock(return_value=mock_page)

    mock_browser = AsyncMock()
    mock_browser.new_context = AsyncMock(return_value=mock_context)

    mock_playwright = MagicMock()
    mock_playwright.chromium.launch = AsyncMock(return_value=mock_browser)

    playwright_manager = MagicMock()
    playwright_manager.start = AsyncMock(return_value=mock_playwright)

    with patch("utils.scraping.playwright_browser.async_playwright", return_value=playwright_manager):
        browser = PlaywrightScraperBrowser(
            site_name="portal",
            storage_state_path="C:\\missing\\state.json",
            use_stealth=False,
        )
        await browser.initialize()

    context_kwargs = mock_browser.new_context.await_args.kwargs
    assert "storage_state" not in context_kwargs
