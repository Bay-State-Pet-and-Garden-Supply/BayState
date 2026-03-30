from __future__ import annotations

import importlib
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock

pytest = importlib.import_module("pytest")

from scrapers.ai_search.models import AISearchResult
from scrapers.ai_search.name_consolidator import NameConsolidator
from scrapers.ai_search.query_builder import QueryBuilder
from scrapers.ai_search.search import SearchClient
from scrapers.ai_search.two_step_refiner import TwoStepSearchRefiner

pytestmark = pytest.mark.asyncio


class ProviderStub:
    def __init__(self, response: tuple[list[dict[str, object]], str | None]):
        self.response: tuple[list[dict[str, object]], str | None] = response
        self.calls: list[str] = []

    async def search(self, query: str) -> tuple[list[dict[str, object]], str | None]:
        self.calls.append(query)
        return self.response


@pytest.fixture
def refiner_config() -> dict[str, float | int]:
    return {
        "confidence_threshold_low": 0.75,
        "confidence_threshold_high": 0.85,
        "min_improvement_delta": 0.1,
        "max_follow_up_queries": 1,
    }


@pytest.fixture
def first_pass_results() -> list[dict[str, str]]:
    return [
        {
            "url": "https://www.acmepets.com/products/12345",
            "title": "ACME SQKY BALL 12345",
            "description": "Official Acme result for SKU 12345",
            "provider": "serpapi",
            "result_type": "organic",
        },
        {
            "url": "https://www.chewy.com/acme-squeaky-ball/dp/12345",
            "title": "Acme Squeaky Ball 12345 at Chewy",
            "description": "Trusted retailer listing for the same SKU",
            "provider": "serpapi",
            "result_type": "shopping",
        },
    ]


@pytest.fixture
def search_client_fixture(
    monkeypatch,
) -> tuple[SearchClient, ProviderStub]:
    monkeypatch.setenv("SERPAPI_API_KEY", "serpapi-test-key")
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)

    provider = ProviderStub(([], None))
    client = SearchClient(max_results=5, provider="serpapi")
    client._providers = {
        "serpapi": cast(Any, provider),
        "brave": cast(Any, provider),
    }
    return client, provider


@pytest.fixture
def query_builder_fixture() -> MagicMock:
    builder = MagicMock(spec=QueryBuilder)
    builder.build_search_query.return_value = "Acme Deluxe Squeaky Ball 12345 product details"
    return builder


@pytest.fixture
def name_consolidator_fixture() -> MagicMock:
    consolidator = MagicMock(spec=NameConsolidator)
    consolidator.consolidate_name = AsyncMock(return_value=("Acme Deluxe Squeaky Ball", 0.03))
    return consolidator


def make_initial_result(
    *,
    confidence: float = 0.6,
    url: str = "https://www.acmepets.com/products/12345",
    source_website: str = "acmepets.com",
) -> AISearchResult:
    return AISearchResult(
        success=True,
        sku="12345",
        product_name="ACME SQKY BALL",
        brand="Acme",
        url=url,
        source_website=source_website,
        confidence=confidence,
    )


def make_second_pass_results(confidence: float) -> list[dict[str, object]]:
    return [
        {
            "url": "https://www.acmepets.com/products/acme-deluxe-squeaky-ball-12345",
            "title": "Acme Deluxe Squeaky Ball 12345",
            "description": "Canonical product page",
            "provider": "serpapi",
            "result_type": "organic",
            "confidence": confidence,
        }
    ]


def build_refiner(
    search_client: SearchClient,
    query_builder: MagicMock,
    name_consolidator: MagicMock,
    config: dict[str, float | int],
) -> TwoStepSearchRefiner:
    return TwoStepSearchRefiner(
        search_client=search_client,
        query_builder=query_builder,
        config=config,
        name_consolidator=name_consolidator,
    )


def get_call_arg(call: Any, index: int, name: str) -> Any:
    if name in call.kwargs:
        return call.kwargs[name]
    return call.args[index]


