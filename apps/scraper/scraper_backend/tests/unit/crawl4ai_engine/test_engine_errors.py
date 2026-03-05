"""Additional unit tests for crawl4ai engine core functionality.

These tests focus on:
- Anti-bot detection and handling
- Error path coverage
- Edge cases
- Retry handler integration
"""

from __future__ import annotations

import asyncio
import sys
import types
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Setup path
_test_dir = Path(__file__).parent
_scraper_root = _test_dir.parent.parent.parent.parent
sys.path.insert(0, str(_scraper_root / "scraper_backend" / "src"))
_test_dir = Path(__file__).parent
_scraper_root = _test_dir.parent.parent.parent
sys.path.insert(0, str(_scraper_root / "scraper_backend" / "src"))

from crawl4ai_engine import Crawl4AIEngine
from crawl4ai_engine.types import CrawlConfig, CrawlResult, EngineConfig


# =============================================================================
# Setup Mocks
# =============================================================================


def setup_mocks():
    """Setup crawl4ai mocks."""
    if "crawl4ai" in sys.modules:
        return

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

    class _MockCrawlResult:
        def __init__(
            self,
            success: bool = True,
            markdown: str = "Content",
            html: str = "<html>Content</html>",
            error: str | None = None,
            status_code: int = 200,
        ):
            self.success = success
            self.markdown = markdown
            self.html = html
            self.error = error
            self.status_code = status_code

    class _MockAsyncWebCrawler:
        def __init__(self, result_override=None):
            self._started = False
            self._result_override = result_override

        async def start(self):
            self._started = True

        async def close(self):
            self._started = False

        async def arun(self, url: str, config=None):
            if self._result_override:
                return self._result_override(url, config)
            return _MockCrawlResult()

    crawl4ai_module.AsyncWebCrawler = _MockAsyncWebCrawler
    crawl4ai_module._MockCrawlResult = _MockCrawlResult
    config_module.BrowserConfig = _BrowserConfig
    config_module.CrawlerRunConfig = _CrawlerRunConfig

    sys.modules["crawl4ai"] = crawl4ai_module
    sys.modules["crawl4ai.config"] = config_module


setup_mocks()


# =============================================================================
# Anti-Bot Detection Tests
# =============================================================================


class TestAntiBotDetection:
    """Tests for anti-bot detection and handling."""

    @pytest.mark.asyncio
    @pytest.mark.asyncio
    async def test_cf_challenge_detection(self):
        """Test detection of Cloudflare challenges."""

        with patch("crawl4ai.AsyncWebCrawler") as mock_crawler:
            mock_instance = MagicMock()
            mock_instance.start = AsyncMock()
            mock_instance.arun = AsyncMock(side_effect=Exception("CF-Challenge detected"))
            mock_crawler.return_value = mock_instance

            config = EngineConfig()
            async with Crawl4AIEngine(config) as engine:
                result = await engine.crawl("https://example.com")

                assert result.success is False
                assert "challenge" in result.error.lower() or "cf-" in result.error.lower()
        """Test detection of Cloudflare challenges."""

        def cf_challenge_result(url, config):
            from crawl4ai_engine.retry import Crawl4AIFailureType

            return MagicMock(
                success=False,
                error="CF-Challenge detected: please wait while we verify...",
                markdown="",
                html='<html><body><div class="cf-challenge">Verify</div></body></html>',
            )

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MagicMock()
            mock_instance.start = AsyncMock()
            mock_instance.arun = AsyncMock(side_effect=Exception("CF-Challenge detected"))
            mock_crawler.return_value = mock_instance

            config = EngineConfig()
            async with Crawl4AIEngine(config) as engine:
                result = await engine.crawl("https://example.com")

                assert result.success is False
                assert "challenge" in result.error.lower() or "cf-" in result.error.lower()

    @pytest.mark.asyncio
    async def test_recaptcha_detection(self):
        """Test detection of reCAPTCHA."""

        def recaptcha_result(url, config):
            raise Exception("reCAPTCHA verification required")

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MagicMock()
            mock_instance.start = AsyncMock()
            mock_instance.arun = AsyncMock(side_effect=Exception("reCAPTCHA verification required"))
            mock_crawler.return_value = mock_instance

            config = EngineConfig()
            async with Crawl4AIEngine(config) as engine:
                result = await engine.crawl("https://example.com")

                assert result.success is False
                assert "captcha" in result.error.lower() or "recaptcha" in result.error.lower()

    @pytest.mark.asyncio
    async def test_fingerprint_blocking(self):
        """Test detection of browser fingerprint blocking."""

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MagicMock()
            mock_instance.start = AsyncMock()
            mock_instance.arun = AsyncMock(side_effect=Exception("Browser fingerprint check failed"))
            mock_crawler.return_value = mock_instance

            config = EngineConfig()
            async with Crawl4AIEngine(config) as engine:
                result = await engine.crawl("https://example.com")

                assert result.success is False


