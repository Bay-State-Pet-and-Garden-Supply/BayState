"""Unit tests for OfficialBrandScraper extract_data method with fallback scenarios.

These tests mock the Crawl4AIEngine boundary to avoid launching Playwright/crawl4ai browsers.
All tests verify no real network calls or browser launches occur.
"""

from __future__ import annotations

import json
import os
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from scrapers.ai_search.official_brand_scraper import OfficialBrandScraper


@pytest.fixture
def scraper() -> OfficialBrandScraper:
    """Create a scraper with mocked search client."""
    with patch("scrapers.ai_search.official_brand_scraper.SearchClient"):
        with patch("scrapers.ai_search.official_brand_scraper.BrandSourceSelector"):
            return OfficialBrandScraper(
                llm_provider="openai",
                llm_model="gpt-4o-mini",
                llm_api_key="test-key",
            )


@pytest.fixture
def temp_schema_file() -> str:
    """Create a temporary JSON CSS schema file."""
    schema = {
        "name": "Test Product Schema",
        "baseSelector": "div.product",
        "fields": [
            {"name": "name", "selector": "h1.title", "type": "text"},
            {"name": "price", "selector": "span.price", "type": "text"},
        ],
    }
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(schema, f)
        path = f.name
    yield path
    os.unlink(path)


class TestExtractDataJsonCssSuccess:
    """Tests for JSON CSS extraction success path."""

    @pytest.mark.asyncio
    async def test_json_css_extraction_succeeds_returns_json_css_method(
        self, scraper: OfficialBrandScraper, temp_schema_file: str
    ) -> None:
        """When JSON CSS extraction succeeds, method metadata should be 'json_css'."""
        # Arrange: Mock Crawl4AIEngine to return successful CSS extraction
        mock_engine = AsyncMock()
        mock_engine.crawl = AsyncMock(
            return_value={
                "success": True,
                "extracted_content": {"name": "Test Product", "price": "$19.99"},
            }
        )
        mock_engine.config = {}

        with patch(
            "scrapers.ai_search.official_brand_scraper.Crawl4AIEngine",
            return_value=mock_engine,
        ):
            with patch.object(mock_engine, "__aenter__", return_value=mock_engine):
                with patch.object(mock_engine, "__aexit__", return_value=None):
                    # Act
                    result = await scraper.extract_data(
                        url="https://example.com/product",
                        schema_path=temp_schema_file,
                    )

        # Assert
        assert result["success"] is True
        assert result["method"] == "json_css"
        assert result["data"]["name"] == "Test Product"
        assert result["data"]["price"] == "$19.99"


class TestExtractDataJsonCssFallback:
    """Tests for JSON CSS failure falling back to LLM extraction."""

    @pytest.mark.asyncio
    async def test_json_css_fails_falls_back_to_llm_extraction(
        self, scraper: OfficialBrandScraper, temp_schema_file: str
    ) -> None:
        """When JSON CSS fails, should fall back to LLM extraction."""
        # Arrange: Create mock engine that fails CSS then succeeds with LLM
        mock_engine = AsyncMock()
        # First call (CSS) fails, second call (LLM) succeeds
        mock_engine.crawl = AsyncMock(
            side_effect=[
                {"success": False, "error": "CSS extraction failed"},
                {
                    "success": True,
                    "extracted_content": '{"name": "LLM Product", "price": "$29.99"}',
                },
            ]
        )
        mock_engine.config = {}

        with patch(
            "scrapers.ai_search.official_brand_scraper.Crawl4AIEngine",
            return_value=mock_engine,
        ):
            with patch.object(mock_engine, "__aenter__", return_value=mock_engine):
                with patch.object(mock_engine, "__aexit__", return_value=None):
                    # Act
                    result = await scraper.extract_data(
                        url="https://example.com/product",
                        schema_path=temp_schema_file,
                    )

        # Assert
        assert result["success"] is True
        assert result["method"] == "llm"
        assert result["data"]["name"] == "LLM Product"
        assert result["data"]["price"] == "$29.99"
        # Verify crawl was called twice (CSS attempt + LLM fallback)
        assert mock_engine.crawl.call_count == 2


