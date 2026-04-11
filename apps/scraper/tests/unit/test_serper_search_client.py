from __future__ import annotations

import httpx
import pytest

from scrapers.providers.serper import SerperSearchClient


class _StubResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, object]:
        return self._payload


class _StubAsyncClient:
    def __init__(self, responses: list[object]) -> None:
        self._responses = responses

    async def __aenter__(self) -> "_StubAsyncClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def post(self, url: str, *, headers: dict[str, str], json: object) -> _StubResponse:
        del url, headers, json
        response = self._responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


@pytest.mark.asyncio
async def test_serper_search_retries_transient_request_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    request = httpx.Request("POST", "https://google.serper.dev/search")
    attempts = [
        httpx.ConnectError("[Errno -5] No address associated with hostname", request=request),
        httpx.ConnectError("[Errno -5] No address associated with hostname", request=request),
        _StubResponse(
            {
                "organic": [
                    {
                        "link": "https://example.com/product",
                        "title": "Example Product",
                        "snippet": "Official page",
                    }
                ]
            }
        ),
    ]
    sleep_calls: list[float] = []

    monkeypatch.setattr(
        "scrapers.providers.serper.httpx.AsyncClient",
        lambda timeout: _StubAsyncClient(list(attempts)),
    )

    async def fake_sleep(delay: float) -> None:
        sleep_calls.append(delay)

    monkeypatch.setattr("scrapers.providers.serper.asyncio.sleep", fake_sleep)

    client = SerperSearchClient(api_key="serper-test-key")
    results, error = await client.search("Example Product")

    assert error is None
    assert sleep_calls == [0.5, 1.0]
    assert results == [
        {
            "url": "https://example.com/product",
            "title": "Example Product",
            "description": "Official page",
            "provider": "serper",
            "result_type": "organic",
        }
    ]
