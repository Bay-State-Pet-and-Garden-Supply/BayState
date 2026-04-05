from __future__ import annotations

import pytest

from scrapers.ai_search.search import (
    SearchClient,
    canonicalize_result_url,
    normalize_search_provider,
)

pytestmark = pytest.mark.asyncio


async def test_search_client_uses_gemini_exclusively(monkeypatch: pytest.MonkeyPatch) -> None:
    class GeminiStub:
        def __init__(self, response: tuple[list[dict[str, str]], str | None]):
            self.response = response
            self.calls: list[str] = []

        async def search(self, query: str) -> tuple[list[dict[str, str]], str | None]:
            self.calls.append(query)
            return self.response

    gemini_stub = GeminiStub(([
        {
            "url": "https://acmepets.com/products/12345",
            "title": "Acme Squeaky Ball",
            "description": "Official page",
            "provider": "gemini",
            "result_type": "grounded",
        }
    ], None))

    client = SearchClient(max_results=5)
    client.gemini_client = gemini_stub

    results, error = await client.search("Acme Squeaky Ball 12345")

    assert error is None
    assert results[0]["provider"] == "gemini"
    assert gemini_stub.calls == ["Acme Squeaky Ball 12345"]


async def test_search_client_uses_cache_on_repeated_queries() -> None:
    class GeminiStub:
        def __init__(self):
            self.calls = 0

        async def search(self, query: str):
            self.calls += 1
            return (
                [
                    {
                        "url": "https://acmepets.com/products/12345",
                        "title": query,
                        "description": "Official page",
                        "provider": "gemini",
                    }
                ],
                None,
            )

    gemini_stub = GeminiStub()
    client = SearchClient(max_results=5)
    client.gemini_client = gemini_stub

    first_results, first_error = await client.search("Acme Squeaky Ball 12345")
    second_results, second_error = await client.search("Acme Squeaky Ball 12345")

    assert first_error is None
    assert second_error is None
    assert first_results == second_results
    assert gemini_stub.calls == 1


async def test_normalize_search_provider_defaults_to_gemini(caplog: pytest.LogCaptureFixture) -> None:
    # After refactor, SearchClient forces gemini regardless of input
    client = SearchClient(provider="auto")
    assert client.provider == "gemini"


async def test_canonicalize_result_url_strips_tracking_params() -> None:
    assert canonicalize_result_url("https://example.com/product?id=123&utm_source=google&ref=ads#details") == "https://example.com/product?id=123"