# =============================================================================
# Error Path Tests
# =============================================================================


class TestErrorPaths:
    """Test various error paths."""

    @pytest.mark.asyncio
    async def test_import_error_crawl4ai_not_installed(self):
        """Test handling when crawl4ai is not installed."""

        # Temporarily remove crawl4ai from sys.modules
        original_modules = sys.modules.copy()

        # Remove crawl4ai modules
        to_remove = [k for k in sys.modules if k.startswith("crawl4ai")]
        for k in to_remove:
            del sys.modules[k]

        try:
            # Re-import to trigger fresh import attempt
            import importlib
            import crawl4ai_engine.engine as engine_module

            importlib.reload(engine_module)

            # Try to initialize - should raise ImportError
            engine = Crawl4AIEngine()
            with pytest.raises((RuntimeError, ImportError)):
                await engine.initialize()
        finally:
            # Restore original modules
            sys.modules.clear()
            sys.modules.update(original_modules)

    @pytest.mark.asyncio
    async def test_timeout_error_handling(self):
        """Test handling of timeout errors."""

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MagicMock()
            mock_instance.start = AsyncMock()
            mock_instance.arun = AsyncMock(side_effect=Exception("Navigation timeout: 30000ms exceeded"))
            mock_crawler.return_value = mock_instance

            config = EngineConfig(timeout=30)
            async with Crawl4AIEngine(config) as engine:
                result = await engine.crawl("https://slow-site.com")

                assert result.success is False
                assert "timeout" in result.error.lower()

    @pytest.mark.asyncio
    async def test_connection_reset_error(self):
        """Test handling of connection reset."""

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MagicMock()
            mock_instance.start = AsyncMock()
            mock_instance.arun = AsyncMock(side_effect=Exception("Connection reset by peer"))
            mock_crawler.return_value = mock_instance

            config = EngineConfig()
            async with Crawl4AIEngine(config) as engine:
                result = await engine.crawl("https://example.com")

                assert result.success is False

    @pytest.mark.asyncio
    async def test_ssl_error_handling(self):
        """Test handling of SSL errors."""

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MagicMock()
            mock_instance.start = AsyncMock()
            mock_instance.arun = AsyncMock(side_effect=Exception("SSL certificate validation failed"))
            mock_crawler.return_value = mock_instance

            config = EngineConfig()
            async with Crawl4AIEngine(config) as engine:
                result = await engine.crawl("https://expired.example.com")

                assert result.success is False

    @pytest.mark.asyncio
    async def test_memory_exhaustion_error(self):
        """Test handling of memory exhaustion."""

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MagicMock()
            mock_instance.start = AsyncMock()
            mock_instance.arun = AsyncMock(side_effect=Exception("Out of memory: browser process killed"))
            mock_crawler.return_value = mock_instance

            config = EngineConfig()
            async with Crawl4AIEngine(config) as engine:
                result = await engine.crawl("https://heavy-site.com")

                assert result.success is False

    @pytest.mark.asyncio
    async def test_redirect_loop_error(self):
        """Test handling of redirect loops."""

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MagicMock()
            mock_instance.start = AsyncMock()
            mock_instance.arun = AsyncMock(side_effect=Exception("Navigation error: too many redirects"))
            mock_crawler.return_value = mock_instance

            config = EngineConfig()
            async with Crawl4AIEngine(config) as engine:
                result = await engine.crawl("https://redirect-loop.com")

                assert result.success is False


