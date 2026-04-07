from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from scrapers.ai_search.scraper import AISearchScraper
from scrapers.ai_search.search import SearchClient


pytestmark = pytest.mark.asyncio


async def test_collect_search_candidates_skips_variants_when_primary_pool_is_already_strong() -> None:
    scraper = AISearchScraper()
    scraper._query_builder.build_identifier_query = MagicMock(return_value="12345")
    scraper._query_builder.build_search_query = MagicMock(return_value="fallback-query")
    scraper._query_builder.build_query_variants = MagicMock(return_value=["variant-one", "variant-two"])

    primary_results = [
        {
            "url": "https://acmepets.com/products/12345-squeaky-ball",
            "title": "Acme Squeaky Ball 12345",
            "description": "Official product details with price and add to cart",
        },
        {
            "url": "https://www.chewy.com/acme-squeaky-ball/dp/12345",
            "title": "Acme Squeaky Ball 12345 at Chewy",
            "description": "Trusted retailer page with in stock details",
        },
    ]

    async def search_side_effect(query: str) -> tuple[list[dict[str, str]], None, float]:
        if query != "12345":
            pytest.fail(f"unexpected variant search executed: {query}")
        return primary_results, None, 0.0

    scraper._search_client.search_with_cost = AsyncMock(side_effect=search_side_effect)

    search_results, working_name, search_error = await scraper._collect_search_candidates(
        sku="12345",
        product_name="Squeaky Ball",
        brand="Acme",
        category="Dog Toys",
    )

    assert search_error is None
    assert working_name == "Squeaky Ball"
    assert [result["url"] for result in search_results[:2]] == [
        "https://acmepets.com/products/12345-squeaky-ball",
        "https://www.chewy.com/acme-squeaky-ball/dp/12345",
    ]
    assert scraper._search_client.search_with_cost.await_count == 1
    scraper._query_builder.build_search_query.assert_not_called()


async def test_collect_search_candidates_stops_after_first_strong_variant() -> None:
    scraper = AISearchScraper()
    scraper._query_builder.build_identifier_query = MagicMock(return_value="12345")
    scraper._query_builder.build_search_query = MagicMock(return_value="fallback-query")
    scraper._query_builder.build_query_variants = MagicMock(
        return_value=["UPC 12345", "variant-two", "variant-three"]
    )

    primary_results = [
        {
            "url": "https://example.com/blog/best-dog-toys-2026",
            "title": "Best dog toys 2026 review",
            "description": "Top 10 list and buying guide",
        }
    ]
    strong_variant_results = [
        {
            "url": "https://acmepets.com/products/12345-squeaky-ball",
            "title": "Acme Squeaky Ball 12345",
            "description": "Official product details with price and add to cart",
        },
        {
            "url": "https://www.chewy.com/acme-squeaky-ball/dp/12345",
            "title": "Acme Squeaky Ball 12345 at Chewy",
            "description": "Trusted retailer page with in stock details",
        },
    ]
    seen_queries: list[str] = []

    async def search_side_effect(query: str) -> tuple[list[dict[str, str]], None, float]:
        seen_queries.append(query)
        if query == "12345":
            return primary_results, None, 0.0
        if query == "UPC 12345":
            return strong_variant_results, None, 0.0
        pytest.fail(f"search expansion should have stopped before querying: {query}")

    scraper._search_client.search_with_cost = AsyncMock(side_effect=search_side_effect)

    search_results, working_name, search_error = await scraper._collect_search_candidates(
        sku="12345",
        product_name="Squeaky Ball",
        brand="Acme",
        category="Dog Toys",
    )

    assert search_error is None
    assert working_name == "Squeaky Ball"
    assert seen_queries == ["12345", "UPC 12345"]
    assert search_results[0]["url"] == "https://acmepets.com/products/12345-squeaky-ball"


async def test_search_client_coalesces_concurrent_identical_queries() -> None:
    release_provider = asyncio.Event()

    class ProviderStub:
        def __init__(self) -> None:
            self.calls: list[str] = []

        async def search(self, query: str) -> tuple[list[dict[str, str]], None]:
            self.calls.append(query)
            await release_provider.wait()
            return (
                [
                    {
                        "url": "https://acmepets.com/products/12345",
                        "title": "Acme Squeaky Ball 12345",
                        "description": "Official page",
                    }
                ],
                None,
            )

    provider = ProviderStub()
    client = SearchClient(max_results=5, provider="gemini")
    client.gemini_client = provider

    tasks = [
        asyncio.create_task(client.search("Acme Squeaky Ball 12345"))
        for _ in range(3)
    ]
    await asyncio.sleep(0)
    release_provider.set()

    results = await asyncio.gather(*tasks)

    assert len(provider.calls) == 1
    assert all(error is None for _, error in results)
    assert all(payload[0]["url"] == "https://acmepets.com/products/12345" for payload, _ in results)
