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

    def test_init_with_engine_config_dataclass(self):
        """Test engine initialization accepts EngineConfig dataclass inputs."""
        with (
            patch("src.crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("src.crawl4ai_engine.engine.BrowserConfig"),
            patch("src.crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            from src.crawl4ai_engine.engine import Crawl4AIEngine
            from src.crawl4ai_engine.types import EngineConfig

            engine = Crawl4AIEngine(
                EngineConfig(
                    headless=False,
                    browser_type="firefox",
                    timeout=45,
                    max_concurrent_crawls=7,
                    user_agent="BayStateBot/1.0",
                    proxy="http://proxy.example.com:8080",
                )
            )

            assert engine.config["browser"]["headless"] is False
            assert engine.config["browser"]["browser_type"] == "firefox"
            assert engine.config["browser"]["user_agent"] == "BayStateBot/1.0"
            assert engine.config["browser"]["proxy"] == "http://proxy.example.com:8080"
            assert engine.config["crawler"]["timeout"] == 45000
            assert engine.config["crawler"]["concurrency_limit"] == 7

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

    def test_build_browser_config_maps_viewport_and_browser_options(self):
        """Test viewport dictionaries and advanced browser options are normalized."""
        config = {
            "browser": {
                "headless": False,
                "viewport": {"width": 1920, "height": 1080},
                "headers": {"X-Test": "1"},
                "cookies": [{"name": "session", "value": "abc"}],
                "extra_args": ["--disable-extensions"],
                "java_script_enabled": False,
                "user_agent_mode": "random",
                "user_agent_generator_config": {"device_type": "desktop"},
                "text_mode": True,
                "light_mode": True,
            }
        }
        with (
            patch("src.crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("src.crawl4ai_engine.engine.BrowserConfig") as mock_browser_config,
            patch("src.crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            mock_browser_config.return_value = MagicMock()
            from src.crawl4ai_engine.engine import Crawl4AIEngine

            engine = Crawl4AIEngine(config)
            _ = engine._build_browser_config()

            call_args = mock_browser_config.call_args.kwargs
            assert call_args["headless"] is False
            assert call_args["viewport_width"] == 1920
            assert call_args["viewport_height"] == 1080
            assert call_args["headers"] == {"X-Test": "1"}
            assert call_args["cookies"] == [{"name": "session", "value": "abc"}]
            assert call_args["extra_args"] == ["--disable-extensions"]
            assert call_args["java_script_enabled"] is False
            assert call_args["user_agent_mode"] == "random"
            assert call_args["user_agent_generator_config"] == {"device_type": "desktop"}
            assert call_args["text_mode"] is True
            assert call_args["light_mode"] is True

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

    @pytest.mark.asyncio
    async def test_crawl_normalizes_markdown_generation_result(self, basic_config):
        """Test crawl converts MarkdownGenerationResult-like objects into strings."""
        with (
            patch("src.crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("src.crawl4ai_engine.engine.BrowserConfig"),
            patch("src.crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            from src.crawl4ai_engine.engine import Crawl4AIEngine

            engine = Crawl4AIEngine(basic_config)
            markdown_result = MagicMock()
            markdown_result.raw_markdown = "raw markdown"
            markdown_result.fit_markdown = "fit markdown"
            markdown_result.fit_html = "<p>fit html</p>"
            markdown_result.markdown_with_citations = "citations markdown"
            markdown_result.references_markdown = "references markdown"

            mock_result = MagicMock()
            mock_result.url = "https://example.com/final"
            mock_result.success = True
            mock_result.html = "<html>ok</html>"
            mock_result.cleaned_html = "<html>clean</html>"
            mock_result.markdown = markdown_result
            mock_result.extracted_content = '{"ok": true}'
            mock_result.metadata = {"title": "Example"}
            mock_result.links = {"internal": ["https://example.com/about"]}
            mock_result.media = {"images": ["https://example.com/image.jpg"]}

            mock_crawler = AsyncMock()
            mock_crawler.arun.return_value = mock_result
            engine._crawler = mock_crawler

            result = await engine.crawl("https://example.com")

            assert result["url"] == "https://example.com/final"
            assert result["html"] == "<html>ok</html>"
            assert result["cleaned_html"] == "<html>clean</html>"
            assert result["markdown"] == "fit markdown"
            assert result["raw_markdown"] == "raw markdown"
            assert result["fit_markdown"] == "fit markdown"
            assert result["fit_html"] == "<p>fit html</p>"
            assert result["markdown_with_citations"] == "citations markdown"
            assert result["references_markdown"] == "references markdown"
            assert result["metadata"] == {"title": "Example"}
            assert result["links"] == {"internal": ["https://example.com/about"]}
            assert result["media"] == {"images": ["https://example.com/image.jpg"]}

    @pytest.mark.asyncio
    async def test_crawl_uses_error_message_when_error_attr_missing(self, basic_config):
        """Test crawl normalizes failure payloads that only expose error_message."""
        with (
            patch("src.crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("src.crawl4ai_engine.engine.BrowserConfig"),
            patch("src.crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            from src.crawl4ai_engine.engine import Crawl4AIEngine

            engine = Crawl4AIEngine(basic_config)
            mock_result = MagicMock()
            mock_result.success = False
            mock_result.error = None
            mock_result.error_message = "Timed out waiting for selector"

            mock_crawler = AsyncMock()
            mock_crawler.arun.return_value = mock_result
            engine._crawler = mock_crawler

            result = await engine.crawl("https://example.com")

            assert result["success"] is False
            assert result["error"] == "Timed out waiting for selector"


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
