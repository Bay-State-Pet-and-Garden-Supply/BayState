from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.mark.asyncio
async def test_login_action_uses_resolved_credential_refs_when_options_are_empty() -> None:
    from scrapers.actions.handlers.login import LoginAction

    mock_executor = MagicMock()
    mock_executor.config = MagicMock()
    mock_executor.config.name = "phillips"
    mock_executor.config.login = None
    mock_executor.config.options = {}
    mock_executor.config.credential_refs = ["phillips"]
    mock_executor.credentials = {
        "phillips": {
            "username": "resolved-user@example.com",
            "password": "resolved-password",
            "type": "basic",
        }
    }
    mock_executor.context = {}
    mock_executor.is_session_authenticated.return_value = False
    mock_executor.mark_session_authenticated = MagicMock()
    mock_executor.find_element_safe = AsyncMock(return_value=object())

    async def execute_step_side_effect(step):
        if (
            getattr(step, "action", None) == "wait_for"
            and step.params.get("selector") == "a.doLogout.cc_do_logout"
            and step.params.get("timeout") == 5
        ):
            raise Exception("not already logged in")
        return None

    mock_executor._execute_step = AsyncMock(side_effect=execute_step_side_effect)

    action = LoginAction(mock_executor)

    await action.execute(
        {
            "url": "https://shop.phillipspet.com/ccrz__CCSiteLogin",
            "username_field": "#emailField",
            "password_field": "#passwordField",
            "submit_button": "#send2Dsk",
            "success_indicator": "a.doLogout.cc_do_logout",
            "timeout": 30,
        }
    )

    executed_steps = [call.args[0] for call in mock_executor._execute_step.call_args_list]
    input_steps = [step for step in executed_steps if getattr(step, "action", None) == "input_text"]

    assert any(step.params.get("selector") == "#emailField" and step.params.get("text") == "resolved-user@example.com" for step in input_steps)
    assert any(step.params.get("selector") == "#passwordField" and step.params.get("text") == "resolved-password" for step in input_steps)
    assert mock_executor._execute_step.await_count == len(executed_steps)
    mock_executor.mark_session_authenticated.assert_called_once()
