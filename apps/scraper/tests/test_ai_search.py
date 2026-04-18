from __future__ import annotations

import asyncio
from typing import Any, Optional
from unittest.mock import AsyncMock, patch

from scrapers.ai_search import AISearchScraper
from scrapers.ai_search.models import AISearchResult


def test_build_search_query_prefers_cleaned_product_name() -> None:
    scraper = AISearchScraper()

    query = scraper._query_builder.build_search_query(
        sku="12345",
        product_name="Squeaky Ball",
        brand="Acme Pets",
        category="Dog Toys",
    )

    assert query == "Squeaky Ball"


def test_collect_search_candidates_uses_identifier_query_for_ambiguous_numeric_sku() -> None:
    queries: list[str] = []

    class SearchClientStub:
        async def search_with_cost(self, query: str) -> tuple[list[dict[str, str]], str | None, float]:
            queries.append(query)
            return [], None, 0.0

    scraper = AISearchScraper()
    scraper.max_follow_up_queries = 0
    scraper._search_client = SearchClientStub()

    asyncio.run(
        scraper._collect_search_candidates(
            sku="4057",
            product_name="Organic Eggplant Black Beauty Heirloom",
            brand="Lake Valley Seed",
            category="Vegetable Seeds",
        )
    )

    assert queries == ["4057"]


def test_validate_extraction_match_rejects_low_confidence() -> None:
    scraper = AISearchScraper(confidence_threshold=0.8)

    ok, reason = scraper._validator.validate_extraction_match(
        extraction_result={
            "success": True,
            "product_name": "Acme Squeaky Ball",
            "brand": "Acme",
            "description": "A dog toy",
            "size_metrics": "Large",
            "images": ["https://example.com/images/products/acme-squeaky-ball.jpg"],
            "categories": ["Dog Toys"],
            "confidence": 0.7,
        },
        sku="12345",
        product_name="Acme Squeaky Ball",
        brand="Acme",
        source_url="https://acmepets.com/products/12345",
    )

    assert ok is False
    assert "Confidence below threshold" in reason


def test_validate_extraction_match_rejects_brand_mismatch() -> None:
    scraper = AISearchScraper(confidence_threshold=0.5)

    ok, reason = scraper._validator.validate_extraction_match(
        extraction_result={
            "success": True,
            "product_name": "Acme Squeaky Ball",
            "brand": "Random Brand",
            "description": "A dog toy",
            "size_metrics": "Large",
            "images": ["https://example.com/images/products/acme-squeaky-ball.jpg"],
            "categories": ["Dog Toys"],
            "confidence": 0.9,
        },
        sku="12345",
        product_name="Acme Squeaky Ball",
        brand="Acme",
        source_url="https://randomsource.com/products/12345",
    )

    assert ok is False
    assert reason == "Brand mismatch with expected product context"


def test_validate_extraction_match_accepts_trusted_secondary_retailer_without_sku_when_brand_and_variant_match() -> None:
    scraper = AISearchScraper(confidence_threshold=0.7)

    ok, reason = scraper._validator.validate_extraction_match(
        extraction_result={
            "success": True,
            "product_name": "Four Paws Wee-Wee Cat Litter Box System Pads 11 in X 17 in (10 ct)",
            "brand": "Four Paws",
            "description": "Trusted retailer PDP for Four Paws Wee-Wee Cat Litter Box System Pads 11 in X 17 in (10 ct)",
            "size_metrics": "10 ct",
            "images": ["https://petswarehouse.com/cdn/shop/files/pads.jpg?v=1"],
            "categories": ["Cat Supplies"],
            "confidence": 0.8,
        },
        sku="045663976866",
        product_name="WEE WEE CAT PADS 11X 17 10CT",
        brand=None,
        source_url="https://petswarehouse.com/products/four-paws-wee-wee-cat-litter-box-system-pads-11-in-x-17-in-10-ct",
    )

    assert ok is True
    assert reason == "ok"