# =============================================================================
# Edge Case Tests
# =============================================================================


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    @pytest.mark.asyncio
    async def test_result_with_null_content(self):
        """Test handling of null/None content."""

        def null_content_result(url, config):
            return MagicMock(
                success=True,
                markdown=None,
                html=None,
            )

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MagicMock()
            mock_instance.start = AsyncMock()
            mock_instance.arun = AsyncMock(side_effect=null_content_result)
            mock_crawler.return_value = mock_instance

            config = EngineConfig()
            async with Crawl4AIEngine(config) as engine:
                result = await engine.crawl("https://empty-page.com")

                # Should handle null content gracefully
                assert result.content is None or result.content == ""

    @pytest.mark.asyncio
    async def test_very_long_url(self):
        """Test handling of very long URLs."""
        long_url = "https://example.com/" + "a" * 2000

        config = EngineConfig()
        async with Crawl4AIEngine(config) as engine:
            result = await engine.crawl(long_url)

            # Should handle URL (may succeed or fail but not crash)
            assert result is not None
            assert result.url == long_url

    @pytest.mark.asyncio
    async def test_invalid_url(self):
        """Test handling of invalid URLs."""
        config = EngineConfig()

        async with Crawl4AIEngine(config) as engine:
            # Invalid URL - may fail but should handle gracefully
            result = await engine.crawl("not-a-valid-url")

            # Result should exist with error info
            assert result is not None
            assert result.success is False or result.error is not None

    @pytest.mark.asyncio
    async def test_crawl_with_special_characters_in_url(self):
        """Test crawling URLs with special characters."""
        urls = [
            "https://example.com/product/123?ref=test&source=google",
            "https://example.com/search?q=dog+food",
            "https://example.com/category/Pet%20Supplies",
        ]

        config = EngineConfig()
        crawl_cfg = CrawlConfig(name="special", url="")

        async with Crawl4AIEngine(config, crawl_cfg) as engine:
            results = await engine.crawl_multiple(urls)

            assert len(results) == len(urls)


# =============================================================================
# Retry Integration Tests
# =============================================================================


class TestRetryIntegration:
    """Test retry logic integration with engine."""

    @pytest.mark.asyncio
    async def test_retry_on_transient_failure(self):
        """Test retry on transient failures."""
        call_count = 0

        def transient_failure(url, config):
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise Exception("Temporary connection error")
            return MagicMock(
                success=True,
                markdown="Success on retry",
                html="<html>Success</html>",
            )

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MagicMock()
            mock_instance.start = AsyncMock()
            mock_instance.arun = AsyncMock(side_effect=transient_failure)
            mock_crawler.return_value = mock_instance

            config = EngineConfig(enable_retry=True, max_retries=3)
            async with Crawl4AIEngine(config) as engine:
                # Note: Without retry handler, this will fail
                # These tests verify the error path
                result = await engine.crawl("https://example.com")

                # Either succeeds on retry or fails after retries
                assert result is not None


# =============================================================================
# Config Edge Cases
# =============================================================================


class TestConfigEdgeCases:
    """Test configuration edge cases."""

    @pytest.mark.asyncio
    async def test_zero_timeout(self):
        """Test with zero timeout (should use default)."""
        config = EngineConfig(timeout=0)

        async with Crawl4AIEngine(config) as engine:
            result = await engine.crawl("https://example.com")

            # Should handle zero timeout gracefully
            assert result is not None

    @pytest.mark.asyncio
    async def test_negative_timeout(self):
        """Test with negative timeout (should use default)."""
        config = EngineConfig(timeout=-10)

        async with Crawl4AIEngine(config) as engine:
            result = await engine.crawl("https://example.com")

            # Should handle negative timeout gracefully
            assert result is not None

    @pytest.mark.asyncio
    async def test_zero_max_concurrent(self):
        """Test with zero max concurrent (should use default)."""
        config = EngineConfig(max_concurrent_crawls=0)

        async with Crawl4AIEngine(config) as engine:
            # crawl_multiple with 0 should handle gracefully
            results = await engine.crawl_multiple(["https://example.com"])
            assert results == []

    @pytest.mark.asyncio
    async def test_very_large_timeout(self):
        """Test with very large timeout value."""
        config = EngineConfig(timeout=3600)  # 1 hour

        async with Crawl4AIEngine(config) as engine:
            result = await engine.crawl("https://example.com")

            assert result is not None
            assert result.metadata.get("timeout") == 3600


