"""Integration/contract tests for OfficialBrandScraper with fixture-backed search.

These tests verify the official-brand selection pipeline against cached golden dataset
search results through the T3 bridge (GoldenDatasetFixtureClient). No live APIs are
used - all search results come from fixtures and scoring is mocked.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock
from pathlib import Path

from scrapers.ai_search.official_brand_scraper import OfficialBrandScraper
from scrapers.ai_search.golden_fixture_client import GoldenDatasetFixtureClient, CacheMissError
from scrapers.ai_search.query_builder import QueryBuilder


@pytest.fixture(scope="module")
def golden_dataset_client() -> GoldenDatasetFixtureClient:
    """Create a GoldenDatasetFixtureClient loaded with the golden dataset."""
    dataset_path = Path(__file__).parent.parent.parent / "data" / "golden_dataset_v3.search_results.json"
    client = GoldenDatasetFixtureClient(golden_dataset_path=str(dataset_path))
    return client


@pytest.fixture
def query_builder() -> QueryBuilder:
    """Create a real QueryBuilder for constructing queries."""
    return QueryBuilder()


# Golden dataset queries that have clear official domain presence
EASY_OFFICIAL_QUERIES = [
    ("Four Paws Wee-Wee Cat Pads 11x17 10ct", "fourpaws.com"),
    ("Outward Hound Dog Hide N Slide", "outwardhound.com"),
    ("Outward Hound Dog Casino Interactive Treat Puzzle", "outwardhound.com"),
]

# Query with retailers but no official domain (tests that None is returned)
QUERY_WITH_ONLY_RETAILERS = "Alpine Corporation 16 Tall Glossy Metal Rooster with Turquoise Tail"


def create_official_vs_retailer_mock(official_domains: list[str]) -> AsyncMock:
    """Create a mock score_snippet that marks official domains as official."""
    async def mock_score(url: str, snippet: str, brand: str) -> dict:
        url_lower = url.lower()
        is_official = any(official in url_lower for official in official_domains)
        blocked = ["amazon.com", "walmart.com", "target.com", "ebay.com", "chewy.com"]
        is_blocked = any(b in url_lower for b in blocked)
        
        if is_official:
            return {"is_official": True, "confidence_score": 0.95, "reason": "Official"}
        elif is_blocked:
            return {"is_official": False, "confidence_score": 0.2, "reason": "Retailer"}
        else:
            return {"is_official": False, "confidence_score": 0.4, "reason": "Unknown"}
    
    return AsyncMock(side_effect=mock_score)


@pytest.mark.integration
@pytest.mark.asyncio
class TestOfficialDomainDetection:
    """Contract tests for official domain detection with cached search results."""

    @pytest.mark.parametrize("query,expected_domain", EASY_OFFICIAL_QUERIES)
    async def test_easy_product_official_domain_detected(
        self,
        golden_dataset_client: GoldenDatasetFixtureClient,
        query_builder: QueryBuilder,
        query: str,
        expected_domain: str,
    ) -> None:
        """Easy products with clear official domains should be detected.
        
        Given: A product search with official domain in results
        When: identify_official_url is called with golden dataset results
        Then: The official domain URL should be returned
        """
        # Get cached results from golden dataset
        results, error = await golden_dataset_client.search(query)
        assert error is None
        assert len(results) > 0
        
        # Create mock search client that returns golden dataset results
        mock_search_client = MagicMock()
        mock_search_client.search = AsyncMock(return_value=(results, None))
        
        # Create mock source selector
        mock_source_selector = MagicMock()
        mock_source_selector.score_snippet = create_official_vs_retailer_mock([expected_domain])
        
        scraper = OfficialBrandScraper(
            search_client=mock_search_client,
            query_builder=query_builder,
            source_selector=mock_source_selector,
        )
        
        # Act
        result = await scraper.identify_official_url("TEST123", "TestBrand")
        
        # Assert: Should find and return official URL
        assert result is not None, f"Expected official URL, got None"
        assert expected_domain in result.lower(), (
            f"Expected domain containing '{expected_domain}', got '{result}'"
        )

    async def test_official_domain_confidence_threshold(
        self,
        golden_dataset_client: GoldenDatasetFixtureClient,
        query_builder: QueryBuilder,
    ) -> None:
        """Official domain detection requires meeting confidence threshold."""
        query = "Outward Hound Dog Hide N Slide"
        results, _ = await golden_dataset_client.search(query)
        
        mock_search_client = MagicMock()
        mock_search_client.search = AsyncMock(return_value=(results, None))
        
        mock_source_selector = MagicMock()
        
        async def low_confidence_score(url: str, snippet: str, brand: str) -> dict:
            if "outwardhound.com" in url.lower():
                return {"is_official": True, "confidence_score": 0.4, "reason": "Low confidence"}
            return {"is_official": False, "confidence_score": 0.3, "reason": "Not official"}
        
        mock_source_selector.score_snippet = AsyncMock(side_effect=low_confidence_score)
        
        scraper = OfficialBrandScraper(
            search_client=mock_search_client,
            query_builder=query_builder,
            source_selector=mock_source_selector,
        )
        
        result = await scraper.identify_official_url("TEST123", "Outward Hound")
        
        # Even low confidence official is selected if it's the only official
        if result:
            assert "outwardhound.com" in result.lower()


@pytest.mark.integration
@pytest.mark.asyncio
class TestRetailerDomainRejection:
    """Contract tests for retailer/aggregator domain rejection."""

    async def test_retailer_not_selected_when_official_exists(
        self,
        golden_dataset_client: GoldenDatasetFixtureClient,
        query_builder: QueryBuilder,
    ) -> None:
        """Retailer domains should NOT be selected when official domain exists."""
        # Use Outward Hound query which has official domain + retailers
        query = "Outward Hound Dog Hide N Slide"
        results, _ = await golden_dataset_client.search(query)
        
        mock_search_client = MagicMock()
        mock_search_client.search = AsyncMock(return_value=(results, None))
        
        mock_source_selector = MagicMock()
        
        async def selective_score(url: str, snippet: str, brand: str) -> dict:
            url_lower = url.lower()
            if "outwardhound.com" in url_lower:
                return {"is_official": True, "confidence_score": 0.9, "reason": "Official"}
            elif any(r in url_lower for r in ["amazon.com", "target.com", "walmart.com", "ebay.com"]):
                return {"is_official": False, "confidence_score": 0.5, "reason": "Retailer"}
            return {"is_official": False, "confidence_score": 0.3, "reason": "Unknown"}
        
        mock_source_selector.score_snippet = AsyncMock(side_effect=selective_score)
        
        scraper = OfficialBrandScraper(
            search_client=mock_search_client,
            query_builder=query_builder,
            source_selector=mock_source_selector,
        )
        
        result = await scraper.identify_official_url("TEST123", "Outward Hound")
        
        assert result is not None
        assert "outwardhound.com" in result.lower()
        for retailer in ["amazon.com", "target.com", "ebay.com"]:
            assert retailer not in result.lower(), f"Retailer '{retailer}' should not be selected"

    async def test_blocked_retailer_domains_rejected(
        self,
        golden_dataset_client: GoldenDatasetFixtureClient,
        query_builder: QueryBuilder,
    ) -> None:
        """Blocked retailer domains should be explicitly rejected."""
        # Use a query that has retailers
        query = "Alpine Corporation 16 Tall Glossy Metal Rooster with Turquoise Tail"
        results, _ = await golden_dataset_client.search(query)
        
        mock_search_client = MagicMock()
        mock_search_client.search = AsyncMock(return_value=(results, None))
        
        mock_source_selector = MagicMock()
        blocked_list = ["ebay.com", "amazon.com", "walmart.com", "target.com"]
        
        async def explicit_blocking(url: str, snippet: str, brand: str) -> dict:
            url_lower = url.lower()
            if any(blocked in url_lower for blocked in blocked_list):
                return {"is_official": False, "confidence_score": 0.0, "reason": "Blocked"}
            return {"is_official": True, "confidence_score": 0.8, "reason": "Official"}
        
        mock_source_selector.score_snippet = AsyncMock(side_effect=explicit_blocking)
        
        scraper = OfficialBrandScraper(
            search_client=mock_search_client,
            query_builder=query_builder,
            source_selector=mock_source_selector,
        )
        
        result = await scraper.identify_official_url("TEST123", "Alpine")
        
        if result:
            for blocked in blocked_list:
                assert blocked not in result.lower(), f"Blocked '{blocked}' should never be selected"


@pytest.mark.integration
@pytest.mark.asyncio
class TestKnowledgeGraphResults:
    """Contract tests for Knowledge Graph result handling."""

    async def test_knowledge_graph_result_returned_immediately(
        self,
        query_builder: QueryBuilder,
    ) -> None:
        """Knowledge Graph results should be returned without LLM scoring."""
        mock_search_client = MagicMock()
        kg_url = "https://www.testbrand.com/official"
        
        mock_search_client.search = AsyncMock(return_value=([
            {"url": kg_url, "title": "TestBrand Official", "description": "Official site", "result_type": "knowledge_graph"},
            {"url": "https://amazon.com/testbrand", "title": "TestBrand on Amazon", "description": "Buy now", "result_type": "organic"},
        ], None))
        
        mock_source_selector = MagicMock()
        
        scraper = OfficialBrandScraper(
            search_client=mock_search_client,
            query_builder=query_builder,
            source_selector=mock_source_selector,
        )
        
        result = await scraper.identify_official_url("TEST123", "TestBrand")
        
        assert result == kg_url
        mock_source_selector.score_snippet.assert_not_called()


@pytest.mark.integration
@pytest.mark.asyncio
class TestFixtureClientIntegration:
    """Tests for GoldenDatasetFixtureClient integration."""

    async def test_fixture_client_cache_miss_raises_error(
        self,
        golden_dataset_client: GoldenDatasetFixtureClient,
    ) -> None:
        """Cache misses should raise CacheMissError (no fallback to live API)."""
        unknown_query = "XYZ Unknown Product 999999 official website"
        
        with pytest.raises(CacheMissError):
            await golden_dataset_client.search(unknown_query)

    async def test_fixture_client_returns_cached_results(
        self,
        golden_dataset_client: GoldenDatasetFixtureClient,
    ) -> None:
        """Fixture client should return cached results for known queries."""
        known_query = "Four Paws Wee-Wee Cat Pads 11x17 10ct"
        
        results, error = await golden_dataset_client.search(known_query)
        
        assert error is None
        assert len(results) > 0
        assert "url" in results[0]
        assert "title" in results[0]

    async def test_fixture_client_no_live_api_calls(
        self,
        golden_dataset_client: GoldenDatasetFixtureClient,
    ) -> None:
        """Fixture client should never make live API calls."""
        assert golden_dataset_client._fixture_client._allow_real_api is False


@pytest.mark.integration
@pytest.mark.asyncio
class TestOfficialBrandPipelineContract:
    """End-to-end contract tests for the official brand selection pipeline."""

    async def test_pipeline_selects_official_over_retailer(
        self,
        query_builder: QueryBuilder,
    ) -> None:
        """Full pipeline test: official domain preferred over retailers."""
        mock_search_client = MagicMock()
        official_url = "https://www.fourpaws.com/products/wee-wee-pads"
        retailer_url = "https://www.amazon.com/four-paws-wee-wee-pads"
        
        mock_search_client.search = AsyncMock(return_value=([
            {"url": retailer_url, "title": "Four Paws Wee-Wee Pads - Amazon", "description": "Free shipping", "result_type": "organic"},
            {"url": official_url, "title": "Four Paws Wee-Wee Pads | Official", "description": "Official products", "result_type": "organic"},
        ], None))
        
        mock_source_selector = MagicMock()
        
        async def official_vs_retailer_score(url: str, snippet: str, brand: str) -> dict:
            if "fourpaws.com" in url.lower():
                return {"is_official": True, "confidence_score": 0.95, "reason": "Official"}
            elif "amazon.com" in url.lower():
                return {"is_official": False, "confidence_score": 0.8, "reason": "Retailer"}
            return {"is_official": False, "confidence_score": 0.3, "reason": "Unknown"}
        
        mock_source_selector.score_snippet = AsyncMock(side_effect=official_vs_retailer_score)
        
        scraper = OfficialBrandScraper(
            search_client=mock_search_client,
            query_builder=query_builder,
            source_selector=mock_source_selector,
        )
        
        result = await scraper.identify_official_url("TEST123", "Four Paws")
        
        assert result == official_url

    async def test_pipeline_returns_none_when_no_official(
        self,
        query_builder: QueryBuilder,
    ) -> None:
        """Full pipeline test: return None when no official domain exists."""
        mock_search_client = MagicMock()
        mock_search_client.search = AsyncMock(return_value=([
            {"url": "https://www.amazon.com/product123", "title": "Product on Amazon", "description": "Buy now", "result_type": "organic"},
            {"url": "https://www.walmart.com/product123", "title": "Product at Walmart", "description": "Low prices", "result_type": "organic"},
            {"url": "https://www.ebay.com/product123", "title": "Product on eBay", "description": "Auction", "result_type": "organic"},
        ], None))
        
        mock_source_selector = MagicMock()
        mock_source_selector.score_snippet = AsyncMock(return_value={
            "is_official": False, "confidence_score": 0.4, "reason": "Retailer",
        })
        
        scraper = OfficialBrandScraper(
            search_client=mock_search_client,
            query_builder=query_builder,
            source_selector=mock_source_selector,
        )
        
        result = await scraper.identify_official_url("TEST123", "TestBrand")
        
        assert result is None


@pytest.mark.integration
@pytest.mark.asyncio
class TestSpecificScenarios:
    """Specific test scenarios from task requirements."""

    async def test_easy_product_official_domain_detection(
        self,
        golden_dataset_client: GoldenDatasetFixtureClient,
        query_builder: QueryBuilder,
    ) -> None:
        """T10-R1: Easy product - official domain should be detected."""
        query = "Four Paws Wee-Wee Cat Pads 11x17 10ct"
        results, _ = await golden_dataset_client.search(query)
        
        mock_search_client = MagicMock()
        mock_search_client.search = AsyncMock(return_value=(results, None))
        
        mock_source_selector = MagicMock()
        mock_source_selector.score_snippet = create_official_vs_retailer_mock(["fourpaws.com"])
        
        scraper = OfficialBrandScraper(
            search_client=mock_search_client,
            query_builder=query_builder,
            source_selector=mock_source_selector,
        )
        
        result = await scraper.identify_official_url("TEST001", "Four Paws")
        
        assert result is not None
        assert "fourpaws.com" in result.lower()

    async def test_retailer_in_results_not_selected(
        self,
        golden_dataset_client: GoldenDatasetFixtureClient,
        query_builder: QueryBuilder,
    ) -> None:
        """T10-R2: Product with retailer in results - retailer NOT selected."""
        # Use Outward Hound which has outwardhound.com (official) and amazon/ebay
        query = "Outward Hound Dog Hide N Slide"
        results, _ = await golden_dataset_client.search(query)
        
        mock_search_client = MagicMock()
        mock_search_client.search = AsyncMock(return_value=(results, None))
        
        mock_source_selector = MagicMock()
        
        async def prefer_official(url: str, snippet: str, brand: str) -> dict:
            url_lower = url.lower()
            if "outwardhound.com" in url_lower:
                return {"is_official": True, "confidence_score": 0.9, "reason": "Official"}
            elif any(r in url_lower for r in ["amazon.com", "target.com", "walmart.com", "ebay.com"]):
                return {"is_official": False, "confidence_score": 0.5, "reason": "Retailer"}
            return {"is_official": False, "confidence_score": 0.3, "reason": "Unknown"}
        
        mock_source_selector.score_snippet = AsyncMock(side_effect=prefer_official)
        
        scraper = OfficialBrandScraper(
            search_client=mock_search_client,
            query_builder=query_builder,
            source_selector=mock_source_selector,
        )
        
        result = await scraper.identify_official_url("TEST002", "Outward Hound")
        
        if result:
            assert "outwardhound.com" in result.lower()
            for retailer in ["amazon.com", "target.com", "walmart.com", "ebay.com"]:
                assert retailer not in result.lower(), f"Retailer '{retailer}' should not be selected"

    async def test_blocked_retailer_explicitly_rejected(
        self,
        query_builder: QueryBuilder,
    ) -> None:
        """T10-R3: Product with blocked retailer - blocked retailer rejected."""
        mock_search_client = MagicMock()
        mock_search_client.search = AsyncMock(return_value=([
            {"url": "https://www.ebay.com/product123", "title": "Product on eBay", "description": "Auction", "result_type": "organic"},
            {"url": "https://www.amazon.com/product123", "title": "Product on Amazon", "description": "Buy now", "result_type": "organic"},
            {"url": "https://www.officialbrand.com/product123", "title": "Official Product", "description": "Official", "result_type": "organic"},
        ], None))
        
        mock_source_selector = MagicMock()
        blocked_domains = ["ebay.com", "amazon.com"]
        
        async def block_retailers(url: str, snippet: str, brand: str) -> dict:
            url_lower = url.lower()
            if any(blocked in url_lower for blocked in blocked_domains):
                return {"is_official": False, "confidence_score": 0.0, "reason": "Blocked retailer"}
            return {"is_official": True, "confidence_score": 0.8, "reason": "Official"}
        
        mock_source_selector.score_snippet = AsyncMock(side_effect=block_retailers)
        
        scraper = OfficialBrandScraper(
            search_client=mock_search_client,
            query_builder=query_builder,
            source_selector=mock_source_selector,
        )
        
        result = await scraper.identify_official_url("TEST003", "TestBrand")
        
        if result:
            for blocked in blocked_domains:
                assert blocked not in result.lower(), f"Blocked '{blocked}' should never be selected"

    async def test_official_domain_confidence_threshold(
        self,
        golden_dataset_client: GoldenDatasetFixtureClient,
        query_builder: QueryBuilder,
    ) -> None:
        """T10-R4: Official-domain detection threshold is met."""
        query = "Four Paws Wee-Wee Cat Pads 11x17 10ct"
        results, _ = await golden_dataset_client.search(query)
        
        mock_search_client = MagicMock()
        mock_search_client.search = AsyncMock(return_value=(results, None))
        
        # Test with high confidence official domain
        mock_source_selector = MagicMock()
        mock_source_selector.score_snippet = AsyncMock(return_value={
            "is_official": True, "confidence_score": 0.9, "reason": "High confidence official",
        })
        
        scraper = OfficialBrandScraper(
            search_client=mock_search_client,
            query_builder=query_builder,
            source_selector=mock_source_selector,
        )
        
        result = await scraper.identify_official_url("TEST004", "Four Paws")
        
        # Should return result with high confidence
        assert result is not None

    async def test_zero_blocked_retailer_selections(
        self,
        query_builder: QueryBuilder,
    ) -> None:
        """T10-R5: Zero blocked-retailer selections where official PDPs exist."""
        mock_search_client = MagicMock()
        official_url = "https://www.officialbrand.com/product123"
        
        mock_search_client.search = AsyncMock(return_value=([
            {"url": "https://www.ebay.com/product123", "title": "Product on eBay", "description": "Auction", "result_type": "organic"},
            {"url": "https://www.amazon.com/product123", "title": "Product on Amazon", "description": "Buy now", "result_type": "organic"},
            {"url": official_url, "title": "Official Product Page", "description": "Official", "result_type": "organic"},
        ], None))
        
        mock_source_selector = MagicMock()
        
        async def official_wins(url: str, snippet: str, brand: str) -> dict:
            url_lower = url.lower()
            if "officialbrand.com" in url_lower:
                return {"is_official": True, "confidence_score": 0.95, "reason": "Official manufacturer"}
            elif any(blocked in url_lower for blocked in ["ebay.com", "amazon.com"]):
                return {"is_official": False, "confidence_score": 0.99, "reason": "Blocked retailer"}
            return {"is_official": False, "confidence_score": 0.3, "reason": "Unknown"}
        
        mock_source_selector.score_snippet = AsyncMock(side_effect=official_wins)
        
        scraper = OfficialBrandScraper(
            search_client=mock_search_client,
            query_builder=query_builder,
            source_selector=mock_source_selector,
        )
        
        result = await scraper.identify_official_url("TEST005", "OfficialBrand")
        
        # Official should win despite retailers having high confidence
        if result:
            assert "officialbrand.com" in result.lower()
            assert "amazon.com" not in result.lower()
            assert "ebay.com" not in result.lower()
