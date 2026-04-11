import pytest
from unittest.mock import MagicMock, patch, AsyncMock
import os
from scrapers.ai_search.scraper import AISearchScraper

@pytest.mark.asyncio
async def test_scrape_product_uses_llm_source_selection_when_enabled() -> None:
    # Enable LLM source selection via env var
    with patch.dict(os.environ, {"AI_SEARCH_USE_LLM_SOURCE_RANKING": "true"}):
        scraper = AISearchScraper()
        assert scraper.use_ai_source_selection is True
        
        # Mock search client to return some results
        mock_results = [
            {"url": "https://official.com/product", "title": "Official", "description": "Desc"},
            {"url": "https://retailer.com/product", "title": "Retailer", "description": "Desc"}
        ]
        scraper._search_client.search_with_cost = AsyncMock(return_value=(mock_results, None, 0.0))
        scraper._name_consolidator.consolidate_name = AsyncMock(return_value=("Test Product", 0.0))
        
        # Mock LLM source selector
        scraper._source_selector.select_best_url = AsyncMock(return_value=("https://official.com/product", 0.001))
        
        # Mock extraction to avoid actual network/browser calls
        scraper._extract_product_data = AsyncMock(return_value={
            "success": True,
            "product_name": "Test Product",
            "confidence": 0.9
        })
        
        # Mock validator
        scraper._validator.validate_extraction_match = MagicMock(return_value=(True, "ok"))
        
        # Run scrape
        result = await scraper.scrape_product(sku="123", product_name="Test Product", brand="TestBrand")
        
        # Verify LLM was called
        scraper._source_selector.select_best_url.assert_called_once()
        assert result.url == "https://official.com/product"

@pytest.mark.asyncio
async def test_scrape_product_falls_back_to_heuristics_when_llm_fails() -> None:
    with patch.dict(os.environ, {"AI_SEARCH_USE_LLM_SOURCE_RANKING": "true"}):
        scraper = AISearchScraper()
        
        mock_results = [
            {"url": "https://heuristic-choice.com/product", "title": "Heuristic", "description": "Desc"}
        ]
        scraper._search_client.search_with_cost = AsyncMock(return_value=(mock_results, None, 0.0))
        scraper._name_consolidator.consolidate_name = AsyncMock(return_value=("Test Product", 0.0))
        
        # Mock LLM to return None
        scraper._source_selector.select_best_url = AsyncMock(return_value=(None, 0.001))
        
        # Mock pick_strong_candidate_url to return None to trigger LLM/Heuristic logic
        scraper._scoring.pick_strong_candidate_url = MagicMock(return_value=None)
        
        # Mock heuristic selection
        scraper._heuristic_source_selection = MagicMock(return_value="https://heuristic-choice.com/product")
        
        # Mock extraction
        scraper._extract_product_data = AsyncMock(return_value={"success": True, "confidence": 0.9})
        scraper._validator.validate_extraction_match = MagicMock(return_value=(True, "ok"))
        
        await scraper.scrape_product(sku="123", product_name="Test Product", brand="TestBrand")
        
        # Verify fallback
        scraper._heuristic_source_selection.assert_called_once()


@pytest.mark.asyncio
async def test_scrape_product_infers_brand_hint_before_llm_source_selection() -> None:
    with patch.dict(os.environ, {"AI_SEARCH_USE_LLM_SOURCE_RANKING": "true"}):
        scraper = AISearchScraper()

        mock_results = [
            {
                "url": "https://bentleyseeds.com/products/tomato-jubilee-seed-packets-copy",
                "title": "Bentley Seed Tomato Jubilee 1943",
                "description": "Official Bentley Seeds product page",
            },
            {
                "url": "https://arett.com/item/B104+HTG001/Bentley-Seed-Tomato-Jubilee-1943",
                "title": "Bentley Seed Tomato Jubilee 1943 - Arett Sales",
                "description": "Retailer listing",
            },
        ]
        scraper._search_client.search_with_cost = AsyncMock(return_value=(mock_results, None, 0.0))
        scraper._name_consolidator.consolidate_name = AsyncMock(return_value=("Bentley Seed Tomato Jubilee 1943", 0.0))

        observed_brands: list[str | None] = []

        async def identify_best_source(search_results, sku, brand=None, product_name=None, cost_context=None, preferred_domains=None):
            del search_results, sku, product_name, cost_context, preferred_domains
            observed_brands.append(brand)
            return "https://bentleyseeds.com/products/tomato-jubilee-seed-packets-copy"

        scraper._identify_best_source = AsyncMock(side_effect=identify_best_source)
        scraper._extract_product_data = AsyncMock(
            return_value={
                "success": True,
                "product_name": "Bentley Seed Tomato Jubilee 1943",
                "brand": "Bentley Seed",
                "confidence": 0.9,
            }
        )
        scraper._validator.validate_extraction_match = MagicMock(return_value=(True, "ok"))

        result = await scraper.scrape_product(
            sku="051588178896",
            product_name="BENTLEY SEED TOMATO JUBILEE",
            brand=None,
        )

        assert result.url == "https://bentleyseeds.com/products/tomato-jubilee-seed-packets-copy"
        assert observed_brands == ["Bentley Seed"]
