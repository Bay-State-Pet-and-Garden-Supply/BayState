"""Integration tests for Crawl4AI Engine with mocked crawl4ai.

These tests verify the full crawl flow with mocked crawl4ai library,
testing various page types, error conditions, and edge cases.
"""

from __future__ import annotations

import asyncio
import sys
import types
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Add scraper_backend/src to path for imports
_test_dir = Path(__file__).parent
_scraper_root = _test_dir.parent.parent.parent.parent
sys.path.insert(0, str(_scraper_root / "scraper_backend" / "src"))
_test_dir = Path(__file__).parent
_scraper_root = _test_dir.parent.parent.parent
sys.path.insert(0, str(_scraper_root / "scraper_backend" / "src"))
_test_dir = Path(__file__).parent
_scraper_root = _test_dir.parent.parent.parent
sys.path.insert(0, str(_scraper_root / "scraper_backend" / "src"))

# Import after path setup
from crawl4ai_engine import Crawl4AIEngine
from crawl4ai_engine.types import CrawlConfig, CrawlResult, EngineConfig


# =============================================================================
# Test Setup - Mock crawl4ai
# =============================================================================


class MockCrawlResult:
    """Mock crawl result for testing."""

    def __init__(
        self,
        success: bool = True,
        markdown: str = "Test content",
        html: str = "<html>Test</html>",
        error: str | None = None,
        status_code: int = 200,
    ):
        self.success = success
        self.markdown = markdown
        self.html = html
        self.error = error
        self.status_code = status_code


class MockAsyncWebCrawler:
    """Mock AsyncWebCrawler for integration tests."""

    def __init__(self, result_override=None):
        self._started = False
        self._result_override = result_override

    async def start(self):
        self._started = True

    async def close(self):
        self._started = False

    async def arun(self, url: str, config=None):
        if self._result_override:
            if callable(self._result_override):
                return self._result_override(url, config)
            return self._result_override
        return MockCrawlResult(
            success=True,
            markdown=f"Content from {url}",
            html=f"<html><body>Content from {url}</body></html>",
        )


def setup_mocks():
    """Setup all necessary mocks."""
    if "crawl4ai" not in sys.modules:
        crawl4ai_module = types.ModuleType("crawl4ai")
        config_module = types.ModuleType("crawl4ai.config")

        class _BrowserConfig:
            def __init__(self, **kwargs):
                for k, v in kwargs.items():
                    setattr(self, k, v)

        class _CrawlerRunConfig:
            def __init__(self, **kwargs):
                for k, v in kwargs.items():
                    setattr(self, k, v)

        crawl4ai_module.AsyncWebCrawler = MockAsyncWebCrawler
        config_module.BrowserConfig = _BrowserConfig
        config_module.CrawlerRunConfig = _CrawlerRunConfig

        sys.modules["crawl4ai"] = crawl4ai_module
        sys.modules["crawl4ai.config"] = config_module


setup_mocks()


# =============================================================================
# Integration Tests
# =============================================================================


class TestEngineFullFlow:
    """Test complete engine flow from initialization to cleanup."""

    @pytest.mark.asyncio
    async def test_full_crawl_flow_success(self):
        """Test complete crawl flow with successful result."""
        config = EngineConfig(headless=True, timeout=30)
        crawl_cfg = CrawlConfig(name="test", url="https://example.com")

        async with Crawl4AIEngine(config, crawl_cfg) as engine:
            result = await engine.crawl("https://example.com")

            assert result.success is True
            assert result.url == "https://example.com"
            assert result.content is not None
            assert result.response_time is not None

    @pytest.mark.asyncio
    async def test_crawl_with_custom_config(self):
        """Test crawl with custom crawl configuration."""
        config = EngineConfig(headless=True)
        crawl_cfg = CrawlConfig(
            name="custom",
            url="https://example.com",
            css_selector=".product",
            wait_for=".loaded",
            js_enabled=True,
        )

        async with Crawl4AIEngine(config, crawl_cfg) as engine:
            result = await engine.crawl(
                "https://example.com",
                css_selector=".custom-product",
            )

            assert result.success is True

    @pytest.mark.asyncio
    async def test_crawl_multiple_urls(self):
        """Test crawling multiple URLs concurrently."""
        config = EngineConfig(max_concurrent_crawls=3)
        crawl_cfg = CrawlConfig(name="batch", url="")

        urls = [
            "https://example.com/page1",
            "https://example.com/page2",
            "https://example.com/page3",
        ]

        async with Crawl4AIEngine(config, crawl_cfg) as engine:
            results = await engine.crawl_multiple(urls)

            assert len(results) == 3
            assert all(r.success for r in results)

    @pytest.mark.asyncio
    async def test_engine_initialization_lazy(self):
        """Test that engine initializes on first crawl if not manually initialized."""
        engine = Crawl4AIEngine()

        # Should auto-initialize
        result = await engine.crawl("https://example.com")

        assert engine.is_initialized is True
        assert result.success is True

    @pytest.mark.asyncio
    async def test_cleanup_handles_errors(self):
        """Test that cleanup handles errors gracefully."""
        engine = Crawl4AIEngine()
        engine._crawler = MagicMock()
        engine._crawler.close = AsyncMock(side_effect=Exception("Cleanup error"))
        engine._initialized = True

        # Should not raise
        await engine.cleanup()

        assert engine._crawler is None
        assert engine._initialized is False


