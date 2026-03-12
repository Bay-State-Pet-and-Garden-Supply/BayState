"""Tests for Crawl4AIExtractor LLM optimization features."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor


class TestCrawl4AIExtractorOptimization:
    """Test suite for Crawl4AIExtractor LLM optimization."""

    @pytest.fixture
    def extractor(self):
        """Initialize extractor with default settings."""
        return Crawl4AIExtractor(
            headless=True,
            llm_model="gpt-4o",
            scoring=MagicMock(),
            matching=MagicMock(),
            extraction_strategy="llm",
        )

    @pytest.mark.asyncio
    async def test_extract_uses_optimized_params(self, extractor):
        """Test that LLMExtractionStrategy is initialized with optimized parameters."""
        url = "https://example.com/p/123"
        sku = "SKU123"
        
        # Mock dependencies
        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "extracted_content": '[{"name": "Test Product"}]'
        }
        
        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True) as mock_strategy_cls,
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch("os.environ.get", return_value="fake-key"),
        ):
            # We need to simulate the engine's context manager
            mock_engine.__aenter__.return_value = mock_engine
            
            await extractor.extract(url, sku, "Test Product", "Test Brand")
            
            # Check LLMExtractionStrategy initialization
            assert mock_strategy_cls.called
            _, kwargs = mock_strategy_cls.call_args
            
            # These should fail initially (Red Phase)
            assert kwargs.get("input_format") == "fit_markdown"
            assert kwargs.get("chunk_token_threshold") == 4000
            assert kwargs.get("overlap_rate") == 0.1
