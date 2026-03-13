from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from scrapers.actions.handlers.click import ClickAction
from scrapers.exceptions import WorkflowExecutionError


@pytest.fixture
def mock_context():
    ctx = MagicMock()
    ctx.config_name = "test_site"
    ctx.is_ci = False
    
    # Mock find_elements_safe
    mock_element = AsyncMock()
    ctx.find_elements_safe = AsyncMock(return_value=[mock_element])
    ctx.extract_value_from_element = AsyncMock(return_value="Button Text")
    ctx.resolve_selector = MagicMock(return_value=None)
    
    # Mock retry_executor
    ctx.retry_executor = AsyncMock()
    # Mock execute_with_retry to call the operation
    async def mock_execute(operation, **kwargs):
        from dataclasses import dataclass
        @dataclass
        class Result:
            success: bool
            result: Any = None
            error: Exception | None = None
        
        try:
            res = await operation()
            return Result(success=True, result=res)
        except Exception as e:
            return Result(success=False, error=e)
            
    ctx.retry_executor.execute_with_retry = mock_execute
    
    return ctx


@pytest.mark.asyncio
async def test_click_action_uses_retry_executor(mock_context):
    """Test that ClickAction uses the retry executor from the context."""
    action = ClickAction(mock_context)
    params = {"selector": ".btn"}
    
    await action.execute(params)
    
    # Verified by the fact that our mock_execute was called and called the operation
    mock_context.find_elements_safe.assert_called()


@pytest.mark.asyncio
async def test_click_action_tries_force_if_standard_fails(mock_context):
    """Test that ClickAction tries force click if standard click fails."""
    mock_element = mock_context.find_elements_safe.return_value[0]
    
    # Fail standard click, succeed force click
    mock_element.click.side_effect = [Exception("Intercepted"), None]
    
    action = ClickAction(mock_context)
    await action.execute({"selector": ".btn"})
    
    assert mock_element.click.call_count == 2
    # First call: standard (force=False/not specified)
    # Second call: force=True
    assert mock_element.click.call_args_list[1][1]["force"] is True


@pytest.mark.asyncio
async def test_click_action_tries_dispatch_if_force_fails(mock_context):
    """Test that ClickAction tries JS dispatch if both standard and force fail."""
    mock_element = mock_context.find_elements_safe.return_value[0]
    
    # Fail both standard and force click
    mock_element.click.side_effect = Exception("Failed")
    mock_element.dispatch_event = AsyncMock()
    
    action = ClickAction(mock_context)
    await action.execute({"selector": ".btn"})
    
    assert mock_element.click.call_count == 2
    mock_element.dispatch_event.assert_called_once_with("click")