class TestEngineErrorHandling:
    """Test engine error handling and edge cases."""

    @pytest.mark.asyncio
    async def test_crawl_handles_crawl4ai_error(self):
        """Test that crawl handles crawl4ai errors gracefully."""

        def error_result(url, config):
            return MockCrawlResult(
                success=False,
                error="Navigation error: timeout",
            )

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MockAsyncWebCrawler(result_override=error_result)
            mock_crawler.return_value = mock_instance

            config = EngineConfig()
            async with Crawl4AIEngine(config) as engine:
                result = await engine.crawl("https://example.com")

                assert result.success is False
                assert result.error is not None
                assert "timeout" in result.error.lower()

    @pytest.mark.asyncio
    async def test_crawl_handles_exception(self):
        """Test that crawl handles exceptions from crawler."""

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MagicMock()
            mock_instance.start = AsyncMock()
            mock_instance.arun = AsyncMock(side_effect=Exception("Browser crash"))
            mock_crawler.return_value = mock_instance

            config = EngineConfig()
            async with Crawl4AIEngine(config) as engine:
                result = await engine.crawl("https://example.com")

                assert result.success is False
                assert result.error is not None
                assert "Browser crash" in result.error

    @pytest.mark.asyncio
    async def test_crawl_multiple_with_failures(self):
        """Test crawl_multiple handles individual URL failures."""
        call_count = 0

        def varying_result(url, config):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                return MockCrawlResult(success=False, error="Failed")
            return MockCrawlResult(success=True, markdown=f"Content {url}")

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MockAsyncWebCrawler(result_override=varying_result)
            mock_crawler.return_value = mock_instance

            config = EngineConfig()
            crawl_cfg = CrawlConfig(name="test", url="")

            async with Crawl4AIEngine(config, crawl_cfg) as engine:
                results = await engine.crawl_multiple(
                    [
                        "https://example.com/1",
                        "https://example.com/2",
                        "https://example.com/3",
                    ]
                )

                assert len(results) == 3
                assert results[0].success is True
                assert results[1].success is False
                assert results[2].success is True


class TestEngineWithPageTypes:
    """Test engine with different page types."""

    @pytest.mark.asyncio
    async def test_crawl_product_listing(self, product_listing_html):
        """Test crawling a product listing page."""
        result = MockCrawlResult(
            success=True,
            markdown=product_listing_html,
            html=product_listing_html,
        )

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MockAsyncWebCrawler(result_override=lambda u, c: result)
            mock_crawler.return_value = mock_instance

            config = EngineConfig()
            async with Crawl4AIEngine(config) as engine:
                crawl_result = await engine.crawl("https://example.com/products")

                assert crawl_result.success is True
                assert "Premium Dog Food" in crawl_result.html or "Premium Dog Food" in crawl_result.content

    @pytest.mark.asyncio
    async def test_crawl_search_results(self, search_results_html):
        """Test crawling a search results page."""
        result = MockCrawlResult(
            success=True,
            markdown=search_results_html,
            html=search_results_html,
        )

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MockAsyncWebCrawler(result_override=lambda u, c: result)
            mock_crawler.return_value = mock_instance

            config = EngineConfig()
            async with Crawl4AIEngine(config) as engine:
                crawl_result = await engine.crawl("https://example.com/search?q=dog+food")

                assert crawl_result.success is True

    @pytest.mark.asyncio
    async def test_crawl_form_page(self, form_page_html):
        """Test crawling a page with forms."""
        result = MockCrawlResult(
            success=True,
            markdown=form_page_html,
            html=form_page_html,
        )

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MockAsyncWebCrawler(result_override=lambda u, c: result)
            mock_crawler.return_value = mock_instance

            config = EngineConfig()
            async with Crawl4AIEngine(config) as engine:
                crawl_result = await engine.crawl("https://example.com/login")

                assert crawl_result.success is True
                assert "login-form" in crawl_result.html

    @pytest.mark.asyncio
    async def test_crawl_javascript_spa(self, javascript_heavy_html):
        """Test crawling a JavaScript-heavy SPA."""
        result = MockCrawlResult(
            success=True,
            markdown=javascript_heavy_html,
            html=javascript_heavy_html,
        )

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MockAsyncWebCrawler(result_override=lambda u, c: result)
            mock_crawler.return_value = mock_instance

            config = EngineConfig()
            async with Crawl4AIEngine(config) as engine:
                crawl_result = await engine.crawl("https://example.com/spa")

                assert crawl_result.success is True
                assert "__INITIAL_DATA__" in crawl_result.html


