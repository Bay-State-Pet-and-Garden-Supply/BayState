"""Tests for page classifier module."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scrapers.product_url_extraction.page_classifier import (
    PageClassification,
    classify_page,
    format_classification_evidence,
    build_identity_evidence,
    PAGE_TYPE_PRODUCT_DETAIL,
    PAGE_TYPE_CATEGORY,
    PAGE_TYPE_SEARCH_RESULT,
    PAGE_TYPE_HOME,
    PAGE_TYPE_BLOG_ARTICLE,
    PAGE_TYPE_LOGIN,
    PAGE_TYPE_BLOCKED,
    PAGE_TYPE_ERROR,
    PAGE_TYPE_WRONG_DOMAIN,
)


FIXTURE_DIR = Path(__file__).parent.parent / "fixtures" / "crawl4ai"


def _load_json(name: str) -> dict:
    with open(FIXTURE_DIR / name) as f:
        return json.load(f)


def _load_snapshot(pattern: str) -> str:
    """Load a snapshot HTML file matching pattern."""
    for p in (FIXTURE_DIR / "snapshots").glob(pattern):
        with open(p) as f:
            return f.read()
    return ""


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def pdp_html_with_jsonld() -> str:
    """HTML with JSON-LD Product schema, og:type=product, and add-to-cart."""
    ld_parts = [
        '"@context":"https://schema.org"',
        '"@type":"Product"',
        '"name":"Test Product"',
        '"image":"https://example.com/img.jpg"',
        '"brand":{"@type":"Brand","name":"Test Brand"}',
        '"offers":{"@type":"Offer","price":"29.99","priceCurrency":"USD"}',
    ]
    ld_json = '{' + ','.join(ld_parts) + '}'
    return f"""<html><head>
<title>Product Name - Brand</title>
<meta property="og:type" content="product">
<meta property="og:image" content="https://example.com/img.jpg">
<script type="application/ld+json">
{ld_json}
</script>
</head><body>
<h1>Test Product</h1>
<form action="/cart/add" method="post">
<select class="product-form__input"><option>Small</option><option>Large</option></select>
<button type="submit" class="add-to-cart">Add to Cart</button>
</form>
<span class="price">$29.99</span>
</body></html>"""


@pytest.fixture
def category_html() -> str:
    """HTML for a category/collection page."""
    return """<html><head>
<title>Dog Food Collection - Brand</title>
<meta property="og:type" content="website">
</head><body>
<h1>Shop Dog Food</h1>
<div class="collection-list">
<a href="/products/food1">Product 1</a>
<a href="/products/food2">Product 2</a>
<a href="/products/food3">Product 3</a>
<a href="/products/food4">Product 4</a>
</div>
<span class="price">$29.99</span>
<span class="price">$39.99</span>
</body></html>"""


@pytest.fixture
def home_html() -> str:
    """HTML for a home page."""
    return """<html><head>
<title>Brand Name</title>
</head><body>
<nav><a href="/collections">Shop</a><a href="/about">About</a></nav>
<h1>Welcome to Brand Name</h1>
<p>Premium pet products for your furry friends.</p>
<footer>Copyright 2026 Brand Name. All rights reserved.</footer>
</body></html>"""


@pytest.fixture
def login_html() -> str:
    """HTML for a login/auth wall page."""
    return """<html><head>
<title>Sign In</title>
</head><body>
<form action="/account/login" method="post">
<input type="email" name="customer[email]" placeholder="Email">
<input type="password" name="customer[password]" placeholder="Password">
<button type="submit">Sign In</button>
</form>
<a href="/account/register">Create Account</a>
<a href="/account/login#recover">Forgot your password?</a>
</body></html>"""


@pytest.fixture
def blog_html() -> str:
    """HTML for a blog article."""
    return """<html><head>
<title>How to Choose the Right Dog Food - Brand Blog</title>
</head><body>
<article>
<h1>How to Choose the Right Dog Food</h1>
<p>When selecting food for your pup...</p>
</article>
</body></html>"""


@pytest.fixture
def search_html() -> str:
    """HTML for a search results page."""
    return """<html><head>
<title>Search results for 'dog food'</title>
</head><body>
<h1>Search results</h1>
<div class="search-results">
<a href="/products/result1">Result 1</a>
<a href="/products/result2">Result 2</a>
</div>
</body></html>"""


# ---------------------------------------------------------------------------
# Tests: PDP detection
# ---------------------------------------------------------------------------


class TestPdpDetection:
    """Tests for product_detail_page classification."""

    def test_pdp_with_jsonld(self, pdp_html_with_jsonld):
        """HTML with JSON-LD Product schema is classified as PDP."""
        result = {
            "url": "https://example.com/products/test-product",
            "success": True,
            "metadata": {"title": "Product Name - Brand"},
            "html": pdp_html_with_jsonld,
        }
        classification = classify_page(result, "example.com")
        assert classification.page_type == PAGE_TYPE_PRODUCT_DETAIL
        assert "has_jsonld_product" in classification.signals
        assert "has_og_type_product" in classification.signals
        assert "has_add_to_cart_form" in classification.signals
        assert classification.confidence >= 0.5
        assert classification.rejection_reason is None

    def test_pdp_og_type_product(self):
        """HTML with og:type=product is classified as PDP."""
        html = """<html><head>
