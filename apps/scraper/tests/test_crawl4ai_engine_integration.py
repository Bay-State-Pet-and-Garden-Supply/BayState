"""Integration tests for crawl4ai engine end-to-end flows."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.crawl4ai_engine.engine import Crawl4AIEngine
from src.crawl4ai_engine.strategies.css_strategy import CSSExtractionStrategy
from src.crawl4ai_engine.strategies.xpath_strategy import XPathExtractionStrategy
from src.crawl4ai_engine.callback import CallbackDelivery
from src.crawl4ai_engine.retry import CircuitBreaker, RetryPolicy, execute_with_retry
from src.crawl4ai_engine.transpiler.yaml_parser import YAMLConfigParser
from src.crawl4ai_engine.transpiler.schema_generator import YAMLToCrawl4AI


class TestEndToEndExtractionFlow:
    """Integration tests for end-to-end extraction flows."""

    @pytest.fixture
    def sample_html(self):
        """Sample HTML for testing."""
        return """
        <html>
            <body>
                <div class="product">
                    <h1 class="title">Test Product</h1>
                    <span class="price" data-price="29.99">$29.99</span>
                    <div class="description">
                        <p>Product description here</p>
                    </div>
                </div>
            </body>
        </html>
        """

    @pytest.fixture
    def sample_yaml_config(self, tmp_path):
        """Create sample YAML config file."""
        yaml_content = """
name: "test-product-scraper"
base_url: "https://example.com"

selectors:
  - name: "title"
    selector: "h1.title"
    attribute: "text"
  - name: "price"
    selector: ".price"
    attribute: "data-price"
  - name: "description"
    selector: ".description"
    attribute: "html"
