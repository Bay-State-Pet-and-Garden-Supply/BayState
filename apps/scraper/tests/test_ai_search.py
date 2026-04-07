from __future__ import annotations

import asyncio
from typing import Any, Optional

from scrapers.ai_search import AISearchScraper


def test_build_search_query_includes_category_when_present() -> None:
    scraper = AISearchScraper()

    query = scraper._query_builder.build_search_query(
        sku="12345",
        product_name="Squeaky Ball",
        brand="Acme Pets",
        category="Dog Toys",
    )

    assert "Acme Pets" in query
    assert "Squeaky Ball" in query
    assert "Dog Toys" in query
    assert "12345" in query
    assert "product" in query
    assert "details" in query


def test_collect_search_candidates_uses_contextual_primary_query_for_ambiguous_numeric_sku() -> None:
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

    assert queries
    assert queries[0] != "4057"
    assert "Lake Valley Seed" in queries[0]
    assert "Organic Eggplant Black Beauty Heirloom" in queries[0]
    assert "Vegetable Seeds" in queries[0]


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


def test_scraper_passes_runtime_api_key_to_search_client(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class SearchClientStub:
        def __init__(
            self,
            max_results: int = 15,
            provider: str | None = None,
            cache_max: int = 500,
            api_key: str | None = None,
        ) -> None:
            captured["max_results"] = max_results
            captured["provider"] = provider
            captured["cache_max"] = cache_max
            captured["api_key"] = api_key

    monkeypatch.setattr("scrapers.ai_search.scraper.SearchClient", SearchClientStub)

    AISearchScraper(
        max_search_results=9,
        llm_provider="gemini",
        llm_api_key="gemini-runtime-key",
    )

    assert captured["max_results"] == 9
    assert captured["provider"] == "auto"
    assert captured["api_key"] == "gemini-runtime-key"


def test_scrape_product_aggregates_candidates_across_query_variants() -> None:
    class VariantSearchClient:
        async def search(self, query: str) -> tuple[list[dict[str, str]], str | None]:
            if "details" in query:
                return (
                    [
                        {
                            "url": "https://chewy.com/pdp/12345",
                            "title": "Acme Squeaky Ball 12345",
                            "description": "Trusted retailer listing with price and add to cart",
                        }
                    ],
                    None,
                )

            if query == "Squeaky Ball 12345":
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

        async def _identify_best_source(
            self,
            search_results: list[dict[str, Any]],
            sku: str,
            brand: str | None,
            product_name: str | None,
        ) -> str | None:
            _ = sku, brand, product_name
            return search_results[0]["url"] if search_results else None

        def _heuristic_source_selection(
            self,
            search_results: list[dict[str, Any]],
            sku: str,
            brand: str | None = None,
            product_name: str | None = None,
            category: str | None = None,
        ) -> str | None:
            _ = sku, brand, product_name, category
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