<title>Product Name</title>
<meta property="og:type" content="product">
</head><body>
<button class="add-to-cart">Add to Cart</button>
<span class="price">$19.99</span>
</body></html>"""
        result = {"url": "https://example.com/p/1", "success": True, "metadata": {"title": "Product Name"}, "html": html}
        classification = classify_page(result, "example.com")
        assert classification.page_type == PAGE_TYPE_PRODUCT_DETAIL

    def test_pdp_with_add_to_cart_and_price(self):
        """HTML with add-to-cart button and price is classified as PDP."""
        html = """<html><head><title>Premium Dog Food</title></head><body>
<h1>Premium Dog Food</h1>
<form action="/cart/add"><button type="submit">Add to Cart</button></form>
<span class="price">$34.99</span>
</body></html>"""
        result = {"url": "https://example.com/products/dog-food", "success": True, "metadata": {"title": "Premium Dog Food"}, "html": html}
        classification = classify_page(result, "example.com")
        assert classification.page_type == PAGE_TYPE_PRODUCT_DETAIL

    def test_pdp_variant_selector(self):
        """HTML with variant selector and price is classified as PDP."""
        html = """<html><head><title>Treat Variety Pack</title></head><body>
<h1>Treat Variety Pack</h1>
<select class="product-form__input"><option>Chicken</option><option>Beef</option></select>
<span class="price">$14.99</span>
</body></html>"""
        result = {"url": "https://example.com/products/treats", "success": True, "metadata": {"title": "Treat Variety Pack"}, "html": html}
        classification = classify_page(result, "example.com")
        assert classification.page_type == PAGE_TYPE_PRODUCT_DETAIL

    def test_og_type_alone_not_pdp(self):
        """og:type=product alone without any strong commerce signal is NOT PDP."""
        html = """<html><head>
<title>Product Name</title>
<meta property="og:type" content="product">
</head><body>
<p>Some description text.</p>
</body></html>"""
        result = {"url": "https://example.com/p/1", "success": True, "metadata": {"title": "Product Name"}, "html": html}
        classification = classify_page(result, "example.com")
        assert classification.page_type != PAGE_TYPE_PRODUCT_DETAIL
        assert classification.rejection_reason is not None
        assert "additional commerce" in classification.rejection_reason.lower()

    def test_jsonld_alone_not_pdp(self):
        """JSON-LD Product alone without any strong commerce signal is NOT PDP."""
        html = """<html><head>
<title>Product Name</title>
<script type="application/ld+json">{"@type":"Product","name":"Test","image":"https://example.com/img.jpg"}</script>
</head><body>
<p>Some description text.</p>
</body></html>"""
        result = {"url": "https://example.com/p/1", "success": True, "metadata": {"title": "Product Name"}, "html": html}
        classification = classify_page(result, "example.com")
        assert classification.page_type != PAGE_TYPE_PRODUCT_DETAIL
        assert classification.rejection_reason is not None
        assert "additional commerce" in classification.rejection_reason.lower()

    def test_og_type_with_add_to_cart_is_pdp(self):
        """og:type=product plus add-to-cart is classified as PDP."""
        html = """<html><head>
<title>Product Name</title>
<meta property="og:type" content="product">
</head><body>
<button class="add-to-cart">Add to Cart</button>
</body></html>"""
        result = {"url": "https://example.com/p/1", "success": True, "metadata": {"title": "Product Name"}, "html": html}
        classification = classify_page(result, "example.com")
        assert classification.page_type == PAGE_TYPE_PRODUCT_DETAIL

    def test_pdp_from_real_fixture(self):
        """PDP classification from the real snapshot HTML (if available)."""
        html = _load_snapshot("*openfarmpet*")
        if not html:
            pytest.skip("No openfarmpet snapshot HTML found")
        result = {
            "url": "https://openfarmpet.com/products/chicken-and-turkey-dry-dog-food",
            "success": True,
            "metadata": {"title": "Grain-Free Chicken & Turkey Dry Dog Food - Open Farm"},
            "html": html,
        }
        classification = classify_page(result, "openfarmpet.com")
        assert classification.page_type == PAGE_TYPE_PRODUCT_DETAIL
        assert classification.domain_match is True


# ---------------------------------------------------------------------------
# Tests: Non-PDP detection
# ---------------------------------------------------------------------------


class TestNonPdpDetection:
    """Tests for non-PDP page classification."""

    def test_category_page_from_html(self, category_html):
        """Category/collection page is classified as category_page."""
        result = {
            "url": "https://example.com/collections/dog-food",
            "success": True,
            "metadata": {"title": "Dog Food Collection - Brand"},
            "html": category_html,
        }
        classification = classify_page(result, "example.com")
        assert classification.page_type == PAGE_TYPE_CATEGORY
        assert classification.rejection_reason is not None

    def test_category_page_with_jsonld_collection(self):
        """Collection page with JSON-LD CollectionPage is classified as category."""
        html = """<html><head>
