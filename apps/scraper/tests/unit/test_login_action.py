from __future__ import annotations

import logging
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


@pytest.mark.asyncio
async def test_login_action_fails_fast_when_credentials_are_missing(caplog) -> None:
    from scrapers.actions.handlers.login import LoginAction
    from scrapers.exceptions import AuthenticationError

    mock_executor = MagicMock()
    mock_executor.config = MagicMock()
    mock_executor.config.name = "phillips"
    mock_executor.config.login = None
    mock_executor.config.options = {}
    mock_executor.config.credential_refs = ["phillips"]
    mock_executor.credentials = {}
    mock_executor.context = {"sku": "SKU-1"}
    mock_executor.results = {"sku": "SKU-1"}
    mock_executor.browser = MagicMock()
    mock_executor.browser.page = None
    mock_executor.collect_runtime_debug_context = AsyncMock(return_value={"page_url": "https://shop.phillipspet.com/login"})
    mock_executor.is_session_authenticated.return_value = False
    mock_executor.mark_session_authenticated = MagicMock()
    mock_executor.find_element_safe = AsyncMock(return_value=None)
    mock_executor._execute_step = AsyncMock()

    action = LoginAction(mock_executor)

    with caplog.at_level(logging.ERROR):
        with pytest.raises(AuthenticationError, match="Missing login credentials"):
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

    mock_executor._execute_step.assert_not_awaited()
    mock_executor.mark_session_authenticated.assert_not_called()
    assert "Login failed for phillips" in caplog.text
    assert "Missing login credentials" in caplog.text


@pytest.mark.asyncio
async def test_login_action_reports_failure_indicator_when_success_wait_fails(caplog) -> None:
    from scrapers.actions.handlers.login import LoginAction
    from scrapers.exceptions import AuthenticationError

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
            "_credential_source": "env",
            "_credential_ref": "phillips",
        }
    }
    mock_executor.context = {"sku": "SKU-1"}
    mock_executor.results = {"sku": "SKU-1"}
    mock_executor.is_session_authenticated.return_value = False
    mock_executor.mark_session_authenticated = MagicMock()
    mock_executor.event_emitter = None
    mock_executor.browser = MagicMock()
    mock_executor.browser.page = MagicMock()
    mock_executor.browser.page.content = AsyncMock(return_value="Invalid username or password")
    type(mock_executor.browser.page).url = "https://shop.phillipspet.com/ccrz__CCSiteLogin?error=1"
    mock_executor.collect_runtime_debug_context = AsyncMock(
        return_value={
            "page_url": "https://shop.phillipspet.com/ccrz__CCSiteLogin?error=1",
            "browser": {"current_url": "https://shop.phillipspet.com/ccrz__CCSiteLogin?error=1"},
        }
    )

    async def find_element_side_effect(selector: str, required: bool = False, timeout: int | None = None):
        _ = required, timeout
        if selector == ".login-error":
            return object()
        return None

    mock_executor.find_element_safe = AsyncMock(side_effect=find_element_side_effect)

    async def execute_step_side_effect(step):
        if getattr(step, "action", None) != "wait_for":
            return None
        selector = step.params.get("selector")
        timeout = step.params.get("timeout")
        if selector == "a.doLogout.cc_do_logout" and timeout == 5:
            raise Exception("not already logged in")
        if selector == "a.doLogout.cc_do_logout" and timeout == 30:
            raise Exception("success indicator missing")
        return None

    mock_executor._execute_step = AsyncMock(side_effect=execute_step_side_effect)

    action = LoginAction(mock_executor)

    with caplog.at_level(logging.ERROR):
        with pytest.raises(AuthenticationError, match="failure indicator matched"):
            await action.execute(
                {
                    "url": "https://shop.phillipspet.com/ccrz__CCSiteLogin",
                    "username_field": "#emailField",
                    "password_field": "#passwordField",
                    "submit_button": "#send2Dsk",
                    "success_indicator": "a.doLogout.cc_do_logout",
                    "timeout": 30,
                    "failure_indicators": {"selectors": [".login-error"], "texts": ["invalid username or password"]},
                }
            )

    assert "failure indicator matched (selector: .login-error)" in caplog.text
    mock_executor.mark_session_authenticated.assert_not_called()
