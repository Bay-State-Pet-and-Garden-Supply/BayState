from __future__ import annotations

import pytest

from scrapers.ai_search.search import SearchClient, canonicalize_result_url

pytestmark = pytest.mark.asyncio


async def test_search_client_uses_serper_by_default() -> None:
    class SerperStub:
        def __init__(self, response: tuple[list[dict[str, str]], str | None]):
            self.response = response
            self.calls: list[str] = []

        async def search(self, query: str) -> tuple[list[dict[str, str]], str | None]:
            self.calls.append(query)
            return self.response

    serper_stub = SerperStub(([
        {
            "url": "https://acmepets.com/products/12345",
            "title": "Acme Squeaky Ball",
            "description": "Official page",
            "provider": "serper",
            "result_type": "organic",
        }
    ], None))

    client = SearchClient(max_results=5)
    client.serper_client = serper_stub

    results, error = await client.search("Acme Squeaky Ball 12345")

    assert error is None
    assert results[0]["provider"] == "serper"
    assert serper_stub.calls == ["Acme Squeaky Ball 12345"]


async def test_search_client_allows_explicit_gemini_provider() -> None:
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

    client = SearchClient(max_results=5, provider="gemini")
    client.serper_client = gemini_stub

    results, error = await client.search("Acme Squeaky Ball 12345")

    assert error is None
    assert results[0]["provider"] == "gemini"
    assert gemini_stub.calls == ["Acme Squeaky Ball 12345"]


async def test_search_client_uses_cache_on_repeated_queries() -> None:
    class SerperStub:
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
                        "provider": "serper",
                    }
                ],
                None,
            )

    serper_stub = SerperStub()
    client = SearchClient(max_results=5)
    client.serper_client = serper_stub

    first_results, first_error = await client.search("Acme Squeaky Ball 12345")
    second_results, second_error = await client.search("Acme Squeaky Ball 12345")

    assert first_error is None
    assert second_error is None
    assert first_results == second_results
    assert serper_stub.calls == 1


async def test_search_client_batches_unique_queries_when_provider_supports_it() -> None:
    class SerperBatchStub:
        def __init__(self) -> None:
            self.batch_calls: list[list[str]] = []

        async def search(self, query: str):
            return (
                [
                    {
                        "url": f"https://acmepets.com/products/{query}",
                        "title": query,
                        "description": "Official page",
                        "provider": "serper",
                    }
                ],
                None,
            )

        async def search_many(self, queries: list[str]):
            self.batch_calls.append(list(queries))
            return [
                (
                    [
                        {
                            "url": f"https://acmepets.com/products/{query}",
                            "title": query,
                            "description": "Official page",
                            "provider": "serper",
                        }
                    ],
                    None,
                )
                for query in queries
            ]

    serper_stub = SerperBatchStub()
    client = SearchClient(max_results=5)
    client.serper_client = serper_stub

    results = await client.search_many(["SKU-1", "SKU-1", "SKU-2"])

    assert serper_stub.batch_calls == [["SKU-1", "SKU-2"]]
    assert [item[0][0]["title"] for item in results] == ["SKU-1", "SKU-1", "SKU-2"]


async def test_search_client_dedupes_canonicalized_urls() -> None:
    class SerperStub:
        async def search(self, query: str):
            _ = query
            return (
                [
                    {
                        "url": "https://acmepets.com/products/12345?utm_source=google",
                        "title": "Acme Squeaky Ball",
                        "description": "Official page",
                        "provider": "serper",
                    },
                    {
                        "url": "https://acmepets.com/products/12345#details",
                        "title": "Acme Squeaky Ball",
                        "description": "Official page",
                        "provider": "serper",
                    },
                ],
                None,
            )

    client = SearchClient(max_results=5)
    client.serper_client = SerperStub()

    results, error = await client.search("Acme Squeaky Ball 12345")

    assert error is None
    assert results == [
        {
            "url": "https://acmepets.com/products/12345",
            "title": "Acme Squeaky Ball",
            "description": "Official page",
            "provider": "serper",
        }
    ]


async def test_normalize_search_provider_defaults_to_serper() -> None:
    client = SearchClient(provider="auto")
    assert client.provider == "serper"


async def test_search_client_passes_runtime_api_key_to_serper_client(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class SerperClientStub:
        def __init__(self, max_results: int = 15, api_key: str | None = None) -> None:
            captured["max_results"] = max_results
            captured["api_key"] = api_key

        async def search(self, query: str) -> tuple[list[dict[str, str]], str | None]:
            _ = query
            return [], None

    monkeypatch.setattr("scrapers.ai_search.search.SerperSearchClient", SerperClientStub)

    SearchClient(max_results=7, provider="serper", api_key="serper-runtime-key")

    assert captured == {
        "max_results": 7,
        "api_key": "serper-runtime-key",
    }


async def test_canonicalize_result_url_strips_tracking_params() -> None:
    assert canonicalize_result_url("https://example.com/product?id=123&utm_source=google&ref=ads#details") == "https://example.com/product?id=123"


async def test_serper_localization_parameters():
    from scrapers.providers.serper import SerperSearchClient
    client = SerperSearchClient(gl="us", hl="en")
    payload = client._build_payload("query")
    assert payload["gl"] == "us"
    assert payload["hl"] == "en"


async def test_serper_extracts_knowledge_graph():
    from scrapers.providers.serper import SerperSearchClient
    client = SerperSearchClient()
    data = {
        "organic": [{"link": "https://example.com/product", "title": "Example", "snippet": "A product"}],
        "knowledgeGraph": {"title": "Example Brand", "website": "https://example.com"}
    }
    results = client._extract_results(data)
    assert len(results) == 2
    assert results[0]["result_type"] == "knowledge_graph"
    assert results[0]["url"] == "https://example.com"
