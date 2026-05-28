"""Unit tests for Amazon adapter."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from scrapers.approved_sources.types import (
    ApprovedSourcePlan,
    ApprovedSourcePlanEntry,
    ApprovedSourceBrand,
    ApprovedSourcePolicy,
)
from scrapers.approved_sources.adapters.amazon import AmazonAdapter


def _make_amazon_plan(
    upc: str = "035585499741",
    brand_name: str = "KONG",
    name: str = "KONG Pull-A-Partz Pals",
    brand_slug: str = "kong",
) -> ApprovedSourcePlan:
    return ApprovedSourcePlan(
        upc=upc,
        input={"name": name, "price": None},
        brand=ApprovedSourceBrand(id="brand-kong", name=brand_name, slug=brand_slug),
        selectedDistributorSlug="amazon",
        priority=[
            ApprovedSourcePlanEntry(
                sourceType="marketplace",
                sourceSlug="amazon",
                displayName="Amazon",
                domains=["amazon.com"],
                assetDomains=["amazon.com"],
                adapterSlug="amazon",
                requiresAuth=False,
                searchMode="sku_search",
                allowedFields=["name", "brand", "upc", "image_urls"],
                priority=10,
                runFirst=True,
            )
        ],
        sourcePolicy=ApprovedSourcePolicy(
            allowedDomains=["amazon.com"],
            allowedAssetDomains=["amazon.com"],
            disallowedDomains=[],
            approvedSourcesOnly=False,
        ),
    )


def _make_amazon_entry() -> ApprovedSourcePlanEntry:
    return ApprovedSourcePlanEntry(
        sourceType="marketplace",
        sourceSlug="amazon",
        displayName="Amazon",
        domains=["amazon.com"],
        assetDomains=["amazon.com"],
        adapterSlug="amazon",
        requiresAuth=False,
        searchMode="sku_search",
        allowedFields=["name", "brand", "upc", "image_urls"],
        priority=10,
        runFirst=True,
    )


class TestAmazonAdapter:
    """Tests for Amazon adapter search and extraction routing."""

    @pytest.mark.asyncio
    @patch("scrapers.approved_sources.adapters.amazon.get_shared_browser_engine")
    async def test_amazon_adapter_extracts_correctly(self, mock_get_engine):
        # 1. Setup mock engine and crawler response
        mock_engine = MagicMock()
        mock_crawler = AsyncMock()
        mock_engine.crawler = mock_crawler
        mock_get_engine.return_value = mock_engine

        mock_search_html = """
        <html>
            <body>
                <div class="s-result-item">
                    <a href="/KONG-Pull-Partz-Pals-Toys-Koala/dp/B0018CLX3C/ref=sr_1_1?keywords=035585499741">
                        <h2>KONG Pull-A-Partz Pals</h2>
                    </a>
                </div>
            </body>
        </html>
        """
        
        mock_search_result = MagicMock()
        mock_search_result.success = True
        mock_search_result.html = mock_search_html

        mock_pdp_result = MagicMock()
        mock_pdp_result.success = True
        mock_pdp_result.extracted_content = json.dumps([{
            "name": "KONG Pull-A-Partz Pals 2 Toys in 1 Dog Toy (Koala)",
            "brand": "Visit the KONG Store",
            "image_urls": ["https://images.amazon.com/KONG.jpg"],
            "description": "KONG Pull-A-Partz Pals 2 Toys in 1 Dog Toy (Koala)",
            "bullets": [],
        }])

        mock_crawler.arun.side_effect = [mock_search_result, mock_pdp_result]

        mock_extractor = AsyncMock()

        # 2. Instantiate and run Amazon adapter
        entry = _make_amazon_entry()
        plan = _make_amazon_plan()
        adapter = AmazonAdapter(entry, plan)

        result = await adapter.extract(mock_extractor)

        # 3. Assertions
        assert result is not None
        assert result.status == "success"
        assert result.product is not None
        assert result.product.name == "KONG Pull-A-Partz Pals 2 Toys in 1 Dog Toy (Koala)"
        assert result.product.brand == "KONG"
        
        # Verify that search URL and PDP URL were crawled
        assert mock_crawler.arun.call_count == 2
        
        # First call should be for search URL
        first_call_args = mock_crawler.arun.call_args_list[0][1]
        assert first_call_args["url"] == "https://www.amazon.com/s?k=035585499741"
        assert first_call_args["config"].wait_until == "domcontentloaded"
        
        # Second call should be for PDP URL
        second_call_args = mock_crawler.arun.call_args_list[1][1]
        assert second_call_args["url"] == "https://www.amazon.com/KONG-Pull-Partz-Pals-Toys-Koala/dp/B0018CLX3C"
        assert second_call_args["config"].wait_until == "domcontentloaded"
        assert second_call_args["config"].extraction_strategy is not None

    @pytest.mark.asyncio
    @patch("scrapers.approved_sources.adapters.amazon.get_shared_browser_engine")
    async def test_amazon_adapter_no_pdp_link_returns_none(self, mock_get_engine):
        mock_engine = MagicMock()
        mock_crawler = AsyncMock()
        mock_engine.crawler = mock_crawler
        mock_get_engine.return_value = mock_engine

        # Search HTML without any dp links (e.g. no results or bot blocked page)
        mock_search_html = "<html><body>No products here</body></html>"
        mock_search_result = MagicMock()
        mock_search_result.success = True
        mock_search_result.html = mock_search_html
        
        mock_crawler.arun.return_value = mock_search_result

        mock_extractor = AsyncMock()

        entry = _make_amazon_entry()
        plan = _make_amazon_plan()
        adapter = AmazonAdapter(entry, plan)

        result = await adapter.extract(mock_extractor)

        assert result is None
        mock_extractor.extract.assert_not_called()

    @pytest.mark.asyncio
    @patch("scrapers.approved_sources.adapters.amazon.get_shared_browser_engine")
    async def test_amazon_adapter_crawl_failed_returns_none(self, mock_get_engine):
        mock_engine = MagicMock()
        mock_crawler = AsyncMock()
        mock_engine.crawler = mock_crawler
        mock_get_engine.return_value = mock_engine
        
        mock_search_result = MagicMock()
        mock_search_result.success = False
        
        mock_crawler.arun.return_value = mock_search_result

        mock_extractor = AsyncMock()

        entry = _make_amazon_entry()
        plan = _make_amazon_plan()
        adapter = AmazonAdapter(entry, plan)

        result = await adapter.extract(mock_extractor)

        assert result is None
        mock_extractor.extract.assert_not_called()
