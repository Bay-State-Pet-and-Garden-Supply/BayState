"""Integration/contract tests for OfficialBrandScraper selection behavior.

These tests use small in-memory fixtures. The old golden_dataset_v3 search-result
replay files were removed because they were discovery/scoring artifacts, not a
reliable extraction benchmark source.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from scrapers.ai_search.official_brand_scraper import OfficialBrandScraper
from scrapers.ai_search.query_builder import QueryBuilder


EASY_OFFICIAL_CASES = [
    (
        "Four Paws Wee-Wee Cat Pads 11x17 10ct",
        "fourpaws.com",
        [
            {
                "url": "https://www.fourpaws.com/products/wee-wee-cat-litter-box-system-pads",
                "title": "Wee-Wee Cat Pads - Four Paws",
                "description": "Official Four Paws cat litter box pads product page",
                "result_type": "organic",
            },
            {
                "url": "https://www.amazon.com/four-paws-wee-wee-pads",
                "title": "Four Paws Wee-Wee Pads - Amazon",
                "description": "Retailer listing",
                "result_type": "organic",
            },
        ],
    ),
    (
        "Outward Hound Dog Hide N Slide",
        "outwardhound.com",
        [
            {
                "url": "https://outwardhound.com/dog-hide-n-slide-purple.html",
                "title": "Dog Hide N Slide - Outward Hound",
                "description": "Official interactive puzzle toy page",
                "result_type": "organic",
            },
            {
                "url": "https://www.target.com/p/outward-hound-hide-n-slide",
                "title": "Outward Hound Hide N Slide - Target",
                "description": "Retailer listing",
                "result_type": "organic",
            },
        ],
    ),
]


def create_official_vs_retailer_mock(official_domains: list[str]) -> AsyncMock:
    async def mock_score(url: str, snippet: str, brand: str) -> dict:
        _ = snippet, brand
        url_lower = url.lower()
        blocked = ["amazon.com", "walmart.com", "target.com", "ebay.com", "chewy.com"]
        if any(official in url_lower for official in official_domains):
            return {"is_official": True, "confidence_score": 0.95, "reason": "Official"}
        if any(domain in url_lower for domain in blocked):
            return {"is_official": False, "confidence_score": 0.2, "reason": "Retailer"}
        return {"is_official": False, "confidence_score": 0.4, "reason": "Unknown"}

    return AsyncMock(side_effect=mock_score)


def build_scraper(results: list[dict], source_selector: MagicMock | None = None) -> OfficialBrandScraper:
    mock_search_client = MagicMock()
    mock_search_client.search = AsyncMock(return_value=(results, None))
    return OfficialBrandScraper(
        search_client=mock_search_client,
        query_builder=QueryBuilder(),
        source_selector=source_selector or MagicMock(score_snippet=AsyncMock()),
    )


@pytest.mark.integration
@pytest.mark.asyncio
class TestOfficialDomainDetection:
    @pytest.mark.parametrize("query,expected_domain,results", EASY_OFFICIAL_CASES)
    async def test_easy_product_official_domain_detected(
        self,
        query: str,
        expected_domain: str,
        results: list[dict],
    ) -> None:
        mock_source_selector = MagicMock()
        mock_source_selector.score_snippet = create_official_vs_retailer_mock([expected_domain])
        scraper = build_scraper(results, mock_source_selector)

        result = await scraper.identify_official_url("TEST123", "TestBrand", product_name=query)

        assert result is not None
        assert expected_domain in result.lower()

    async def test_official_domain_confidence_threshold(self) -> None:
        results = EASY_OFFICIAL_CASES[1][2]
        mock_source_selector = MagicMock()

        async def low_confidence_score(url: str, snippet: str, brand: str) -> dict:
            _ = snippet, brand
            if "outwardhound.com" in url.lower():
                return {"is_official": True, "confidence_score": 0.4, "reason": "Low confidence"}
            return {"is_official": False, "confidence_score": 0.3, "reason": "Not official"}

        mock_source_selector.score_snippet = AsyncMock(side_effect=low_confidence_score)
        scraper = build_scraper(results, mock_source_selector)

        result = await scraper.identify_official_url("TEST123", "Outward Hound")

        if result:
            assert "outwardhound.com" in result.lower()


@pytest.mark.integration
@pytest.mark.asyncio
class TestRetailerDomainRejection:
    async def test_retailer_not_selected_when_official_exists(self) -> None:
        results = EASY_OFFICIAL_CASES[1][2]
        mock_source_selector = MagicMock()
        mock_source_selector.score_snippet = create_official_vs_retailer_mock(["outwardhound.com"])
        scraper = build_scraper(results, mock_source_selector)

        result = await scraper.identify_official_url("TEST123", "Outward Hound")

        assert result is not None
        assert "outwardhound.com" in result.lower()
        for retailer in ["amazon.com", "target.com", "ebay.com"]:
            assert retailer not in result.lower()

    async def test_blocked_retailer_domains_rejected(self) -> None:
        results = [
            {"url": "https://www.ebay.com/product123", "title": "Product on eBay", "description": "Auction", "result_type": "organic"},
            {"url": "https://www.amazon.com/product123", "title": "Product on Amazon", "description": "Buy now", "result_type": "organic"},
            {"url": "https://www.officialbrand.com/product123", "title": "Official Product", "description": "Official", "result_type": "organic"},
        ]
        mock_source_selector = MagicMock()

        async def block_retailers(url: str, snippet: str, brand: str) -> dict:
            _ = snippet, brand
            if any(blocked in url.lower() for blocked in ["ebay.com", "amazon.com"]):
                return {"is_official": False, "confidence_score": 0.0, "reason": "Blocked retailer"}
            return {"is_official": True, "confidence_score": 0.8, "reason": "Official"}

        mock_source_selector.score_snippet = AsyncMock(side_effect=block_retailers)
        scraper = build_scraper(results, mock_source_selector)

        result = await scraper.identify_official_url("TEST003", "TestBrand")

        if result:
            assert "amazon.com" not in result.lower()
            assert "ebay.com" not in result.lower()


@pytest.mark.integration
@pytest.mark.asyncio
class TestKnowledgeGraphResults:
    async def test_knowledge_graph_result_returned_immediately(self) -> None:
        kg_url = "https://www.testbrand.com/official"
        mock_source_selector = MagicMock()
        scraper = build_scraper(
            [
                {"url": kg_url, "title": "TestBrand Official", "description": "Official site", "result_type": "knowledge_graph"},
                {"url": "https://amazon.com/testbrand", "title": "TestBrand on Amazon", "description": "Buy now", "result_type": "organic"},
            ],
            mock_source_selector,
        )

        result = await scraper.identify_official_url("TEST123", "TestBrand")

        assert result == kg_url
        mock_source_selector.score_snippet.assert_not_called()


@pytest.mark.integration
@pytest.mark.asyncio
class TestOfficialBrandPipelineContract:
    async def test_pipeline_selects_official_over_retailer(self) -> None:
        official_url = "https://www.fourpaws.com/products/wee-wee-pads"
        retailer_url = "https://www.amazon.com/four-paws-wee-wee-pads"
        mock_source_selector = MagicMock()

        async def official_vs_retailer_score(url: str, snippet: str, brand: str) -> dict:
            _ = snippet, brand
            if "fourpaws.com" in url.lower():
                return {"is_official": True, "confidence_score": 0.95, "reason": "Official"}
            if "amazon.com" in url.lower():
                return {"is_official": False, "confidence_score": 0.8, "reason": "Retailer"}
            return {"is_official": False, "confidence_score": 0.3, "reason": "Unknown"}

        mock_source_selector.score_snippet = AsyncMock(side_effect=official_vs_retailer_score)
        scraper = build_scraper(
            [
                {"url": retailer_url, "title": "Four Paws Wee-Wee Pads - Amazon", "description": "Free shipping", "result_type": "organic"},
                {"url": official_url, "title": "Four Paws Wee-Wee Pads | Official", "description": "Official products", "result_type": "organic"},
            ],
            mock_source_selector,
        )

        result = await scraper.identify_official_url("TEST123", "Four Paws")

        assert result == official_url

    async def test_pipeline_returns_none_when_no_official(self) -> None:
        mock_source_selector = MagicMock()
        mock_source_selector.score_snippet = AsyncMock(return_value={"is_official": False, "confidence_score": 0.4, "reason": "Retailer"})
        scraper = build_scraper(
            [
                {"url": "https://www.amazon.com/product123", "title": "Product on Amazon", "description": "Buy now", "result_type": "organic"},
                {"url": "https://www.walmart.com/product123", "title": "Product at Walmart", "description": "Low prices", "result_type": "organic"},
                {"url": "https://www.ebay.com/product123", "title": "Product on eBay", "description": "Auction", "result_type": "organic"},
            ],
            mock_source_selector,
        )

        result = await scraper.identify_official_url("TEST123", "TestBrand")

        assert result is None
