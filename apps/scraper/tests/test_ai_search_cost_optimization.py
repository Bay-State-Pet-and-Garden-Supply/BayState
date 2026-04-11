from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from scrapers.ai_search.scraper import AISearchScraper
from scrapers.ai_search.search import SearchClient


pytestmark = pytest.mark.asyncio


async def test_collect_search_candidates_runs_consolidated_name_follow_up_after_sku_search() -> None:
    scraper = AISearchScraper()
    scraper._query_builder.build_identifier_query = MagicMock(return_value="12345")
    scraper._query_builder.build_name_query = MagicMock(return_value="Acme Squeaky Ball")
    scraper._query_builder.build_search_query = MagicMock(return_value="legacy-search")
    scraper._query_builder.build_query_variants = MagicMock(return_value=["variant-one", "variant-two"])
    scraper._query_builder.build_site_query_variants = MagicMock(return_value=["site:example.com 12345"])
    scraper._name_consolidator.consolidate_name = AsyncMock(return_value=("Acme Squeaky Ball", 0.0))

    primary_results = [
        {
            "url": "https://www.chewy.com/acme-squeaky-ball/dp/12345",
            "title": "Acme Squeaky Ball 12345 at Chewy",
            "description": "Trusted retailer page with in stock details",
        },
    ]
    follow_up_results = [
        {
            "url": "https://acmepets.com/products/12345-squeaky-ball",
            "title": "Acme Squeaky Ball 12345",
            "description": "Official product details with price and add to cart",
        }
    ]

    seen_queries: list[str] = []

    async def search_side_effect(query: str) -> tuple[list[dict[str, str]], None, float]:
        seen_queries.append(query)
        if query == "12345":
            return primary_results, None, 0.0
        if query == "Acme Squeaky Ball":
            return follow_up_results, None, 0.0
        pytest.fail(f"unexpected query executed: {query}")

    scraper._search_client.search_with_cost = AsyncMock(side_effect=search_side_effect)

    search_results, working_name, search_error = await scraper._collect_search_candidates(
        sku="12345",
        product_name="Squeaky Ball",
        brand="Acme",
        category="Dog Toys",
    )

    assert search_error is None
    assert working_name == "Acme Squeaky Ball"
    assert seen_queries == ["12345", "Acme Squeaky Ball"]
    assert [result["url"] for result in search_results[:2]] == [
        "https://acmepets.com/products/12345-squeaky-ball",
        "https://www.chewy.com/acme-squeaky-ball/dp/12345",
    ]
    assert scraper._search_client.search_with_cost.await_count == 2
    scraper._query_builder.build_name_query.assert_called_once_with("Acme Squeaky Ball")
    scraper._query_builder.build_search_query.assert_not_called()
    scraper._query_builder.build_query_variants.assert_not_called()
    scraper._query_builder.build_site_query_variants.assert_not_called()


async def test_collect_search_candidates_uses_follow_up_results_to_improve_weak_primary_pool() -> None:
    scraper = AISearchScraper()
    scraper._query_builder.build_identifier_query = MagicMock(return_value="12345")
    scraper._query_builder.build_name_query = MagicMock(return_value="Acme Squeaky Ball")
    scraper._query_builder.build_search_query = MagicMock(return_value="legacy-search")
    scraper._query_builder.build_query_variants = MagicMock(
        return_value=["UPC 12345", "variant-two", "variant-three"]
    )
    scraper._query_builder.build_site_query_variants = MagicMock(return_value=["site:example.com 12345"])
    scraper._name_consolidator.consolidate_name = AsyncMock(return_value=("Acme Squeaky Ball", 0.0))

    primary_results = [
        {
            "url": "https://example.com/blog/best-dog-toys-2026",
            "title": "Best dog toys 2026 review",
            "description": "Top 10 list and buying guide",
        }
    ]
    follow_up_results = [
        {
            "url": "https://acmepets.com/products/12345-squeaky-ball",
            "title": "Acme Squeaky Ball 12345",
            "description": "Official product details with price and add to cart",
        }
    ]
    seen_queries: list[str] = []

    async def search_side_effect(query: str) -> tuple[list[dict[str, str]], None, float]:
        seen_queries.append(query)
        if query == "12345":
            return primary_results, None, 0.0
        if query == "Acme Squeaky Ball":
            return follow_up_results, None, 0.0
        pytest.fail(f"unexpected query executed: {query}")

    scraper._search_client.search_with_cost = AsyncMock(side_effect=search_side_effect)

    search_results, working_name, search_error = await scraper._collect_search_candidates(
        sku="12345",
        product_name="Squeaky Ball",
        brand="Acme",
        category="Dog Toys",
    )

    assert search_error is None
    assert working_name == "Acme Squeaky Ball"
    assert seen_queries == ["12345", "Acme Squeaky Ball"]
    assert search_results[0]["url"] == "https://acmepets.com/products/12345-squeaky-ball"
    scraper._query_builder.build_name_query.assert_called_once_with("Acme Squeaky Ball")
    scraper._query_builder.build_search_query.assert_not_called()
    scraper._query_builder.build_query_variants.assert_not_called()
    scraper._query_builder.build_site_query_variants.assert_not_called()