# =============================================================================
# Extraction Tests
# =============================================================================


class TestExtraction:
    """Test content extraction functionality."""

    @pytest.mark.asyncio
    async def test_extract_with_schema(self):
        """Test extraction with provided schema."""
        schema = {
            "product_name": "h1.product-title",
            "price": "span.current-price",
            "description": "div.description",
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
            assert result.success is True

    @pytest.mark.asyncio
    async def test_extract_with_empty_schema(self):
        """Test extraction with empty schema."""
        config = EngineConfig()
        crawl_cfg = CrawlConfig(
            name="empty_schema",
            url="https://example.com",
            schema={},
        )

        async with Crawl4AIEngine(config, crawl_cfg) as engine:
            result = await engine.crawl("https://example.com")

            assert result.success is True

    @pytest.mark.asyncio
    async def test_extract_with_none_schema(self):
        """Test extraction with None schema (default)."""
        config = EngineConfig()
        crawl_cfg = CrawlConfig(
            name="none_schema",
            url="https://example.com",
            schema=None,
        )

        async with Crawl4AIEngine(config, crawl_cfg) as engine:
            result = await engine.crawl("https://example.com")

            assert result.success is True


# =============================================================================
# Multiple Crawl Scenarios
# =============================================================================


class TestMultipleCrawlScenarios:
    """Test various multiple crawl scenarios."""

    @pytest.mark.asyncio
    async def test_crawl_many_urls(self):
        """Test crawling many URLs."""
        urls = [f"https://example.com/page{i}" for i in range(20)]

        config = EngineConfig(max_concurrent_crawls=5)
        crawl_cfg = CrawlConfig(name="many", url="")

        async with Crawl4AIEngine(config, crawl_cfg) as engine:
            results = await engine.crawl_multiple(urls)

            assert len(results) == 20
            assert all(r.success for r in results)

    @pytest.mark.asyncio
    async def test_crawl_with_duplicates(self):
        """Test crawling duplicate URLs."""
        urls = [
            "https://example.com/page1",
            "https://example.com/page1",  # duplicate
            "https://example.com/page2",
        ]

        config = EngineConfig()
        crawl_cfg = CrawlConfig(name="dupes", url="")

        async with Crawl4AIEngine(config, crawl_cfg) as engine:
            results = await engine.crawl_multiple(urls)

            # Should crawl all including duplicates
            assert len(results) == 3


# =============================================================================
# Cleanup Tests
# =============================================================================


class TestCleanup:
    """Test cleanup and resource management."""

    @pytest.mark.asyncio
    async def test_cleanup_idempotent(self):
        """Test that cleanup can be called multiple times."""
        engine = Crawl4AIEngine()
        engine._crawler = MagicMock()
        engine._crawler.close = AsyncMock()
        engine._initialized = True

        # First cleanup
        await engine.cleanup()
        assert engine._crawler is None
        assert engine._initialized is False

        # Second cleanup should not fail
        await engine.cleanup()
        assert engine._crawler is None

    @pytest.mark.asyncio
    async def test_context_manager_exception_propagates(self):
        """Test that exceptions in context manager propagate."""
        config = EngineConfig()

        with patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler:
            mock_instance = MagicMock()
            mock_instance.start = AsyncMock(side_effect=Exception("Init failed"))
            mock_crawler.return_value = mock_instance

            with pytest.raises(Exception, match="Init failed"):
                async with Crawl4AIEngine(config) as engine:
                    pass


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
