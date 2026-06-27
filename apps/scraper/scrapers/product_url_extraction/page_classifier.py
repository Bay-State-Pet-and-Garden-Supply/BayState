"""Page classifier — pure signal-based page type classification.

Classifies crawled pages into known types using deterministic signals
(title, meta, JSON-LD, final URL, DOM hints). No LLM calls.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Known page types
PAGE_TYPE_PRODUCT_DETAIL = "product_detail_page"
PAGE_TYPE_CATEGORY = "category_page"
PAGE_TYPE_SEARCH_RESULT = "search_result"
PAGE_TYPE_HOME = "home_page"
PAGE_TYPE_BLOG_ARTICLE = "blog_article"
PAGE_TYPE_LOGIN = "login_page"
PAGE_TYPE_BLOCKED = "blocked_page"
PAGE_TYPE_ERROR = "error_page"
PAGE_TYPE_WRONG_DOMAIN = "wrong_domain"
PAGE_TYPE_UNKNOWN = "unknown"

# Minimum confidence required for product_detail_page classification.
# Prevents low-confidence single-signal pages (e.g. og:type=product only)
# from triggering verification.
MIN_PDP_CONFIDENCE = 0.5

# Signal weights (positive = strong indicator)
SIGNAL_WEIGHTS: dict[str, float] = {
    "has_jsonld_product": 30.0,
    "has_jsonld_product_group": 25.0,
    "has_og_type_product": 25.0,
    "has_add_to_cart_form": 20.0,
    "has_variant_selector": 15.0,
    "has_price_with_currency": 15.0,
    "has_product_h1": 10.0,
    "has_product_name_in_title": 5.0,
    "has_buy_now_button": 10.0,
    "has_add_to_cart_button": 15.0,
    "has_jsonld_category": -20.0,
    "has_category_title": -15.0,
    "has_search_path": -25.0,
    "has_search_title": -20.0,
    "has_blog_path": -25.0,
    "has_home_path": -15.0,
    "has_login_form": -30.0,
    "has_blocked_text": -100.0,
    "has_error_title": -50.0,
    "has_domain_mismatch": -100.0,
    "has_multiple_product_links": -25.0,
    "has_collection_path": -20.0,
    "has_collection_title": -15.0,
    "has_nav_only_content": -20.0,
}

# PDP-specific positive signal names (used for confidence calculation)
PDP_POSITIVE_SIGNALS: set[str] = {
    "has_jsonld_product",
    "has_jsonld_product_group",
    "has_og_type_product",
    "has_add_to_cart_form",
    "has_variant_selector",
    "has_price_with_currency",
    "has_product_h1",
    "has_product_name_in_title",
    "has_buy_now_button",
    "has_add_to_cart_button",
}

# Non-PDP negative signal names
NON_PDP_SIGNALS: set[str] = {
    "has_jsonld_category",
    "has_category_title",
    "has_search_path",
    "has_search_title",
    "has_blog_path",
    "has_home_path",
    "has_login_form",
    "has_blocked_text",
    "has_error_title",
    "has_domain_mismatch",
    "has_nav_only_content",
}


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------


@dataclass
class PageClassification:
    """Result of page classification."""

    page_type: str  # one of PAGE_TYPE_* constants
    confidence: float  # 0.0–1.0
    signals: list[str]  # positive signal names
    negative_signals: list[str] = field(default_factory=list)  # negative signal names
    rejection_reason: str | None = None
    page_title: str | None = None
    final_url: str | None = None
    domain_match: bool = True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_domain(url: str) -> str:
    """Extract lowercase hostname from URL."""
    try:
        hostname = urlparse(url).hostname or ""
    except Exception:
        return ""
    return hostname.lower()


def _domain_matches(actual_domain: str, expected_domain: str) -> bool:
    """Check if actual domain matches expected domain/subdomain."""
    if not expected_domain:
        return True
    if not actual_domain:
        return False
    expected_domain = expected_domain.lower().strip()
    actual_domain = actual_domain.lower().strip()
    # Exact match or subdomain match
    return actual_domain == expected_domain or actual_domain.endswith(f".{expected_domain}")


def _has_jsonld_product(html: str | None) -> bool:
    """Check if HTML contains JSON-LD with @type: Product or @type: ProductGroup."""
    if not html:
        return False
    # Match any script[type="application/ld+json"] content
    pattern = re.compile(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>.*?"@type"\s*:\s*"\s*(?:Product|ProductGroup)\s*".*?</script>',
        re.DOTALL | re.IGNORECASE,
    )
    return bool(pattern.search(html))


def _has_jsonld_category(html: str | None) -> bool:
    """Check if HTML contains JSON-LD with @type: CollectionPage or ItemList."""
    if not html:
        return False
    pattern = re.compile(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>.*?"@type"\s*:\s*"\s*(?:CollectionPage|ItemList|BreadcrumbList)\s*".*?</script>',
        re.DOTALL | re.IGNORECASE,
    )
    return bool(pattern.search(html))


def _has_product_schema_in_metadata(metadata: dict[str, Any]) -> bool:
    """Check if Crawl4AI metadata already contains parsed Product schema info."""
    # Crawl4AI may extract schema.org types into metadata
    schema_type = (metadata.get("schema_type") or metadata.get("type") or "").lower()
    if schema_type in {"product", "productgroup"}:
        return True
    # Check description for product indicators
    return False


def _has_og_type_product(html: str | None) -> bool:
    """Check for og:type == product in HTML meta tags."""
    if not html:
        return False
    return bool(re.search(
        r'<meta[^>]*property=["\']og:type["\'][^>]*content=["\']product["\']',
        html,
        re.IGNORECASE,
    ))


def _has_add_to_cart(html: str | None) -> bool:
    """Check for add-to-cart form or button in HTML."""
    if not html:
        return False
    # Look for form with add to cart action
    if re.search(
        r'<form[^>]*action=["\'][^"\']*(?:cart|add-to-cart|addtocart)[^"\']*["\']',
        html,
        re.IGNORECASE,
    ):
        return True
    # Look for add-to-cart buttons
    if re.search(
        r'<(?:button|a|input)[^>]*(?:add[-_]?to[-_]?cart|addtocart|buy[-_]?now)[^>]*>',
        html,
        re.IGNORECASE,
    ):
        return True
    # Look for Shopify-style add-to-cart forms
    if re.search(
        r'<form[^>]*action=["\']/cart/add["\']',
        html,
        re.IGNORECASE,
    ):
        return True
    return False


def _has_variant_selector(html: str | None) -> bool:
    """Check for variant/option selector in HTML."""
    if not html:
        return False
    patterns = [
        r'<select[^>]*option[^>]*(?:variant|size|color|flavor|scent|strength|type)[^>]*>',
        r'class=["\'][^"\']*(?:product-form__input|variant-selector|swatch|variant-wrapper|product__variant)[^"\']*["\']',
        r'<fieldset[^>]*class=["\'][^"\']*(?:variant|option|product-form|swatch)[^"\']*["\']',
        r'data-variant-id|data-option-index|data-product-variant',
    ]
    return any(re.search(p, html, re.IGNORECASE) for p in patterns)


def _has_price(html: str | None) -> bool:
    """Check for price with currency symbol in HTML."""
    if not html:
        return False
    # Price patterns: $XX.XX, £XX.XX, €XX.XX plus common class names
    patterns = [
        r'[\$£€¥]\s*\d+[.,]\d{2}',
        r'<[^>]*(?:price|product-price|sale-price|current-price)[^>]*>.*?[\$£€¥]',
        r'class=["\'][^"\']*(?:price|product__price|product-price)[^"\']*["\']',
        r'itemprop=["\']price["\']',
        r'data-price[= ]',
    ]
    return any(re.search(p, html, re.IGNORECASE) for p in patterns)


def _has_product_h1(html: str | None, metadata: dict[str, Any]) -> bool:
    """Check if H1 matches product-level content (not brand/domain)."""
    if not html:
        return False
    # Extract H1 text
    h1_match = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.DOTALL | re.IGNORECASE)
    if not h1_match:
        return False
    h1_text = h1_match.group(1).strip()
    h1_text = re.sub(r'<[^>]+>', '', h1_text).strip()  # Strip inner tags
    if not h1_text:
        return False
    title = metadata.get("title", "")
    # If H1 appears to be a product name (not just brand/site name), it's a strong signal
    # A product H1 typically contains more than 3 words, has meaningful product descriptors
    word_count = len(h1_text.split())
    if word_count >= 2 and title and h1_text in title:
        return True
    # Check for common product patterns in H1
    if re.search(r'(?:flavor|scent|formula|blend|recipe|kibble|food|treat|supplement|size|pack|bag|box|count)', h1_text, re.IGNORECASE):
        return True
    return False


def _has_product_name_in_title(metadata: dict[str, Any]) -> bool:
    """Check if page title contains product-like content."""
    title = (metadata.get("title") or "").strip()
    if not title:
        return False
    # Product titles typically contain: brand + product name/descriptor
    # Filter out pure brand/domain titles
    title_lower = title.lower()
    # If title is just "Brand Name" or "Domain.com", it's likely not a product
    if len(title_lower.split()) <= 2:
        return False
    # Check for common ecommerce patterns
    patterns = [
        r'(?:buy|shop|order|get|save)\s',
        r'(?:free\s+shipping|on\s+sale|limited\s+time)',
        r'(?:price|cost|only\s+\$)',
    ]
    if any(re.search(p, title_lower) for p in patterns):
        return True
    return False


def _has_category_title(metadata: dict[str, Any]) -> bool:
    """Check if page title indicates a category/collection page."""
    title = (metadata.get("title") or "").lower().strip()
    if not title:
        return False
    category_words = {
        "collection", "category", "shop all", "browse", "products",
        "shop by", "all products", "our products", "catalog",
    }
    return any(w in title for w in category_words)


def _has_search_path(url: str) -> bool:
    """Check if URL path indicates a search results page."""
    try:
        path = urlparse(url).path.lower()
        query = urlparse(url).query.lower()
    except Exception:
        return False
    if "/search" in path or "/search/" in path:
        return True
    if "q=" in query or "query=" in query or "search=" in query:
        return True
    return False


def _has_search_title(metadata: dict[str, Any]) -> bool:
    """Check if page title indicates search results."""
    title = (metadata.get("title") or "").lower().strip()
    if not title:
        return False
    search_words = {"search results", "search:", "search for", "search -"}
    return any(w in title for w in search_words)


def _has_blog_path(url: str) -> bool:
    """Check if URL path indicates a blog or article."""
    try:
        path = urlparse(url).path.lower()
    except Exception:
        return False
    blog_patterns = {"/blog", "/articles", "/news", "/journal", "/post"}
    return any(p in path for p in blog_patterns)


def _has_home_path(url: str) -> bool:
    """Check if URL path indicates home page."""
    try:
        path = urlparse(url).path.rstrip("/")
    except Exception:
        return False
    return path == "" or path == "/" or path == "/home"


def _has_collection_path(url: str) -> bool:
    """Check if URL path indicates a collection/category listing page."""
    try:
        path = urlparse(url).path.lower()
    except Exception:
        return False
    collection_patterns = {"/collections", "/categories", "/category", "/product-list", "/all-products", "/shop"}
    return any(p in path for p in collection_patterns)


def _has_login_form(html: str | None) -> bool:
    """Check if page is a login/auth wall."""
    if not html:
        return False
    # Check head/meta for login signals
    title_match = re.search(r'<title[^>]*>(.*?)</title>', html, re.DOTALL | re.IGNORECASE)
    if title_match:
        title_text = title_match.group(1).lower().strip()
        if title_text in {"sign in", "log in", "login", "sign in / register", "account login"}:
            return True
    # Check for prominent login/password forms in first 3KB
    head_section = html[:3000].lower()
    login_indicators = [
        'type="password"', 'name="password"', 'id="password"',
        'type="email"', 'name="login"', 'name="_username"',
        'forgot your password', 'reset password', 'create account',
    ]
    login_count = sum(1 for ind in login_indicators if ind in head_section)
    # Also check for login-specific form action
    has_login_action = bool(re.search(
        r'<form[^>]*action=["\'][^"\']*(?:login|sign[_-]?in|auth|authenticate)[^"\']*["\']',
        html,
        re.IGNORECASE,
    ))
    if login_count >= 3 and has_login_action:
        return True
    return False


def _has_blocked_text(crawl_result: dict[str, Any]) -> bool:
    """Check if crawl encountered a blocked/restricted page."""
    if not crawl_result.get("success", False):
        error = (crawl_result.get("error") or "").lower()
        blocked_words = {"403", "429", "blocked", "captcha", "forbidden", "too many requests", "access denied"}
        if any(w in error for w in blocked_words):
            return True
    html = crawl_result.get("html") or crawl_result.get("cleaned_html") or ""
    head = html[:2000].lower()
    blocked_words = {"access denied", "please verify you are a human", "security check", "sorry, you have been blocked"}
    return any(w in head for w in blocked_words)


def _has_error_title(metadata: dict[str, Any]) -> bool:
    """Check if page title indicates an error/not-found page."""
    title = (metadata.get("title") or "").lower().strip()
    if not title:
        return False
    error_words = {"404", "not found", "page not found", "error", "oops", "sorry, this page isn't available"}
    return any(w in title for w in error_words)


def _has_multiple_product_links(html: str | None) -> bool:
    """Check if page contains links to multiple product pages."""
    if not html:
        return False
    # Count product page links (common pattern: /products/SLUG or /product/SLUG)
    product_links = re.findall(
        r'href=["\'][^"\']*(?:/products/|/product/|/p/|/item/)[^"\']*["\']',
        html,
        re.IGNORECASE,
    )
    return len(product_links) >= 3


def _has_nav_only_content(html: str | None, metadata: dict[str, Any]) -> bool:
    """Check if page appears to have only navigation content (no main content).

    Only triggers for pages with enough HTML to analyze. Short pages are not
    penalized here since many single-page apps or minimal PDPs are short.
    """
    if not html or len(html) < 5000:
        return False
    # Check main body area for nav/footer-only content
    body = html[3000:15000]
    if not body:
        return False
    body_lower = body.lower()
    nav_keywords = {"menu", "navigation", "footer", "copyright", "all rights reserved"}
    nav_count = sum(1 for kw in nav_keywords if kw in body_lower)
    if nav_count >= 3 and len(body) < 2000:
        return True
    return False


def _has_collection_title(metadata: dict[str, Any]) -> bool:
    """Check if title contains collection keywords."""
    title = (metadata.get("title") or "").lower().strip()
    if not title:
        return False
    collection_words = {"collection", "shop", "store", "products", "catalog"}
    return any(t in title for t in collection_words)


# ---------------------------------------------------------------------------
# Main classification function
# ---------------------------------------------------------------------------


def classify_page(
    crawl_result: dict[str, Any],
    canonical_domain: str,
) -> PageClassification:
    """Classify a crawled page into a known page type.

    Uses deterministic signals from crawl metadata, HTML content,
    final URL, and domain matching. No LLM calls.

    Args:
        crawl_result: Normalized Crawl4AI crawl result dict.
        canonical_domain: Expected canonical domain for the product source.

    Returns:
        ``PageClassification`` with page type, confidence, signals,
        negative signals, and optional rejection reason.
    """
    final_url = crawl_result.get("url", "")
    metadata = crawl_result.get("metadata", {}) if isinstance(crawl_result.get("metadata"), dict) else {}
    html = crawl_result.get("html") or crawl_result.get("cleaned_html") or ""
    page_title = metadata.get("title", "")

    # ---- Domain verification ----
    actual_domain = _resolve_domain(final_url)
    domain_match = _domain_matches(actual_domain, canonical_domain)

    # ---- Extract signals ----
    signals: list[str] = []
    negative_signals: list[str] = []

    # Test all signal extractors
    signal_checks = [
        ("has_jsonld_product", _has_jsonld_product(html) or _has_product_schema_in_metadata(metadata)),
        ("has_jsonld_product_group", bool(
            html and re.search(
                r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>.*?"@type"\s*:\s*"\s*ProductGroup\s*".*?</script>',
                html, re.DOTALL | re.IGNORECASE,
            )
        )),
        ("has_og_type_product", _has_og_type_product(html)),
        ("has_add_to_cart_form", _has_add_to_cart(html)),
        ("has_variant_selector", _has_variant_selector(html)),
        ("has_price_with_currency", _has_price(html)),
        ("has_product_h1", _has_product_h1(html, metadata)),
        ("has_product_name_in_title", _has_product_name_in_title(metadata)),
        ("has_jsonld_category", _has_jsonld_category(html)),
        ("has_category_title", _has_category_title(metadata)),
        ("has_search_path", _has_search_path(final_url)),
        ("has_search_title", _has_search_title(metadata)),
        ("has_blog_path", _has_blog_path(final_url)),
        ("has_home_path", _has_home_path(final_url)),
        ("has_login_form", _has_login_form(html)),
        ("has_blocked_text", _has_blocked_text(crawl_result)),
        ("has_error_title", _has_error_title(metadata)),
        ("has_multiple_product_links", _has_multiple_product_links(html)),
        ("has_collection_path", _has_collection_path(final_url)),
        ("has_collection_title", _has_collection_title(metadata)),
        ("has_nav_only_content", _has_nav_only_content(html, metadata)),
    ]

    if not domain_match:
        negative_signals.append("has_domain_mismatch")

    for signal_name, present in signal_checks:
        if present:
            if signal_name in PDP_POSITIVE_SIGNALS:
                signals.append(signal_name)
            elif signal_name in NON_PDP_SIGNALS:
                negative_signals.append(signal_name)
            else:
                # Neutral signals not in PDP_POSITIVE or NON_PDP_SIGNALS
                if signal_name in {"has_multiple_product_links", "has_collection_path"}:
                    negative_signals.append(signal_name)
                else:
                    signals.append(signal_name)

    # ---- Compute PDP confidence ----
    pdp_score = sum(SIGNAL_WEIGHTS.get(s, 0) for s in signals)
    non_pdp_score = sum(abs(SIGNAL_WEIGHTS.get(s, 0)) for s in negative_signals)

    # Domain mismatch is an automatic strong negative
    if not domain_match:
        non_pdp_score += abs(SIGNAL_WEIGHTS.get("has_domain_mismatch", 100))
    else:
        # Domain match is a bonus for PDP
        pdp_score += 10.0

    # ---- Classify ----
    page_type = PAGE_TYPE_UNKNOWN
    rejection_reason: str | None = None
    confidence = 0.0

    # Priority order: check blocking/error first, then domain, then classification

    # Compute strong-signal metadata before the elif chain so it is available
    # for PDP detection branches.  These variables are cheap to compute and
    # safe to evaluate even for blocked/error pages (the lists are empty).
    _signals_set = set(signals)
    _signals_beyond_meta = _signals_set - {"has_og_type_product", "has_jsonld_product", "has_jsonld_product_group"}
    _has_strong_signal = bool(_signals_beyond_meta & {
        "has_add_to_cart_form", "has_price_with_currency",
        "has_variant_selector", "has_product_h1",
        "has_product_name_in_title", "has_buy_now_button",
        "has_add_to_cart_button",
    })

    # 1. Blocked/error page
    if "has_blocked_text" in negative_signals:
        page_type = PAGE_TYPE_BLOCKED
        rejection_reason = "Crawl encountered blocked or restricted page"
        confidence = 0.95
    elif "has_error_title" in negative_signals:
        page_type = PAGE_TYPE_ERROR
        rejection_reason = "Page title indicates error or not-found page"
        confidence = 0.9

    # 2. Domain mismatch
    elif not domain_match:
        page_type = PAGE_TYPE_WRONG_DOMAIN
        rejection_reason = f"Final URL domain ({actual_domain}) does not match canonical domain ({canonical_domain})"
        confidence = 0.95

    # 3. Login/auth wall
    elif "has_login_form" in negative_signals:
        page_type = PAGE_TYPE_LOGIN
        rejection_reason = "Page appears to be a login or auth wall"
        confidence = 0.8

    # 4. PDP detection
    # If the only positive signals are meta/schema tags (og:type, JSON-LD),
    # require at least one additional strong commerce signal to confirm PDP.
    elif pdp_score >= 25.0 and pdp_score > abs(non_pdp_score):
        if _has_strong_signal or _signals_beyond_meta:
            confidence = min(pdp_score / 100.0, 0.95)
            if confidence >= MIN_PDP_CONFIDENCE:
                page_type = PAGE_TYPE_PRODUCT_DETAIL
            else:
                page_type = PAGE_TYPE_UNKNOWN
                rejection_reason = (
                    f"PDP signals present but confidence too low "
                    f"({confidence:.2f} < {MIN_PDP_CONFIDENCE})"
                )
        else:
            page_type = PAGE_TYPE_UNKNOWN
            rejection_reason = (
                "Product schema or og:type present but no additional commerce "
                "signals (add-to-cart, price, variant, H1, name)"
            )
            confidence = 0.3
    elif "has_jsonld_product" in signals or "has_og_type_product" in signals:
        if _has_strong_signal and non_pdp_score < 20:
            page_type = PAGE_TYPE_PRODUCT_DETAIL
            confidence = 0.7
        elif _has_strong_signal:
            page_type = PAGE_TYPE_UNKNOWN
            rejection_reason = "Mixed signals: product schema present but non-PDP signals also detected"
            confidence = 0.4
        else:
            page_type = PAGE_TYPE_UNKNOWN
            rejection_reason = (
                "Product schema or og:type present but no additional commerce "
                "signals (add-to-cart, price, variant, H1, name)"
            )
            confidence = 0.3

    # 5. Category page
    elif "has_jsonld_category" in negative_signals or "has_category_title" in negative_signals:
        page_type = PAGE_TYPE_CATEGORY
        rejection_reason = "Page is a category or collection listing"
        confidence = 0.8
    elif "has_collection_path" in negative_signals:
        page_type = PAGE_TYPE_CATEGORY
        rejection_reason = "Page URL path indicates a collection/category listing"
        confidence = 0.75
    elif "has_multiple_product_links" in negative_signals and "has_price_with_currency" not in signals:
        page_type = PAGE_TYPE_CATEGORY
        rejection_reason = "Page contains multiple product links without single product signals"
        confidence = 0.65

    # 6. Search results
    elif "has_search_path" in negative_signals or "has_search_title" in negative_signals:
        page_type = PAGE_TYPE_SEARCH_RESULT
        rejection_reason = "Page is a search results page"
        confidence = 0.85

    # 7. Blog/article
    elif "has_blog_path" in negative_signals:
        page_type = PAGE_TYPE_BLOG_ARTICLE
        rejection_reason = "Page is a blog article or news post"
        confidence = 0.8

    # 8. Home page
    elif "has_home_path" in negative_signals:
        page_type = PAGE_TYPE_HOME
        rejection_reason = "Page is the site home page"
        confidence = 0.85

    # 9. Nav-only content
    elif "has_nav_only_content" in negative_signals:
        page_type = PAGE_TYPE_UNKNOWN
        rejection_reason = "Page contains only navigation content"
        confidence = 0.3

    # 10. Everything else
    else:
        page_type = PAGE_TYPE_UNKNOWN
        rejection_reason = "Page did not match any known PDP or non-PDP pattern"
        confidence = 0.2

    return PageClassification(
        page_type=page_type,
        confidence=round(confidence, 4),
        signals=signals,
        negative_signals=negative_signals,
        rejection_reason=rejection_reason,
        page_title=page_title,
        final_url=final_url,
        domain_match=domain_match,
    )


def format_classification_evidence(classification: PageClassification) -> dict[str, Any]:
    """Format page classification evidence for artifact payload."""
    return {
        "page_type": classification.page_type,
        "confidence": classification.confidence,
        "signals": classification.signals,
        "negative_signals": classification.negative_signals,
        "rejection_reason": classification.rejection_reason,
        "page_title": classification.page_title,
        "final_url": classification.final_url,
        "domain_match": classification.domain_match,
    }


# ---------------------------------------------------------------------------
# Identity evidence builder
# ---------------------------------------------------------------------------


def build_identity_evidence(
    crawl_result: dict[str, Any],
    source_slug: str | None,
    canonical_domain: str,
    brand_from_payload: str | None = None,
    product_name_from_payload: str | None = None,
) -> dict[str, Any]:
    """Build identity evidence from crawl result and available context.

    Produces brand/name overlap evidence without querying the database.
    Falls back to source_slug / domain when brand_name is absent.

    Args:
        crawl_result: Crawl4AI crawl result.
        source_slug: Source slug from job (or None).
        canonical_domain: Canonical domain for the source.
        brand_from_payload: Optional brand name from job payload.
        product_name_from_payload: Optional product name from job payload.

    Returns:
        Identity evidence dict with brand overlap and name consistency info.
    """
    metadata = crawl_result.get("metadata", {}) if isinstance(crawl_result.get("metadata"), dict) else {}
    html = crawl_result.get("html") or crawl_result.get("cleaned_html") or ""
    final_url = crawl_result.get("url", "")

    page_title = metadata.get("title", "")
    page_description = metadata.get("description", "")

    # Extract brand from page content (common patterns)
    extracted_brand: str | None = None
    if html:
        # Look for og:site_name
        og_site = re.search(r'<meta[^>]*property=["\']og:site_name["\'][^>]*content=["\']([^"\']+)["\']', html, re.IGNORECASE)
        if og_site:
            extracted_brand = og_site.group(1).strip()
        if not extracted_brand:
            # Try JSON-LD brand
            brand_match = re.search(
                r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>.*?"brand"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"]+)"',
                html, re.DOTALL | re.IGNORECASE,
            )
            if brand_match:
                extracted_brand = brand_match.group(1).strip()

    # Extract name from JSON-LD Product
    extracted_product_name: str | None = None
    if html:
        name_match = re.search(
            r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>.*?"@type"\s*:\s*"Product".*?"name"\s*:\s*"([^"]+)"',
            html, re.DOTALL | re.IGNORECASE,
        )
        if name_match:
            extracted_product_name = name_match.group(1).strip()

    # Compute brand overlap
    brand_overlap: dict[str, Any] = {}
    expected_brand = brand_from_payload or source_slug or canonical_domain
    if expected_brand and extracted_brand:
        expected_tokens = set(expected_brand.lower().split())
        extracted_tokens = set(extracted_brand.lower().split())
        overlap = expected_tokens & extracted_tokens
        brand_overlap = {
            "expected_brand": expected_brand,
            "extracted_brand": extracted_brand,
            "token_overlap": list(overlap),
            "overlap_score": round(len(overlap) / max(len(expected_tokens), 1), 4),
        }
    elif expected_brand:
        brand_overlap = {
            "expected_brand": expected_brand,
            "extracted_brand": extracted_brand,
            "token_overlap": [],
            "overlap_score": 0.0,
        }

    # Compute name overlap
    name_consistency: dict[str, Any] = {}
    if extracted_product_name:
        # Check consistency between JSON-LD name and page title
        title_norm = page_title.lower().strip() if page_title else ""
        name_norm = extracted_product_name.lower().strip()
        title_tokens = set(title_norm.split())
        name_tokens = set(name_norm.split())
        title_overlap = title_tokens & name_tokens
        name_consistency = {
            "extracted_name": extracted_product_name,
            "title_name": page_title,
            "title_overlap_tokens": list(title_overlap),
            "title_overlap_score": round(len(title_overlap) / max(len(name_tokens), 1), 4),
        }

    # Variant conflict signals (from title having variant references)
    variant_conflict_signals: list[str] = []
    if page_title:
        title_lower = page_title.lower()
        variant_words = {"variant", "option", "select", "choose", "pick"}
        if any(w in title_lower for w in variant_words):
            variant_conflict_signals.append("title_contains_variant_selector_words")

    return {
        "brand_overlap": brand_overlap,
        "name_consistency": name_consistency,
        "variant_conflict_signals": variant_conflict_signals,
        "extracted_meta": {
            "page_title": page_title,
            "page_description": page_description,
        },
    }


__all__ = [
    "PageClassification",
    "classify_page",
    "format_classification_evidence",
    "build_identity_evidence",
    # Page type constants
    "PAGE_TYPE_PRODUCT_DETAIL",
    "PAGE_TYPE_CATEGORY",
    "PAGE_TYPE_SEARCH_RESULT",
    "PAGE_TYPE_HOME",
    "PAGE_TYPE_BLOG_ARTICLE",
    "PAGE_TYPE_LOGIN",
    "PAGE_TYPE_BLOCKED",
    "PAGE_TYPE_ERROR",
    "PAGE_TYPE_WRONG_DOMAIN",
    "PAGE_TYPE_UNKNOWN",
]
