import pytest
from unittest.mock import MagicMock, patch, AsyncMock
import os
from scrapers.ai_search.scraper import AISearchScraper

@pytest.mark.asyncio
async def test_scrape_product_performs_two_pass_discovery() -> None:
    # Enable LLM source selection via env var
    with patch.dict(os.environ, {"AI_SEARCH_USE_LLM_SOURCE_RANKING": "true"}):
        scraper = AISearchScraper()
        
        # Mock search client
        # First call: Reconnaissance
        # Subsequent calls: Targeted variants
        mock_results_recon = [{"url": "https://site1.com", "title": "Abbrv Name", "description": "Snippet"}]
        mock_results_targeted = [{"url": "https://official.com/product", "title": "Full Brand Name", "description": "Official"}]
        
        search_mock = AsyncMock()
        def search_side_effect(query):
            if "ABBRV NAME" in query:
                return (mock_results_recon, None)
            return (mock_results_targeted, None)
            
        search_mock.side_effect = search_side_effect
        scraper._search_client.search = search_mock
        
        # Mock name consolidator
        scraper._name_consolidator.consolidate_name = AsyncMock(return_value=("Full Brand Name", 0.001))
        
        # Mock LLM source selector
        scraper._source_selector.select_best_url = AsyncMock(return_value=("https://official.com/product", 0.001))
        
        # Mock extraction and validation
        scraper._extract_product_data = AsyncMock(return_value={"success": True, "confidence": 0.9})
        scraper._validator.validate_extraction_match = MagicMock(return_value=(True, "ok"))
        
        # Run scrape
        await scraper.scrape_product(sku="123", product_name="ABBRV NAME", brand="TestBrand")
        
        # Verify flows
        # 1. Recon search called
        assert scraper._search_client.search.call_count >= 2
        
        # 2. Name consolidator called with reconnaissance results
        scraper._name_consolidator.consolidate_name.assert_called_once()
        args, kwargs = scraper._name_consolidator.consolidate_name.call_args
        assert kwargs["abbreviated_name"] == "ABBRV NAME"
        assert kwargs["search_snippets"] == mock_results_recon
        
        # 3. Targeted search used consolidated name
        # The query builder should have been called with the consolidated name
        # We can check the logger or just trust the side_effect logic if it reached the end
        
        # 4. Source selector called with targeted results
        scraper._source_selector.select_best_url.assert_called_once()
        args, kwargs = scraper._source_selector.select_best_url.call_args
        assert kwargs["results"] == mock_results_targeted
        assert kwargs["product_name"] == "Full Brand Name"
        
        # 5. Telemetry recorded agreement
        assert len(scraper._telemetry["llm_heuristic_agreement"]) > 0
