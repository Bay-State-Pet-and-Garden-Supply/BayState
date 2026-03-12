"""Tests for Crawl4AI Engine Escalation & Fallback features."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from src.crawl4ai_engine.engine import Crawl4AIEngine


class TestCrawl4AIEngineEscalation:
    """Test suite for engine escalation and fallback mechanisms."""

    @pytest.fixture
    def engine_with_fallback(self):
        """Engine configured with a fallback function."""
        engine = Crawl4AIEngine({"browser": {}, "crawler": {}})
        return engine

    @pytest.mark.asyncio
    async def test_fallback_triggered_on_403(self, engine_with_fallback):
        """Test fallback is triggered when crawler returns 403."""
        # Setup mock crawl result
        mock_result = MagicMock()
        mock_result.success = False
        mock_result.error = "403 Forbidden"
        mock_result.metadata = {}
        
        mock_crawler = AsyncMock()
        mock_crawler.arun.return_value = mock_result
        engine_with_fallback._crawler = mock_crawler

        # Setup mock fallback function
        mock_fallback = AsyncMock()
        mock_fallback.return_value = {
            "success": True,
            "extracted_content": "Fallback Data",
            "html": "<html>Fallback</html>"
        }

        # Inject fallback into engine
        engine_with_fallback.config["crawler"]["fallback_fetch_function"] = mock_fallback

        # Execute
        result = await engine_with_fallback.crawl("https://example.com/403")

        # Verify fallback was called and result is from fallback
        mock_fallback.assert_called_once_with("https://example.com/403")
        assert result["success"] is True
        assert result["extracted_content"] == "Fallback Data"
        assert result["html"] == "<html>Fallback</html>"
        assert result.get("fallback_triggered") is True

    @pytest.mark.asyncio
    async def test_fallback_not_triggered_on_success(self, engine_with_fallback):
        """Test fallback is NOT triggered when crawler succeeds."""
        mock_result = MagicMock()
        mock_result.success = True
        mock_result.html = "<html>Success</html>"
        mock_result.markdown = "Success"
        mock_result.extracted_content = "Data"
        mock_result.error = None
        mock_result.metadata = {}
        
        mock_crawler = AsyncMock()
        mock_crawler.arun.return_value = mock_result
        engine_with_fallback._crawler = mock_crawler

        mock_fallback = AsyncMock()
        engine_with_fallback.config["crawler"]["fallback_fetch_function"] = mock_fallback

        result = await engine_with_fallback.crawl("https://example.com/success")

        mock_fallback.assert_not_called()
        assert result["success"] is True
        assert result["fallback_triggered"] is False