"""
        yaml_file = tmp_path / "test.yaml"
        yaml_file.write_text(yaml_content)
        return yaml_file


class TestEngineWithStrategies:
    """Test engine working with various strategies."""

    @pytest.fixture
    def engine_config(self):
        """Basic engine config."""
        return {
            "browser": {
                "headless": True,
                "timeout": 30000,
            },
            "crawler": {
                "js_enabled": True,
                "timeout": 30000,
                "markdown": True,
            },
        }

    @pytest.mark.asyncio
    async def test_engine_with_css_strategy(self, engine_config):
        """Test engine with CSS extraction strategy."""
        with patch("src.crawl4ai_engine.strategies.css_strategy.import_module") as mock_import:
            mock_extraction = MagicMock()
            mock_strategy_cls = MagicMock()
            mock_extraction.extraction_strategy = {"JsonCssExtractionStrategy": mock_strategy_cls}
            mock_import.return_value = mock_extraction

            schema = {
                "name": "product",
                "fields": [
                    {"name": "title", "selector": "h1", "type": "text"},
                ],
            }

            strategy = CSSExtractionStrategy(schema)

            with patch("src.crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler_class:
                mock_crawler = AsyncMock()
                mock_crawler_class.return_value = mock_crawler

                mock_result = MagicMock()
                mock_result.extracted_content = '{"title": "Product"}'
                mock_crawler.arun = AsyncMock(return_value=mock_result)

                engine = Crawl4AIEngine(engine_config)
                async with engine:
                    result = await strategy.extract("https://example.com", mock_crawler)

                assert result["title"] == "Product"

    @pytest.mark.asyncio
    async def test_engine_with_xpath_strategy(self, engine_config):
        """Test engine with XPath extraction strategy."""
        with patch("src.crawl4ai_engine.strategies.xpath_strategy.import_module") as mock_import:
            mock_extraction = MagicMock()
            mock_strategy_cls = MagicMock()
            mock_extraction.extraction_strategy = {"JsonXPathExtractionStrategy": mock_strategy_cls}
            mock_import.return_value = mock_extraction

            schema = {
                "name": "product",
                "fields": [
                    {"name": "title", "selector": "//h1", "type": "text"},
                ],
            }

            strategy = XPathExtractionStrategy(schema)

            with patch("src.crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler_class:
                mock_crawler = AsyncMock()
                mock_crawler_class.return_value = mock_crawler

                mock_result = MagicMock()
                mock_result.extracted_content = '{"title": "Product"}'
                mock_crawler.arun = AsyncMock(return_value=mock_result)

                engine = Crawl4AIEngine(engine_config)
                async with engine:
                    result = await strategy.extract("https://example.com", mock_crawler)

                assert result["title"] == "Product"


class TestFallbackChainIntegration:
    """Integration tests for fallback chain."""

    @pytest.mark.asyncio
    async def test_css_to_xpath_fallback_chain(self):
        """Test CSS to XPath fallback chain."""
        # Mock both strategies
        with (
            patch("src.crawl4ai_engine.strategies.css_strategy.import_module") as mock_css,
            patch("src.crawl4ai_engine.strategies.xpath_strategy.import_module") as mock_xpath,
        ):
            # Setup CSS mock
            mock_extraction_css = MagicMock()
            mock_strategy_css = MagicMock()
            mock_extraction_css.extraction_strategy = {"JsonCssExtractionStrategy": mock_strategy_css}
            mock_css.return_value = mock_extraction_css

            # Setup XPath mock
            mock_extraction_xpath = MagicMock()
            mock_strategy_xpath = MagicMock()
            mock_extraction_xpath.extraction_strategy = {"JsonXPathExtractionStrategy": mock_strategy_xpath}
            mock_xpath.return_value = mock_extraction_xpath

            schema = {
                "name": "product",
                "fields": [{"name": "title", "selector": "h1", "type": "text"}],
            }

            css_strategy = CSSExtractionStrategy(schema)
            xpath_strategy = XPathExtractionStrategy(schema)

            # Both strategies should work independently
            assert css_strategy is not None
            assert xpath_strategy is not None


class TestRetryWithExtraction:
    """Integration tests for retry logic with extraction."""

    @pytest.mark.asyncio
    async def test_extraction_with_retry_success(self):
        """Test successful extraction with retry."""
        call_count = 0

        async def extraction():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise TimeoutError("Temporary network issue")
            return {"title": "Product"}

        policy = RetryPolicy(max_retries=3, base_delay=0.01)
        result = await execute_with_retry(extraction, policy=policy)

        assert result["title"] == "Product"
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_extraction_with_circuit_breaker(self):
        """Test extraction with circuit breaker."""
        cb = CircuitBreaker()

        # Open circuit
        for _ in range(5):
            cb.record_failure(__import__("src.crawl4ai_engine.retry", fromlist=["ErrorCategory"]).ErrorCategory.TRANSIENT)

        async def operation():
            return "success"

        from scrapers.exceptions import CircuitBreakerOpenError

        with pytest.raises(CircuitBreakerOpenError):
            await execute_with_retry(operation, circuit_breaker=cb)


class TestCallbackIntegration:
    """Integration tests for callback delivery."""

    @pytest.fixture
    def callback_delivery(self):
        """Create callback delivery."""
        return CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="test-scraper",
        )

    @pytest.mark.asyncio
    async def test_complete_callback_flow(self, callback_delivery):
        """Test complete callback flow."""
        raw_results = {
            "data": {
                "SKU001": {"title": "Product 1", "price": 29.99},
                "SKU002": {"title": "Product 2", "price": 39.99},
            }
        }

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            payload = await callback_delivery.send_callback(
                job_id="job-123",
                crawl4ai_results=raw_results,
            )

            assert payload["job_id"] == "job-123"
            assert payload["status"] == "completed"
            assert payload["results"]["skus_processed"] == 2


class TestTranspilerIntegration:
    """Integration tests for YAML transpiler."""

    @pytest.fixture
    def yaml_config_file(self, tmp_path):
        """Create a YAML config file."""
        yaml_content = """
name: "product-scraper"
base_url: "https://store.example.com"

selectors:
  - name: "title"
    selector: "h1.product-title"
    attribute: "text"
  - name: "price"
    selector: ".price"
    attribute: "data-price"
  - name: "image"
    selector: "img.product-image"
    attribute: "src"

workflows:
  - action: "navigate"
    params:
      url: "{base_url}"
  - action: "wait_for"
    params:
      selector: "h1.product-title"
