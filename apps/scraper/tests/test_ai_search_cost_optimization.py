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


async def test_collect_search_candidates_uses_site_constrained_follow_up_for_preferred_domain() -> None:
    scraper = AISearchScraper()
    scraper._query_builder.build_identifier_query = MagicMock(return_value="045663976903")
    scraper._query_builder.build_search_query = MagicMock(return_value="fallback-query")
    scraper._query_builder.build_query_variants = MagicMock(return_value=["broad-query"])
    scraper._query_builder.build_site_query_variants = MagicMock(return_value=["site:bradleycaldwell.com 045663976903"])

    seen_queries: list[str] = []
    primary_results = [
        {
            "url": "https://countrymax.com/four-paws-wee-wee-cat-pads-fresh-scent",
            "title": "Four Paws Wee-Wee Cat Pads Fresh Scent",
            "description": "Cat pads fresh scent 28x30 10 count add to cart",
        }
    ]
    preferred_site_results = [
        {
            "url": "https://www.bradleycaldwell.com/four-paws-wee-wee-cat-litter-box-system-cat-pads-fresh-scented-10-count.html",
            "title": "Four Paws Wee-Wee Cat Litter Box System Cat Pads Fresh Scented 10 Count",
            "description": "Official distributor page with add to cart and product details",
        }
    ]

    async def search_side_effect(query: str) -> tuple[list[dict[str, str]], None, float]:
        seen_queries.append(query)
        if query == "045663976903":
            return primary_results, None, 0.0
        if query == "site:bradleycaldwell.com 045663976903":
            return preferred_site_results, None, 0.0
        if query == "broad-query":
            return (
                [
                    {
                        "url": "https://petswarehouse.com/products/four-paws-wee-wee-cat-pads-fresh-scent-28-in-x-30-in-10-ct",
                        "title": "petswarehouse.com",
                        "description": "Trusted retailer PDP with add to cart",
                    }
                ],
                None,
                0.0,
            )
        pytest.fail(f"unexpected query executed: {query}")

    scraper._search_client.search_with_cost = AsyncMock(side_effect=search_side_effect)

    search_results, working_name, search_error = await scraper._collect_search_candidates(
        sku="045663976903",
        product_name="WEE WEE CAT PADS FRE SH 28X30 10CT",
        brand="FOUR PAWS",
        category="Cat Supplies",
        preferred_domains=["bradleycaldwell.com"],
    )

    assert search_error is None
    assert working_name == "WEE WEE CAT PADS FRE SH 28X30 10CT"
    assert seen_queries == ["045663976903", "site:bradleycaldwell.com 045663976903"]
    assert search_results[0]["url"].startswith("https://www.bradleycaldwell.com/")


async def test_collect_search_candidates_tries_second_preferred_domain_query_when_first_is_unhelpful() -> None:
    scraper = AISearchScraper()
    scraper.max_follow_up_queries = 0
    scraper._query_builder.build_identifier_query = MagicMock(return_value="045663976880")
    scraper._query_builder.build_search_query = MagicMock(return_value="fallback-query")
    scraper._query_builder.build_query_variants = MagicMock(return_value=["broad-query"])
    scraper._query_builder.build_site_query_variants = MagicMock(
        return_value=[
            "site:petswarehouse.com 045663976880",
            "site:petswarehouse.com Four Paws WEE WEE CAT PADS 28X 30 10CT",
        ]
    )

    seen_queries: list[str] = []

    async def search_side_effect(query: str) -> tuple[list[dict[str, str]], None, float]:
        seen_queries.append(query)
        if query == "045663976880":
            return (
                [
                    {
                        "url": "https://www.chewy.com/wee-wee-four-paws-cat-pee-pads-28-x/dp/2364134",
                        "title": "Four Paws Wee-Wee Cat Pads",
                        "description": "Chewy PDP with add to cart",
                    }
                ],
                None,
                0.0,
            )
        if query == "site:petswarehouse.com 045663976880":
            return (
                [
                    {
                        "url": "https://www.bradleycaldwell.com/wee-wee-cat-pads-10-pk-436324",
                        "title": "bradleycaldwell.com",
                        "description": "The search for `site:petswarehouse.com 045663976880` did not return any direct results.",
                        "provider": "gemini",
                        "result_type": "grounded",
                    }
                ],
                None,
                0.0,
            )
        if query == "site:petswarehouse.com Four Paws WEE WEE CAT PADS 28X 30 10CT":
            return (
                [
                    {
                        "url": "https://petswarehouse.com/products/four-paws-wee-wee-cat-pads-fresh-scent-28-in-x-30-in-10-ct",
                        "title": "petswarehouse.com",
                        "description": "Trusted retailer PDP with add to cart",
                    }
                ],
                None,
                0.0,
            )
        if query == "broad-query":
            return (
                [
                    {
                        "url": "https://petswarehouse.com/products/four-paws-wee-wee-cat-pads-fresh-scent-28-in-x-30-in-10-ct",
                        "title": "petswarehouse.com",
                        "description": "Trusted retailer PDP with add to cart",
                    }
                ],
                None,
                0.0,
            )
        pytest.fail(f"unexpected query executed: {query}")

    scraper._search_client.search_with_cost = AsyncMock(side_effect=search_side_effect)

    search_results, working_name, search_error = await scraper._collect_search_candidates(
        sku="045663976880",
        product_name="WEE WEE CAT PADS 28X 30 10CT",
        brand="Four Paws",
        category="Cat Supplies",
        preferred_domains=["petswarehouse.com"],
    )

    assert search_error is None
    assert working_name == "WEE WEE CAT PADS 28X 30 10CT"
    assert seen_queries[:3] == [
        "045663976880",
        "site:petswarehouse.com 045663976880",
        "site:petswarehouse.com Four Paws WEE WEE CAT PADS 28X 30 10CT",
    ]
    assert "broad-query" not in seen_queries
    assert search_results[0]["url"].endswith("28-in-x-30-in-10-ct")


