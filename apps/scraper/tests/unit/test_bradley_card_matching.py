"""Unit tests for redesigned Bradley Caldwell card matching and detail extraction."""

from __future__ import annotations


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
        upc=upc,
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


def test_bradley_pdp_image_filtering() -> None:
    """Test that PDP page parsing filters out logo images and recommended product cards."""
    html_content = """
    <!DOCTYPE html>
    <html>
    <head><title>DOGGINSTIX BULLY STICKS</title></head>
    <body>
      <header>
        <img class="logo" src="https://cdn.bigcommerce.com/images/bci-logo_123.original.png" />
      </header>
      <main>
        <h1>DOGGINSTIX BULLY STICKS</h1>
        <p>Brand: <a href="/dogginstix">DOGGINSTIX</a></p>
        
        <dl>
          <dt>Size</dt><dd>12 IN</dd>
          <dt>BCI Item Number</dt><dd>028004</dd>
        </dl>
        
        <!-- Main Product Gallery -->
        <div class="sticky top-4">
          <div class="flex">
            <img src="https://cdn.bigcommerce.com/products/028004__98409.jpg" />
          </div>
        </div>
        
        <!-- Recommended Product Cards (Should be excluded) -->
        <div class="related-products">
          <article class="group relative flex">
            <a href="/other-product-028006">
              <img src="https://cdn.bigcommerce.com/products/028006__42620.jpg" />
            </a>
          </article>
        </div>
      </main>
    </body>
    </html>
    """

    plan = _make_minimal_plan(upc="028004")
    entry = _make_entry()
    adapter = BradleyAdapter(entry, plan)

    result = adapter.extract_from_html(html_content, "028004", "https://www.bradleycaldwell.com/dogginstix-bully-sticks-028004")
    
    assert result.success
    assert result.product.get("size") == "12 IN"
    image_urls = result.product.get("image_urls", [])
    
    # Correct main product image should be extracted
    assert "https://cdn.bigcommerce.com/products/028004__98409.jpg" in image_urls
    
    # Logo should be excluded
    assert not any("logo" in url for url in image_urls)
    
    # Recommended product image should be excluded
    assert not any("028006" in url for url in image_urls)


def test_bradley_no_match_search_returns_no_match_not_error() -> None:
    """When a search page has no matching product card and no explicit
    'Sorry, no results' message, classify as NO_MATCH not EXTRACTION_FAILED.
    """
    html_content = """
    <!DOCTYPE html>
    <html>
    <head><title>Search Results</title></head>
    <body>
      <div class="search-results">
        <h3>Search results for "999999999999"</h3>
        <p class="text-gray-500">No products matched your search criteria.</p>
      </div>
    </body>
    </html>
    """

    plan = _make_minimal_plan(upc="999999999999")
    entry = _make_entry()
    adapter = BradleyAdapter(entry, plan)

    result = adapter.extract_from_html(
        html_content,
        "999999999999",
        "https://www.bradleycaldwell.com/search?term=999999999999",
    )

    assert not result.success
    assert result.failure_code is not None
    assert result.failure_code.value == "NO_MATCH"
    assert "No matching product card found" in (result.failure_message or "")
    assert result.outcome is None or result.outcome == "not_stocked"
