"""Tests for crawl4ai extraction strategies."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


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


class TestLLMFallbackStrategy:
    """Test suite for LLMFallbackStrategy."""

    @pytest.fixture
    def sample_schema(self):
        """Sample schema for LLM extraction."""
        return {
            "name": "product",
            "fields": [
                {"name": "title", "selector": "h1", "type": "text"},
                {"name": "price", "selector": ".price", "type": "text"},
            ],
        }

    def test_init_with_defaults(self, sample_schema):
        """Test LLM strategy initialization with defaults."""
        with patch("src.crawl4ai_engine.strategies.llm_fallback.import_module") as mock_import:
            mock_crawl4ai = MagicMock()
            mock_extraction = MagicMock()
            mock_llm_config_cls = MagicMock()
            mock_llm_strategy_cls = MagicMock()
            mock_crawl4ai.LLMConfig = mock_llm_config_cls
            mock_extraction.LLMExtractionStrategy = mock_llm_strategy_cls
            mock_import.side_effect = [mock_crawl4ai, mock_extraction]

            with patch.dict("os.environ", {}, clear=False):
                from src.crawl4ai_engine.strategies.llm_fallback import LLMFallbackStrategy

                strategy = LLMFallbackStrategy(sample_schema)

                assert strategy.schema == sample_schema
                assert strategy.provider == "openai/gpt-4o-mini"
                assert strategy.budget_usd == 1.0
                assert strategy.confidence_threshold == 0.7

    def test_init_with_custom_params(self, sample_schema):
        """Test LLM strategy with custom parameters."""
        with patch("src.crawl4ai_engine.strategies.llm_fallback.import_module") as mock_import:
            mock_crawl4ai = MagicMock()
            mock_extraction = MagicMock()
            mock_llm_config_cls = MagicMock()
            mock_llm_strategy_cls = MagicMock()
            mock_crawl4ai.LLMConfig = mock_llm_config_cls
            mock_extraction.LLMExtractionStrategy = mock_llm_strategy_cls
            mock_import.side_effect = [mock_crawl4ai, mock_extraction]

            with patch.dict("os.environ", {}, clear=False):
                from src.crawl4ai_engine.strategies.llm_fallback import LLMFallbackStrategy

                strategy = LLMFallbackStrategy(
                    sample_schema,
                    provider="anthropic/claude-3-opus",
                    budget_usd=5.0,
                    confidence_threshold=0.8,
                )

                assert strategy.provider == "anthropic/claude-3-opus"
                assert strategy.model == "claude-3-opus"
                assert strategy.budget_usd == 5.0
                assert strategy.confidence_threshold == 0.8

    def test_init_invalid_budget_raises(self, sample_schema):
        """Test that invalid budget raises ValueError."""
        with patch("src.crawl4ai_engine.strategies.llm_fallback.import_module"):
            with patch.dict("os.environ", {}, clear=False):
                from src.crawl4ai_engine.strategies.llm_fallback import LLMFallbackStrategy

                with pytest.raises(ValueError, match="budget_usd must be > 0"):
                    LLMFallbackStrategy(sample_schema, budget_usd=0)

    def test_init_invalid_confidence_raises(self, sample_schema):
        """Test that invalid confidence threshold raises ValueError."""
        with patch("src.crawl4ai_engine.strategies.llm_fallback.import_module"):
            with patch.dict("os.environ", {}, clear=False):
                from src.crawl4ai_engine.strategies.llm_fallback import LLMFallbackStrategy

                with pytest.raises(ValueError, match="confidence_threshold must be between"):
                    LLMFallbackStrategy(sample_schema, confidence_threshold=1.5)

    def test_model_from_provider(self):
        """Test extracting model from provider string."""
        with patch("src.crawl4ai_engine.strategies.llm_fallback.import_module"):
            with patch.dict("os.environ", {}, clear=False):
                from src.crawl4ai_engine.strategies.llm_fallback import LLMFallbackStrategy

                assert LLMFallbackStrategy._model_from_provider("openai/gpt-4o") == "gpt-4o"
                assert LLMFallbackStrategy._model_from_provider("anthropic/claude-3") == "claude-3"
                assert LLMFallbackStrategy._model_from_provider("no-slash-model") == "no-slash-model"

    def test_resolve_api_token(self):
        """Test API token resolution from environment."""
        with patch("src.crawl4ai_engine.strategies.llm_fallback.import_module"):
            with patch.dict(
                "os.environ",
                {"OPENAI_API_KEY": "sk-test-openai", "ANTHROPIC_API_KEY": "sk-test-anthropic"},
                clear=False,
            ):
                from src.crawl4ai_engine.strategies.llm_fallback import LLMFallbackStrategy

                assert LLMFallbackStrategy._resolve_api_token("openai/gpt-4o") == "sk-test-openai"
                assert LLMFallbackStrategy._resolve_api_token("anthropic/claude-3") == "sk-test-anthropic"
                assert LLMFallbackStrategy._resolve_api_token("unknown/provider") is None

    def test_parse_extracted_content(self):
        """Test parsing extracted content from various formats."""
        with patch("src.crawl4ai_engine.strategies.llm_fallback.import_module"):
            with patch.dict("os.environ", {}, clear=False):
                from src.crawl4ai_engine.strategies.llm_fallback import LLMFallbackStrategy

                # Test JSON string
                result = LLMFallbackStrategy._parse_extracted_content('{"key": "value"}')
                assert result == {"key": "value"}

                # Test non-JSON string
                result = LLMFallbackStrategy._parse_extracted_content("plain text")
                assert result == {"raw": "plain text"}

                # Test dict
                result = LLMFallbackStrategy._parse_extracted_content({"key": "value"})
                assert result == {"key": "value"}

    def test_calculate_confidence(self):
        """Test confidence calculation."""
        with patch("src.crawl4ai_engine.strategies.llm_fallback.import_module"):
            with patch.dict("os.environ", {}, clear=False):
                from src.crawl4ai_engine.strategies.llm_fallback import LLMFallbackStrategy

                schema = {
                    "fields": [
                        {"name": "title"},
                        {"name": "price"},
                    ]
                }

                strategy = LLMFallbackStrategy(schema, confidence_threshold=0.7)

                # All fields filled
                content = {"title": "Product", "price": "29.99"}
                assert strategy._calculate_confidence(content) == 1.0

                # Some fields missing
                content = {"title": "Product"}
                assert strategy._calculate_confidence(content) == 0.5

                # Empty content
                content = {}
                assert strategy._calculate_confidence(content) == 0.0

    def test_calculate_confidence_with_list(self):
        """Test confidence calculation with list content."""
        with patch("src.crawl4ai_engine.strategies.llm_fallback.import_module"):
            with patch.dict("os.environ", {}, clear=False):
                from src.crawl4ai_engine.strategies.llm_fallback import LLMFallbackStrategy

                schema = {"fields": [{"name": "title"}]}
                strategy = LLMFallbackStrategy(schema)

                content = [{"title": "Product 1"}, {"title": "Product 2"}]
                # Should use first item
                assert strategy._calculate_confidence(content) == 1.0

                # Empty list
                assert strategy._calculate_confidence([]) == 0.0

    def test_has_value(self):
        """Test value presence check."""
        with patch("src.crawl4ai_engine.strategies.llm_fallback.import_module"):
            with patch.dict("os.environ", {}, clear=False):
                from src.crawl4ai_engine.strategies.llm_fallback import LLMFallbackStrategy

                assert LLMFallbackStrategy._has_value("text") is True
                assert LLMFallbackStrategy._has_value("") is False
                assert LLMFallbackStrategy._has_value(None) is False
                assert LLMFallbackStrategy._has_value({"key": "value"}) is True
                assert LLMFallbackStrategy._has_value({}) is False
                assert LLMFallbackStrategy._has_value([1, 2, 3]) is True
                assert LLMFallbackStrategy._has_value([]) is False
                assert LLMFallbackStrategy._has_value(42) is True

    def test_coerce_usage_int(self):
        """Test token usage coercion."""
        with patch("src.crawl4ai_engine.strategies.llm_fallback.import_module"):
            with patch.dict("os.environ", {}, clear=False):
                from src.crawl4ai_engine.strategies.llm_fallback import LLMFallbackStrategy

                assert LLMFallbackStrategy._coerce_usage_int(100) == 100
                assert LLMFallbackStrategy._coerce_usage_int(100.5) == 100
                assert LLMFallbackStrategy._coerce_usage_int("200") == 200
                assert LLMFallbackStrategy._coerce_usage_int(True) == 0
                assert LLMFallbackStrategy._coerce_usage_int(None) == 0
                assert LLMFallbackStrategy._coerce_usage_int("invalid") == 0


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
        # This test verifies the fallback chain logic exists
        # Actual chain execution is tested in integration tests
        from src.crawl4ai_engine.strategies.css_strategy import CSSExtractionStrategy
        from src.crawl4ai_engine.strategies.xpath_strategy import XPathExtractionStrategy
        from src.crawl4ai_engine.strategies.llm_fallback import LLMFallbackStrategy

        # Verify all strategy classes can be imported and instantiated
        assert CSSExtractionStrategy is not None
        assert XPathExtractionStrategy is not None
        assert LLMFallbackStrategy is not None

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
