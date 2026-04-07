from __future__ import annotations

import pytest

from scrapers.ai_search.crawl4ai_extractor import FallbackExtractor, _resolve_grounding_images
from scrapers.ai_search.google_redirects import GroundingRedirectResolver
from scrapers.ai_search.matching import MatchingUtils
from scrapers.ai_search.scoring import SearchScorer

pytestmark = pytest.mark.asyncio


async def test_resolve_grounding_images_drops_unresolved_redirects(monkeypatch: pytest.MonkeyPatch) -> None:
    redirect_url = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/files/SV-771_BeanLima-2024-Front.jpg"
    durable_url = "https://cdn.example.com/images/bean-lima-front.jpg"
    resolver = GroundingRedirectResolver()

    async def fake_resolve_many(urls: list[str], *, label: str) -> dict[str, str]:
        assert urls == [redirect_url, durable_url]
        assert label == "image URL"
        return {redirect_url: ""}

    monkeypatch.setattr(resolver, "resolve_many", fake_resolve_many)

    images = await _resolve_grounding_images(resolver, [redirect_url, durable_url])

    assert images == [durable_url]


async def test_fallback_extractor_resolves_grounding_redirect_image_urls(monkeypatch: pytest.MonkeyPatch) -> None:
    redirect_url = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/files/SV-771_BeanLima-2024-Front.jpg"
    resolved_url = "https://cdn.bentleyseed.com/products/SV-771_BeanLima-2024-Front.jpg"
    extractor = FallbackExtractor(scoring=SearchScorer(), matching=MatchingUtils())

    async def fake_resolve_many(urls: list[str], *, label: str) -> dict[str, str]:
        assert urls == [redirect_url]
        assert label == "image URL"
        return {redirect_url: resolved_url}

    monkeypatch.setattr(extractor._grounding_redirect_resolver, "resolve_many", fake_resolve_many)

    result = await extractor.extract(
        url="https://bentleyseed.com/products/hendersons-lima-bean-seed",
        sku="SV-771",
        product_name=None,
        brand=None,
        html=f"""
        <html>
          <head>
            <title>Henderson's Lima Bean Seed</title>
            <meta property="og:title" content="Henderson's Lima Bean Seed" />
            <meta property="og:description" content="Official product details." />
            <meta property="og:image" content="{redirect_url}" />
          </head>
        </html>
        """,
    )

    assert result["success"] is True
    assert result["images"] == [resolved_url]
