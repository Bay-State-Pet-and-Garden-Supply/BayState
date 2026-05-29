"""Unit tests for Amazon adapter."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from scrapers.approved_sources.types import (
    ApprovedSourcePlan,
    ApprovedSourcePlanEntry,
    ApprovedSourceBrand,
    ApprovedSourcePolicy,
)
from scrapers.approved_sources.adapters.amazon import AmazonAdapter

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "crawl4ai"
AMAZON_PDP_FIXTURE = FIXTURES_DIR / "amazon_product.html"


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
        mock_pdp_result.html = """
        <html>
            <body>
                <span id="productTitle">KONG Pull-A-Partz Pals 2 Toys in 1 Dog Toy (Koala)</span>
                <a id="bylineInfo">Visit the KONG Store</a>
                <div id="feature-bullets">
                    <ul>
                        <li><span>Pull apart for twice the play.</span></li>
                        <li><span>Soft toy for indoor fun.</span></li>
                    </ul>
                </div>
                <div id="imageBlock_feature_div">
                    <img id="landingImage"
                        data-old-hires="https://m.media-amazon.com/images/I/81main._AC_SL1500_.jpg"
                        src="https://m.media-amazon.com/images/I/51main._AC_US40_.jpg" />
                    <div class="a-image-wrapper" data-old-hires="https://m.media-amazon.com/images/I/81back._AC_SL1500_.jpg"></div>
                </div>
                <table class="a-keyvalue">
                    <tr><td>Item Weight</td><td>1 pounds</td></tr>
                </table>
            </body>
        </html>
        """

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
        assert second_call_args["config"].extraction_strategy is None

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

    def test_extract_product_fields_from_fixture_html(self):
        adapter = AmazonAdapter(_make_amazon_entry(), _make_amazon_plan())
        html = AMAZON_PDP_FIXTURE.read_text(encoding="utf-8")

        fields = adapter._extract_product_fields_from_html(html, upc="035585499741")

        assert fields["name"] == "Purina Dog Chow Complete With Real Chicken Adult Dry Dog Food - 44 lb. Bag"
        assert fields["brand"] == "Purina"
        assert fields["description"].startswith("Give your dog the nutrition he needs")
        assert fields["image_urls"] == [
            "https://m.media-amazon.com/images/purina-dog-chow._AC_SL1500_.jpg",
            "https://m.media-amazon.com/images/purina-dog-chow-back._AC_SL1500_.jpg",
            "https://m.media-amazon.com/images/purina-dog-chow-ingredients._AC_SL1500_.jpg",
        ]
        assert fields["weight"] == "44 pounds"
        assert fields["dimensions"] == "24 x 16 x 4 inches"

    def test_extract_product_fields_handles_modern_gallery_markup(self):
        adapter = AmazonAdapter(_make_amazon_entry(), _make_amazon_plan())
        html = """
        <html>
          <body>
            <span id="productTitle">360 Pet Nutrition Freeze-Dried Raw Dog Food</span>
            <a id="bylineInfo">Visit the 360 Pet Nutrition Store</a>
            <div id="feature-bullets">
              <ul>
                <li><span>About this item</span></li>
                <li><span>Made with High-Quality Ingredients.</span></li>
                <li><span>Freeze-Dried for Convenience.</span></li>
              </ul>
            </div>
            <div id="imageBlock_feature_div">
              <img
                id="landingImage"
                src="https://m.media-amazon.com/images/I/81CBHGMK1ZL._AC_SX522_.jpg"
                data-old-hires="https://m.media-amazon.com/images/I/81CBHGMK1ZL._AC_SL1500_.jpg"
                data-a-dynamic-image='{"https://m.media-amazon.com/images/I/81CBHGMK1ZL._AC_SY355_.jpg":[355,355]}'
              />
              <div class="a-image-wrapper" data-old-hires="https://m.media-amazon.com/images/I/71h-oy4IrWL._AC_SL1500_.jpg"></div>
              <div class="a-image-wrapper" data-old-hires="https://m.media-amazon.com/images/I/81TNX+jemML._AC_SL1500_.jpg"></div>
              <img src="https://m.media-amazon.com/images/I/41rEQvFqHuL.SS40_BG85,85,85_BR-120_PKdp-play-icon-overlay__.jpg" />
            </div>
            <table class="a-keyvalue">
              <tr><td>Package Dimensions</td><td>10.83 x 6.57 x 2.05 inches; 5 ounces</td></tr>
              <tr><td>Item Weight</td><td>5 Ounces</td></tr>
            </table>
          </body>
        </html>
        """

        fields = adapter._extract_product_fields_from_html(html, upc="123456789012")

        assert fields["name"] == "360 Pet Nutrition Freeze-Dried Raw Dog Food"
        assert fields["brand"] == "360 Pet Nutrition"
        assert fields["weight"] == "5 Ounces"
        assert fields["dimensions"] == "10.83 x 6.57 x 2.05 inches; 5 ounces"
        assert "Made with High-Quality Ingredients." in fields["description"]
        assert "Freeze-Dried for Convenience." in fields["description"]
        assert fields["image_urls"] == [
            "https://m.media-amazon.com/images/I/81CBHGMK1ZL._AC_SL1500_.jpg",
            "https://m.media-amazon.com/images/I/71h-oy4IrWL._AC_SL1500_.jpg",
            "https://m.media-amazon.com/images/I/81TNX+jemML._AC_SL1500_.jpg",
        ]

    def test_normalize_image_url_deduplication(self):
        adapter = AmazonAdapter(_make_amazon_entry(), _make_amazon_plan())

        # 1. Base URL without token
        url1 = "https://m.media-amazon.com/images/I/81Woj7S8k7L.jpg"
        # 2. Thumbnail URL with token
        url2 = "https://m.media-amazon.com/images/I/81Woj7S8k7L._AC_SX679_.jpg"
        # 3. Another token style
        url3 = "https://m.media-amazon.com/images/I/81Woj7S8k7L._SS40_.jpg"
        # 4. Already high-res
        url4 = "https://m.media-amazon.com/images/I/81Woj7S8k7L._AC_SL1500_.jpg"

        norm1 = adapter._normalize_image_url(url1)
        norm2 = adapter._normalize_image_url(url2)
        norm3 = adapter._normalize_image_url(url3)
        norm4 = adapter._normalize_image_url(url4)

        expected = "https://m.media-amazon.com/images/I/81Woj7S8k7L._AC_SL1500_.jpg"

        assert norm1 == expected
        assert norm2 == expected
        assert norm3 == expected
        assert norm4 == expected

        # Non-Amazon URL should be untouched
        external_url = "https://example.com/product.jpg"
        assert adapter._normalize_image_url(external_url) == external_url

        # Filtered URLs should return None
        assert adapter._normalize_image_url("https://m.media-amazon.com/images/I/grey-pixel.gif") is None