async def test_second_search_triggers_when_low_confidence(
    search_client_fixture: tuple[SearchClient, ProviderStub],
    query_builder_fixture: MagicMock,
    name_consolidator_fixture: MagicMock,
    refiner_config: dict[str, float | int],
    first_pass_results: list[dict[str, str]],
) -> None:
    search_client, provider = search_client_fixture
    provider.response = (make_second_pass_results(0.82), None)
    refiner = build_refiner(
        search_client,
        query_builder_fixture,
        name_consolidator_fixture,
        refiner_config,
    )

    result = await refiner.refine(make_initial_result(confidence=0.6), first_pass_results, 0.6)

    assert result.two_step_triggered is True
    assert provider.calls == [query_builder_fixture.build_search_query.return_value]
    name_consolidator_fixture.consolidate_name.assert_awaited_once()
    query_builder_fixture.build_search_query.assert_called_once()


async def test_circuit_breaker_skips_when_high_confidence(
    search_client_fixture: tuple[SearchClient, ProviderStub],
    query_builder_fixture: MagicMock,
    name_consolidator_fixture: MagicMock,
    refiner_config: dict[str, float | int],
    first_pass_results: list[dict[str, str]],
) -> None:
    search_client, provider = search_client_fixture
    refiner = build_refiner(
        search_client,
        query_builder_fixture,
        name_consolidator_fixture,
        refiner_config,
    )
    trusted_result = make_initial_result(
        confidence=0.87,
        url="https://www.chewy.com/acme-squeaky-ball/dp/12345",
        source_website="chewy.com",
    )

    result = await refiner.refine(trusted_result, first_pass_results, 0.87)

    assert result.two_step_triggered is False
    assert result.second_pass_results is None
    assert result.second_pass_confidence is None
    assert provider.calls == []
    name_consolidator_fixture.consolidate_name.assert_not_awaited()
    query_builder_fixture.build_search_query.assert_not_called()


async def test_name_extraction_success(
    search_client_fixture: tuple[SearchClient, ProviderStub],
    query_builder_fixture: MagicMock,
    name_consolidator_fixture: MagicMock,
    refiner_config: dict[str, float | int],
    first_pass_results: list[dict[str, str]],
) -> None:
    search_client, provider = search_client_fixture
    provider.response = (make_second_pass_results(0.7), None)
    refiner = build_refiner(
        search_client,
        query_builder_fixture,
        name_consolidator_fixture,
        refiner_config,
    )

    result = await refiner.refine(make_initial_result(confidence=0.62), first_pass_results, 0.62)

    name_call = name_consolidator_fixture.consolidate_name.await_args
    assert get_call_arg(name_call, 0, "sku") == "12345"
    assert get_call_arg(name_call, 1, "abbreviated_name") == "ACME SQKY BALL"
    assert get_call_arg(name_call, 2, "search_snippets") == first_pass_results
    build_call = query_builder_fixture.build_search_query.call_args
    assert get_call_arg(build_call, 0, "sku") == "12345"
    assert get_call_arg(build_call, 1, "product_name") == "Acme Deluxe Squeaky Ball"
    assert result.product_name_extracted == "Acme Deluxe Squeaky Ball"
    assert result.cost_usd == pytest.approx(0.03)


async def test_name_extraction_failure_fallback(
    search_client_fixture: tuple[SearchClient, ProviderStub],
    query_builder_fixture: MagicMock,
    name_consolidator_fixture: MagicMock,
    refiner_config: dict[str, float | int],
    first_pass_results: list[dict[str, str]],
) -> None:
    search_client, provider = search_client_fixture
    name_consolidator_fixture.consolidate_name = AsyncMock(side_effect=RuntimeError("llm unavailable"))
    refiner = build_refiner(
        search_client,
        query_builder_fixture,
        name_consolidator_fixture,
        refiner_config,
    )

    result = await refiner.refine(make_initial_result(confidence=0.61), first_pass_results, 0.61)

    assert result.success is True
    assert result.two_step_triggered is False
    assert result.product_name_extracted is None
    assert result.second_pass_results is None
    assert result.second_pass_confidence is None
    assert result.cost_usd == pytest.approx(0.0)
    assert provider.calls == []
    query_builder_fixture.build_search_query.assert_not_called()


