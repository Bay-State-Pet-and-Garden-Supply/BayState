from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from utils.scraping.playwright_browser import PlaywrightScraperBrowser


@pytest.fixture
def browser():
    """Create a PlaywrightScraperBrowser instance for testing."""
    return PlaywrightScraperBrowser(site_name="test_site")


@pytest.mark.asyncio
async def test_get_tries_multiple_strategies(browser):
    """Test that get tries multiple wait strategies if earlier ones fail."""
    mock_page = MagicMock()
    # Mock goto to fail for networkidle but succeed for load
    mock_page.goto = AsyncMock(side_effect=[Exception("Network idle timeout"), MagicMock()])
    browser.page = mock_page
    
    # Force a shorter timeout for test speed
    browser.timeout = 1000 
    
    await browser.get("http://test.com", wait_until=["networkidle", "load"])
    
    assert mock_page.goto.call_count == 2
    # Check calls
    calls = mock_page.goto.call_args_list
    assert calls[0][1]["wait_until"] == "networkidle"
    assert calls[1][1]["wait_until"] == "load"


@pytest.mark.asyncio
async def test_get_raises_if_all_strategies_fail(browser):
    """Test that get raises an exception if all navigation strategies fail."""
    mock_page = MagicMock()
    mock_page.goto = AsyncMock(side_effect=[Exception("Fail 1"), Exception("Fail 2")])
    browser.page = mock_page
    browser.timeout = 1000
    
    with pytest.raises(Exception, match="Fail 2"):
        await browser.get("http://test.com", wait_until=["networkidle", "load"])
        
    assert mock_page.goto.call_count == 2


@pytest.mark.asyncio
async def test_get_uses_default_strategies(browser):
    """Test that get uses default strategies if none provided."""
    mock_page = MagicMock()
    mock_page.goto = AsyncMock(return_value=MagicMock())
    browser.page = mock_page
    
    await browser.get("http://test.com")
    
    # Default is networkidle (then load if it fails, but here it succeeds)
    assert mock_page.goto.call_count == 1
    assert mock_page.goto.call_args[1]["wait_until"] == "networkidle"
