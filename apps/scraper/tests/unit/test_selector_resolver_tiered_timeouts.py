from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.timeout_config import TIER_IMPORTANT, TIER_OPTIONAL, TimeoutConfig
from scrapers.executor.selector_resolver import SelectorResolver


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
async def test_find_element_safe_uses_important_tier_for_required_fields(resolver):
    """Test that find_element_safe uses IMPORTANT tier (10s) for required=True."""
    # We expect the call to use IMPORTANT tier if not provided
    # IMPORTANT is 10000 by default
    await resolver.find_element_safe(".test-selector", required=True)
    
    # Check locator.element_handle call
    mock_locator = resolver.browser.page.locator.return_value
    mock_locator.element_handle.assert_called_once_with(timeout=10000)


@pytest.mark.asyncio
async def test_find_element_safe_uses_optional_tier_for_optional_fields(resolver):
    """Test that find_element_safe uses OPTIONAL tier (5s) for required=False."""
    # We expect the call to use OPTIONAL tier (5000 by default)
    await resolver.find_element_safe(".test-selector", required=False)
    
    # Check locator.element_handle call
    mock_locator = resolver.browser.page.locator.return_value
    mock_locator.element_handle.assert_called_once_with(timeout=5000)


@pytest.mark.asyncio
async def test_find_element_safe_respects_explicit_timeout(resolver):
    """Test that find_element_safe respects an explicitly provided timeout."""
    await resolver.find_element_safe(".test-selector", timeout=2000)
    
    # Check locator.element_handle call
    mock_locator = resolver.browser.page.locator.return_value
    mock_locator.element_handle.assert_called_once_with(timeout=2000)


@pytest.mark.asyncio
async def test_find_elements_safe_uses_optional_tier_by_default(resolver):
    """Test that find_elements_safe uses OPTIONAL tier (5s) by default."""
    await resolver.find_elements_safe(".test-selector")
    
    # Check locator wait and all call
    mock_locator = resolver.browser.page.locator.return_value
    mock_locator.first.wait_for.assert_called_once_with(state="attached", timeout=5000)
    mock_locator.all.assert_called_once_with()


@pytest.mark.asyncio
async def test_find_elements_safe_respects_explicit_timeout(resolver):
    """Test that find_elements_safe respects an explicitly provided timeout."""
    await resolver.find_elements_safe(".test-selector", timeout=8000)
    
    # Check locator wait and all call
    mock_locator = resolver.browser.page.locator.return_value
    mock_locator.first.wait_for.assert_called_once_with(state="attached", timeout=8000)
    mock_locator.all.assert_called_once_with()