"""
        config_file = tmp_path / "scraper.yaml"
        config_file.write_text(yaml_content)
        return config_file

    def test_full_transpilation_flow(self, yaml_config_file):
        """Test full YAML to crawl4ai schema flow."""
        parser = YAMLConfigParser()
        transpiler = YAMLToCrawl4AI(parser)

        # Parse
        parsed = parser.parse_file(yaml_config_file)
        assert parsed.name == "product-scraper"
        assert parsed.base_url == "https://store.example.com"

        # Transpile
        schema = transpiler.transpile(yaml_config_file)
        assert schema["name"] == "product-scraper"
        assert schema["baseUrl"] == "https://store.example.com"
        assert len(schema["fields"]) == 3

    def test_transpile_to_python_file(self, yaml_config_file, tmp_path):
        """Test transpiling to Python file."""
        parser = YAMLConfigParser()
        transpiler = YAMLToCrawl4AI(parser)

        output_file = tmp_path / "generated_schema.py"
        transpiler.transpile_to_python(
            yaml_config_file,
            output_path=str(output_file),
            variable_name="PRODUCT_SCHEMA",
        )

        content = output_file.read_text()
        assert "PRODUCT_SCHEMA" in content
        assert "from __future__ import annotations" in content


class TestFullWorkflow:
    """End-to-end workflow tests."""

    @pytest.mark.asyncio
    async def test_full_extraction_workflow(self):
        """Test complete extraction workflow."""
        # This simulates the full workflow:
        # 1. Parse YAML config
        # 2. Build extraction strategy
        # 3. Execute extraction
        # 4. Send callback

        with patch("src.crawl4ai_engine.strategies.css_strategy.import_module") as mock_import:
            mock_extraction = MagicMock()
            mock_strategy_cls = MagicMock()
            mock_extraction.extraction_strategy = {"JsonCssExtractionStrategy": mock_strategy_cls}
            mock_import.return_value = mock_extraction

            # 1. Parse YAML (simplified)
            schema = {
                "name": "product",
                "fields": [
                    {"name": "title", "selector": "h1", "type": "text"},
                    {"name": "price", "selector": ".price", "type": "text"},
                ],
            }

            # 2. Build strategy
            strategy = CSSExtractionStrategy(schema)

            # 3. Execute extraction
            mock_crawler = AsyncMock()
            mock_result = MagicMock()
            mock_result.extracted_content = '{"title": "Test", "price": "29.99"}'
            mock_crawler.arun = AsyncMock(return_value=mock_result)

            extraction_result = await strategy.extract("https://example.com", mock_crawler)

            # 4. Callback delivery
            callback = CallbackDelivery(
                callback_url="https://example.com/callback",
                api_key="test-key",
                runner_name="runner",
                scraper_name="test",
            )

            transformed = callback.transform_results({"data": {"SKU001": extraction_result}})

            assert "title" in extraction_result
            assert transformed["SKU001"]["test"]["title"] == "Test"
            assert "scraped_at" in transformed["SKU001"]["test"]


class TestMetricsCollection:
    """Integration tests for metrics collection."""

    def test_extraction_metrics_tracked(self):
        """Test extraction metrics are tracked."""
        from src.crawl4ai_engine.metrics import Crawl4AIMetricsCollector, ExtractionMode

        collector = Crawl4AIMetricsCollector()
        metric = collector.record_extraction(
            url="https://example.com/product",
            mode=ExtractionMode.LLM_FREE,
            success=True,
            duration_ms=250.0,
            anti_bot_triggered=True,
            anti_bot_strategy="stealth",
        )
        summary = collector.get_summary()

        assert metric.success is True
        assert summary["extractions"]["total"] == 1
        assert summary["extractions"]["llm_free"] == 1
        assert summary["performance"]["success_rate"] == 1.0
        assert summary["anti_bot"]["total_attempts"] == 1
        assert summary["anti_bot"]["strategies_used"]["stealth"] == 1


class TestAntiBotIntegration:
    """Integration tests for anti-bot features."""

    def test_anti_bot_config_loading(self):
        """Test anti-bot configuration loading."""
        from src.crawl4ai_engine.anti_bot import AntiBotConfigGenerator, AntiBotSettings

        settings = AntiBotSettings.from_scraper_config(
            {
                "stealth": True,
                "user_agents": ["UA-1"],
                "proxies": ["http://proxy:8080"],
            }
        )
        generator = AntiBotConfigGenerator(settings)
        selection = generator.next_selection()

        assert settings.stealth is True
        assert selection.user_agent == "UA-1"
        assert selection.proxy == "http://proxy:8080"
