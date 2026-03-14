from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from core.scraper_testing_client import ScraperTestingClient
from scrapers.actions.handlers.login import LoginAction
from scrapers.exceptions import WorkflowExecutionError


def _build_login_config() -> SimpleNamespace:
    return SimpleNamespace(
        model_dump=lambda: {
            "url": "https://example.test/login",
            "username_field": "#username",
            "password_field": "#password",
            "submit_button": "#submit",
            "success_indicator": ".account-home",
            "timeout": 12,
        }
    )


def _build_executor() -> MagicMock:
    executor = MagicMock()
    executor.config = SimpleNamespace(
        name="orgill",
        login=_build_login_config(),
        options=None,
        credential_refs=["orgill"],
    )
    executor.context = {}
    executor.credentials = {"orgill": {"username": "user@example.com", "password": "secret"}}
    executor.event_emitter = None
    executor.mark_session_authenticated = MagicMock()
    executor.is_session_authenticated = MagicMock(return_value=False)
    return executor


@pytest.mark.asyncio
async def test_login_action_uses_resolved_credentials_and_awaits_steps() -> None:
    executor = _build_executor()
    success_indicator = ".account-home"

    async def execute_step(step):
        if step.action == "wait_for" and step.params == {"selector": success_indicator, "timeout": 5}:
            raise RuntimeError("not already logged in")
        return None

    executor._execute_step = AsyncMock(side_effect=execute_step)
    action = LoginAction(executor)

    await action.execute({})

    observed = [
        (call.args[0].action, call.args[0].params)
        for call in executor._execute_step.await_args_list
    ]
    assert observed == [
        ("navigate", {"url": "https://example.test/login"}),
        ("wait_for", {"selector": success_indicator, "timeout": 5}),
        ("wait_for", {"selector": "#username", "timeout": 15}),
        ("input_text", {"selector": "#username", "text": "user@example.com"}),
        ("input_text", {"selector": "#password", "text": "secret"}),
        ("click", {"selector": "#submit"}),
        ("wait_for", {"selector": success_indicator, "timeout": 12}),
    ]
    executor.mark_session_authenticated.assert_called_once_with()


@pytest.mark.asyncio
async def test_login_action_raises_when_credentials_are_missing() -> None:
    executor = _build_executor()
    executor.credentials = {}
    executor.config.credential_refs = []
    executor._execute_step = AsyncMock()
    action = LoginAction(executor)

    with pytest.raises(WorkflowExecutionError, match="Missing credentials"):
        await action.execute({})


@pytest.mark.asyncio
async def test_validate_login_selectors_uses_optional_lookup_and_emits_status() -> None:
    executor = _build_executor()
    executor.find_element_safe = AsyncMock(side_effect=[object(), None, object()])
    executor.event_emitter = MagicMock()
    action = LoginAction(executor)

    await action._validate_login_selectors(
        {
            "username_field": "#username",
            "password_field": "#password",
            "submit_button": "#submit",
        }
    )

    assert executor.find_element_safe.await_args_list[0].args == ("#username",)
    assert executor.find_element_safe.await_args_list[0].kwargs == {"required": False}
    assert executor.find_element_safe.await_args_list[1].args == ("#password",)
    assert executor.find_element_safe.await_args_list[1].kwargs == {"required": False}
    assert executor.find_element_safe.await_args_list[2].args == ("#submit",)
    assert executor.find_element_safe.await_args_list[2].kwargs == {"required": False}
    emitted_statuses = [
        call.kwargs["status"]
        for call in executor.event_emitter.login_selector_status.call_args_list
    ]
    assert emitted_statuses == ["FOUND", "MISSING", "FOUND"]


def test_scraper_testing_client_passes_api_client_to_workflow_executor(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeParser:
        def load_from_dict(self, config_dict):
            captured["loaded_config"] = config_dict
            return SimpleNamespace(name="orgill")

    class FakeApiClient:
        def __init__(self):
            self.api_url = "http://localhost:3000"
            self.api_key = "bsr_test"

        def get_published_config(self, slug: str):
            captured["slug"] = slug
            return {"name": "orgill", "base_url": "https://www.orgill.com", "workflows": []}

    class FakeExecutor:
        def __init__(self, config, *, headless, api_client):
            captured["executor_config"] = config
            captured["headless"] = headless
            captured["api_client"] = api_client
            self.browser = None

        async def initialize(self):
            return None

        async def execute_workflow(self, context, quit_browser):
            captured["context"] = context
            captured["quit_browser"] = quit_browser
            return {"success": True, "results": {"SKU": context["sku"]}}

    monkeypatch.setattr("scrapers.parser.yaml_parser.ScraperConfigParser", FakeParser)
    monkeypatch.setattr("core.scraper_testing_client.ScraperAPIClient", FakeApiClient)
    monkeypatch.setattr("scrapers.executor.workflow_executor.WorkflowExecutor", FakeExecutor)

    client = ScraperTestingClient(headless=False)
    result = client._run_local_scraper_sync("orgill", ["12345"])

    assert captured["slug"] == "orgill"
    assert captured["headless"] is False
    assert isinstance(captured["api_client"], FakeApiClient)
    assert captured["context"] == {"sku": "12345"}
    assert captured["quit_browser"] is False
    assert result["success"] is True
    assert result["products"] == [{"SKU": "12345"}]


def test_scraper_testing_client_awaits_async_browser_quit(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeParser:
        def load_from_dict(self, config_dict):
            return SimpleNamespace(name="petfoodex")

    class FakeApiClient:
        def __init__(self):
            self.api_url = "http://localhost:3000"
            self.api_key = "bsr_test"

        def get_published_config(self, slug: str):
            return {"name": "petfoodex", "base_url": "https://orders.petfoodexperts.com", "workflows": []}

    class FakeBrowser:
        async def quit(self):
            captured["quit_called"] = True

    class FakeExecutor:
        def __init__(self, config, *, headless, api_client):
            self.browser = FakeBrowser()

        async def initialize(self):
            return None

        async def execute_workflow(self, context, quit_browser):
            return {"success": True, "results": {"SKU": context["sku"]}}

    monkeypatch.setattr("scrapers.parser.yaml_parser.ScraperConfigParser", FakeParser)
    monkeypatch.setattr("core.scraper_testing_client.ScraperAPIClient", FakeApiClient)
    monkeypatch.setattr("scrapers.executor.workflow_executor.WorkflowExecutor", FakeExecutor)

    client = ScraperTestingClient()
    result = client._run_local_scraper_sync("petfoodex", ["555"])

    assert captured["quit_called"] is True
    assert result["success"] is True