<title>All Products - Brand</title>
<script type="application/ld+json">{"@type":"CollectionPage"}</script>
</head><body>
<a href="/products/p1">P1</a><a href="/products/p2">P2</a><a href="/products/p3">P3</a>
</body></html>"""
        result = {"url": "https://example.com/collections/all", "success": True, "metadata": {"title": "All Products - Brand"}, "html": html}
        classification = classify_page(result, "example.com")
        assert classification.page_type == PAGE_TYPE_CATEGORY

    def test_home_page(self, home_html):
        """Home page is classified as home_page."""
        result = {"url": "https://example.com/", "success": True, "metadata": {"title": "Brand Name"}, "html": home_html}
        classification = classify_page(result, "example.com")
        assert classification.page_type == PAGE_TYPE_HOME

    def test_blog_article(self, blog_html):
        """Blog article URL is classified as blog_article."""
        result = {
            "url": "https://example.com/blog/how-to-choose-dog-food",
            "success": True,
            "metadata": {"title": "How to Choose the Right Dog Food - Brand Blog"},
            "html": blog_html,
        }
        classification = classify_page(result, "example.com")
        assert classification.page_type == PAGE_TYPE_BLOG_ARTICLE

    def test_search_results(self, search_html):
        """Search results URL is classified as search_result."""
        result = {"url": "https://example.com/search?q=dog+food", "success": True, "metadata": {"title": "Search results for 'dog food'"}, "html": search_html}
        classification = classify_page(result, "example.com")
        assert classification.page_type == PAGE_TYPE_SEARCH_RESULT

    def test_login_wall(self, login_html):
        """Login/auth wall is classified as login_page."""
        result = {"url": "https://example.com/account/login", "success": True, "metadata": {"title": "Sign In"}, "html": login_html}
        classification = classify_page(result, "example.com")
        assert classification.page_type == PAGE_TYPE_LOGIN

    def test_blocked_page(self):
        """Blocked crawl result is classified as blocked_page."""
        result = _load_json("blocked_crawl_result.json")
        classification = classify_page(result, "blocked-site.com")
        assert classification.page_type == PAGE_TYPE_BLOCKED

    def test_error_title_page(self):
        """Page with 404 in title is classified as error_page."""
        html = "<html><head><title>404 Not Found</title></head><body><p>Page not found</p></body></html>"
        result = {"url": "https://example.com/missing", "success": True, "metadata": {"title": "404 Not Found"}, "html": html}
        classification = classify_page(result, "example.com")
        assert classification.page_type == PAGE_TYPE_ERROR


# ---------------------------------------------------------------------------
# Tests: Domain verification
# ---------------------------------------------------------------------------


class TestDomainVerification:
    """Domain mismatch detection."""

    def test_domain_mismatch(self, pdp_html_with_jsonld):
        """URL hostname != canonical_domain marks wrong_domain."""
        result = {
            "url": "https://wrong-domain.com/products/test",
            "success": True,
            "metadata": {"title": "Product Name - Brand"},
            "html": pdp_html_with_jsonld,
        }
        classification = classify_page(result, "example.com")
        assert classification.page_type == PAGE_TYPE_WRONG_DOMAIN
        assert classification.rejection_reason is not None
        assert "does not match" in classification.rejection_reason.lower()
        assert "has_domain_mismatch" in classification.negative_signals

    def test_subdomain_allowed(self, pdp_html_with_jsonld):
        """Subdomain of canonical domain should match."""
        result = {
            "url": "https://shop.example.com/products/test",
            "success": True,
            "metadata": {"title": "Product Name - Brand"},
            "html": pdp_html_with_jsonld,
        }
        classification = classify_page(result, "example.com")
        assert classification.domain_match is True

    def test_www_subdomain_allowed(self, pdp_html_with_jsonld):
        """www subdomain should match."""
        result = {
            "url": "https://www.example.com/products/test",
            "success": True,
            "metadata": {"title": "Product Name - Brand"},
            "html": pdp_html_with_jsonld,
        }
        classification = classify_page(result, "example.com")
        assert classification.domain_match is True

    def test_empty_canonical_domain(self, pdp_html_with_jsonld):
        """Empty canonical domain should not cause mismatch rejection."""
        result = {
            "url": "https://example.com/products/test",
            "success": True,
            "metadata": {"title": "Product Name - Brand"},
            "html": pdp_html_with_jsonld,
        }
        classification = classify_page(result, "")
        assert classification.domain_match is True


# ---------------------------------------------------------------------------
# Tests: Evidence helpers
# ---------------------------------------------------------------------------


class TestFormatClassificationEvidence:
    """Format classification evidence."""

    def test_format_evidence(self):
        """Format produces expected keys."""
        clf = PageClassification(
            page_type=PAGE_TYPE_PRODUCT_DETAIL,
            confidence=0.85,
            signals=["has_jsonld_product", "has_og_type_product"],
            negative_signals=["has_search_path"],
            domain_match=True,
            page_title="Test Product",
            final_url="https://example.com/p/1",
        )
        evidence = format_classification_evidence(clf)
        assert evidence["page_type"] == PAGE_TYPE_PRODUCT_DETAIL
        assert evidence["confidence"] == 0.85
        assert "has_jsonld_product" in evidence["signals"]
        assert evidence["domain_match"] is True


class TestBuildIdentityEvidence:
    """Build identity evidence from crawl result."""

    def test_with_brand_from_payload(self, pdp_html_with_jsonld):
        """Brand overlap computed from payload brand name."""
        result = {"url": "https://example.com/p/1", "success": True, "metadata": {"title": "Product Name - Brand"}, "html": pdp_html_with_jsonld}
        evidence = build_identity_evidence(
            crawl_result=result,
            source_slug="test-brand",
            canonical_domain="example.com",
            brand_from_payload="Test Brand",
        )
        assert "brand_overlap" in evidence
        assert "name_consistency" in evidence

    def test_identity_with_empty_crawl(self):
        """Empty crawl returns minimal evidence."""
        evidence = build_identity_evidence(
            crawl_result={},
            source_slug="test",
            canonical_domain="example.com",
        )
        assert "brand_overlap" in evidence
        assert "name_consistency" in evidence
        assert "variant_conflict_signals" in evidence


class TestFromCategoryFixture:
    """Tests using the category crawl result fixture."""

    def test_category_fixture_classification(self):
        """Category fixture is classified as category_page."""
        result = _load_json("category_crawl_result.json")
        # Add HTML with category signals and enough body content to avoid nav_only_content
        html = """<html><head><title>Dog Food - Open Farm</title></head><body>