def test_validate_extraction_match_rejects_conflicting_variant_tokens() -> None:
    scraper = AISearchScraper(confidence_threshold=0.7)

    ok, reason = scraper._validator.validate_extraction_match(
        extraction_result={
            "success": True,
            "product_name": "Four Paws Wee-Wee Cat Pads Fresh Scent 28 in X 30 in (10 ct)",
            "brand": "Four Paws",
            "description": "While you searched for 11 x 17, the standard size is 28 x 30.",
            "size_metrics": "10 ct",
            "images": ["https://petswarehouse.com/cdn/shop/files/pads.jpg?v=1"],
            "categories": ["Cat Supplies"],
            "confidence": 0.85,
        },
        sku="045663976866",
        product_name="WEE WEE CAT PADS 11X 17 10CT",
        brand="Four Paws",
        source_url="https://petswarehouse.com/products/four-paws-wee-wee-cat-pads-fresh-scent-28-in-x-30-in-10-ct",
    )

    assert ok is False
    assert reason == "Product page contains conflicting variant tokens"


def test_prepare_search_results_deprioritizes_low_quality_links() -> None:
    scraper = AISearchScraper()
    results = [
        {
            "url": "https://example.com/blog/best-dog-toys-2026",
            "title": "Best dog toys 2026 review",
            "description": "Top 10 list",
        },
        {
            "url": "https://acmepets.com/products/12345-squeaky-ball",
            "title": "Acme Squeaky Ball Product Page",
            "description": "Official product details",
        },
    ]

    prepared = scraper._scoring.prepare_search_results(
        search_results=results,
        sku="12345",
        brand="Acme",
        product_name="Squeaky Ball",
        category="Dog Toys",
    )

    assert prepared[0]["url"] == "https://acmepets.com/products/12345-squeaky-ball"


def test_prepare_search_results_keeps_best_non_whitelisted_pdp_when_brand_present() -> None:
    scraper = AISearchScraper()
    results = [
        {
            "url": "https://independentpet.com/products/acme-squeaky-ball-12345",
            "title": "Acme Squeaky Ball 12345",
            "description": "Exact product page with add to cart and in stock details",
        },
        {
            "url": "https://chewy.com/dog-toys",
            "title": "Dog Toys",
            "description": "Shop dog toys and accessories",
        },
    ]

    prepared = scraper._scoring.prepare_search_results(
        search_results=results,
        sku="12345",
        brand="Acme",
        product_name="Squeaky Ball",
        category="Dog Toys",
    )

    assert prepared[0]["url"] == "https://independentpet.com/products/acme-squeaky-ball-12345"


def test_prepare_search_results_demotes_marketplaces_below_official_brand_pages() -> None:
    scraper = AISearchScraper(prefer_manufacturer=True)
    results = [
        {
            "url": "https://www.ebay.com/itm/1234567890",
            "title": "NutriSource Ocean Select Entree Dog Food 26LB",
            "description": "eBay listing for NutriSource Ocean Select Entree",
        },
        {
            "url": "https://nutrisourcepetfoods.com/our-food/ocean-select-entree/",
            "title": "Ocean Select Entree Dog Food | NutriSource",
            "description": "Official NutriSource product page for Ocean Select Entree dog food",
        },
    ]

    prepared = scraper._scoring.prepare_search_results(
        search_results=results,
        sku="073893281016",
        brand="NutriSource",
        product_name="Ocean Select Entree Dog Food",
        category="Dog Food",
        prefer_manufacturer=True,
    )

    assert prepared[0]["url"] == "https://nutrisourcepetfoods.com/our-food/ocean-select-entree/"


def test_prepare_search_results_prefers_official_family_page_with_variant_signals_over_small_retailer() -> None:
    scraper = AISearchScraper(prefer_manufacturer=True)
    results = [
        {
            "url": "https://www.wiltonhardware.com/p/nature-scapes-color-enhanced-mulch-sierra-red-032247884594",
            "title": "Nature Scapes Color Enhanced Mulch Sierra Red 032247884594",
            "description": "Independent retailer PDP for Scotts Sierra Red mulch 1.5 cu ft.",
        },
        {
            "url": "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
            "title": "Scotts Nature Scapes Color Enhanced Mulch 1.5 cu. ft.",
            "description": "Official Scotts family page with Red, Brown, and Black color variants plus 1.5 CF and 2 CF size options.",
        },
    ]

    prepared = scraper._scoring.prepare_search_results(
        search_results=results,
        sku="032247884594",
        brand="Scotts",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
        category="Mulch",
        prefer_manufacturer=True,
    )

    assert (
        prepared[0]["url"]
        == "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html"
    )


