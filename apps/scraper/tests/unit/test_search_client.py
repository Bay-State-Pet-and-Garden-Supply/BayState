from __future__ import annotations

from scrapers.ai_search.search import SearchClient


def test_search_client_can_overfetch_provider_results_without_changing_public_limit() -> None:
    client = SearchClient(max_results=15, provider_max_results=30, api_key="serper-test-key")

    assert client.max_results == 15
    assert client.provider_max_results == 30
    assert client.serper_client is not None
    assert client.serper_client.max_results == 30


def test_search_client_reads_serper_overfetch_from_env(monkeypatch) -> None:
    monkeypatch.setenv("AI_SEARCH_SERPER_MAX_RESULTS", "25")

    client = SearchClient(max_results=15, api_key="serper-test-key")

    assert client.provider_max_results == 25
    assert client.serper_client is not None
    assert client.serper_client.max_results == 25


def test_search_client_env_overfetch_never_drops_below_public_limit(monkeypatch) -> None:
    monkeypatch.setenv("AI_SEARCH_SERPER_MAX_RESULTS", "10")

    client = SearchClient(max_results=15, api_key="serper-test-key")

    assert client.provider_max_results == 15
    assert client.serper_client is not None
    assert client.serper_client.max_results == 15
