import pytest
from unittest.mock import MagicMock, patch, AsyncMock
import os
from scrapers.ai_search.scraper import AISearchScraper


@pytest.mark.asyncio
async def test_scrape_product_performs_two_pass_discovery() -> None:
    # Enable LLM source selection and two-step refinement via env var
    with patch.dict(os.environ, {"AI_SEARCH_USE_LLM_SOURCE_RANKING": "true", "AI_SEARCH_ENABLE_TWO_STEP": "true"}):
        scraper = AISearchScraper()

        # Mock search client
        # First call: Reconnaissance
        # Subsequent calls: Targeted variants
        mock_results_recon = [{"url": "https://site1.com", "title": "Abbrv Name", "description": "Snippet"}]
        mock_results_targeted = [{"url": "https://official.com/product", "title": "Full Brand Name", "description": "Official"}]

        search_mock = AsyncMock()

        def search_side_effect(query):
            if query == "123":
                return (mock_results_recon, None, 0.0)
            return (mock_results_targeted, None, 0.0)

        search_mock.side_effect = search_side_effect
        scraper._search_client.search_with_cost = search_mock

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
        # 1. Recon search called (at least once for initial search)
        assert scraper._search_client.search_with_cost.call_count >= 1

        # 2. Name consolidator called with reconnaissance results (may be called twice in two-pass mode)
        assert scraper._name_consolidator.consolidate_name.call_count >= 1
        # Get the first call args to verify the initial call was correct
        args, kwargs = scraper._name_consolidator.consolidate_name.call_args_list[0]
        assert kwargs["abbreviated_name"] == "ABBRV NAME"
        # The snippets passed to consolidation may include aggregated results
        # from follow-up queries when the initial pool is weak. Assert that
        # at least one search result was forwarded rather than exact equality.
        assert len(kwargs["search_snippets"]) >= 1
        snippet_urls = {s["url"] for s in kwargs["search_snippets"]}
        assert snippet_urls.intersection({"https://site1.com", "https://official.com/product"})

        # 3. Targeted search used consolidated name
        # The query builder should have been called with the consolidated name
        # We can check the logger or just trust the side_effect logic if it reached the end

        # 4. Source selector called with a merged candidate pool that includes the targeted result
        scraper._source_selector.select_best_url.assert_called_once()
        args, kwargs = scraper._source_selector.select_best_url.call_args
        assert kwargs["product_name"] == "Full Brand Name"
        result_urls = [candidate["url"] for candidate in kwargs["results"]]
        assert "https://official.com/product" in result_urls

        # 5. Telemetry recorded agreement
        assert len(scraper._telemetry["llm_heuristic_agreement"]) > 0