async def test_collect_search_candidates_applies_preferred_domain_ranking_without_extra_queries() -> None:
    scraper = AISearchScraper()
    scraper._query_builder.build_identifier_query = MagicMock(return_value="045663976903")
    scraper._query_builder.build_name_query = MagicMock(return_value="Four Paws Wee-Wee Cat Pads Fresh Scent 10 Count")
    scraper._query_builder.build_search_query = MagicMock(return_value="legacy-search")
    scraper._query_builder.build_query_variants = MagicMock(return_value=["broad-query"])
    scraper._query_builder.build_site_query_variants = MagicMock(return_value=["site:bradleycaldwell.com 045663976903"])
    scraper._name_consolidator.consolidate_name = AsyncMock(
        return_value=("Four Paws Wee-Wee Cat Pads Fresh Scent 10 Count", 0.0)
    )

    seen_queries: list[str] = []
    primary_results = [
        {
            "url": "https://countrymax.com/four-paws-wee-wee-cat-pads-fresh-scent",
            "title": "Four Paws Wee-Wee Cat Pads Fresh Scent",
            "description": "Cat pads fresh scent 28x30 10 count add to cart",
        },
    ]
    follow_up_results = [
        {
            "url": "https://www.bradleycaldwell.com/four-paws-wee-wee-cat-litter-box-system-cat-pads-fresh-scented-10-count.html",
            "title": "Four Paws Wee-Wee Cat Litter Box System Cat Pads Fresh Scented 10 Count",
            "description": "Preferred distributor page with add to cart and product details",
        }
    ]

    async def search_side_effect(query: str) -> tuple[list[dict[str, str]], None, float]:
        seen_queries.append(query)
        if query == "045663976903":
            return primary_results, None, 0.0
        if query == "Four Paws Wee-Wee Cat Pads Fresh Scent 10 Count":
            return follow_up_results, None, 0.0
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
    assert working_name == "Four Paws Wee-Wee Cat Pads Fresh Scent 10 Count"
    assert seen_queries == ["045663976903", "Four Paws Wee-Wee Cat Pads Fresh Scent 10 Count"]
    assert search_results[0]["url"].startswith("https://www.bradleycaldwell.com/")
    scraper._query_builder.build_name_query.assert_called_once_with("Four Paws Wee-Wee Cat Pads Fresh Scent 10 Count")
    scraper._query_builder.build_search_query.assert_not_called()
    scraper._query_builder.build_query_variants.assert_not_called()
    scraper._query_builder.build_site_query_variants.assert_not_called()


