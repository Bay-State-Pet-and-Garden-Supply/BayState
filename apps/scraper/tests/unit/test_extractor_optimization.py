"""Tests for Crawl4AIExtractor and fallback extraction behavior."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor, FallbackExtractor


class TestCrawl4AIExtractorOptimization:
    """Test suite for Crawl4AIExtractor LLM optimization."""

    @pytest.fixture
    def extractor(self):
        """Initialize extractor with default settings."""
        return Crawl4AIExtractor(
            headless=True,
            llm_model="gpt-4o",
            scoring=MagicMock(),
            matching=MagicMock(),
            extraction_strategy="llm",
        )

    @pytest.mark.asyncio
    async def test_extract_uses_optimized_params(self, extractor):
        """Test that LLMExtractionStrategy is initialized with optimized parameters."""
        url = "https://example.com/p/123"
        sku = "SKU123"
        
        # Mock dependencies
        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "extracted_content": '[{"name": "Test Product"}]'
        }
        
        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True) as mock_strategy_cls,
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch("os.environ.get", return_value="fake-key"),
        ):
            # We need to simulate the engine's context manager
            mock_engine.__aenter__.return_value = mock_engine
            
            await extractor.extract(url, sku, "Test Product", "Test Brand")
            
            # Check LLMExtractionStrategy initialization
            assert mock_strategy_cls.called
            _, kwargs = mock_strategy_cls.call_args
            
            # These should fail initially (Red Phase)
            assert kwargs.get("input_format") == "fit_markdown"
            assert kwargs.get("chunk_token_threshold") == 4000
            assert kwargs.get("overlap_rate") == 0.1

    @pytest.mark.asyncio
    async def test_extract_reuses_fit_markdown_for_fallback_when_html_missing(self, extractor):
        """Test that fit markdown is reused for fallback parsing when HTML is unavailable."""
        url = "https://example.com/p/123"
        sku = "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": False,
            "error": "auth error",
            "html": None,
            "fit_markdown": "fit markdown content",
            "raw_markdown": "raw markdown content",
            "markdown": "fit markdown content",
        }

        with patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine):
            mock_engine.__aenter__.return_value = mock_engine
            extractor._extract_with_fallback = AsyncMock(return_value={"success": False, "error": "fallback"})

            result = await extractor.extract(url, sku, "Test Product", "Test Brand")

            extractor._extract_with_fallback.assert_awaited_once_with(
                url,
                sku,
                "Test Product",
                "Test Brand",
                "",
                "fit markdown content",
            )
            assert result == {"success": False, "error": "fallback"}

    @pytest.mark.asyncio
    async def test_extract_accepts_structured_extracted_content_payload(self, extractor):
        """Test that structured extracted_content payloads are accepted without JSON parsing."""
        url = "https://example.com/p/123"
        sku = "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.side_effect = [
            {
                "success": True,
                "html": None,
                "fit_markdown": None,
                "raw_markdown": None,
                "markdown": None,
            },
            {
                "success": True,
                "extracted_content": [
                    {
                        "product_name": "Test Product",
                        "brand": "Test Brand",
                        "description": "Structured payload",
                        "size_metrics": "12 oz",
                        "images": ["https://example.com/image.jpg"],
                        "categories": ["Product"],
                    }
                ],
            },
        ]

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch("os.environ.get", return_value="fake-key"),
        ):
            mock_engine.__aenter__.return_value = mock_engine

            result = await extractor.extract(url, sku, "Test Product", "Test Brand")

            assert result is not None
            assert result["success"] is True
            assert result["product_name"] == "Test Product"
            assert result["brand"] == "Test Brand"
            assert result["confidence"] == 1.0

    @pytest.mark.asyncio
    async def test_extract_returns_first_pass_jsonld_result(self, extractor):
        """Test that first-pass JSON-LD extraction short-circuits LLM fallback."""
        url = "https://example.com/p/123"
        sku = "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "html": "<html><body>product</body></html>",
            "markdown": "product markdown",
        }
        extractor._extraction.extract_product_from_html_jsonld = MagicMock(
            return_value={"product_name": "Structured Product", "confidence": 0.2}
        )

        with patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine):
            mock_engine.__aenter__.return_value = mock_engine

            result = await extractor.extract(url, sku, "Structured Product", "Structured Brand")

            assert result["product_name"] == "Structured Product"
            assert result["url"] == url
            assert result["confidence"] == 0.8
            mock_engine.crawl.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_extract_returns_error_when_openai_key_missing(self, extractor):
        """Test that LLM extraction fails clearly when OPENAI_API_KEY is absent."""
        url = "https://example.com/p/123"
        sku = "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "html": "",
            "fit_markdown": "",
            "raw_markdown": "",
            "markdown": "",
        }

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("os.environ.get", return_value=None),
        ):
            mock_engine.__aenter__.return_value = mock_engine

            result = await extractor.extract(url, sku, "Test Product", "Test Brand")

            assert result == {"success": False, "error": "OPENAI_API_KEY not set"}

    @pytest.mark.asyncio
    async def test_extract_falls_back_on_auth_error_payload(self, extractor):
        """Test that auth-shaped LLM responses trigger fallback extraction."""
        url = "https://example.com/p/123"
        sku = "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.side_effect = [
            {
                "success": True,
                "html": "",
                "fit_markdown": "",
                "raw_markdown": "",
                "markdown": "",
            },
            {
                "success": True,
                "html": "<html>fallback</html>",
                "markdown": "fallback markdown",
                "extracted_content": '[{"error":"authentication failed"}]',
            },
        ]

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch("os.environ.get", return_value="fake-key"),
        ):
            mock_engine.__aenter__.return_value = mock_engine
            extractor._extract_with_fallback = AsyncMock(return_value={"success": False, "error": "fallback"})

            result = await extractor.extract(url, sku, "Test Product", "Test Brand")

            extractor._extract_with_fallback.assert_awaited_once_with(
                url,
                sku,
                "Test Product",
                "Test Brand",
                "<html>fallback</html>",
                "fallback markdown",
            )
            assert result == {"success": False, "error": "fallback"}

    @pytest.mark.asyncio
    async def test_extract_falls_back_on_invalid_extracted_content_type(self, extractor):
        """Test that unsupported extracted_content payloads trigger fallback parsing."""
        url = "https://example.com/p/123"
        sku = "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.side_effect = [
            {
                "success": True,
                "html": "",
                "fit_markdown": "",
                "raw_markdown": "",
                "markdown": "",
            },
            {
                "success": True,
                "html": "<html>fallback</html>",
                "markdown": "fallback markdown",
                "extracted_content": 123,
            },
        ]

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch("os.environ.get", return_value="fake-key"),
        ):
            mock_engine.__aenter__.return_value = mock_engine
            extractor._extract_with_fallback = AsyncMock(return_value={"success": True, "product_name": "Fallback"})

            result = await extractor.extract(url, sku, "Test Product", "Test Brand")

            extractor._extract_with_fallback.assert_awaited_once_with(
                url,
                sku,
                "Test Product",
                "Test Brand",
                "<html>fallback</html>",
                "fallback markdown",
            )
            assert result == {"success": True, "product_name": "Fallback"}

    @pytest.mark.asyncio
    async def test_extract_uses_fallback_after_content_type_exception_with_existing_content(self, extractor):
        """Test that content-type exceptions reuse first-pass content with fallback extraction."""
        url = "https://example.com/p/123"
        sku = "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.side_effect = [
            {
                "success": True,
                "html": "<html>cached</html>",
                "fit_markdown": "",
                "raw_markdown": "",
                "markdown": "cached markdown",
            },
            TypeError("expected string or bytes-like object, got 'NoneType'"),
        ]
        extractor._extraction.extract_product_from_html_jsonld = MagicMock(return_value=None)

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("scrapers.ai_search.crawl4ai_extractor.extract_product_from_meta_tags", return_value=None),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch("os.environ.get", return_value="fake-key"),
        ):
            mock_engine.__aenter__.return_value = mock_engine
            extractor._extract_with_fallback = AsyncMock(return_value={"success": True, "product_name": "Fallback"})

            result = await extractor.extract(url, sku, "Test Product", "Test Brand")

            extractor._extract_with_fallback.assert_awaited_once_with(
                url,
                sku,
                "Test Product",
                "Test Brand",
                "<html>cached</html>",
                "cached markdown",
            )
            assert result == {"success": True, "product_name": "Fallback"}

    @pytest.mark.asyncio
    async def test_extract_returns_content_type_error_without_existing_content(self, extractor):
        """Test that content-type exceptions without cached content return a clear error."""
        url = "https://example.com/p/123"
        sku = "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.side_effect = TypeError("expected string or bytes-like object, got 'NoneType'")

        with patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine):
            mock_engine.__aenter__.return_value = mock_engine

            result = await extractor.extract(url, sku, "Test Product", "Test Brand")

            assert result == {"success": False, "error": "Crawl4AI returned invalid content type"}


class TestFallbackExtractor:
    """Test suite for HTTP/meta fallback extraction behavior."""

    @pytest.fixture
    def fallback_extractor(self):
        matching = MagicMock()
        matching.is_name_match.return_value = True
        matching.is_brand_match.return_value = True
        return FallbackExtractor(scoring=MagicMock(), matching=matching)

    @pytest.mark.asyncio
    async def test_extract_uses_prefetched_html_meta_success(self, fallback_extractor):
        """Test successful meta extraction using pre-fetched HTML."""
        html = """
        <html>
          <head>
            <title>Acme Test Product</title>
            <meta property="og:title" content="Acme Test Product" />
            <meta property="og:description" content="A great product in 12 oz size" />
            <meta property="og:image" content="https://example.com/images/product.jpg" />
          </head>
        </html>
        """

        result = await fallback_extractor.extract(
            "https://example.com/products/test-product",
            "SKU123",
            "Acme Test Product",
            "Acme",
            html=html,
        )

        assert result["success"] is True
        assert result["product_name"] == "Acme Test Product"
        assert result["brand"] == "Acme"
        assert result["images"] == ["https://example.com/images/product.jpg"]
        assert result["categories"] == ["Product"]

    @pytest.mark.asyncio
    async def test_extract_rejects_title_mismatch(self, fallback_extractor):
        """Test fallback extraction rejects mismatched product titles."""
        fallback_extractor._matching.is_name_match.return_value = False
        html = """
        <html>
          <head>
            <title>Different Product</title>
            <meta property="og:title" content="Different Product" />
            <meta property="og:description" content="Not the requested product" />
            <meta property="og:image" content="https://example.com/images/product.jpg" />
          </head>
        </html>
        """

        result = await fallback_extractor.extract(
            "https://example.com/products/different-product",
            "SKU123",
            "Expected Product",
            "Acme",
            html=html,
        )

        assert result == {
            "success": False,
            "error": "Fallback extraction title does not match expected product",
        }
