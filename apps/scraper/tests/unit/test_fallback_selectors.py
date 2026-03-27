from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.timeout_config import TIER_FALLBACK, TIER_IMPORTANT, TimeoutConfig
from scrapers.executor.selector_resolver import SelectorResolver
from scrapers.models.config import SelectorConfig


@pytest.fixture
def mock_browser():
    """Create a mock browser with a mock page."""
    mock_page = MagicMock()
    # Mock locator for convert_to_playwright_locator
    mock_locator = MagicMock()
    mock_locator.first.wait_for = AsyncMock()
    mock_locator.element_handle = AsyncMock()
    mock_locator.all = AsyncMock()
    mock_page.locator.return_value = mock_locator
    
    browser = MagicMock()
    browser.page = mock_page
    browser.context = None
    browser.context_data = {"timeout_multiplier": 1.0}
    return browser


@pytest.fixture
def resolver(mock_browser):
    """Create a SelectorResolver with the mock browser."""
    return SelectorResolver(mock_browser)


@pytest.mark.asyncio
async def test_find_element_safe_tries_fallback_on_failure(resolver):
    """Test that find_element_safe tries the fallback selector if the primary fails."""
    mock_page = resolver.browser.page
    
    # Setup locators for primary and fallback
    primary_locator = MagicMock()
    primary_locator.element_handle = AsyncMock(side_effect=Exception("Primary failed"))
    primary_locator.first.wait_for = AsyncMock()
    
    fallback_locator = MagicMock()
    mock_element = MagicMock()
    fallback_locator.element_handle = AsyncMock(return_value=mock_element)
    fallback_locator.first.wait_for = AsyncMock()
    
    # Mock convert_to_playwright_locator to return our specific locators
    with patch("scrapers.executor.selector_resolver.convert_to_playwright_locator") as mock_convert:
        mock_convert.side_effect = [primary_locator, fallback_locator]
        
        result = await resolver.find_element_safe([".primary", ".fallback"], required=True)
        
        assert result == mock_element
        assert mock_convert.call_count == 2
        # Check that primary used IMPORTANT tier and fallback used FALLBACK tier
        primary_locator.element_handle.assert_called_once_with(timeout=10000)
        fallback_locator.element_handle.assert_called_once_with(timeout=2000)


@pytest.mark.asyncio
async def test_find_elements_safe_tries_fallback_if_primary_empty(resolver):
    """Test that find_elements_safe tries the fallback if primary returns empty list."""
    mock_page = resolver.browser.page
    
    primary_locator = MagicMock()
    primary_locator.first.wait_for = AsyncMock()
    primary_locator.all = AsyncMock(return_value=[])
    
    fallback_locator = MagicMock()
    fallback_locator.first.wait_for = AsyncMock()
    mock_elements = [MagicMock(), MagicMock()]
    fallback_locator.all = AsyncMock(return_value=mock_elements)
    
    with patch("scrapers.executor.selector_resolver.convert_to_playwright_locator") as mock_convert:
        mock_convert.side_effect = [primary_locator, fallback_locator]
        
        result = await resolver.find_elements_safe([".primary", ".fallback"])
        
        assert result == mock_elements
        assert mock_convert.call_count == 2
        # Check timeouts
        primary_locator.first.wait_for.assert_called_once_with(state="attached", timeout=5000)
        fallback_locator.first.wait_for.assert_called_once_with(state="attached", timeout=2000)
        primary_locator.all.assert_called_once_with()
        fallback_locator.all.assert_called_once_with()


@pytest.mark.asyncio
async def test_find_element_safe_raises_if_all_fail(resolver):
    """Test that find_element_safe raises error if all selectors (including fallbacks) fail."""
    mock_page = resolver.browser.page
    
    locator1 = MagicMock()
    locator1.element_handle = AsyncMock(side_effect=Exception("Fail 1"))
    locator1.first.wait_for = AsyncMock()
    
    locator2 = MagicMock()
    locator2.element_handle = AsyncMock(side_effect=Exception("Fail 2"))
    locator2.first.wait_for = AsyncMock()
    
    with patch("scrapers.executor.selector_resolver.convert_to_playwright_locator") as mock_convert:
        mock_convert.side_effect = [locator1, locator2]
        
        with pytest.raises(Exception, match="Fail 2"):
            await resolver.find_element_safe([".s1", ".s2"], required=True)
