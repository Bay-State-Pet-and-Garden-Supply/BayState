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
            llm_model="gemini-3.1-flash-lite-preview",
            scoring=MagicMock(),
            matching=MagicMock(),
            extraction_strategy="llm",
            llm_provider="gemini",
            llm_api_key="test-key",
        )

    @pytest.mark.asyncio
    async def test_extract_uses_optimized_params(self, extractor):
        """Test that LLMExtractionStrategy is initialized with optimized parameters."""
        url = "https://example.com/p/123"
        sku = "SKU123"
        
        # Mock dependencies
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
                "extracted_content": '[{"name": "Test Product"}]',
            },
        ]
        
        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True) as mock_strategy_cls,
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
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
    async def test_extract_relaxes_wait_strategy_after_timeout(self, extractor):
        """Live storefronts should retry with domcontentloaded when network idle fails."""
        mock_engine = AsyncMock()
        mock_engine.crawl.side_effect = [
            {
                "success": False,
                "error": 'Page.goto: Timeout 30000ms exceeded while waiting until "networkidle"',
                "html": "",
                "markdown": "",
            },
            {
                "success": False,
                "error": "navigation timeout",
                "html": "",
                "markdown": "",
            },
        ]

        def build_engine(config):
            mock_engine.config = config
            return mock_engine

        with patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", side_effect=build_engine):
            mock_engine.__aenter__.return_value = mock_engine

            await extractor.extract("https://example.com/p/123", "SKU123", "Test Product", "Test Brand")

        assert mock_engine.crawl.await_count == 2
        assert mock_engine.config["crawler"]["wait_until"] == "domcontentloaded"

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
    async def test_extract_bypasses_cache_for_second_pass(self, extractor):
        """Second-pass extraction must bypass the first crawl's cached response."""
        url = "https://example.com/p/123"
        sku = "SKU123"
        observed_cache_modes = []

        mock_engine = AsyncMock()
        mock_engine.config = {}

        async def fake_crawl(_url):
            observed_cache_modes.append(mock_engine.config["crawler"]["cache_mode"])
            if len(observed_cache_modes) == 1:
                return {
                    "success": True,
                    "html": "<html><body>product</body></html>",
                    "fit_markdown": "product markdown",
                    "raw_markdown": "product markdown",
                    "markdown": "product markdown",
                }
            return {
                "success": True,
                "html": "<html></html>",
                "extracted_content": [
                    {
                        "product_name": "Test Product",
                        "brand": "Test Brand",
                        "description": "Structured payload",
                        "size_metrics": "12 oz",
                        "images": ["https://example.com/image.jpg"],
                        "categories": ["Garden Supplies"],
                    }
                ],
            }

        mock_engine.crawl.side_effect = fake_crawl

        def build_engine(config):
            mock_engine.config = config
            return mock_engine

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", side_effect=build_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch.object(extractor._extraction, "extract_product_from_html_jsonld", return_value=None),
            patch("scrapers.ai_search.crawl4ai_extractor.extract_product_from_meta_tags", return_value=None),
        ):
            mock_engine.__aenter__.return_value = mock_engine

            result = await extractor.extract(url, sku, "Test Product", "Test Brand")

            assert result is not None
            assert result["success"] is True
            assert observed_cache_modes == ["ENABLED", "BYPASS"]

    @pytest.mark.asyncio
    async def test_extract_relaxes_wait_strategy_for_second_pass_after_timeout(self, extractor):
        """LLM second pass should retry with domcontentloaded after a navigation timeout."""
        url = "https://example.com/p/123"
        sku = "SKU123"
        observed_wait_modes = []

        mock_engine = AsyncMock()
        mock_engine.config = {}

        async def fake_crawl(_url):
            observed_wait_modes.append(mock_engine.config["crawler"]["wait_until"])
            if len(observed_wait_modes) == 1:
                return {
                    "success": True,
                    "html": "<html><body>product</body></html>",
                    "fit_markdown": "product markdown",
                    "raw_markdown": "product markdown",
                    "markdown": "product markdown",
                }
            if len(observed_wait_modes) == 2:
                return {
                    "success": False,
                    "error": 'Page.goto: Timeout 30000ms exceeded while waiting until "networkidle"',
                    "html": "",
                    "markdown": "",
                }
            return {
                "success": True,
                "html": "<html></html>",
                "extracted_content": [
                    {
                        "product_name": "Test Product",
                        "brand": "Test Brand",
                        "description": "Structured payload",
                        "size_metrics": "12 oz",
                        "images": ["https://example.com/image.jpg"],
                        "categories": ["Garden Supplies"],
                    }
                ],
            }

        mock_engine.crawl.side_effect = fake_crawl

        def build_engine(config):
            mock_engine.config = config
            return mock_engine

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", side_effect=build_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch.object(extractor._extraction, "extract_product_from_html_jsonld", return_value=None),
            patch("scrapers.ai_search.crawl4ai_extractor.extract_product_from_meta_tags", return_value=None),
        ):
            mock_engine.__aenter__.return_value = mock_engine

            result = await extractor.extract(url, sku, "Test Product", "Test Brand")

            assert result is not None
            assert result["success"] is True
            assert observed_wait_modes == ["networkidle", "networkidle", "domcontentloaded"]

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
                "html": """
                <html>
                  <head>
                    <meta property=\"og:image\" content=\"https://example.com/image.jpg\" />
                  </head>
                </html>
                """,
                "extracted_content": [
                    {
                        "product_name": "Test Product",
                        "brand": "Test Brand",
                        "description": "Structured payload",
                        "size_metrics": "12 oz",
                        "images": ["https://example.com/image.jpg"],
                        "categories": ["Garden Supplies"],
                    }
                ],
            },
        ]

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
        ):
            mock_engine.__aenter__.return_value = mock_engine

            result = await extractor.extract(url, sku, "Test Product", "Test Brand")

            assert result is not None
            assert result["success"] is True
            assert result["product_name"] == "Test Product"
            assert result["brand"] == "Test Brand"
            assert result["confidence"] == 1.0

    @pytest.mark.asyncio
    async def test_extract_normalizes_llm_output_with_aliases_and_meta_images(self, extractor):
        """LLM payloads should be normalized before confidence and return."""
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
                "html": """
                <html>
                  <head>
                    <meta property=\"og:image\" content=\"/hero.jpg\" />
                  </head>
                </html>
                """,
                "extracted_content": [
                    {
                        "product_name": "Organic Eggplant Black Beauty Heirloom",
                        "brand": "LV Seed",
                        "description": "A productive heirloom variety for home gardens.",
                        "size_metrics": "Not specified",
                        "images": [],
                        "categories": ["Garden Center", "Seeds"],
                    }
                ],
            },
        ]

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
        ):
            mock_engine.__aenter__.return_value = mock_engine

            result = await extractor.extract(url, sku, "LV SEED ORGANIC EGGP LANT BLACK HEIRLOOM", None)

            assert result is not None
            assert result["success"] is True
            assert result["brand"] == "Lake Valley Seed"
            assert result["size_metrics"] == ""
            assert result["images"] == ["https://example.com/hero.jpg"]
            assert "Garden Center" not in result["categories"]
            assert "Seeds" in result["categories"]

    @pytest.mark.asyncio
    async def test_extract_replaces_page_relative_files_image_with_meta_image(self, extractor):
        """Malformed `files/...` image paths should fall back to valid OG images."""
        url = "https://bentleyseeds.com/products/turnip-purple-white-globe"
        sku = "HTG-017"

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
                "html": """
                <html>
                  <head>
                    <meta property=\"og:image\" content=\"//bentleyseeds.com/cdn/shop/files/HTG-017_front.jpg?v=1739186744\" />
                  </head>
                </html>
                """,
                "extracted_content": [
                    {
                        "product_name": "Turnip Purple White Globe Seed Packets",
                        "brand": "Bentley Seeds",
                        "description": "Classic heirloom turnip packet.",
                        "size_metrics": "Not specified",
                        "images": ["files/HTG-017_front.jpg"],
                        "categories": ["Seeds"],
                    }
                ],
            },
        ]

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
        ):
            mock_engine.__aenter__.return_value = mock_engine

            result = await extractor.extract(url, sku, "Turnip Purple White Globe", "Bentley Seeds")

            assert result is not None
            assert result["success"] is True
            assert result["images"] == [
                "https://bentleyseeds.com/cdn/shop/files/HTG-017_front.jpg?v=1739186744"
            ]

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
    async def test_extract_uses_fallback_when_gemini_key_missing(self):
        """Test that missing LLM credentials defer to the zero-cost fallback path."""
        url = "https://example.com/p/123"
        sku = "SKU123"

        extractor = Crawl4AIExtractor(
            headless=True,
            llm_model="gemini-3.1-flash-lite-preview",
            scoring=MagicMock(),
            matching=MagicMock(),
            extraction_strategy="llm",
            llm_provider="gemini",
            llm_api_key=None,
        )

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
        ):
            mock_engine.__aenter__.return_value = mock_engine
            extractor._extract_with_fallback = AsyncMock(return_value={"success": True, "product_name": "Fallback Product"})

            result = await extractor.extract(url, sku, "Test Product", "Test Brand")

            extractor._extract_with_fallback.assert_awaited_once_with(
                url,
                sku,
                "Test Product",
                "Test Brand",
                "",
                "",
            )
            assert result == {"success": True, "product_name": "Fallback Product"}

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
    async def test_extract_falls_back_on_error_tagged_llm_payload(self, extractor):
        """LiteLLM/Crawl4AI error payloads should not be normalized into fake product data."""
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
                "extracted_content": [
                    {
                        "index": 0,
                        "error": True,
                        "tags": ["error"],
                        "content": "litellm.APIConnectionError: provider mismatch",
                        "product_name": "",
                        "images": [],
                    }
                ],
            },
        ]

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
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
    async def test_extract_uses_fallback_for_soft_404_first_pass(self, extractor):
        """Soft-404 pages should skip second-pass extraction and go straight to fallback recovery."""
        url = "https://example.com/missing-product"
        sku = "SKU123"
        not_found_html = """
        <html>
          <head>
            <title>Page not found - Example</title>
            <meta property="og:title" content="Page not found - Example" />
          </head>
        </html>
        """
        markdown = "WHOOPS! 404 It looks like you are lost!"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "html": not_found_html,
            "fit_markdown": markdown,
            "raw_markdown": markdown,
            "markdown": markdown,
        }

        with patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine):
            mock_engine.__aenter__.return_value = mock_engine
            extractor._extract_with_fallback = AsyncMock(return_value={"success": False, "error": "Fallback extraction landed on a not-found page"})

            result = await extractor.extract(url, sku, "Test Product", "Test Brand")

            extractor._extract_with_fallback.assert_awaited_once_with(
                url,
                sku,
                "Test Product",
                "Test Brand",
                not_found_html,
                markdown,
            )
            mock_engine.crawl.assert_awaited_once()
            assert result == {"success": False, "error": "Fallback extraction landed on a not-found page"}

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
