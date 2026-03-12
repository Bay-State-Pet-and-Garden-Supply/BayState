"""Tests for Crawl4AI Engine."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestCrawl4AIEngine:
    """Test suite for Crawl4AIEngine."""

    @pytest.fixture
    def basic_config(self):
        """Basic configuration for engine."""
        return {
            "browser": {
                "headless": True,
            },
            "crawler": {
                "js_enabled": True,
                "markdown": True,
                "timeout": 30000,
            },
        }

    def test_init_with_config(self, basic_config):
        """Test engine initialization with config dict."""
        with (
            patch("src.crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("src.crawl4ai_engine.engine.BrowserConfig") as mock_browser_config,
            patch("src.crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            from src.crawl4ai_engine.engine import Crawl4AIEngine

            engine = Crawl4AIEngine(basic_config)

            assert engine.config == basic_config
            mock_browser_config.assert_called()

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
            _ = engine._build_browser_config()

            mock_browser_config.assert_called()
            # Verify specific arguments
            call_args = mock_browser_config.call_args.kwargs
            assert call_args["headless"] is True

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
            _ = engine._build_run_config()

            mock_run_config.assert_called()

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
            async with engine as e:
                assert e == engine
                assert engine._crawler == mock_crawler
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

            assert engine._crawler is None
            mock_crawler.__aexit__.assert_called_once()

    @pytest.mark.asyncio
    async def test_crawl_without_init_raises(self, basic_config):
        """Test crawl raises error if context manager not used."""
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
                _ = engine.crawler


class TestConfigLoading:
    """Test configuration loading and merging."""

    def test_load_config_from_file(self, tmp_path):
        """Test loading config from YAML file."""
        from src.crawl4ai_engine.config import load_config
        d = tmp_path / "config"
        d.mkdir()
        config_file = d / "config.yaml"
        config_file.write_text('browser:\n  headless: false', encoding="utf-8")
        
        config = load_config(str(config_file))
        assert config["browser"]["headless"] is False

    def test_load_config_not_found(self):
        """Test loading non-existent config file raises error."""
        from src.crawl4ai_engine.config import load_config
        with pytest.raises(FileNotFoundError):
            load_config("non_existent_file.yaml")

    def test_merge_configs(self):
        """Test basic config merging."""
        from src.crawl4ai_engine.config import merge_configs
        base = {"a": 1, "b": 2}
        override = {"b": 3, "c": 4}
        result = merge_configs(base, override)
        assert result == {"a": 1, "b": 3, "c": 4}

    def test_merge_configs_nested(self):
        """Test nested config merging."""
        from src.crawl4ai_engine.config import merge_configs
        base = {
            "a": {
                "b": {"c": 1},
            }
        }
        override = {
            "a": {"b": {"d": 3}},
        }

        result = merge_configs(base, override)

        assert result["a"]["b"]["c"] == 1
        assert result["a"]["b"]["d"] == 3
