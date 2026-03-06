"""Tests for Crawl4AI Engine v0.4+ features."""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock


class TestCrawl4AIEngineV04:
    """Test suite for new Crawl4AI Engine features."""

    @pytest.fixture
    def v04_config(self):
        """Configuration with v0.4+ features."""
        return {
            "browser": {
                "headless": True,
            },
            "crawler": {
                "magic": True,
                "simulate_user": True,
                "remove_overlay_elements": True,
                "concurrency_limit": 5,
                "session_id": "test-session",
                "cache_mode": "BYPASS", # Use bypass to verify it's passed
                "css_selector": ".product-main",
                "excluded_tags": ["nav", "footer"],
                "js_code": "window.scrollTo(0, 1000);",
            },
        }

    def test_build_browser_config_v04(self, v04_config):
        """Test browser config building with v0.4+ settings."""
        with (
            patch("crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("crawl4ai_engine.engine.BrowserConfig") as mock_browser_config,
            patch("crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            from crawl4ai_engine.engine import Crawl4AIEngine

            engine = Crawl4AIEngine(v04_config)
            # The __init__ calls it once
            assert mock_browser_config.call_count >= 1
            
            last_call_args = mock_browser_config.call_args
            assert last_call_args.kwargs.get("headless") is True

    def test_build_run_config_v04(self, v04_config):
        """Test crawler run config building with v0.4+ settings."""
        with (
            patch("crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("crawl4ai_engine.engine.BrowserConfig"),
            patch("crawl4ai_engine.engine.CrawlerRunConfig") as mock_run_config,
        ):
            from crawl4ai_engine.engine import Crawl4AIEngine

            engine = Crawl4AIEngine(v04_config)
            # The __init__ calls it once
            assert mock_run_config.call_count >= 1
            
            last_call_args = mock_run_config.call_args.kwargs
            
            assert last_call_args.get("magic") is True
            assert last_call_args.get("simulate_user") is True
            assert last_call_args.get("remove_overlay_elements") is True
            assert last_call_args.get("session_id") == "test-session"
            assert last_call_args.get("css_selector") == ".product-main"
            assert last_call_args.get("excluded_tags") == ["nav", "footer"]
            assert last_call_args.get("js_code") == "window.scrollTo(0, 1000);"
            
            # Verify cache_mode was converted to Enum
            from crawl4ai import CacheMode
            assert last_call_args.get("cache_mode") == CacheMode.BYPASS

    def test_content_filtering_defaults(self):
        """Test default content filtering settings."""
        with (
            patch("crawl4ai_engine.engine.BrowserConfig"),
            patch("crawl4ai_engine.engine.CrawlerRunConfig") as mock_run_config,
        ):
            from crawl4ai_engine.engine import Crawl4AIEngine
            engine = Crawl4AIEngine({})
            _ = engine._build_run_config()
            
            assert mock_run_config.call_count >= 1
            last_call = mock_run_config.call_args
            assert last_call.kwargs.get("css_selector") is None
            # Default excluded tags should be present
            excluded = last_call.kwargs.get("excluded_tags")
            assert "nav" in excluded
            assert "footer" in excluded
            assert "header" in excluded
            assert last_call.kwargs.get("remove_overlay_elements") is True

    def test_domain_session_id_logic(self):
        """Test that domain session ID is correctly extracted."""
        with (
            patch("crawl4ai_engine.engine.BrowserConfig"),
            patch("crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            from crawl4ai_engine.engine import Crawl4AIEngine
            engine = Crawl4AIEngine({})
            
            session_id = engine._get_domain_session_id("https://www.example.com/product/123")
            assert session_id == "session_www_example_com"
            
            session_id = engine._get_domain_session_id("http://sub.domain.org")
            assert session_id == "session_sub_domain_org"

    @pytest.mark.asyncio
    async def test_crawl_uses_domain_session_id(self):
        """Test that crawl uses domain session ID by default."""
        with (
            patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler_class,
            patch("crawl4ai_engine.engine.BrowserConfig"),
            patch("crawl4ai_engine.engine.CrawlerRunConfig") as mock_run_config,
        ):
            mock_crawler = AsyncMock()
            mock_crawler_class.return_value = mock_crawler
            
            from crawl4ai_engine.engine import Crawl4AIEngine
            engine = Crawl4AIEngine({})
            
            async with engine:
                await engine.crawl("https://test.com/item")
                
            mock_crawler.arun.assert_called_once()
            
            # Check constructor calls for CrawlerRunConfig
            assert mock_run_config.call_count >= 2
            last_call = mock_run_config.call_args
            assert last_call.kwargs.get("session_id") == "session_test_com"

    @pytest.mark.asyncio
    async def test_crawl_many_uses_domain_session_ids(self):
        """Test that crawl_many uses per-URL domain session IDs."""
        with (
            patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler_class,
            patch("crawl4ai_engine.engine.BrowserConfig"),
            patch("crawl4ai_engine.engine.CrawlerRunConfig") as mock_run_config,
        ):
            mock_crawler = AsyncMock()
            mock_crawler_class.return_value = mock_crawler
            
            from crawl4ai_engine.engine import Crawl4AIEngine
            engine = Crawl4AIEngine({})
            
            urls = ["https://a.com", "https://b.com"]
            async with engine:
                await engine.crawl_many(urls)
                
            mock_crawler.arun_many.assert_called_once()
            
            # Constructor should be called for each URL (+1 for __init__)
            assert mock_run_config.call_count >= 3
            
            # Get the session IDs passed to constructors
            constructor_session_ids = [
                call.kwargs.get("session_id") 
                for call in mock_run_config.call_args_list[1:]
            ]
            assert "session_a_com" in constructor_session_ids
            assert "session_b_com" in constructor_session_ids

    @pytest.mark.asyncio
    async def test_crawl_many_uses_arun_many(self, v04_config):
        """Test that crawl_many uses the native arun_many method."""
        with (
            patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler_class,
            patch("crawl4ai_engine.engine.BrowserConfig"),
            patch("crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            mock_crawler = AsyncMock()
            mock_crawler_class.return_value = mock_crawler
            
            from crawl4ai_engine.engine import Crawl4AIEngine
            
            engine = Crawl4AIEngine(v04_config)
            urls = ["https://example1.com", "https://example2.com"]
            
            async with engine:
                await engine.crawl_many(urls)
                
            mock_crawler.arun_many.assert_called_once()
            call_kwargs = mock_crawler.arun_many.call_args.kwargs
            assert call_kwargs.get("urls") == urls
            assert call_kwargs.get("concurrency_limit") == 5

    @pytest.mark.asyncio
    async def test_crawl_many_default_concurrency(self):
        """Test that crawl_many uses default concurrency limit of 3."""
        with (
            patch("crawl4ai_engine.engine.AsyncWebCrawler") as mock_crawler_class,
            patch("crawl4ai_engine.engine.BrowserConfig"),
            patch("crawl4ai_engine.engine.CrawlerRunConfig"),
        ):
            mock_crawler = AsyncMock()
            mock_crawler_class.return_value = mock_crawler
            
            from crawl4ai_engine.engine import Crawl4AIEngine
            
            # Config without concurrency_limit
            engine = Crawl4AIEngine({})
            urls = ["https://example1.com", "https://example2.com"]
            
            async with engine:
                await engine.crawl_many(urls)
                
            mock_crawler.arun_many.assert_called_once()
            call_args = mock_crawler.arun_many.call_args
            assert call_args.kwargs.get("concurrency_limit") == 3

    def test_build_fallback_strategy_chain(self):
        """Test building of extraction strategy fallback chain."""
        config = {
            "crawler": {
                "extraction_chain": {
                    "css_selectors": {"name": "h1"},
                    "llm_schema": {"type": "object", "properties": {"name": {"type": "string"}}},
                }
            }
        }
        
        with (
            patch("crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("crawl4ai_engine.engine.BrowserConfig"),
            patch("crawl4ai_engine.engine.CrawlerRunConfig"),
            patch("crawl4ai_engine.engine.build_fallback_chain") as mock_build_chain,
        ):
            mock_build_chain.return_value = ["strategy1", "strategy2"]
            
            from crawl4ai_engine.engine import Crawl4AIEngine
            engine = Crawl4AIEngine(config)
            _ = engine._build_run_config()
            
            assert mock_build_chain.call_count >= 1
            kwargs = mock_build_chain.call_args.kwargs
            assert kwargs.get("css_selectors") == {"name": "h1"}
            assert "llm_schema" in kwargs

    def test_explicit_extraction_strategy(self):
        """Test that explicit extraction strategy is used."""
        mock_strategy = MagicMock()
        config = {
            "crawler": {
                "extraction_strategy": mock_strategy
            }
        }
        
        with (
            patch("crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("crawl4ai_engine.engine.BrowserConfig"),
            patch("crawl4ai_engine.engine.CrawlerRunConfig") as mock_run_config,
        ):
            from crawl4ai_engine.engine import Crawl4AIEngine
            engine = Crawl4AIEngine(config)
            _ = engine._build_run_config()
            
            assert mock_run_config.call_count >= 1
            last_call = mock_run_config.call_args
            assert last_call.kwargs.get("extraction_strategy") == mock_strategy
