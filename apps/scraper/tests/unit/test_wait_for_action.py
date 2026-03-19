from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_wait_for_uses_first_match_for_duplicate_selectors() -> None:
    from scrapers.actions.handlers.wait_for import WaitForAction

    mock_executor = MagicMock()
    mock_executor.timeout = 30
    mock_executor.is_ci = False
    mock_executor.browser = MagicMock(page=MagicMock())

    first_locator = MagicMock()
    first_locator.is_visible = AsyncMock(return_value=False)
    first_locator.wait_for = AsyncMock(return_value=None)

    locator = MagicMock()
    locator.first = first_locator
    locator.wait_for = AsyncMock(side_effect=AssertionError("wait_for should target locator.first"))

    with patch("scrapers.actions.handlers.wait_for.convert_to_playwright_locator", return_value=locator):
        action = WaitForAction(mock_executor)
        await action.execute({"selector": "a.doLogout.cc_do_logout", "timeout": 30})

    first_locator.wait_for.assert_awaited_once_with(state="visible", timeout=30000)
    locator.wait_for.assert_not_awaited()