async def test_ab_validation_prefers_second_when_better(
    search_client_fixture: tuple[SearchClient, ProviderStub],
    query_builder_fixture: MagicMock,
    name_consolidator_fixture: MagicMock,
    refiner_config: dict[str, float | int],
    first_pass_results: list[dict[str, str]],
) -> None:
    search_client, provider = search_client_fixture
    provider.response = (make_second_pass_results(0.76), None)
    refiner = build_refiner(
        search_client,
        query_builder_fixture,
        name_consolidator_fixture,
        refiner_config,
    )

    result = await refiner.refine(make_initial_result(confidence=0.63), first_pass_results, 0.63)

    assert result.two_step_triggered is True
    assert result.second_pass_results is not None
    assert result.second_pass_confidence == pytest.approx(0.76)
    assert result.two_step_improved is True


async def test_ab_validation_keeps_first_when_better(
    search_client_fixture: tuple[SearchClient, ProviderStub],
    query_builder_fixture: MagicMock,
    name_consolidator_fixture: MagicMock,
    refiner_config: dict[str, float | int],
    first_pass_results: list[dict[str, str]],
) -> None:
    search_client, provider = search_client_fixture
    provider.response = (make_second_pass_results(0.68), None)
    refiner = build_refiner(
        search_client,
        query_builder_fixture,
        name_consolidator_fixture,
        refiner_config,
    )

    result = await refiner.refine(make_initial_result(confidence=0.63), first_pass_results, 0.63)

    assert result.two_step_triggered is True
    assert result.second_pass_confidence == pytest.approx(0.68)
    assert result.two_step_improved is False


async def test_budget_enforcement_respects_max_queries(
    search_client_fixture: tuple[SearchClient, ProviderStub],
    query_builder_fixture: MagicMock,
    name_consolidator_fixture: MagicMock,
    first_pass_results: list[dict[str, str]],
) -> None:
    search_client, provider = search_client_fixture
    refiner = build_refiner(
        search_client,
        query_builder_fixture,
        name_consolidator_fixture,
        {
            "confidence_threshold_low": 0.75,
            "confidence_threshold_high": 0.85,
            "min_improvement_delta": 0.1,
            "max_follow_up_queries": 0,
        },
    )

    result = await refiner.refine(make_initial_result(confidence=0.58), first_pass_results, 0.58)

    assert result.two_step_triggered is False
    assert result.second_pass_results is None
    assert provider.calls == []
    name_consolidator_fixture.consolidate_name.assert_not_awaited()
    query_builder_fixture.build_search_query.assert_not_called()


async def test_telemetry_records_both_passes(
    search_client_fixture: tuple[SearchClient, ProviderStub],
    query_builder_fixture: MagicMock,
    name_consolidator_fixture: MagicMock,
    refiner_config: dict[str, float | int],
    first_pass_results: list[dict[str, str]],
) -> None:
    search_client, provider = search_client_fixture
    provider.response = (make_second_pass_results(0.81), None)
    name_consolidator_fixture.consolidate_name = AsyncMock(return_value=("Acme Deluxe Squeaky Ball", 0.04))
    refiner = build_refiner(
        search_client,
        query_builder_fixture,
        name_consolidator_fixture,
        refiner_config,
    )

    result = await refiner.refine(make_initial_result(confidence=0.64), first_pass_results, 0.64)

    assert result.first_pass_confidence == pytest.approx(0.64)
    assert result.second_pass_confidence == pytest.approx(0.81)
    assert result.two_step_triggered is True
    assert result.two_step_improved is True
    assert result.product_name_extracted == "Acme Deluxe Squeaky Ball"
    assert result.cost_usd == pytest.approx(0.04)
