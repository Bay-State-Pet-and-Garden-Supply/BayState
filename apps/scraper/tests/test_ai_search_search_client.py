from __future__ import annotations

import pytest

from scrapers.ai_search.search import (
    BraveSearchClient,
    SearchClient,
    SerpAPISearchClient,
    canonicalize_result_url,
    normalize_search_provider,
)


pytestmark = pytest.mark.asyncio


async def test_serpapi_search_normalizes_and_dedupes_results(monkeypatch: pytest.MonkeyPatch) -> None:
    client = SerpAPISearchClient(max_results=5)

    async def fake_request_json(_query: str) -> dict[str, object]:
        return {
            "organic_results": [
                {
                    "position": 1,
                    "title": "Acme Squeaky Ball 12345",
                    "link": "https://acmepets.com/products/12345-squeaky-ball?utm_source=google",
                    "snippet": "Official product details for SKU 12345",
                    "snippet_highlighted_words": ["SKU 12345", "official"],
                }
            ],
            "shopping_results": [
                {
                    "position": 1,
                    "title": "Acme Squeaky Ball 12345",
                    "link": "https://acmepets.com/products/12345-squeaky-ball",
                    "source": "Acme Pets",
                    "price": "$12.99",
                },
                {
                    "position": 2,
                    "title": "Acme Squeaky Ball 12345 at Chewy",
                    "link": "https://www.chewy.com/acme-squeaky-ball/dp/12345?ref=ads",
                    "source": "Chewy",
                    "price": "$13.49",
                },
            ],
        }

    monkeypatch.setattr(client, "_request_json", fake_request_json)

    results, error = await client.search("Acme Squeaky Ball 12345")

    assert error is None
    assert len(results) == 2
    assert results[0]["provider"] == "serpapi"
    assert results[0]["result_type"] == "organic"
    assert results[0]["url"] == "https://acmepets.com/products/12345-squeaky-ball"
    assert "SKU 12345" in results[0]["extra_snippets"]
    assert results[1]["result_type"] == "shopping"
    assert results[1]["url"] == "https://www.chewy.com/acme-squeaky-ball/dp/12345"


async def test_search_client_prefers_serpapi_when_available(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SERPAPI_API_KEY", "serpapi-test-key")
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)

    class ProviderStub:
        def __init__(self, response: tuple[list[dict[str, str]], str | None]):
            self.response = response
            self.calls: list[str] = []

        async def search(self, query: str) -> tuple[list[dict[str, str]], str | None]:
            self.calls.append(query)
            return self.response

    serpapi_stub = ProviderStub(([
        {
            "url": "https://acmepets.com/products/12345",
            "title": "Acme Squeaky Ball",
            "description": "Official page",
            "provider": "serpapi",
            "result_type": "organic",
        }
    ], None))
    brave_stub = ProviderStub(([
        {
            "url": "https://fallback.example.com/products/12345",
            "title": "Fallback page",
            "description": "Fallback page",
        }
    ], None))

    client = SearchClient(max_results=5, provider="auto")
    client._providers = {"serpapi": serpapi_stub, "brave": brave_stub}

    results, error = await client.search("Acme Squeaky Ball 12345")

    assert error is None
    assert results[0]["provider"] == "serpapi"
    assert serpapi_stub.calls == ["Acme Squeaky Ball 12345"]
    assert brave_stub.calls == []


