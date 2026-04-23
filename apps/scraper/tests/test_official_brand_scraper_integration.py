import pytest
import json
from unittest.mock import MagicMock, AsyncMock, patch
from scrapers.ai_search.official_brand_scraper import OfficialBrandScraper

@pytest.mark.asyncio
async def test_official_brand_scraper_orchestration():
    # 1. Mock SearchClient
    mock_search_client = AsyncMock()
    mock_search_client.search.return_value = ([
        {
            "url": "https://brand.com",
            "result_type": "knowledge_graph",
            "title": "Official Brand"
        }
    ], None)
    
    scraper = OfficialBrandScraper(search_client=mock_search_client)
    
    # Test identification
    url = await scraper.identify_official_url("SKU123", "BrandX")
    assert url == "https://brand.com"
    
    # 2. Mock Crawl4AIEngine
    mock_result = {
        "success": True,
        "extracted_content": json.dumps({"name": "Test Product", "price": "$99"})
    }
    
    # We need to mock the context manager and the crawl method
    with patch("scrapers.ai_search.official_brand_scraper.Crawl4AIEngine") as mock_engine_cls:
        mock_engine = AsyncMock()
        mock_engine.config = {"crawler": {}}
        mock_engine.crawl.return_value = mock_result
        mock_engine.__aenter__.return_value = mock_engine
        mock_engine_cls.return_value = mock_engine
        
        # Mock filesystem
        with patch("os.path.exists", return_value=True), \
             patch("builtins.open", MagicMock()):
            with patch("json.load", return_value={"baseSelector": "div"}):
                data = await scraper.extract_data("https://brand.com", schema_path="schema.json")
                
                assert data["success"] is True
                assert data["method"] == "json_css"
                assert data["data"]["name"] == "Test Product"