async def test_collect_search_candidates_can_disable_name_follow_up_with_budget_zero() -> None:
    scraper = AISearchScraper()
    scraper.max_follow_up_queries = 0
    scraper._query_builder.build_identifier_query = MagicMock(return_value="045663976880")
    scraper._query_builder.build_name_query = MagicMock(return_value="Four Paws Wee-Wee Cat Pads")
    scraper._query_builder.build_search_query = MagicMock(return_value="legacy-search")
    scraper._query_builder.build_query_variants = MagicMock(return_value=["broad-query"])
    scraper._query_builder.build_site_query_variants = MagicMock(
        return_value=[
            "site:petswarehouse.com 045663976880",
            "site:petswarehouse.com Four Paws WEE WEE CAT PADS 28X 30 10CT",
        ]
    )
    scraper._name_consolidator.consolidate_name = AsyncMock(return_value=("Four Paws Wee-Wee Cat Pads", 0.0))

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
    assert working_name == "Four Paws Wee-Wee Cat Pads"
    assert seen_queries == ["045663976880"]
    assert search_results[0]["url"].endswith("/2364134")
    scraper._query_builder.build_name_query.assert_not_called()
    scraper._query_builder.build_search_query.assert_not_called()
    scraper._query_builder.build_query_variants.assert_not_called()
    scraper._query_builder.build_site_query_variants.assert_not_called()


async def test_collect_search_candidates_infers_brand_hint_from_search_snippets() -> None:
    scraper = AISearchScraper()
    scraper.max_follow_up_queries = 0
    scraper._query_builder.build_identifier_query = MagicMock(return_value="045663976866")
    scraper._query_builder.build_name_query = MagicMock(return_value="Four Paws Wee-Wee Cat Pads")
    scraper._query_builder.build_search_query = MagicMock(return_value="legacy-search")
    scraper._query_builder.build_query_variants = MagicMock(return_value=[])
    scraper._query_builder.build_site_query_variants = MagicMock(return_value=["site:petswarehouse.com 045663976866"])
    scraper._name_consolidator.consolidate_name = AsyncMock(return_value=("Four Paws Wee-Wee Cat Pads", 0.0))
    scraper._infer_search_brand_hint = MagicMock(return_value="Four Paws")

    observed_brand: dict[str, str | None] = {}

    def capture_prepare_candidate_pool(
        search_results: list[dict[str, str]],
        sku: str,
        brand: str | None,
        product_name: str | None,
        category: str | None,
        preferred_domains: list[str] | None = None,
    ) -> list[dict[str, str]]:
        del sku, product_name, category, preferred_domains
        observed_brand["brand"] = brand
        return list(search_results)

    scraper._prepare_candidate_pool = MagicMock(side_effect=capture_prepare_candidate_pool)

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

    assert observed_brand["brand"] == "Four Paws"
    scraper._query_builder.build_name_query.assert_not_called()
    scraper._query_builder.build_search_query.assert_not_called()
    scraper._query_builder.build_query_variants.assert_not_called()
    scraper._query_builder.build_site_query_variants.assert_not_called()


async def test_collect_search_candidates_returns_empty_pool_without_follow_up_queries() -> None:
    scraper = AISearchScraper()
    scraper.max_follow_up_queries = 1
    scraper._query_builder.build_identifier_query = MagicMock(return_value="045663976866")
    scraper._query_builder.build_name_query = MagicMock(return_value="Four Paws Wee-Wee Cat Pads")
    scraper._query_builder.build_search_query = MagicMock(return_value="legacy-search")
    scraper._query_builder.build_query_variants = MagicMock(return_value=["broad-query"])
    scraper._query_builder.build_site_query_variants = MagicMock(return_value=["site:petswarehouse.com 045663976866"])
    scraper._name_consolidator.consolidate_name = AsyncMock(return_value=("Four Paws Wee-Wee Cat Pads", 0.0))

    scraper._search_client.search_with_cost = AsyncMock(return_value=([], None, 0.0))

    search_results, _, search_error = await scraper._collect_search_candidates(
        sku="045663976866",
        product_name="WEE WEE CAT PADS 11X 17 10CT",
        brand="Four Paws",
        category=None,
        preferred_domains=["petswarehouse.com"],
    )

    assert search_results == []
    assert search_error is None
    assert scraper._search_client.search_with_cost.await_count == 1
    scraper._query_builder.build_name_query.assert_not_called()
    scraper._query_builder.build_search_query.assert_not_called()
    scraper._query_builder.build_query_variants.assert_not_called()
    scraper._query_builder.build_site_query_variants.assert_not_called()


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
