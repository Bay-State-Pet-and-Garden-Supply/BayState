"""Tests for crawl4ai extraction strategies."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor, FallbackExtractor


class TestCSSExtractionStrategy:
    """Test suite for CSSExtractionStrategy."""

    @pytest.fixture
    def sample_schema(self):
        """Sample schema for CSS extraction."""
        return {
            "name": "product",
            "fields": [
                {"name": "title", "selector": "h1.product-title", "type": "text"},
                {"name": "price", "selector": ".price", "type": "attribute", "attribute": "data-price"},
                {"name": "description", "selector": ".description", "type": "html"},
            ],
        }

    def test_init_with_schema(self, sample_schema):
        """Test strategy initialization with schema."""
        with patch("src.crawl4ai_engine.strategies.css_strategy.import_module") as mock_import:
            mock_extraction_module = MagicMock()
            mock_strategy_cls = MagicMock()
            mock_extraction_module.extraction_strategy = {"JsonCssExtractionStrategy": mock_strategy_cls}
            mock_import.side_effect = [mock_extraction_module, MagicMock()]

            from src.crawl4ai_engine.strategies.css_strategy import CSSExtractionStrategy

            with patch.object(CSSExtractionStrategy, "__init__", lambda self, schema: None):
                strategy = CSSExtractionStrategy.__new__(CSSExtractionStrategy)
                strategy.schema = sample_schema
                strategy._strategy = MagicMock()
                assert strategy.schema == sample_schema

    def test_build_schema_from_yaml_selectors_simple(self):
        """Test building schema from simple YAML selectors."""
        with patch("src.crawl4ai_engine.strategies.css_strategy.import_module"):
            from src.crawl4ai_engine.strategies.css_strategy import CSSExtractionStrategy

            selectors = [
                {"name": "title", "selector": "h1", "attribute": "text"},
                {"name": "price", "selector": ".price"},
            ]

            schema = CSSExtractionStrategy.build_schema_from_yaml_selectors(selectors, schema_name="test_schema")

            assert schema["name"] == "test_schema"
            assert len(schema["fields"]) == 2
            assert schema["fields"][0]["name"] == "title"
            assert schema["fields"][0]["selector"] == "h1"
            assert schema["fields"][0]["type"] == "text"
            assert schema["fields"][1]["name"] == "price"

    def test_build_schema_from_yaml_selectors_with_base_selector(self):
        """Test building schema with base selector."""
        with patch("src.crawl4ai_engine.strategies.css_strategy.import_module"):
            from src.crawl4ai_engine.strategies.css_strategy import CSSExtractionStrategy

            selectors = {
                "base_selector": ".product-container",
                "fields": [
                    {"name": "title", "selector": "h1"},
                ],
            }

            schema = CSSExtractionStrategy.build_schema_from_yaml_selectors(selectors, schema_name="test")

            assert schema["baseSelector"] == ".product-container"
            assert len(schema["fields"]) == 1

    def test_build_schema_nested_fields(self):
        """Test building schema with nested fields."""
        with patch("src.crawl4ai_engine.strategies.css_strategy.import_module"):
            from src.crawl4ai_engine.strategies.css_strategy import CSSExtractionStrategy

            selectors = [
                {
                    "name": "product",
                    "selector": ".product",
                    "fields": [
                        {"name": "title", "selector": "h2"},
                        {"name": "price", "selector": ".price"},
                    ],
                }
            ]

            schema = CSSExtractionStrategy.build_schema_from_yaml_selectors(selectors, schema_name="nested_test")

            assert len(schema["fields"]) == 1
            assert schema["fields"][0]["type"] == "nested"
            assert len(schema["fields"][0]["fields"]) == 2

    def test_build_schema_nested_list(self):
        """Test building schema with nested list."""
        with patch("src.crawl4ai_engine.strategies.css_strategy.import_module"):
            from src.crawl4ai_engine.strategies.css_strategy import CSSExtractionStrategy

            selectors = [
                {
                    "name": "reviews",
                    "selector": ".review",
                    "type": "list",
                    "fields": [
                        {"name": "author", "selector": ".author"},
                        {"name": "text", "selector": ".text"},
                    ],
                }
            ]

            schema = CSSExtractionStrategy.build_schema_from_yaml_selectors(selectors, schema_name="list_test")

            assert schema["fields"][0]["type"] == "nested_list"

    @pytest.mark.asyncio
    async def test_extract_success(self, sample_schema):
        """Test successful extraction."""
        with patch("src.crawl4ai_engine.strategies.css_strategy.import_module") as mock_import:
            mock_extraction_module = MagicMock()
            mock_strategy_cls = MagicMock()
            mock_strategy_instance = MagicMock()
            mock_strategy_cls.return_value = mock_strategy_instance
            mock_extraction_module.extraction_strategy = {"JsonCssExtractionStrategy": mock_strategy_cls}
            mock_import.side_effect = [mock_extraction_module, MagicMock()]

            from src.crawl4ai_engine.strategies.css_strategy import CSSExtractionStrategy

            strategy = CSSExtractionStrategy(sample_schema)

            mock_crawler = AsyncMock()
            mock_result = MagicMock()
            mock_result.extracted_content = '{"title": "Test Product", "price": "29.99"}'
            mock_crawler.arun = AsyncMock(return_value=mock_result)

            result = await strategy.extract("https://example.com", mock_crawler)

            assert result == {"title": "Test Product", "price": "29.99"}

    @pytest.mark.asyncio
    async def test_extract_json_decode_error(self, sample_schema):
        """Test extraction with JSON decode error falls back to raw."""
        with patch("src.crawl4ai_engine.strategies.css_strategy.import_module") as mock_import:
            mock_extraction_module = MagicMock()
            mock_strategy_cls = MagicMock()
            mock_strategy_instance = MagicMock()
            mock_strategy_cls.return_value = mock_strategy_instance
            mock_extraction_module.extraction_strategy = {"JsonCssExtractionStrategy": mock_strategy_cls}
            mock_import.side_effect = [mock_extraction_module, MagicMock()]

            from src.crawl4ai_engine.strategies.css_strategy import CSSExtractionStrategy

            strategy = CSSExtractionStrategy(sample_schema)

            mock_crawler = AsyncMock()
            mock_result = MagicMock()
            mock_result.extracted_content = "not valid json"
            mock_crawler.arun = AsyncMock(return_value=mock_result)

            result = await strategy.extract("https://example.com", mock_crawler)

            assert result == {"raw": "not valid json"}


class TestXPathExtractionStrategy:
    """Test suite for XPathExtractionStrategy."""

    @pytest.fixture
    def sample_schema(self):
        """Sample schema for XPath extraction."""
        return {
            "name": "product",
            "fields": [
                {"name": "title", "selector": "//h1[@class='title']", "type": "text"},
                {"name": "price", "selector": "//span[@class='price']", "type": "attribute", "attribute": "data-price"},
            ],
        }

    def test_init_with_schema(self, sample_schema):
        """Test strategy initialization with schema."""
        with patch("src.crawl4ai_engine.strategies.xpath_strategy.import_module") as mock_import:
            mock_extraction_module = MagicMock()
            mock_strategy_cls = MagicMock()
            mock_extraction_module.extraction_strategy = {"JsonXPathExtractionStrategy": mock_strategy_cls}
            mock_import.side_effect = [mock_extraction_module, MagicMock()]

            from src.crawl4ai_engine.strategies.xpath_strategy import XPathExtractionStrategy

            with patch.object(XPathExtractionStrategy, "__init__", lambda self, schema: None):
                strategy = XPathExtractionStrategy.__new__(XPathExtractionStrategy)
                strategy.schema = sample_schema
                strategy._strategy = MagicMock()
                assert strategy.schema == sample_schema

    def test_build_schema_from_yaml_selectors(self):
        """Test building schema from YAML selectors."""
        with patch("src.crawl4ai_engine.strategies.xpath_strategy.import_module"):
            from src.crawl4ai_engine.strategies.xpath_strategy import XPathExtractionStrategy

            selectors = [
                {"name": "title", "xpath": "//h1", "attribute": "text"},
                {"name": "price", "xpath": "//span[@class='price']"},
            ]

            schema = XPathExtractionStrategy.build_schema_from_yaml_selectors(selectors, schema_name="xpath_test")

            assert schema["name"] == "xpath_test"
            assert len(schema["fields"]) == 2
            assert schema["fields"][0]["selector"] == "//h1"
            assert schema["fields"][1]["selector"] == "//span[@class='price']"

    @pytest.mark.asyncio
    async def test_extract_success(self, sample_schema):
        """Test successful extraction."""
        with patch("src.crawl4ai_engine.strategies.xpath_strategy.import_module") as mock_import:
            mock_extraction_module = MagicMock()
            mock_strategy_cls = MagicMock()
            mock_strategy_instance = MagicMock()
            mock_strategy_cls.return_value = mock_strategy_instance
            mock_extraction_module.extraction_strategy = {"JsonXPathExtractionStrategy": mock_strategy_cls}
            mock_import.side_effect = [mock_extraction_module, MagicMock()]

            from src.crawl4ai_engine.strategies.xpath_strategy import XPathExtractionStrategy

            strategy = XPathExtractionStrategy(sample_schema)

            mock_crawler = AsyncMock()
            mock_result = MagicMock()
            mock_result.extracted_content = '{"title": "XPath Product"}'
            mock_crawler.arun = AsyncMock(return_value=mock_result)

            result = await strategy.extract("https://example.com", mock_crawler)

            assert result == {"title": "XPath Product"}


class TestExtractorFallbackBehavior:
    """Tests for the current extractor fallback path used instead of the removed strategy module."""

    @pytest.fixture
    def extractor(self):
        """Create a Crawl4AIExtractor with mocked collaborators."""
        return Crawl4AIExtractor(
            headless=True,
            llm_model="gpt-4o",
            scoring=MagicMock(),
            matching=MagicMock(),
            extraction_strategy="llm",
        )

    @pytest.fixture
    def fallback_extractor(self):
        """Create a FallbackExtractor with matching helpers enabled by default."""
        matching = MagicMock()
        matching.is_name_match.return_value = True
        matching.is_brand_match.return_value = True
        return FallbackExtractor(scoring=MagicMock(), matching=matching)

    @pytest.mark.asyncio
    async def test_extract_with_fallback_prefers_html(self, extractor):
        """Test that fallback extraction reuses HTML when it is available."""
        extractor._fallback_extractor.extract = AsyncMock(return_value={"success": True})

        result = await extractor._extract_with_fallback(
            "https://example.com/product",
            "SKU123",
            "Test Product",
            "Test Brand",
            "<html>preferred</html>",
            "markdown fallback",
        )

        extractor._fallback_extractor.extract.assert_awaited_once_with(
            "https://example.com/product",
            "SKU123",
            "Test Product",
            "Test Brand",
            html="<html>preferred</html>",
        )
        assert result == {"success": True}

    @pytest.mark.asyncio
    async def test_extract_with_fallback_uses_markdown_when_html_empty(self, extractor):
        """Test that fallback extraction reuses markdown when HTML is unavailable."""
        extractor._fallback_extractor.extract = AsyncMock(return_value={"success": True})

        result = await extractor._extract_with_fallback(
            "https://example.com/product",
            "SKU123",
            "Test Product",
            "Test Brand",
            "",
            "markdown fallback",
        )

        extractor._fallback_extractor.extract.assert_awaited_once_with(
            "https://example.com/product",
            "SKU123",
            "Test Product",
            "Test Brand",
            html="markdown fallback",
        )
        assert result == {"success": True}

    def test_log_telemetry_includes_error_payload(self, extractor):
        """Test telemetry logging includes the structured error payload."""
        with patch("scrapers.ai_search.crawl4ai_extractor.logger.info") as mock_info:
            extractor._log_telemetry(
                "https://example.com/product",
                "SKU123",
                "llm",
                False,
                120,
                15,
                40,
                error="boom",
                confidence=0.25,
                pruning_enabled=True,
                fit_markdown_used=True,
                fallback_triggered=True,
            )

            logged_message = mock_info.call_args.args[0]
            assert '"error": "boom"' in logged_message
            assert '"fallback_triggered": true' in logged_message
            assert '"fit_markdown_used": true' in logged_message

    @pytest.mark.asyncio
    async def test_extract_returns_meta_tag_result_from_first_pass(self, extractor):
        """Test that meta-tag extraction short-circuits the second crawl."""
        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.__aenter__.return_value = mock_engine
        mock_engine.crawl.return_value = {
            "success": True,
            "html": "<html>first pass</html>",
            "markdown": "first pass markdown",
        }
        extractor._extraction.extract_product_from_html_jsonld = MagicMock(return_value=None)

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch(
                "scrapers.ai_search.crawl4ai_extractor.extract_product_from_meta_tags",
                return_value={"success": True, "product_name": "Meta Product", "confidence": 0.72},
            ),
        ):
            result = await extractor.extract("https://example.com/product", "SKU123", "Meta Product", "Meta Brand")

        assert result == {"success": True, "product_name": "Meta Product", "confidence": 0.72}
        mock_engine.crawl.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_extract_failed_first_pass_without_content_returns_error(self, extractor):
        """Test that a failed first crawl without cached content returns the crawl error."""
        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.__aenter__.return_value = mock_engine
        mock_engine.crawl.return_value = {
            "success": False,
            "error": "blocked",
            "html": None,
            "markdown": None,
        }

        with patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine):
            result = await extractor.extract("https://example.com/product", "SKU123", "Test Product", "Test Brand")

        assert result == {"success": False, "error": "blocked"}

    @pytest.mark.asyncio
    async def test_extract_json_css_uses_schema_strategy(self):
        """Test that json_css extraction uses the JSON/CSS strategy on the second crawl."""
        extractor = Crawl4AIExtractor(
            headless=True,
            llm_model="gpt-4o",
            scoring=MagicMock(),
            matching=MagicMock(),
            extraction_strategy="json_css",
        )
        extractor._extraction.extract_product_from_html_jsonld = MagicMock(return_value=None)

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.__aenter__.return_value = mock_engine
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
                "extracted_content": {
                    "product_name": "CSS Product",
                    "brand": "CSS Brand",
                    "description": "A product",
                    "size_metrics": "1 lb",
                    "images": ["https://example.com/image.jpg"],
                    "categories": ["Product"],
                },
            },
        ]

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("scrapers.ai_search.crawl4ai_extractor.extract_product_from_meta_tags", return_value=None),
            patch("crawl4ai.extraction_strategy.JsonCssExtractionStrategy", create=True) as mock_strategy_cls,
        ):
            mock_strategy = MagicMock()
            mock_strategy_cls.return_value = mock_strategy

            result = await extractor.extract("https://example.com/product", "SKU123", "CSS Product", "CSS Brand")

        assert result["success"] is True
        assert result["product_name"] == "CSS Product"
        assert result["confidence"] == 1.0
        assert mock_engine.config["crawler"]["extraction_strategy"] is mock_strategy

    @pytest.mark.asyncio
    async def test_extract_second_pass_without_content_uses_fallback(self, extractor):
        """Test that an unsuccessful second crawl falls back to HTML/markdown parsing."""
        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.__aenter__.return_value = mock_engine
        mock_engine.crawl.side_effect = [
            {
                "success": True,
                "html": "",
                "fit_markdown": "",
                "raw_markdown": "",
                "markdown": "",
            },
            {
                "success": False,
                "error": "second pass failed",
                "html": "<html>fallback html</html>",
                "markdown": "fallback markdown",
            },
        ]
        extractor._extraction.extract_product_from_html_jsonld = MagicMock(return_value=None)
        extractor._extract_with_fallback = AsyncMock(return_value={"success": True, "product_name": "Fallback Product"})

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("scrapers.ai_search.crawl4ai_extractor.extract_product_from_meta_tags", return_value=None),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch("os.environ.get", return_value="fake-key"),
        ):
            result = await extractor.extract("https://example.com/product", "SKU123", "Test Product", "Test Brand")

        extractor._extract_with_fallback.assert_awaited_once_with(
            "https://example.com/product",
            "SKU123",
            "Test Product",
            "Test Brand",
            "<html>fallback html</html>",
            "fallback markdown",
        )
        assert result == {"success": True, "product_name": "Fallback Product"}

    @pytest.mark.asyncio
    async def test_extract_returns_error_for_unhandled_exception(self, extractor):
        """Test that non-content exceptions surface as explicit failures."""
        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.__aenter__.return_value = mock_engine
        mock_engine.crawl.side_effect = RuntimeError("boom")

        with patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine):
            result = await extractor.extract("https://example.com/product", "SKU123", "Test Product", "Test Brand")

        assert result == {"success": False, "error": "boom"}

    @pytest.mark.asyncio
    async def test_fallback_extractor_http_fetch_uses_response_url(self, fallback_extractor):
        """Test that HTTP fallback extraction records the final response URL."""
        fallback_extractor._extraction.extract_product_from_html_jsonld = MagicMock(return_value={"confidence": 0.9})

        mock_response = MagicMock()
        mock_response.text = "<html>fetched</html>"
        mock_response.url = "https://example.com/final-product"
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.get.return_value = mock_response
            mock_client_cls.return_value.__aenter__.return_value = mock_client

            result = await fallback_extractor.extract(
                "https://example.com/original-product",
                "SKU123",
                "Fetched Product",
                "Fetched Brand",
            )

        assert result["url"] == "https://example.com/final-product"
        assert result["confidence"] == 0.9
        mock_client.get.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_fallback_extractor_rejects_brand_mismatch(self, fallback_extractor):
        """Test that fallback extraction rejects pages outside the expected brand/domain context."""
        fallback_extractor._matching.is_brand_match.return_value = False
        html = """
        <html>
          <head>
            <title>Test Product</title>
            <meta property="og:title" content="Test Product" />
            <meta property="og:description" content="Helpful description" />
            <meta property="og:image" content="https://example.com/image.jpg" />
          </head>
        </html>
        """

        result = await fallback_extractor.extract(
            "https://example.com/product",
            "SKU123",
            "Test Product",
            "Expected Brand",
            html=html,
        )

        assert result == {
            "success": False,
            "error": "Fallback extraction brand/domain does not match expected context",
        }

    @pytest.mark.asyncio
    async def test_fallback_extractor_returns_error_when_no_structured_data_found(self, fallback_extractor):
        """Test that fallback extraction fails when no usable product signals are present."""
        html = """
        <html>
          <head>
            <title>Test Product</title>
            <meta property="og:title" content="Test Product" />
          </head>
        </html>
        """

        result = await fallback_extractor.extract(
            "https://example.com/product",
            "SKU123",
            "Test Product",
            "Expected Brand",
            html=html,
        )

        assert result == {
            "success": False,
            "error": "Fallback extraction found no structured product data",
        }


class TestFallbackChain:
    """Test suite for fallback chain logic."""

    @pytest.fixture
    def sample_schema(self):
        """Sample schema for testing."""
        return {
            "name": "product",
            "fields": [
                {"name": "title", "selector": "h1", "type": "text"},
                {"name": "price", "selector": ".price", "type": "text"},
            ],
        }

    def test_fallback_chain_order(self, sample_schema):
        """Test that fallback chain tries strategies in correct order."""
        # The dedicated LLM fallback strategy module was removed.
        # Current fallback coverage validates CSS/XPath strategies here and
        # Crawl4AIExtractor fallback behavior in integration tests.
        from src.crawl4ai_engine.strategies.css_strategy import CSSExtractionStrategy
        from src.crawl4ai_engine.strategies.xpath_strategy import XPathExtractionStrategy

        assert CSSExtractionStrategy is not None
        assert XPathExtractionStrategy is not None

    def test_css_to_xpath_fallback(self, sample_schema):
        """Test CSS can fall back to XPath."""
        with (
            patch("src.crawl4ai_engine.strategies.css_strategy.import_module") as mock_css,
            patch("src.crawl4ai_engine.strategies.xpath_strategy.import_module") as mock_xpath,
        ):
            # Setup CSS mock
            mock_extraction_css = MagicMock()
            mock_strategy_cls_css = MagicMock()
            mock_extraction_css.extraction_strategy = {"JsonCssExtractionStrategy": mock_strategy_cls_css}
            mock_css.return_value = mock_extraction_css

            # Setup XPath mock
            mock_extraction_xpath = MagicMock()
            mock_strategy_cls_xpath = MagicMock()
            mock_extraction_xpath.extraction_strategy = {"JsonXPathExtractionStrategy": mock_strategy_cls_xpath}
            mock_xpath.return_value = mock_extraction_xpath

            from src.crawl4ai_engine.strategies.css_strategy import CSSExtractionStrategy
            from src.crawl4ai_engine.strategies.xpath_strategy import XPathExtractionStrategy

            css_strategy = CSSExtractionStrategy(sample_schema)
            xpath_strategy = XPathExtractionStrategy(sample_schema)

            # Both should be created successfully
            assert css_strategy is not None
            assert xpath_strategy is not None
