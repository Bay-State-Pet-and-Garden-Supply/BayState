"""Unit tests for redesigned Bradley Caldwell card matching and detail extraction."""

from __future__ import annotations

from urllib.parse import urljoin
import pytest
from bs4 import BeautifulSoup

from scrapers.approved_sources.adapters.bradley import BradleyAdapter
from scrapers.approved_sources.types import ApprovedSourcePlanEntry, ApprovedSourcePlan


def _make_minimal_plan(upc: str) -> ApprovedSourcePlan:
    from scrapers.approved_sources.types import ApprovedSourcePolicy
    policy = ApprovedSourcePolicy(
        allowedDomains=["bradleycaldwell.com"],
        allowedAssetDomains=["bradleycaldwell.com", "cdn.bigcommerce.com"],
        disallowedDomains=[],
        approvedSourcesOnly=False,
    )
    return ApprovedSourcePlan(
        upc=sku,
        brand=None,
        input={"name": "E-Z HANG SCALE"},
        sourcePolicy=policy,
    )


def _make_entry() -> ApprovedSourcePlanEntry:
    return ApprovedSourcePlanEntry(
        sourceType="distributor",
        sourceSlug="bradley",
        displayName="Bradley Caldwell",
        adapterSlug="bradley_crawl4ai",
        requiresAuth=False,
        domains=["bradleycaldwell.com"],
        assetDomains=["bradleycaldwell.com", "cdn.bigcommerce.com"],
        allowedFields=["name", "brand", "upc", "bci_item_number", "size", "case_pack", "image_urls"],
    )


def test_bradley_headless_card_matching_by_container_sku() -> None:
    """Test that Bradley adapter successfully matches a product card when UPC is only in parent container text, not in the link URL."""
    html_content = """
    <!DOCTYPE html>
    <html>
    <head><title>Search Results</title></head>
    <body>
      <div class="nav">
        <a href="/cart">Cart</a>
        <a href="/checkout">Checkout</a>
      </div>
      
      <!-- Unrelated Card -->
      <div class="card">
        <a href="/unrelated-product-123">
          Unrelated Dog Food
        </a>
        <span class="block text-sm">Purina</span>
        <div>BCI#: 999999</div>
      </div>

      <!-- Target Card: BCI# matches searched UPC "001135", but link href does NOT contain "001135" -->
      <div class="card-container">
        <div class="inner-card">
          <a class="product-title-link" href="/e-z-hang-scale-silver-up-to-55-lb">
            E-Z HANG SCALE
          </a>
          <span class="block text-sm font-bold">KERBL</span>
          <div class="specs">
            <p>BCI# : 001135</p>
            <p>UPC Code: 4018653001135</p>
            <p>Size: Medium</p>
            <p>Case Pack: 6</p>
          </div>
          <div class="images">
            <img src="https://cdn.bigcommerce.com/products/001135_thumbnail.jpg" />
          </div>
        </div>
      </div>
    </body>
    </html>
    """

    plan = _make_minimal_plan(upc="001135")
    entry = _make_entry()
    adapter = BradleyAdapter(entry, plan)

    result = adapter.extract_from_html(html_content, "001135", "https://www.bradleycaldwell.com/search?term=001135")
    
    assert result.success
    assert result.product.get("name") == "E-Z HANG SCALE"
    assert result.product.get("brand") == "KERBL"
    assert result.product.get("bci_item_number") == "001135"
    assert result.product.get("upc") == "4018653001135"
    assert result.product.get("size") == "Medium"
    assert result.product.get("case_pack") == "6"
    assert "https://cdn.bigcommerce.com/products/001135_thumbnail.jpg" in result.product.get("image_urls", [])
    assert adapter._product_page_url == "https://www.bradleycaldwell.com/e-z-hang-scale-silver-up-to-55-lb"


def test_bradley_headless_card_matching_flexible_regexes() -> None:
    """Test that the flexible regex patterns correctly identify detail fields and BCI#/UPC formats."""
    html_content = """
    <div class="product-card">
      <a href="/kerbl-ez-hang-scale">Kerbl E-Z Hang Scale</a>
      <div class="meta">
        <span>Item #: 001135</span>
        <span>UPC: 4018653001135</span>
        <span>Pack: 12</span>
      </div>
    </div>
    """

    plan = _make_minimal_plan(upc="001135")
    entry = _make_entry()
    adapter = BradleyAdapter(entry, plan)

    result = adapter.extract_from_html(html_content, "001135", "https://www.bradleycaldwell.com/search?term=001135")
    
    assert result.success
    assert result.product.get("bci_item_number") == "001135"
    assert result.product.get("upc") == "4018653001135"
    assert result.product.get("case_pack") == "12"