async def test_collect_search_candidates_infers_brand_hint_from_search_snippets() -> None:
    scraper = AISearchScraper()
    scraper.max_follow_up_queries = 0
    scraper._query_builder.build_identifier_query = MagicMock(return_value="045663976866")
    scraper._query_builder.build_search_query = MagicMock(return_value="fallback-query")
    scraper._query_builder.build_query_variants = MagicMock(return_value=[])

    scraper._search_client.search_with_cost = AsyncMock(
        return_value=(
            [
                {
                    "url": "https://petswarehouse.com/search?q=four-paws-wee-wee-cat-pads",
                    "title": "Four Paws Wee-Wee Cat Litter Box System Pads 11 in x 17 in 10 ct",
                    "description": "Trusted retailer page with add to cart",
                }
            ],
            None,
            0.0,
        )
    )

    await scraper._collect_search_candidates(
        sku="045663976866",
        product_name="WEE WEE CAT PADS 11X 17 10CT",
        brand=None,
        category="Cat Supplies",
    )

    assert scraper._query_builder.build_query_variants.call_args.kwargs["brand"] == "Four Paws"


async def test_collect_search_candidates_runs_broad_follow_up_after_unhelpful_site_query() -> None:
    scraper = AISearchScraper()
    scraper.max_follow_up_queries = 1
    scraper._query_builder.build_identifier_query = MagicMock(return_value="045663976866")
    scraper._query_builder.build_search_query = MagicMock(return_value="broad-query")
    scraper._query_builder.build_query_variants = MagicMock(return_value=["broad-query"])
    scraper._query_builder.build_site_query_variants = MagicMock(return_value=["site:petswarehouse.com 045663976866"])

    seen_queries: list[str] = []

    async def search_side_effect(query: str) -> tuple[list[dict[str, str]], None, float]:
        seen_queries.append(query)
        if query == "045663976866":
            return [], None, 0.0
        if query == "site:petswarehouse.com 045663976866":
            return (
                [
                    {
                        "url": "https://petswarehouse.com/products/four-paws-wee-wee-cat-pads-fresh-scent-28-in-x-30-in-10-ct",
                        "title": "Four Paws Wee-Wee Cat Pads Fresh Scent 28 in X 30 in (10 ct)",
                        "description": 'While you searched for 11\" x 17\", the standard size is 28\" x 30\".',
                    }
                ],
                None,
                0.0,
            )
        if query == "broad-query":
            return (
                [
                    {
                        "url": "https://petswarehouse.com/products/four-paws-wee-wee-cat-litter-box-system-pads-11-in-x-17-in-10-ct",
                        "title": "Four Paws Wee-Wee Cat Litter Box System Pads 11 in X 17 in (10 ct)",
                        "description": "Trusted retailer PDP with add to cart",
                    }
                ],
                None,
                0.0,
            )
        pytest.fail(f"unexpected query executed: {query}")

    scraper._search_client.search_with_cost = AsyncMock(side_effect=search_side_effect)

    search_results, _, _ = await scraper._collect_search_candidates(
        sku="045663976866",
        product_name="WEE WEE CAT PADS 11X 17 10CT",
        brand="Four Paws",
        category=None,
        preferred_domains=["petswarehouse.com"],
    )

    assert seen_queries == ["045663976866", "site:petswarehouse.com 045663976866", "broad-query"]
    assert search_results[0]["url"].endswith("11-in-x-17-in-10-ct")


def test_should_expand_search_when_generic_pages_lack_expected_variant_tokens() -> None:
    scraper = AISearchScraper()

    should_expand = scraper._should_expand_search(
        search_results=[
            {
                "url": "https://monsterpets.com/products/wee-wee-cat-pads-1",
                "title": "Wee-Wee Cat Pads",
                "description": "Cat pads product details",
            },
            {
                "url": "https://shop.pvpeteatery.com/products/wee-wee-cat-pads",
                "title": "Wee-Wee Cat Pads",
                "description": "Buy wee-wee cat pads online",
            },
        ],
        sku="045663976903",
        brand=None,
        product_name="WEE WEE CAT PADS FRE SH 28X30 10CT",
        category=None,
    )

    assert should_expand is True


def test_should_expand_search_when_top_result_mentions_conflicting_variant() -> None:
    scraper = AISearchScraper()

    should_expand = scraper._should_expand_search(
        search_results=[
            {
                "url": "https://petswarehouse.com/products/four-paws-wee-wee-cat-pads-fresh-scent-28-in-x-30-in-10-ct",
                "title": "Four Paws Wee-Wee Cat Pads Fresh Scent 28 in X 30 in (10 ct)",
                "description": 'While you searched for 11" x 17", the standard size is 28" x 30".',
            }
        ],
        sku="045663976866",
        brand="Four Paws",
        product_name="WEE WEE CAT PADS 11X 17 10CT",
        category=None,
    )

    assert should_expand is True


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
