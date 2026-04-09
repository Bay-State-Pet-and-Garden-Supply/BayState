from __future__ import annotations

from types import SimpleNamespace

import pytest

from scrapers.ai_search.search import GeminiSearchClient

pytestmark = pytest.mark.asyncio


def _build_grounded_response(*, url: str, title: str) -> SimpleNamespace:
    chunk = SimpleNamespace(web=SimpleNamespace(uri=url, title=title))
    metadata = SimpleNamespace(
        grounding_chunks=[chunk],
        web_search_queries=["4057"],
        grounding_supports=[],
    )
    candidate = SimpleNamespace(grounding_metadata=metadata)
    return SimpleNamespace(candidates=[candidate], text="Grounded product summary")


class _ClientStub:
    def __init__(self, response: SimpleNamespace) -> None:
        async def generate_content(**kwargs: object) -> SimpleNamespace:
            del kwargs
            return response

        self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))


async def test_gemini_search_resolves_google_grounding_redirects(monkeypatch: pytest.MonkeyPatch) -> None:
    redirect_url = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/example"
    resolved_url = "https://lakevalleyseed.com/product/item-4057-eggplant-black-beauty/"

    client = GeminiSearchClient()
    client._client = _ClientStub(_build_grounded_response(url=redirect_url, title="lakevalleyseed.com"))

    async def fake_resolve(urls: list[str]) -> dict[str, str]:
        assert urls == [redirect_url]
        return {redirect_url: resolved_url}

    monkeypatch.setattr(client, "_resolve_grounding_redirects", fake_resolve)

    results, error = await client.search("4057")

    assert error is None
    assert results == [
        {
            "url": resolved_url,
            "title": "lakevalleyseed.com",
            "description": "lakevalleyseed.com",
            "extra_snippets": ["4057"],
            "provider": "gemini",
            "result_type": "grounded",
        }
    ]


async def test_gemini_search_errors_when_grounding_redirects_cannot_be_resolved(monkeypatch: pytest.MonkeyPatch) -> None:
    redirect_url = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/example"

    client = GeminiSearchClient()
    client._client = _ClientStub(_build_grounded_response(url=redirect_url, title="lakevalleyseed.com"))

    async def fake_resolve(urls: list[str]) -> dict[str, str]:
        assert urls == [redirect_url]
        return {redirect_url: ""}

    monkeypatch.setattr(client, "_resolve_grounding_redirects", fake_resolve)

    results, error = await client.search("4057")

    assert results == []
    assert error == "Failed to resolve Google grounding result URLs"
