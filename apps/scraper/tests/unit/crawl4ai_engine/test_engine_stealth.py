"""Tests for Crawl4AI Engine Stealth and Persistence features."""

import pytest
from unittest.mock import MagicMock, patch
from src.crawl4ai_engine.engine import Crawl4AIEngine


class TestCrawl4AIEngineStealth:
    """Test suite for Crawl4AIEngine stealth features."""

    @pytest.fixture
    def stealth_config(self):
        """Configuration with stealth enabled."""
        return {
            "browser": {
                "headless": True,
                "enable_stealth": True,
                "use_persistent_context": True,
            },
            "crawler": {
                "magic": True,
            },
        }

    def test_build_browser_config_stealth(self, stealth_config):
        """Test browser config building with stealth and persistence."""
        with (
            patch("src.crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("src.crawl4ai_engine.engine.BrowserConfig") as mock_browser_config,
            patch("src.crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            mock_browser_config.return_value = MagicMock()
            
            engine = Crawl4AIEngine(stealth_config)
            _ = engine._build_browser_config()

            mock_browser_config.assert_called()
            call_args = mock_browser_config.call_args.kwargs
            
            # These should fail initially (Red Phase)
            assert call_args.get("enable_stealth") is True
            assert call_args.get("use_persistent_context") is True

    def test_default_stealth_values(self):
        """Test that stealth and persistence default to False if not provided."""
        basic_config = {"browser": {}}
        with (
            patch("src.crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("src.crawl4ai_engine.engine.BrowserConfig") as mock_browser_config,
            patch("src.crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            mock_browser_config.return_value = MagicMock()
            
            engine = Crawl4AIEngine(basic_config)
            _ = engine._build_browser_config()

            mock_browser_config.assert_called()
            call_args = mock_browser_config.call_args.kwargs
            
            # These should also be explicitly checked in implementation
            assert call_args.get("enable_stealth") is False
            assert call_args.get("use_persistent_context") is False

    def test_browser_type_config(self):
        """Test that browser_type is correctly passed to BrowserConfig."""
        config = {"browser": {"browser_type": "firefox"}}
        with (
            patch("src.crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("src.crawl4ai_engine.engine.BrowserConfig") as mock_browser_config,
            patch("src.crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            mock_browser_config.return_value = MagicMock()
            
            engine = Crawl4AIEngine(config)
            _ = engine._build_browser_config()

            mock_browser_config.assert_called()
            call_args = mock_browser_config.call_args.kwargs
            
            assert call_args.get("browser_type") == "firefox"