class TestExtractDataSchemaMissing:
    """Tests for when schema file is missing or not provided."""

    @pytest.mark.asyncio
    async def test_css_skipped_when_schema_missing_goes_directly_to_llm(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When schema_path is None, should skip CSS and go directly to LLM."""
        # Arrange: Mock engine that succeeds with LLM
        mock_engine = AsyncMock()
        mock_engine.crawl = AsyncMock(
            return_value={
                "success": True,
                "extracted_content": '{"name": "Direct LLM Product", "price": "$39.99"}',
            }
        )
        mock_engine.config = {}

        with patch(
            "scrapers.ai_search.official_brand_scraper.Crawl4AIEngine",
            return_value=mock_engine,
        ):
            with patch.object(mock_engine, "__aenter__", return_value=mock_engine):
                with patch.object(mock_engine, "__aexit__", return_value=None):
                    # Act
                    result = await scraper.extract_data(
                        url="https://example.com/product",
                        schema_path=None,
                    )

        # Assert
        assert result["success"] is True
        assert result["method"] == "llm"
        # Verify crawl was called only once (LLM only, no CSS attempt)
        assert mock_engine.crawl.call_count == 1

    @pytest.mark.asyncio
    async def test_css_skipped_when_schema_file_not_exists(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When schema_path points to non-existent file, should skip CSS and go to LLM."""
        # Arrange: Mock engine that succeeds with LLM
        mock_engine = AsyncMock()
        mock_engine.crawl = AsyncMock(
            return_value={
                "success": True,
                "extracted_content": '{"name": "Nonexistent Schema Product", "price": "$49.99"}',
            }
        )
        mock_engine.config = {}

        with patch(
            "scrapers.ai_search.official_brand_scraper.Crawl4AIEngine",
            return_value=mock_engine,
        ):
            with patch.object(mock_engine, "__aenter__", return_value=mock_engine):
                with patch.object(mock_engine, "__aexit__", return_value=None):
                    # Act
                    result = await scraper.extract_data(
                        url="https://example.com/product",
                        schema_path="/nonexistent/path/schema.json",
                    )

        # Assert
        assert result["success"] is True
        assert result["method"] == "llm"
        # Verify crawl was called only once (LLM only, no CSS attempt)
        assert mock_engine.crawl.call_count == 1


class TestExtractDataBothStagesFail:
    """Tests for when both CSS and LLM extraction fail."""

    @pytest.mark.asyncio
    async def test_both_css_and_llm_fail_returns_structured_failure(
        self, scraper: OfficialBrandScraper, temp_schema_file: str
    ) -> None:
        """When both CSS and LLM extraction fail, should return structured failure."""
        # Arrange: Mock engine where both CSS and LLM fail
        mock_engine = AsyncMock()
        mock_engine.crawl = AsyncMock(
            side_effect=[
                {"success": False, "error": "CSS extraction failed"},
                {"success": False, "error": "LLM extraction failed"},
            ]
        )
        mock_engine.config = {}

        with patch(
            "scrapers.ai_search.official_brand_scraper.Crawl4AIEngine",
            return_value=mock_engine,
        ):
            with patch.object(mock_engine, "__aenter__", return_value=mock_engine):
                with patch.object(mock_engine, "__aexit__", return_value=None):
                    # Act
                    result = await scraper.extract_data(
                        url="https://example.com/product",
                        schema_path=temp_schema_file,
                    )

        # Assert
        assert result["success"] is False
        assert "error" in result
        assert result["error"] == "LLM extraction failed"
        # Verify crawl was called twice (CSS attempt + LLM attempt)
        assert mock_engine.crawl.call_count == 2


class TestExtractDataLlmReturnsList:
    """Tests for LLM returning list of objects instead of single object."""

    @pytest.mark.asyncio
    async def test_llm_returns_list_of_objects_handles_correctly(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When LLM returns a list of objects, should extract first item."""
        # Arrange: Mock engine returning list of objects
        mock_engine = AsyncMock()
        mock_engine.crawl = AsyncMock(
            return_value={
                "success": True,
                "extracted_content": '[{"name": "First Product", "price": "$10.00"}, {"name": "Second Product", "price": "$20.00"}]',
            }
        )
        mock_engine.config = {}

        with patch(
            "scrapers.ai_search.official_brand_scraper.Crawl4AIEngine",
            return_value=mock_engine,
        ):
            with patch.object(mock_engine, "__aenter__", return_value=mock_engine):
                with patch.object(mock_engine, "__aexit__", return_value=None):
                    # Act
                    result = await scraper.extract_data(
                        url="https://example.com/product",
                        schema_path=None,
                    )

        # Assert
        assert result["success"] is True
        assert result["method"] == "llm"
        # Should extract first item from list
        assert result["data"]["name"] == "First Product"
        assert result["data"]["price"] == "$10.00"

    @pytest.mark.asyncio
    async def test_llm_returns_empty_list_returns_empty_list_as_data(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When LLM returns an empty list, should return it as valid data."""
        # Arrange: Mock engine returning empty list
        mock_engine = AsyncMock()
        mock_engine.crawl = AsyncMock(
            return_value={
                "success": True,
                "extracted_content": "[]",
            }
        )
        mock_engine.config = {}

        with patch(
            "scrapers.ai_search.official_brand_scraper.Crawl4AIEngine",
            return_value=mock_engine,
        ):
            with patch.object(mock_engine, "__aenter__", return_value=mock_engine):
                with patch.object(mock_engine, "__aexit__", return_value=None):
                    # Act
                    result = await scraper.extract_data(
                        url="https://example.com/product",
                        schema_path=None,
                    )

        # Assert: Empty list is valid (no extraction occurs, but success=True)
        assert result["success"] is True
        assert result["data"] == []
        assert result["method"] == "llm"


class TestExtractDataStringifiedJson:
    """Tests for stringified JSON content handling."""

    @pytest.mark.asyncio
    async def test_css_returns_stringified_json_parses_correctly(
        self, scraper: OfficialBrandScraper, temp_schema_file: str
    ) -> None:
        """When CSS returns stringified JSON, should parse it correctly."""
        # Arrange: Mock engine returning stringified JSON from CSS
        mock_engine = AsyncMock()
        mock_engine.crawl = AsyncMock(
            return_value={
                "success": True,
                "extracted_content": '{"name": "Stringified CSS Product", "price": "$15.99"}',
            }
        )
        mock_engine.config = {}

        with patch(
            "scrapers.ai_search.official_brand_scraper.Crawl4AIEngine",
            return_value=mock_engine,
        ):
            with patch.object(mock_engine, "__aenter__", return_value=mock_engine):
                with patch.object(mock_engine, "__aexit__", return_value=None):
                    # Act
                    result = await scraper.extract_data(
                        url="https://example.com/product",
                        schema_path=temp_schema_file,
                    )

        # Assert
        assert result["success"] is True
        assert result["method"] == "json_css"
        assert result["data"]["name"] == "Stringified CSS Product"
        assert result["data"]["price"] == "$15.99"

    @pytest.mark.asyncio
    async def test_css_returns_invalid_stringified_json_returns_raw_content(
        self, scraper: OfficialBrandScraper, temp_schema_file: str
    ) -> None:
        """When CSS returns invalid stringified JSON, should return raw content unchanged."""
        # Arrange: Mock engine returning invalid JSON string
        mock_engine = AsyncMock()
        mock_engine.crawl = AsyncMock(
            return_value={
                "success": True,
                "extracted_content": "This is not valid JSON",
            }
        )
        mock_engine.config = {}

        with patch(
            "scrapers.ai_search.official_brand_scraper.Crawl4AIEngine",
            return_value=mock_engine,
        ):
            with patch.object(mock_engine, "__aenter__", return_value=mock_engine):
                with patch.object(mock_engine, "__aexit__", return_value=None):
                    # Act
                    result = await scraper.extract_data(
                        url="https://example.com/product",
                        schema_path=temp_schema_file,
                    )

        # Assert
        assert result["success"] is True
        assert result["method"] == "json_css"
        # Should return raw string when JSON parsing fails
        assert result["data"] == "This is not valid JSON"


class TestExtractDataNoBrowserLaunches:
    """Tests to verify no browser or network calls are made."""

    @pytest.mark.asyncio
    async def test_no_playwright_browser_launched(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """Verify no Playwright browser is launched during extraction."""
        mock_engine = AsyncMock()
        mock_engine.crawl = AsyncMock(
            return_value={
                "success": True,
                "extracted_content": '{"name": "Mock Product"}',
            }
        )
        mock_engine.config = {}

        with patch(
            "scrapers.ai_search.official_brand_scraper.Crawl4AIEngine",
            return_value=mock_engine,
        ) as mock_engine_class:
            with patch.object(mock_engine, "__aenter__", return_value=mock_engine):
                with patch.object(mock_engine, "__aexit__", return_value=None):
                    await scraper.extract_data(
                        url="https://example.com/product",
                        schema_path=None,
                    )

        # Verify Crawl4AIEngine was instantiated but no real browser launched
        assert mock_engine_class.called
        # The mock handles all calls, no real browser should be launched

    @pytest.mark.asyncio
    async def test_no_llm_api_calls_made(self, scraper: OfficialBrandScraper) -> None:
        """Verify no real LLM API calls are made during extraction."""
        mock_engine = AsyncMock()
        mock_engine.crawl = AsyncMock(
            return_value={
                "success": True,
                "extracted_content": '{"name": "Mock Product"}',
            }
        )
        mock_engine.config = {}

        # Patch any potential LLM client creation
        with patch(
            "scrapers.ai_search.official_brand_scraper.Crawl4AIEngine",
            return_value=mock_engine,
        ):
            with patch.object(mock_engine, "__aenter__", return_value=mock_engine):
                with patch.object(mock_engine, "__aexit__", return_value=None):
                    with patch(
                        "scrapers.ai_search.official_brand_scraper.resolve_llm_runtime"
                    ) as mock_resolve:
                        # Setup mock LLM runtime
                        mock_runtime = MagicMock()
                        mock_runtime.api_key = "test-key"
                        mock_runtime.model = "gpt-4o-mini"
                        mock_runtime.crawl4ai_provider = "openai/gpt-4o-mini"
                        mock_resolve.return_value = mock_runtime

                        await scraper.extract_data(
                            url="https://example.com/product",
                            schema_path=None,
                        )

        # Verify extraction used mocked engine, not real LLM
        assert mock_engine.crawl.called


# =============================================================================
# identify_official_url Branch Tests
# =============================================================================


@pytest.fixture
def mock_search_client() -> MagicMock:
    """Create a mock search client."""
    return MagicMock()


@pytest.fixture
def mock_query_builder() -> MagicMock:
    """Create a mock query builder."""
    mock = MagicMock()
    mock.build_brand_focused_query.return_value = "test brand 123 official website"
    return mock


@pytest.fixture
def mock_source_selector() -> MagicMock:
    """Create a mock brand source selector."""
    return MagicMock()


@pytest.fixture
def scraper_for_identify(
    mock_search_client: MagicMock,
    mock_query_builder: MagicMock,
    mock_source_selector: MagicMock,
) -> OfficialBrandScraper:
    """Create an OfficialBrandScraper with mocked dependencies for identify_official_url tests."""
    return OfficialBrandScraper(
        search_client=mock_search_client,
        query_builder=mock_query_builder,
        source_selector=mock_source_selector,
    )


class TestIdentifyOfficialUrlSearchError:
    """Test branch: Search error → returns None."""

    @pytest.mark.asyncio
    async def test_search_error_returns_none(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
    ) -> None:
        """When search returns an error, identify_official_url should return None."""
        # Arrange: Mock search to return error
        mock_search_client.search = AsyncMock(return_value=([], "Connection timeout"))

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert
        assert result is None
        mock_search_client.search.assert_called_once()

    @pytest.mark.asyncio
    async def test_search_error_with_various_error_messages(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
    ) -> None:
        """Search errors with different messages should all return None."""
        error_messages = [
            "Connection timeout",
            "Rate limit exceeded",
            "API key invalid",
            "Network unreachable",
            "HTTP 500",
        ]

        for error_msg in error_messages:
            mock_search_client.search = AsyncMock(return_value=([], error_msg))

            result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

            assert result is None, f"Expected None for error: {error_msg}"


class TestIdentifyOfficialUrlEmptyResults:
    """Test branch: Empty results → returns None."""

    @pytest.mark.asyncio
    async def test_empty_results_returns_none(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
    ) -> None:
        """When search returns empty results, identify_official_url should return None."""
        # Arrange: Mock search to return empty results with no error
        mock_search_client.search = AsyncMock(return_value=([], None))

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert
        assert result is None
        mock_search_client.search.assert_called_once()

    @pytest.mark.asyncio
    async def test_empty_url_results_filtered(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
        mock_source_selector: MagicMock,
    ) -> None:
        """Results with empty or None URLs should be skipped during scoring."""
        # Arrange: Mock search to return results with no valid URLs
        mock_search_client.search = AsyncMock(return_value=(
            [
                {"url": "", "title": "Empty URL"},
                {"url": None, "title": "None URL"},
            ],
            None,
        ))

        mock_source_selector.score_snippet = AsyncMock(return_value={
            "is_official": True,
            "confidence_score": 0.9,
            "reason": "Official",
        })

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert: Should return None since no URLs to score (empty/None are skipped)
        assert result is None
        # score_snippet should not be called since all URLs are empty/None
        mock_source_selector.score_snippet.assert_not_called()


class TestIdentifyOfficialUrlKnowledgeGraph:
    """Test branch: Knowledge Graph URL selection → returns KG URL."""

    @pytest.mark.asyncio
    async def test_knowledge_graph_result_returned_immediately(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
    ) -> None:
        """When Knowledge Graph result exists, it should be returned immediately."""
        # Arrange: Mock search with Knowledge Graph result
        kg_url = "https://www.testbrand.com"
        mock_search_client.search = AsyncMock(return_value=([
            {
                "url": kg_url,
                "title": "TestBrand Official",
                "description": "Official TestBrand website",
                "provider": "google",
                "result_type": "knowledge_graph",
            },
            {
                "url": "https://www.amazon.com/testbrand",
                "title": "TestBrand on Amazon",
                "description": "Buy TestBrand products",
                "provider": "google",
                "result_type": "organic",
            },
        ], None))

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert
        assert result == kg_url

    @pytest.mark.asyncio
    async def test_knowledge_graph_among_organic_results(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
    ) -> None:
        """KG result mixed with organic results should be found and returned."""
        # Arrange: Knowledge Graph is not first in results
        kg_url = "https://official.testbrand.com"
        mock_search_client.search = AsyncMock(return_value=([
            {
                "url": "https://retailer1.com/testbrand",
                "title": "TestBrand at Retailer1",
                "description": "Shop now",
                "result_type": "organic",
            },
            {
                "url": kg_url,
                "title": "TestBrand Company",
                "description": "Official website",
                "result_type": "knowledge_graph",
            },
            {
                "url": "https://retailer2.com/testbrand",
                "title": "TestBrand at Retailer2",
                "description": "Great prices",
                "result_type": "organic",
            },
        ], None))

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert
        assert result == kg_url

    @pytest.mark.asyncio
    async def test_knowledge_graph_with_empty_url_skipped(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
        mock_source_selector: MagicMock,
    ) -> None:
        """KG result with empty URL should be skipped, fallback to organic."""
        # Arrange: KG with empty URL, followed by organic results
        official_url = "https://official.testbrand.com"
        mock_search_client.search = AsyncMock(return_value=([
            {
                "url": "",
                "title": "TestBrand Knowledge Graph",
                "description": "Official",
                "result_type": "knowledge_graph",
            },
            {
                "url": official_url,
                "title": "TestBrand Official Site",
                "description": "Official products",
                "result_type": "organic",
            },
        ], None))

        # Mock source selector to mark organic result as official
        mock_source_selector.score_snippet = AsyncMock(return_value={
            "is_official": True,
            "confidence_score": 0.95,
            "reason": "Brand domain match",
        })

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert
        assert result == official_url


class TestIdentifyOfficialUrlScoredOrganicResults:
    """Test branch: Scored organic result selection → returns highest scored official URL."""

    @pytest.mark.asyncio
    async def test_highest_confidence_official_url_selected(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
        mock_source_selector: MagicMock,
    ) -> None:
        """When multiple official URLs found, highest confidence should be selected."""
        # Arrange
        mock_search_client.search = AsyncMock(return_value=([
            {
                "url": "https://low-confidence.testbrand.com",
                "title": "TestBrand Products",
                "description": "Product catalog",
                "result_type": "organic",
            },
            {
                "url": "https://high-confidence.testbrand.com",
                "title": "TestBrand Official Store",
                "description": "Official website",
                "result_type": "organic",
            },
            {
                "url": "https://medium-confidence.testbrand.com",
                "title": "TestBrand Info",
                "description": "About TestBrand",
                "result_type": "organic",
            },
        ], None))

        # Mock source selector to return different confidence scores
        async def mock_score_snippet(url: str, snippet: str, brand: str) -> dict:
            scores = {
                "https://low-confidence.testbrand.com": {
                    "is_official": True,
                    "confidence_score": 0.6,
                    "reason": "Brand match",
                },
                "https://high-confidence.testbrand.com": {
                    "is_official": True,
                    "confidence_score": 0.95,
                    "reason": "Official domain",
                },
                "https://medium-confidence.testbrand.com": {
                    "is_official": True,
                    "confidence_score": 0.75,
                    "reason": "Brand reference",
                },
            }
            return scores.get(url, {"is_official": False, "confidence_score": 0.0, "reason": "Unknown"})

        mock_source_selector.score_snippet = AsyncMock(side_effect=mock_score_snippet)

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert: Should select highest confidence official URL
        assert result == "https://high-confidence.testbrand.com"

    @pytest.mark.asyncio
    async def test_only_official_results_considered(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
        mock_source_selector: MagicMock,
    ) -> None:
        """Non-official results should not be selected even if higher confidence."""
        # Arrange
        official_url = "https://official.testbrand.com"
        mock_search_client.search = AsyncMock(return_value=([
            {
                "url": "https://amazon.com/testbrand",
                "title": "TestBrand on Amazon",
                "description": "Great deals",
                "result_type": "organic",
            },
            {
                "url": official_url,
                "title": "TestBrand Official",
                "description": "Official site",
                "result_type": "organic",
            },
        ], None))

        # Amazon has high confidence but is not official
        async def mock_score_snippet(url: str, snippet: str, brand: str) -> dict:
            if "amazon.com" in url:
                return {
                    "is_official": False,
                    "confidence_score": 0.99,  # High confidence but not official
                    "reason": "Retailer",
                }
            return {
                "is_official": True,
                "confidence_score": 0.85,
                "reason": "Official domain",
            }

        mock_source_selector.score_snippet = AsyncMock(side_effect=mock_score_snippet)

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert: Should select official URL, not high-confidence retailer
        assert result == official_url

    @pytest.mark.asyncio
    async def test_empty_snippet_skipped_in_scoring(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
        mock_source_selector: MagicMock,
    ) -> None:
        """Results without URLs should be skipped during scoring."""
        # Arrange
        official_url = "https://official.testbrand.com"
        mock_search_client.search = AsyncMock(return_value=([
            {
                "url": None,
                "title": "No URL result",
                "description": "Missing URL",
                "result_type": "organic",
            },
            {
                "url": "",
                "title": "Empty URL result",
                "description": "Empty URL",
                "result_type": "organic",
            },
            {
                "url": official_url,
                "title": "TestBrand Official",
                "description": "Official site",
                "result_type": "organic",
            },
        ], None))

        mock_source_selector.score_snippet = AsyncMock(return_value={
            "is_official": True,
            "confidence_score": 0.9,
            "reason": "Official",
        })

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert
        assert result == official_url
        # Should only score one result (the one with URL)
        assert mock_source_selector.score_snippet.call_count == 1

    @pytest.mark.asyncio
    async def test_top_five_results_only_scored(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
        mock_source_selector: MagicMock,
    ) -> None:
        """Only top 5 results should be scored for efficiency."""
        # Arrange: Create 10 results
        results = [
            {
                "url": f"https://result{i}.testbrand.com",
                "title": f"Result {i}",
                "description": f"Description {i}",
                "result_type": "organic",
            }
            for i in range(10)
        ]
        mock_search_client.search = AsyncMock(return_value=(results, None))

        mock_source_selector.score_snippet = AsyncMock(return_value={
            "is_official": True,
            "confidence_score": 0.8,
            "reason": "Test",
        })

        # Act
        await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert: Only 5 calls to score_snippet (top 5 results)
        assert mock_source_selector.score_snippet.call_count == 5


class TestIdentifyOfficialUrlNoOfficialResult:
    """Test branch: No official result → returns None."""

    @pytest.mark.asyncio
    async def test_all_results_not_official_returns_none(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
        mock_source_selector: MagicMock,
    ) -> None:
        """When no results are official, should return None."""
        # Arrange: All results are from retailers/aggregators
        mock_search_client.search = AsyncMock(return_value=([
            {
                "url": "https://amazon.com/testbrand-product",
                "title": "TestBrand on Amazon",
                "description": "Buy now",
                "result_type": "organic",
            },
            {
                "url": "https://ebay.com/testbrand-item",
                "title": "TestBrand on eBay",
                "description": "Auction",
                "result_type": "organic",
            },
            {
                "url": "https://walmart.com/testbrand",
                "title": "TestBrand at Walmart",
                "description": "Low prices",
                "result_type": "organic",
            },
        ], None))

        # All results are not official
        mock_source_selector.score_snippet = AsyncMock(return_value={
            "is_official": False,
            "confidence_score": 0.3,
            "reason": "Retailer site",
        })

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert
        assert result is None

    @pytest.mark.asyncio
    async def test_source_selector_error_returns_none(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
        mock_source_selector: MagicMock,
    ) -> None:
        """When source selector errors, should treat as not official."""
        # Arrange
        mock_search_client.search = AsyncMock(return_value=([
            {
                "url": "https://testbrand.com",
                "title": "TestBrand",
                "description": "Products",
                "result_type": "organic",
            },
        ], None))

        # Source selector returns error-like response
        mock_source_selector.score_snippet = AsyncMock(return_value={
            "is_official": False,
            "confidence_score": 0.0,
            "reason": "LLM timeout",
        })

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert
        assert result is None


class TestIdentifyOfficialUrlSkippedNonOfficial:
    """Test branch: Skipped non-official results → does not select retailer/aggregator."""

    @pytest.mark.asyncio
    async def test_retailer_results_not_selected(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
        mock_source_selector: MagicMock,
    ) -> None:
        """Major retailer results should be correctly identified and skipped."""
        # Arrange
        mock_search_client.search = AsyncMock(return_value=([
            {
                "url": "https://amazon.com/testbrand-12345",
                "title": "TestBrand 12345 - Amazon.com",
                "description": "Free shipping",
                "result_type": "organic",
            },
            {
                "url": "https://chewy.com/testbrand-product",
                "title": "TestBrand at Chewy",
                "description": "Pet supplies",
                "result_type": "organic",
            },
            {
                "url": "https://walmart.com/ip/testbrand",
                "title": "TestBrand - Walmart",
                "description": "Everyday low price",
                "result_type": "organic",
            },
        ], None))

        # All are correctly identified as non-official
        async def mock_score_snippet(url: str, snippet: str, brand: str) -> dict:
            return {
                "is_official": False,
                "confidence_score": 0.2,
                "reason": "Retailer/aggregator",
            }

        mock_source_selector.score_snippet = AsyncMock(side_effect=mock_score_snippet)

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert
        assert result is None

    @pytest.mark.asyncio
    async def test_aggregator_results_not_selected(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
        mock_source_selector: MagicMock,
    ) -> None:
        """Aggregator/price comparison results should be correctly skipped."""
        # Arrange
        mock_search_client.search = AsyncMock(return_value=([
            {
                "url": "https://pricerunner.com/testbrand",
                "title": "TestBrand - Compare Prices",
                "description": "Find best deals",
                "result_type": "organic",
            },
            {
                "url": "https://shopping.google.com/testbrand",
                "title": "TestBrand - Google Shopping",
                "description": "Compare retailers",
                "result_type": "organic",
            },
            {
                "url": "https://slickdeals.net/testbrand",
                "title": "TestBrand Deals",
                "description": "Coupons and deals",
                "result_type": "organic",
            },
        ], None))

        # All are correctly identified as non-official aggregators
        mock_source_selector.score_snippet = AsyncMock(return_value={
            "is_official": False,
            "confidence_score": 0.1,
            "reason": "Price comparison/aggregator",
        })

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert
        assert result is None

    @pytest.mark.asyncio
    async def test_mixed_results_official_preferred_over_retailer(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
        mock_source_selector: MagicMock,
    ) -> None:
        """When mixed results present, official should be selected over retailers."""
        # Arrange
        official_url = "https://www.testbrand.com/products/12345"
        mock_search_client.search = AsyncMock(return_value=([
            {
                "url": "https://amazon.com/testbrand-12345",
                "title": "TestBrand 12345",
                "description": "Amazon's Choice",
                "result_type": "organic",
            },
            {
                "url": official_url,
                "title": "TestBrand Product 12345",
                "description": "Official TestBrand store",
                "result_type": "organic",
            },
            {
                "url": "https://ebay.com/testbrand-12345",
                "title": "TestBrand 12345 - New",
                "description": "eBay listing",
                "result_type": "organic",
            },
        ], None))

        # Mixed scoring: only official domain gets is_official=True
        async def mock_score_snippet(url: str, snippet: str, brand: str) -> dict:
            if "testbrand.com" in url:
                return {
                    "is_official": True,
                    "confidence_score": 0.95,
                    "reason": "Official manufacturer domain",
                }
            return {
                "is_official": False,
                "confidence_score": 0.8,  # High confidence but not official
                "reason": "Third-party retailer",
            }

        mock_source_selector.score_snippet = AsyncMock(side_effect=mock_score_snippet)

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert: Official URL selected despite retailers having decent confidence
        assert result == official_url

    @pytest.mark.asyncio
    async def test_marketplace_results_not_selected(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
        mock_source_selector: MagicMock,
    ) -> None:
        """Marketplace results should be skipped."""
        # Arrange
        mock_search_client.search = AsyncMock(return_value=([
            {
                "url": "https://ebay.com/itm/testbrand-12345",
                "title": "TestBrand 12345 - eBay",
                "description": "Buy it now",
                "result_type": "organic",
            },
            {
                "url": "https://amazon.com/marketplace/testbrand",
                "title": "TestBrand Marketplace",
                "description": "Third-party sellers",
                "result_type": "organic",
            },
        ], None))

        mock_source_selector.score_snippet = AsyncMock(return_value={
            "is_official": False,
            "confidence_score": 0.15,
            "reason": "Marketplace listing",
        })

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert
        assert result is None


class TestIdentifyOfficialUrlEdgeCases:
    """Edge cases and boundary conditions."""

    @pytest.mark.asyncio
    async def test_exact_six_results_only_top_five_scored(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
        mock_source_selector: MagicMock,
    ) -> None:
        """With exactly 6 results, only first 5 should be scored."""
        # Arrange
        results = [
            {
                "url": f"https://result{i}.com",
                "title": f"Result {i}",
                "description": f"Desc {i}",
                "result_type": "organic",
            }
            for i in range(6)
        ]
        mock_search_client.search = AsyncMock(return_value=(results, None))

        # 5th result (index 4) is official
        call_count = 0
        async def mock_score_snippet(url: str, snippet: str, brand: str) -> dict:
            nonlocal call_count
            call_count += 1
            is_official = (call_count == 5)  # 5th result is official
            return {
                "is_official": is_official,
                "confidence_score": 0.9 if is_official else 0.5,
                "reason": "test",
            }

        mock_source_selector.score_snippet = AsyncMock(side_effect=mock_score_snippet)

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert: 6th result not scored, so 5th result wins
        assert result == "https://result4.com"
        assert mock_source_selector.score_snippet.call_count == 5

    @pytest.mark.asyncio
    async def test_single_result_not_official_returns_none(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
        mock_source_selector: MagicMock,
    ) -> None:
        """Single result that is not official should return None."""
        # Arrange
        mock_search_client.search = AsyncMock(return_value=([
            {
                "url": "https://retailer.com/testbrand",
                "title": "TestBrand at Retailer",
                "description": "Buy here",
                "result_type": "organic",
            },
        ], None))

        mock_source_selector.score_snippet = AsyncMock(return_value={
            "is_official": False,
            "confidence_score": 0.4,
            "reason": "Retailer",
        })

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert
        assert result is None

    @pytest.mark.asyncio
    async def test_single_result_official_returns_url(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
        mock_source_selector: MagicMock,
    ) -> None:
        """Single result that is official should return its URL."""
        # Arrange
        official_url = "https://official.testbrand.com/12345"
        mock_search_client.search = AsyncMock(return_value=([
            {
                "url": official_url,
                "title": "TestBrand 12345 - Official",
                "description": "Official product page",
                "result_type": "organic",
            },
        ], None))

        mock_source_selector.score_snippet = AsyncMock(return_value={
            "is_official": True,
            "confidence_score": 0.98,
            "reason": "Official domain",
        })

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert
        assert result == official_url

    @pytest.mark.asyncio
    async def test_multiple_kg_results_first_returned(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
    ) -> None:
        """If multiple KG results, first one should be returned."""
        # Arrange
        mock_search_client.search = AsyncMock(return_value=([
            {
                "url": "https://first-kg.testbrand.com",
                "title": "First KG",
                "description": "First",
                "result_type": "knowledge_graph",
            },
            {
                "url": "https://second-kg.testbrand.com",
                "title": "Second KG",
                "description": "Second",
                "result_type": "knowledge_graph",
            },
        ], None))

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert
        assert result == "https://first-kg.testbrand.com"

    @pytest.mark.asyncio
    async def test_confidence_tie_first_wins(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
        mock_source_selector: MagicMock,
    ) -> None:
        """When confidence scores tie, first URL should win."""
        # Arrange
        mock_search_client.search = AsyncMock(return_value=([
            {
                "url": "https://first-official.testbrand.com",
                "title": "First Official",
                "description": "First",
                "result_type": "organic",
            },
            {
                "url": "https://second-official.testbrand.com",
                "title": "Second Official",
                "description": "Second",
                "result_type": "organic",
            },
        ], None))

        # Both have same confidence
        mock_source_selector.score_snippet = AsyncMock(return_value={
            "is_official": True,
            "confidence_score": 0.9,
            "reason": "Official",
        })

        # Act
        result = await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert: First one wins (stable sort preserves order)
        assert result == "https://first-official.testbrand.com"

    @pytest.mark.asyncio
    async def test_query_builder_called_with_correct_params(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_search_client: MagicMock,
        mock_query_builder: MagicMock,
    ) -> None:
        """Query builder should receive correct brand and sku in base query."""
        # Arrange
        mock_search_client.search = AsyncMock(return_value=([], None))

        # Act
        await scraper_for_identify.identify_official_url("ABC123", "AcmeCorp")

        # Assert
        mock_query_builder.build_brand_focused_query.assert_called_once()
        call_args = mock_query_builder.build_brand_focused_query.call_args
        base_query = call_args[0][0]
        assert "AcmeCorp" in base_query
        assert "ABC123" in base_query

    @pytest.mark.asyncio
    async def test_exclusions_passed_to_query_builder(
        self,
        scraper_for_identify: OfficialBrandScraper,
        mock_query_builder: MagicMock,
        mock_search_client: MagicMock,
    ) -> None:
        """Standard exclusions should be passed to query builder."""
        # Arrange
        mock_search_client.search = AsyncMock(return_value=([], None))

        # Act
        await scraper_for_identify.identify_official_url("12345", "TestBrand")

        # Assert
        call_args = mock_query_builder.build_brand_focused_query.call_args
        exclusions = call_args[0][1]
        assert "amazon.com" in exclusions
        assert "ebay.com" in exclusions
        assert "walmart.com" in exclusions
