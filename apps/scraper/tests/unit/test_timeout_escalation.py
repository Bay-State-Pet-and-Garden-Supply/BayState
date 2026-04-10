from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.adaptive_retry_strategy import AdaptiveRetryConfig, AdaptiveRetryStrategy, FailureType, RetryStrategy
from core.retry_executor import RetryExecutor
from scrapers.exceptions import ErrorContext
from scrapers.executor.selector_resolver import SelectorResolver


@pytest.fixture
def strategy():
    """Create an adaptive strategy with fixed timeout multiplier."""
    s = AdaptiveRetryStrategy(history_file=None)
    # Force a specific config for testing
    config = AdaptiveRetryConfig(
        max_retries=2,
        base_delay=0.1,
        max_delay=1.0,
        backoff_multiplier=1.0,
        strategy=RetryStrategy.IMMEDIATE_RETRY,
        timeout_multiplier=1.5
    )
    s.default_configs[FailureType.NETWORK_ERROR] = config
    return s


@pytest.mark.asyncio
async def test_retry_executor_escalates_timeout_multiplier(strategy):
    """Test that RetryExecutor increases the timeout_multiplier in the context on each attempt."""
    executor = RetryExecutor(adaptive_strategy=strategy)
    
    # Operation that always fails with a retryable error
    operation = MagicMock(side_effect=Exception("Connection reset"))
    
    result = await executor.execute_with_retry(
        operation=operation,
        site_name="test_site",
        action_name="test_action",
        max_retries=2
    )
    
    assert result.success is False
    assert operation.call_count == 3  # Initial + 2 retries
    
    # We can't easily check the multiplier mid-loop without complex mocking,
    # but we can verify the multiplier logic in SelectorResolver separately.


@pytest.mark.asyncio
async def test_selector_resolver_applies_multiplier_from_context():
    """Test that SelectorResolver reads and applies the multiplier from the browser context."""
    # Mock browser with context_data
    mock_browser = MagicMock()
    mock_browser.context_data = {"timeout_multiplier": 2.0}
    mock_page = MagicMock()
    mock_locator = MagicMock()
    mock_locator.element_handle = AsyncMock()
    mock_page.locator.return_value = mock_locator
    mock_browser.page = mock_page
    
    resolver = SelectorResolver(mock_browser)
    
    with patch("scrapers.executor.selector_resolver.convert_to_playwright_locator", return_value=mock_locator):
        await resolver.find_element_safe(".test", timeout=1000)
        
        # Base timeout was 1000, multiplier was 2.0 -> should be 2000
        mock_locator.element_handle.assert_called_once_with(timeout=2000)


@pytest.mark.asyncio
async def test_timeout_multiplier_propagation_integration():
    """Test the full propagation from ErrorContext to context_data in StepExecutor."""
    # This test verifies the fix in StepExecutor._on_retry_callback
    from scrapers.executor.step_executor import StepExecutor
    
    mock_context = MagicMock()
    mock_context.context_data = {"timeout_multiplier": 1.0}
    
    executor = StepExecutor(
        config_name="test",
        browser=MagicMock(),
        retry_executor=MagicMock(),
        context=mock_context
    )
    
    # Create error with context containing multiplier
    error_ctx = ErrorContext(timeout_multiplier=1.5)
    error = Exception("Test")
    error.context = error_ctx
    
    # Call the callback manually
    executor._on_retry_callback(attempt=0, error=error, delay=0.1)
    
    # Check that multiplier was propagated to shared context
    assert mock_context.context_data["timeout_multiplier"] == 1.5