<h1>Dog Food Collection</h1>
<p>Browse our selection of premium dog food options. All recipes are crafted with
wholesome ingredients and balanced nutrition to support your dog's health and vitality.
From grain-free options to limited ingredient diets, we have something for every pup.</p>
<div class="product-grid">
<div class="product-card"><a href="/products/one">Product One</a><span class="price">$29.99</span></div>
<div class="product-card"><a href="/products/two">Product Two</a><span class="price">$34.99</span></div>
<div class="product-card"><a href="/products/three">Product Three</a><span class="price">$39.99</span></div>
<div class="product-card"><a href="/products/four">Product Four</a><span class="price">$44.99</span></div>
</div>
<p>Free shipping on orders over $50. Subscribe and save 15% on every order.</p>
<p>Our dog food is made in the USA with globally sourced ingredients.</p>
<p>All recipes meet AAFCO nutrient profiles for all life stages.</p>
</body></html>"""
        result["html"] = html
        classification = classify_page(result, "openfarmpet.com")
        assert classification.page_type == PAGE_TYPE_CATEGORY

    def test_pdp_fixture_classification(self):
        """PDP fixture needs HTML for classification."""
        result = _load_json("pdp_crawl_result.json")
        # Classification needs HTML signals, so provide minimal PDP HTML
        html = """<html><head>
<title>Grain-Free Chicken & Turkey Dry Dog Food - Open Farm</title>
<meta property="og:type" content="product">
<script type="application/ld+json">{"@type":"Product","name":"Grain-Free Chicken & Turkey Dry Dog Food"}</script>
</head><body>
<h1>Grain-Free Chicken & Turkey Dry Dog Food</h1>
<form action="/cart/add"><button>Add to Cart</button></form>
<span class="price">$28.99</span>
</body></html>"""
        result["html"] = html
        classification = classify_page(result, "openfarmpet.com")
        assert classification.page_type == PAGE_TYPE_PRODUCT_DETAIL
