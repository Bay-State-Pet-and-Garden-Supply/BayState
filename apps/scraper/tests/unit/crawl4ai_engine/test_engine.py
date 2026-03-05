"""Tests for Crawl4AI Engine."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestCrawl4AIEngine:
    """Test suite for Crawl4AIEngine."""

    @pytest.fixture
    def basic_config(self):
        """Basic configuration for testing."""
        return {
            "browser": {
                "headless": True,
            },
            "crawler": {
                "js_enabled": True,
                "timeout": 30000,
                "markdown": True,
            },
        }

    def test_init_with_config(self, basic_config):
        """Test engine initialization with config dict."""
        with (
            patch("src.crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("src.crawl4ai_engine.engine.BrowserConfig") as mock_browser_config,
            patch("src.crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            mock_browser_config.return_value = MagicMock()
            from src.crawl4ai_engine.engine import Crawl4AIEngine

            engine = Crawl4AIEngine(basic_config)
            assert engine.config == basic_config
            assert engine._crawler is None

    def test_build_browser_config(self, basic_config):
        """Test browser config building."""
        with (
            patch("src.crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("src.crawl4ai_engine.engine.BrowserConfig") as mock_browser_config,
            patch("src.crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            mock_browser_config.return_value = MagicMock()
            from src.crawl4ai_engine.engine import Crawl4AIEngine

            engine = Crawl4AIEngine(basic_config)
            browser_config = engine._build_browser_config()

            mock_browser_config.assert_called_once()
            call_kwargs = mock_browser_config.call_args.kwargs
            assert call_kwargs.get("headless") is True

    def test_build_run_config(self, basic_config):
        """Test crawler run config building."""
        with (
            patch("src.crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("src.crawl4ai_engine.engine.BrowserConfig"),
            patch("src.crawl4ai_engine.engine.CrawlerRunConfig") as mock_run_config,
        ):
            mock_run_config.return_value = MagicMock()
            from src.crawl4ai_engine.engine import Crawl4AIEngine

            engine = Crawl4AIEngine(basic_config)
            run_config = engine._build_run_config()

            mock_run_config.assert_called_once()

    @pytest.mark.asyncio
    async def test_context_manager_enter(self, basic_config):
        """Test async context manager entry."""
        with (
            patch("src.crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler_class,
            patch("src.crawl4ai_engine.engine.BrowserConfig"),
            patch("src.crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            mock_crawler = AsyncMock()
            mock_crawler_class.return_value = mock_crawler

            from src.crawl4ai_engine.engine import Crawl4AIEngine

            engine = Crawl4AIEngine(basic_config)
            async with engine:
                mock_crawler.__aenter__.assert_called_once()

    @pytest.mark.asyncio
    async def test_context_manager_exit(self, basic_config):
        """Test async context manager exit."""
        with (
            patch("src.crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler_class,
            patch("src.crawl4ai_engine.engine.BrowserConfig"),
            patch("src.crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            mock_crawler = AsyncMock()
            mock_crawler_class.return_value = mock_crawler

            from src.crawl4ai_engine.engine import Crawl4AIEngine

            engine = Crawl4AIEngine(basic_config)
            async with engine:
                pass

            mock_crawler.__aexit__.assert_called_once()

    @pytest.mark.asyncio
    async def test_crawl_without_init_raises(self, basic_config):
        """Test that crawl raises if not in context manager."""
        with (
            patch("src.crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("src.crawl4ai_engine.engine.BrowserConfig"),
            patch("src.crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            from src.crawl4ai_engine.engine import Crawl4AIEngine

            engine = Crawl4AIEngine(basic_config)
            with pytest.raises(RuntimeError, match="not initialized"):
                await engine.crawl("https://example.com")

    def test_crawler_property_not_initialized(self, basic_config):
        """Test crawler property raises when not initialized."""
        with (
            patch("src.crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("src.crawl4ai_engine.engine.BrowserConfig"),
            patch("src.crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            from src.crawl4ai_engine.engine import Crawl4AIEngine

            engine = Crawl4AIEngine(basic_config)
            with pytest.raises(RuntimeError, match="not initialized"):
                _ = engine._crawler


class TestConfigLoading:
    """Test suite for config loading functions."""

    def test_load_config_from_string(self):
        """Test loading config from YAML string."""
        from src.crawl4ai_engine.config import load_config_from_string

        config_str = """
browser:
  headless: true
  timeout: 30000
crawler:
  js_enabled: true
"""
        config = load_config_from_string(config_str)

        assert config["browser"]["headless"] is True
        assert config["browser"]["timeout"] == 30000
        assert config["crawler"]["js_enabled"] is True

    def test_load_config_empty_string(self):
        """Test loading empty config string."""
        from src.crawl4ai_engine.config import load_config_from_string

        config = load_config_from_string("")
        assert config == {}

    def test_merge_configs(self):
        """Test merging two config dictionaries."""
        from src.crawl4ai_engine.config import merge_configs

        base = {
            "browser": {"headless": True, "timeout": 30000},
            "crawler": {"js_enabled": True},
        }
        override = {
            "browser": {"timeout": 60000},
            "extra": "value",
        }

        result = merge_configs(base, override)

        assert result["browser"]["headless"] is True
        assert result["browser"]["timeout"] == 60000
        assert result["crawler"]["js_enabled"] is True
        assert result["extra"] == "value"

    def test_merge_configs_nested(self):
        """Test merging nested configs."""
        from src.crawl4ai_engine.config import merge_configs

        base = {
            "a": {"b": {"c": 1, "d": 2}},
        }
        override = {
            "a": {"b": {"d": 3}},
        }

        result = merge_configs(base, override)

        assert result["a"]["b"]["c"] == 1
        assert result["a"]["b"]["d"] == 3