async def test_search_client_falls_back_to_brave_when_serpapi_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SERPAPI_API_KEY", "serpapi-test-key")
    monkeypatch.setenv("BRAVE_API_KEY", "brave-test-key")

    class ProviderStub:
        def __init__(self, response: tuple[list[dict[str, str]], str | None]):
            self.response = response
            self.calls: list[str] = []

        async def search(self, query: str) -> tuple[list[dict[str, str]], str | None]:
            self.calls.append(query)
            return self.response

    serpapi_stub = ProviderStub(([], "SERPAPI_API_KEY not set"))
    brave_stub = ProviderStub(([
        {
            "url": "https://acmepets.com/products/12345",
            "title": "Acme Squeaky Ball",
            "description": "Official page",
            "provider": "brave",
            "result_type": "organic",
        }
    ], None))

    client = SearchClient(max_results=5, provider="serpapi")
    client._providers = {"serpapi": serpapi_stub, "brave": brave_stub}

    results, error = await client.search("Acme Squeaky Ball 12345")

    assert error is None
    assert results[0]["provider"] == "brave"
    assert serpapi_stub.calls == ["Acme Squeaky Ball 12345"]
    assert brave_stub.calls == ["Acme Squeaky Ball 12345"]


async def test_brave_search_executes_request_and_normalizes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "brave-key-12345678901234567890")
    captured: dict[str, object] = {}

    class FakeResponse:
        def __init__(self, payload: dict[str, object]):
            self._payload = payload

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return self._payload

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            captured["timeout"] = kwargs.get("timeout")

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url: str, *, headers: dict[str, str], params: dict[str, object]):
            captured["url"] = url
            captured["headers"] = headers
            captured["params"] = params
            return FakeResponse(
                {
                    "web": {
                        "results": [
                            {
                                "url": "https://acmepets.com/products/12345?utm_source=google",
                                "title": "Acme Squeaky Ball",
                                "description": "",
                                "extra_snippets": ["In stock", "In stock"],
                            },
                            {"url": "", "title": "Ignored"},
                        ]
                    }
                }
            )

    monkeypatch.setattr("scrapers.ai_search.search.httpx.AsyncClient", FakeAsyncClient)

    client = BraveSearchClient(max_results=5)
    results, error = await client.search("Acme Squeaky Ball 12345")

    assert error is None
    assert captured["url"] == "https://api.search.brave.com/res/v1/web/search"
    assert captured["headers"] == {
        "Accept": "application/json",
        "X-Subscription-Token": "brave-key-12345678901234567890",
    }
    assert results == [
        {
            "url": "https://acmepets.com/products/12345",
            "title": "Acme Squeaky Ball",
            "description": "In stock",
            "extra_snippets": ["In stock"],
            "provider": "brave",
            "result_type": "organic",
        }
    ]


async def test_serpapi_search_handles_api_error_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SERPAPI_API_KEY", "serpapi-api-key-1234567890")

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, str]:
            return {"error": "quota exceeded"}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            return None

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, _url: str, *, params: dict[str, object]):
            assert params["engine"] == "google"
            assert params["api_key"] == "serpapi-api-key-1234567890"
            return FakeResponse()

    monkeypatch.setattr("scrapers.ai_search.search.httpx.AsyncClient", FakeAsyncClient)

    client = SerpAPISearchClient(max_results=5)
    results, error = await client.search("Acme Squeaky Ball 12345")

    assert results == []
    assert error == "quota exceeded"


async def test_search_client_uses_cache_on_repeated_queries() -> None:
    class ProviderStub:
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
                    }
                ],
                None,
            )

    provider = ProviderStub()
    client = SearchClient(max_results=5, provider="serpapi")
    client._providers = {"serpapi": provider, "brave": provider}

    first_results, first_error = await client.search("Acme Squeaky Ball 12345")
    second_results, second_error = await client.search("Acme Squeaky Ball 12345")

    assert first_error is None
    assert second_error is None
    assert first_results == second_results
    assert provider.calls == 1


async def test_normalize_search_provider_defaults_unknown_values(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level("WARNING"):
        provider = normalize_search_provider("unsupported-engine")

    assert provider == "auto"
    assert "Unsupported search provider" in caplog.text


async def test_canonicalize_result_url_strips_tracking_params() -> None:
    assert canonicalize_result_url("https://example.com/product?id=123&utm_source=google&ref=ads#details") == "https://example.com/product?id=123"
