"""Tests for Crawl4AI Engine Pruning features."""

import pytest
from unittest.mock import MagicMock, patch
from src.crawl4ai_engine.engine import Crawl4AIEngine


class TestCrawl4AIEnginePruning:
    """Test suite for Crawl4AIEngine pruning features."""

    @pytest.fixture
    def pruning_config(self):
        """Configuration with pruning enabled."""
        return {
            "browser": {
                "headless": True,
            },
            "crawler": {
                "pruning_enabled": True,
                "pruning_threshold": 0.4,
                "pruning_threshold_type": "fixed",
                "pruning_min_word_threshold": 12,
                "pruning_user_query": "dog food ingredients",
                "markdown_options": {"ignore_links": True},
                "markdown_content_source": "cleaned_html",
            },
        }

    def test_build_run_config_with_pruning(self, pruning_config):
        """Test that PruningContentFilter is applied to run config via DefaultMarkdownGenerator."""
        with (
            patch("src.crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("src.crawl4ai_engine.engine.BrowserConfig"),
            patch("src.crawl4ai_engine.engine.CrawlerRunConfig") as mock_run_config,
            patch("src.crawl4ai_engine.engine.PruningContentFilter") as mock_pruning_filter,
            patch("src.crawl4ai_engine.engine.DefaultMarkdownGenerator") as mock_md_generator,
        ):
            mock_run_config.return_value = MagicMock()
            mock_filter_instance = MagicMock()
            mock_pruning_filter.return_value = mock_filter_instance
            mock_md_instance = MagicMock()
            mock_md_generator.return_value = mock_md_instance
            
            engine = Crawl4AIEngine(pruning_config)
            
            # Reset mock call count because __init__ already calls _build_run_config
            mock_pruning_filter.reset_mock()
            mock_md_generator.reset_mock()
            
            _ = engine._build_run_config()

            mock_run_config.assert_called()
            call_args = mock_run_config.call_args.kwargs
            
            assert call_args.get("markdown_generator") == mock_md_instance
            mock_pruning_filter.assert_called_once_with(
                user_query="dog food ingredients",
                min_word_threshold=12,
                threshold_type="fixed",
                threshold=0.4,
            )
            mock_md_generator.assert_called_once_with(
                content_filter=mock_filter_instance,
                options={"ignore_links": True},
                content_source="cleaned_html",
            )

    def test_pruning_disabled_by_default(self):
        """Test that pruning is NOT applied by default."""
        basic_config = {"crawler": {}}
        with (
            patch("src.crawl4ai_engine.engine.AsyncWebCrawler"),
            patch("src.crawl4ai_engine.engine.BrowserConfig"),
            patch("src.crawl4ai_engine.engine.CrawlerRunConfig") as mock_run_config,
            patch("src.crawl4ai_engine.engine.PruningContentFilter") as mock_pruning_filter,
            patch("src.crawl4ai_engine.engine.DefaultMarkdownGenerator") as mock_md_generator,
        ):
            mock_run_config.return_value = MagicMock()
            
            engine = Crawl4AIEngine(basic_config)
            _ = engine._build_run_config()

            mock_run_config.assert_called()
            call_args = mock_run_config.call_args.kwargs
            
            assert call_args.get("markdown_generator") is None
            mock_pruning_filter.assert_not_called()
            mock_md_generator.assert_not_called()