def test_prepare_search_results_prefers_official_brand_segment_when_brand_missing() -> None:
    scraper = AISearchScraper(prefer_manufacturer=True)
    results = [
        {
            "url": "https://arett.com/item/B104+HTG001/Bentley-Seed-Tomato-Jubilee-1943",
            "title": "Tomato Jubilee 1943",
            "description": "Bentley Seed retailer listing exact product with add to cart",
        },
        {
            "url": "https://bentleyseeds.com/products/jubilee-tomato-seed",
            "title": "Seed Packets - Bentley Seeds",
            "description": "Official product page",
        },
    ]

    prepared = scraper._scoring.prepare_search_results(
        search_results=results,
        sku="051588178896",
        brand=None,
        product_name="Tomato Jubilee 1943",
        category="Vegetable Seeds",
        prefer_manufacturer=True,
    )

    assert prepared[0]["url"] == "https://bentleyseeds.com/products/jubilee-tomato-seed"


def test_build_cohort_key_groups_unknown_brand_products_by_prefix_and_category() -> None:
    scraper = AISearchScraper()

    first_key = scraper._build_cohort_key(
        {
            "sku": "SV-001",
            "product_name": "Bentley Seed Tomato Jubilee 1943",
            "category": "Vegetable Seeds",
        }
    )
    second_key = scraper._build_cohort_key(
        {
            "sku": "SV-002",
            "product_name": "Bentley Seed Roma Tomato",
            "category": "Vegetable Seeds",
        }
    )

    assert first_key == "bentleyseed::vegetableseeds"
    assert second_key == first_key


def test_infer_search_brand_hint_prefers_title_text_over_slug_fallback() -> None:
    scraper = AISearchScraper()

    inferred_brand = scraper._infer_search_brand_hint(
        [
            {
                "url": "https://petswarehouse.com/products/acme-pads-small",
                "title": "Four Paws Wee-Wee Pads small",
                "description": "Product details with add to cart",
            }
        ],
        "WEE WEE CAT PADS 11X17 10CT",
    )

    assert inferred_brand == "Four Paws"


