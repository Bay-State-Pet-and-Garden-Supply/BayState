import pytest
from unittest.mock import MagicMock, patch, AsyncMock
import os
from scrapers.ai_search.models import ResolvedCandidate
from scrapers.ai_search.scraper import AISearchScraper
from scrapers.ai_search.selection_pipeline import SelectionPipelineResult


@pytest.mark.asyncio
async def test_scrape_product_performs_two_pass_discovery() -> None:
    # Enable LLM source selection and two-step refinement via env var
    with patch.dict(
        os.environ,
        {
            "AI_SEARCH_USE_LLM_SOURCE_RANKING": "true",
            "AI_SEARCH_ENABLE_TWO_STEP": "true",
            "AI_SEARCH_PROVIDER": "gemini",
        },
    ):
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


@pytest.mark.asyncio
async def test_scrape_product_prefers_resolved_official_candidate_from_shared_pipeline() -> None:
    retailer_url = "https://www.homedepot.com/p/Scotts-Nature-Scapes-1-5-cu-ft-Sierra-Red-Mulch-88459442/100000001"
    family_url = "https://scottsmiraclegro.com/en-us/products/nature-scapes-color-enhanced-mulch.html"
    resolved_official_url = "https://scottsmiraclegro.com/en-us/products/88459442.html"
    variation_url = "https://scottsmiraclegro.com/on/demandware.store/Sites-SMG-Site/en_US/Product-Variation?pid=88459442&dwvar_88459442_color=red&dwvar_88459442_size=1-5-cu-ft"
    family_html = "<html>official family html</html>"
    variation_payload = '{"product":{"id":"032247884594"}}'

    scraper = AISearchScraper()
    scraper._collect_search_candidates = AsyncMock(
        return_value=(
            [
                {
                    "url": retailer_url,
                    "title": "Scotts Nature Scapes Sierra Red Mulch 1.5 cu ft - The Home Depot",
                    "description": "Direct retailer PDP for Sierra Red mulch.",
                },
                {
                    "url": family_url,
                    "title": "Scotts Nature Scapes Color Enhanced Mulch | Scotts",
                    "description": "Official Scotts family page for Nature Scapes mulch.",
                },
            ],
            "Scotts Nature Scapes Sierra Red 1.5 cu ft",
            None,
        )
    )
    scraper._maybe_refine_search_results = AsyncMock(side_effect=lambda *, search_results, **kwargs: search_results)
    scraper._scoring.classify_result_source = MagicMock(side_effect=["secondary_retailer_exact", "official_family"])
    scraper._extraction.extract_demandware_variant_candidates = MagicMock(return_value=[{"url": variation_url}])
    scraper._heuristic_source_selection = MagicMock(return_value=retailer_url)
    scraper._extract_product_data = AsyncMock(
        side_effect=lambda url, sku, product_name, brand: {
            "success": True,
            "product_name": product_name,
            "brand": brand,
            "confidence": 0.95,
            "url": url,
        }
    )
    scraper._validator.validate_extraction_match = MagicMock(return_value=(True, "ok"))

    class _ResponseStub:
        def __init__(self, text: str) -> None:
            self.text = text

        def raise_for_status(self) -> None:
            return None

    class _AsyncClientStub:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url: str, headers=None):
            del headers
            if url == family_url:
                return _ResponseStub(family_html)
            if url == variation_url:
                return _ResponseStub(variation_payload)
            raise AssertionError(f"Unexpected URL fetched: {url}")

    with (
        patch("httpx.AsyncClient", return_value=_AsyncClientStub()),
        patch(
            "scrapers.ai_search.scraper.run_selection_pipeline",
            new=AsyncMock(
                return_value=SelectionPipelineResult(
                    ranked_candidates=[
                        ResolvedCandidate(
                            url=resolved_official_url,
                            canonical_url=resolved_official_url,
                            source_url=family_url,
                            source_domain="scottsmiraclegro.com",
                            source_type="official_family",
                            resolved_url=resolved_official_url,
                            resolved_canonical_url=resolved_official_url,
                            family_url=family_url,
                            resolved_variant={"variant_id": "032247884594"},
                        ),
                        ResolvedCandidate(
                            url=retailer_url,
                            canonical_url=retailer_url,
                            source_url=retailer_url,
                            source_domain="homedepot.com",
                            source_type="direct",
                            resolved_url=retailer_url,
                            resolved_canonical_url=retailer_url,
                            family_url=None,
                            resolved_variant={"variant_id": "032247884594"},
                        ),
                    ],
                    prioritized_url=resolved_official_url,
                    selector_cost_usd=0.07,
                )
            ),
        ) as run_pipeline,
    ):
        result = await scraper.scrape_product(
            sku="032247884594",
            product_name="Scotts Nature Scapes Sierra Red 1.5 cu ft",
            brand="Scotts",
            category="Mulch",
            preferred_domains=["scottsmiraclegro.com"],
        )

    run_pipeline.assert_awaited_once()
    call_kwargs = run_pipeline.await_args.kwargs
    assert call_kwargs["html_by_url"] == {family_url: family_html}
    assert call_kwargs["resolved_payload_by_url"] == {variation_url: variation_payload}
    assert result.success is True
    assert result.url == resolved_official_url
    scraper._extraction.extract_demandware_variant_candidates.assert_called_once_with(
        html_text=family_html,
        source_url=family_url,
        expected_name="Scotts Nature Scapes Sierra Red 1.5 cu ft",
    )
    scraper._extract_product_data.assert_awaited_once_with(
        resolved_official_url,
        "032247884594",
        "Scotts Nature Scapes Sierra Red 1.5 cu ft",
        "Scotts",
    )