class TestEngineConfiguration:
    """Test engine configuration options."""

    @pytest.mark.asyncio
    async def test_different_browser_types(self):
        """Test engine with different browser types."""
        for browser_type in ["chromium", "firefox", "webkit"]:
            config = EngineConfig(browser_type=browser_type, headless=True)

            async with Crawl4AIEngine(config) as engine:
                result = await engine.crawl("https://example.com")

                assert result.success is True
                assert result.metadata.get("browser_type") == browser_type

    @pytest.mark.asyncio
    async def test_proxy_configuration(self):
        """Test engine with proxy configuration."""
        config = EngineConfig(
            proxy="http://proxy.example.com:8080",
            headless=True,
        )

        async with Crawl4AIEngine(config) as engine:
            result = await engine.crawl("https://example.com")

            # Result should still succeed with proxy
            assert result.success is True

    @pytest.mark.asyncio
    async def test_custom_user_agent(self):
        """Test engine with custom user agent."""
        custom_ua = "Mozilla/5.0 (Test Browser)"
        config = EngineConfig(user_agent=custom_ua, headless=True)

        async with Crawl4AIEngine(config) as engine:
            result = await engine.crawl("https://example.com")

            assert result.success is True


class TestSchemaExtraction:
    """Test schema-based extraction."""

    @pytest.mark.asyncio
    async def test_crawl_with_schema(self):
        """Test crawl with extraction schema."""
        schema = {
            "product_name": "h1.title",
            "price": "span.price",
        }

        config = EngineConfig()
        crawl_cfg = CrawlConfig(
            name="schema_test",
            url="https://example.com",
            schema=schema,
        )

        async with Crawl4AIEngine(config, crawl_cfg) as engine:
            result = await engine.crawl("https://example.com")

            # With mocked crawl4ai, extracted_data may be minimal
            # but the flow should work
            assert result.success is True


class TestConcurrency:
    """Test concurrent crawling scenarios."""

    @pytest.mark.asyncio
    async def test_concurrent_crawl_limit(self):
        """Test that concurrent crawl limit is respected."""
        config = EngineConfig(max_concurrent_crawls=2)
        crawl_cfg = CrawlConfig(name="concurrent", url="")

        async with Crawl4AIEngine(config, crawl_cfg) as engine:
            # This should work without errors
            results = await engine.crawl_multiple(
                [
                    "https://example.com/1",
                    "https://example.com/2",
                    "https://example.com/3",
                ]
            )

            assert len(results) == 3

    @pytest.mark.asyncio
    async def test_empty_url_list(self):
        """Test crawling with empty URL list."""
        config = EngineConfig()
        crawl_cfg = CrawlConfig(name="empty", url="")

        async with Crawl4AIEngine(config, crawl_cfg) as engine:
            results = await engine.crawl_multiple([])

            assert results == []


class TestQuickCrawl:
    """Test quick_crawl convenience function."""

    @pytest.mark.asyncio
    async def test_quick_crawl_basic(self):
        """Test quick_crawl function."""
        from crawl4ai_engine import quick_crawl

        result = await quick_crawl("https://example.com", timeout=30)

        assert result.success is True
        assert result.url == "https://example.com"

    @pytest.mark.asyncio
    async def test_quick_crawl_custom_options(self):
        """Test quick_crawl with custom options."""
        from crawl4ai_engine import quick_crawl

        result = await quick_crawl(
            "https://example.com",
            timeout=60,
            headless=False,
        )

        assert result.success is True


# =============================================================================
# Edge Case Tests
# =============================================================================


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    @pytest.mark.asyncio
    async def test_double_initialization(self):
        """Test that double initialization is handled."""
        engine = Crawl4AIEngine()

        await engine.initialize()
        first_state = engine.is_initialized

        # Should not fail on second init
        await engine.initialize()
        second_state = engine.is_initialized

        assert first_state is True
        assert second_state is True

        await engine.cleanup()

    @pytest.mark.asyncio
    async def test_crawl_before_init(self):
        """Test crawl works without explicit initialization."""
        engine = Crawl4AIEngine()

        # Should auto-initialize
        result = await engine.crawl("https://example.com")

        assert result.success is True
        assert engine.is_initialized is True

        await engine.cleanup()

    @pytest.mark.asyncio
    async def test_result_metadata(self):
        """Test that result metadata is populated."""
        config = EngineConfig(browser_type="firefox", timeout=45)

        async with Crawl4AIEngine(config) as engine:
            result = await engine.crawl("https://example.com")

            assert result.metadata.get("crawler") == "crawl4ai"
            assert result.metadata.get("browser_type") == "firefox"
            assert result.metadata.get("timeout") == 45


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