def test_scraper_passes_runtime_api_key_to_search_client(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class SearchClientStub:
        def __init__(
            self,
            max_results: int = 15,
            provider: str | None = None,
            cache_max: int = 500,
            api_key: str | None = None,
            provider_max_results: int | None = None,
        ) -> None:
            captured["max_results"] = max_results
            captured["provider"] = provider
            captured["cache_max"] = cache_max
            captured["api_key"] = api_key
            captured["provider_max_results"] = provider_max_results

    monkeypatch.setattr("scrapers.ai_search.scraper.SearchClient", SearchClientStub)

    AISearchScraper(
        max_search_results=9,
        llm_provider="gemini",
        llm_api_key="gemini-runtime-key",
    )

    assert captured["max_results"] == 9
    assert captured["provider"] == "auto"
    assert captured["api_key"] == "gemini-runtime-key"
    assert captured["provider_max_results"] is not None


def test_scrape_product_uses_consolidated_name_follow_up_search() -> None:
    class VariantSearchClient:
        def __init__(self) -> None:
            self.calls: list[str] = []

        async def search(self, query: str) -> tuple[list[dict[str, str]], str | None]:
            self.calls.append(query)
            if query == "12345":
                return (
                    [
                        {
                            "url": "https://chewy.com/pdp/12345",
                            "title": "Acme Squeaky Ball 12345",
                            "description": "Trusted retailer listing with price and add to cart",
                        },
                        {
                            "url": "https://anotherstore.com/acme-ball",
                            "title": "Acme Ball",
                            "description": "Another retailer listing",
                        },
                    ],
                    None,
                )

            if query == "Acme Squeaky Ball":
                return (
                    [
                        {
                            "url": "https://acmepets.com/products/12345-squeaky-ball",
                            "title": "Acme Squeaky Ball 12345",
                            "description": "Official product details for SKU 12345",
                        }
                    ],
                    None,
                )

            return ([], None)

    class VariantScraper(AISearchScraper):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            self._search_client = VariantSearchClient()

        async def _extract_product_data(
            self,
            url: str,
            sku: str,
            product_name: str | None,
            brand: str | None,
        ) -> dict[str, object]:
            if "chewy.com" in url:
                return {
                    "success": True,
                    "product_name": "Acme Squeaky Ball 12345",
                    "brand": "Another Brand",
                    "description": "Retailer page",
                    "size_metrics": "12 oz",
                    "images": ["https://chewy.com/images/products/12345.jpg"],
                    "categories": ["Dog Toys"],
                    "confidence": 0.95,
                }

            return {
                "success": True,
                "product_name": "Acme Squeaky Ball 12345",
                "brand": brand,
                "description": "Official product details for SKU 12345",
                "size_metrics": "12 oz",
                "images": ["https://acmepets.com/images/products/12345.jpg"],
                "categories": ["Dog Toys"],
                "confidence": 0.88,
            }

    scraper = VariantScraper(confidence_threshold=0.7)
    scraper._name_consolidator.consolidate_name = AsyncMock(return_value=("Acme Squeaky Ball", 0.0))

    result = asyncio.run(
        scraper.scrape_product(
            sku="12345",
            product_name="Squeaky Ball",
            brand="Acme",
            category="Dog Toys",
        )
    )

    assert result.success is True
    assert result.url == "https://acmepets.com/products/12345-squeaky-ball"
    assert scraper._search_client.calls == ["12345", "Acme Squeaky Ball"]


def test_scrape_products_batch_prefers_previously_accepted_cohort_domain() -> None:
    class CohortSearchClient:
        async def search(self, query: str) -> tuple[list[dict[str, Any]], str | None]:
            lowered = query.lower()
            if "small" in lowered:
                return (
                    [
                        {
                            "url": "https://petswarehouse.com/products/acme-pads-small",
                            "title": "Acme Pads Small 10 Count",
                            "description": "Acme Pads Small 10 Count with add to cart",
                        },
                        {
                            "url": "https://countrymax.com/acme-pads-small",
                            "title": "Acme Pads Small 10 Count",
                            "description": "Acme Pads Small 10 Count with add to cart",
                        },
                    ],
                    None,
                )

            return (
                [
                    {
                        "url": "https://countrymax.com/acme-pads-large",
                        "title": "Acme Pads Large 20 Count",
                        "description": "Acme Pads Large 20 Count with add to cart",
                    },
                    {
                        "url": "https://petswarehouse.com/products/acme-pads-large",
                        "title": "Acme Pads Large 20 Count",
                        "description": "Acme Pads Large 20 Count with add to cart",
                    },
                ],
                None,
            )

        async def search_with_cost(self, query: str) -> tuple[list[dict[str, Any]], str | None, float]:
            results, error = await self.search(query)
            return results, error, 0.0

    class CohortScraper(AISearchScraper):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            self._search_client = CohortSearchClient()

        async def _should_skip_url(self, url: str) -> bool:
            _ = url
            return False

        async def _extract_product_data(
            self,
            url: str,
            sku: str,
            product_name: str | None,
            brand: str | None,
        ) -> dict[str, object]:
            count = "10 Count" if "small" in url else "20 Count"
            size_metrics = "10ct" if "small" in url else "20ct"
            return {
                "success": True,
                "product_name": product_name or "Acme Pads",
                "brand": brand,
                "description": f"{product_name} {count}",
                "size_metrics": size_metrics,
                "images": [f"{url}/image.jpg"],
                "categories": ["Cat Supplies"],
                "confidence": 0.87,
            }

    scraper = CohortScraper(confidence_threshold=0.7)

    results = asyncio.run(
        scraper.scrape_products_batch(
            [
                {
                    "sku": "SKU-SMALL",
                    "product_name": "Acme Pads Small 10 Count",
                    "brand": "Acme",
                    "category": "Cat Supplies",
                },
                {
                    "sku": "SKU-LARGE",
                    "product_name": "Acme Pads Large 20 Count",
                    "brand": "Acme",
                    "category": "Cat Supplies",
                },
            ],
            max_concurrency=2,
        )
    )

    assert [result.url for result in results] == [
        "https://petswarehouse.com/products/acme-pads-small",
        "https://petswarehouse.com/products/acme-pads-large",
    ]


def test_scrape_products_batch_carries_forward_inferred_brand_and_domain_hints() -> None:
    class CohortHintScraper(AISearchScraper):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            self.collect_calls: list[dict[str, Any]] = []

        async def _should_skip_url(self, url: str) -> bool:
            _ = url
            return False

        async def _collect_search_candidates(
            self,
            sku: str,
            product_name: Optional[str],
            brand: Optional[str],
            category: Optional[str],
            cost_context=None,
            preferred_domains: list[str] | None = None,
        ) -> tuple[list[dict[str, Any]], Optional[str], Optional[str]]:
            self.collect_calls.append(
                {
                    "sku": sku,
                    "brand": brand,
                    "preferred_domains": preferred_domains or [],
                }
            )
            slug = "small" if sku == "SKU-SMALL" else "large"
            return (
                [
                    {
                        "url": f"https://petswarehouse.com/products/acme-pads-{slug}",
                        "title": f"Four Paws Wee-Wee Pads {slug}",
                        "description": "Product details with add to cart",
                    }
                ],
                product_name,
                None,
            )

        async def _extract_product_data(
            self,
            url: str,
            sku: str,
            product_name: str | None,
            brand: str | None,
        ) -> dict[str, object]:
            return {
                "success": True,
                "product_name": product_name or "Four Paws Wee-Wee Pads",
                "brand": "FOUR PAWS",
                "description": f"{product_name} 10 Count",
                "size_metrics": "10ct",
                "images": [f"{url}/image.jpg"],
                "categories": ["Cat Supplies"],
                "confidence": 0.9,
            }

    scraper = CohortHintScraper(confidence_threshold=0.7)

    asyncio.run(
        scraper.scrape_products_batch(
            [
                {
                    "sku": "SKU-SMALL",
                    "product_name": "WEE WEE CAT PADS 11X17 10CT",
                    "category": "Cat Supplies",
                },
                {
                    "sku": "SKU-LARGE",
                    "product_name": "WEE WEE CAT PADS 28X30 10CT",
                    "category": "Cat Supplies",
                },
            ],
            max_concurrency=2,
        )
    )

    assert scraper.collect_calls[0]["brand"] is None
    assert scraper.collect_calls[0]["preferred_domains"] == []
    assert scraper.collect_calls[1]["brand"] == "FOUR PAWS"
    assert scraper.collect_calls[1]["preferred_domains"] == ["petswarehouse.com"]


def test_scrape_products_batch_normalizes_failed_items_to_dominant_domain() -> None:
    class CohortNormalizationScraper(AISearchScraper):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            self._attempts: dict[str, int] = {}

        async def scrape_product(
            self,
            sku: str,
            product_name: Optional[str] = None,
            brand: Optional[str] = None,
            category: Optional[str] = None,
            cohort_state=None,
        ):
            attempts = self._attempts.get(sku, 0)
            self._attempts[sku] = attempts + 1

            if sku == "SKU-1" and attempts == 0:
                return AISearchResult(success=False, sku=sku, error="Initial failure")

            return AISearchResult(
                success=True,
                sku=sku,
                product_name=product_name,
                brand="Acme",
                url=f"https://petswarehouse.com/products/{sku.lower()}",
                source_website="petswarehouse.com",
                confidence=0.9,
                images=["https://petswarehouse.com/image.jpg"],
            )

    scraper = CohortNormalizationScraper(confidence_threshold=0.7)

    results = asyncio.run(
        scraper.scrape_products_batch(
            [
                {"sku": "SKU-1", "product_name": "Acme Pads Small 10 Count", "brand": "Acme", "category": "Cat Supplies"},
                {"sku": "SKU-2", "product_name": "Acme Pads Large 20 Count", "brand": "Acme", "category": "Cat Supplies"},
                {"sku": "SKU-3", "product_name": "Acme Pads Jumbo 30 Count", "brand": "Acme", "category": "Cat Supplies"},
            ],
            max_concurrency=2,
        )
    )

    assert all(result.success for result in results)
    assert all(result.source_website == "petswarehouse.com" for result in results)
    assert scraper._attempts["SKU-1"] == 2


def test_scrape_products_batch_uses_batch_search_orchestrator_for_base_scraper() -> None:
    observed: dict[str, Any] = {}

    class FakeBatchSearchResult:
        def __init__(self, results: list[AISearchResult]) -> None:
            self._results = results

        def to_search_results(self) -> list[AISearchResult]:
            return list(self._results)

    class FakeOrchestrator:
        def __init__(self, **kwargs: Any) -> None:
            observed["kwargs"] = kwargs

        async def search_cohort(
            self,
            products: list[Any],
            *,
            max_search_concurrent: int = 5,
            max_extract_concurrent: int = 3,
        ) -> FakeBatchSearchResult:
            observed["products"] = products
            observed["max_search_concurrent"] = max_search_concurrent
            observed["max_extract_concurrent"] = max_extract_concurrent
            return FakeBatchSearchResult(
                [
                    AISearchResult(
                        success=True,
                        sku=product.sku,
                        product_name=product.name,
                        brand=product.brand,
                        url=f"https://petswarehouse.com/products/{product.sku.lower()}",
                        source_website="petswarehouse.com",
                        confidence=0.9,
                        images=["https://petswarehouse.com/image.jpg"],
                    )
                    for product in products
                ]
            )

    with patch("scrapers.ai_search.scraper.BatchSearchOrchestrator", FakeOrchestrator):
        scraper = AISearchScraper(confidence_threshold=0.7)
        results = asyncio.run(
            scraper.scrape_products_batch(
                [
                    {
                        "sku": "SKU-1",
                        "product_name": "Acme Pads Small 10 Count",
                        "brand": "Acme",
                        "category": "Cat Supplies",
                    },
                    {
                        "sku": "SKU-2",
                        "product_name": "Acme Pads Large 20 Count",
                        "brand": "Acme",
                        "category": "Cat Supplies",
                    },
                ],
                max_concurrency=2,
            )
        )

    assert observed["kwargs"]["validator"] is scraper._validator
    assert observed["max_search_concurrent"] == 2
    assert observed["max_extract_concurrent"] == 2
    assert [product.sku for product in observed["products"]] == ["SKU-1", "SKU-2"]
    assert [result.url for result in results] == [
        "https://petswarehouse.com/products/sku-1",
        "https://petswarehouse.com/products/sku-2",
    ]


def test_scrape_product_rejects_unrelated_result() -> None:
    class StubCrawl4AIExtractor:
        async def extract(
            self,
            url: str,
            sku: str,
            product_name: Optional[str],
            brand: Optional[str],
        ) -> Optional[dict[str, Any]]:
            _ = url, sku, product_name, brand
            return {
                "success": True,
                "product_name": "Unrelated Product",
                "brand": "Wrong Brand",
                "description": "Unrelated",
                "size_metrics": "N/A",
                "images": ["https://wrongbrand.com/images/products/999.jpg"],
                "categories": ["Dog Toys"],
                "confidence": 0.95,
            }

    class StubSearchClient:
        async def search(self, query: str) -> tuple[list[dict[str, Any]], str | None]:
            _ = query
            return [
                {
                    "url": "https://wrongbrand.com/products/999",
                    "title": "Wrong Brand Toy",
                    "description": "Not the requested product",
                }
            ], None

    class StubScraper(AISearchScraper):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            self._crawl4ai_extractor = StubCrawl4AIExtractor()
            self._fallback_extractor = StubCrawl4AIExtractor()
            self._search_client = StubSearchClient()

        async def _should_skip_url(self, url: str) -> bool:
            _ = url
            return False

        async def _identify_best_source(
            self,
            search_results: list[dict[str, Any]],
            sku: str,
            brand: str | None,
            product_name: str | None,
            cost_context=None,
            preferred_domains: list[str] | None = None,
        ) -> str | None:
            _ = sku, brand, product_name, cost_context, preferred_domains
            return search_results[0]["url"] if search_results else None

        def _heuristic_source_selection(
            self,
            search_results: list[dict[str, Any]],
            sku: str,
            brand: str | None = None,
            product_name: str | None = None,
            category: str | None = None,
            preferred_domains: list[str] | None = None,
        ) -> str | None:
            _ = sku, brand, product_name, category, preferred_domains
            return search_results[0]["url"] if search_results else None

    scraper = StubScraper(confidence_threshold=0.7)

    result = asyncio.run(
        scraper.scrape_product(
            sku="12345",
            product_name="Acme Squeaky Ball",
            brand="Acme",
            category="Dog Toys",
        )
    )

    assert result.success is False
    assert result.error is not None
    assert any(term in result.error.lower() for term in ["mismatch", "extraction failed"])
