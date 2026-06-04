"""Platform fingerprinting and curated JsonCssExtractionStrategy schemas.

Provides deterministic extraction for common e-commerce platforms
before falling back to LLM extraction. Supports Shopify, WooCommerce,
Magento, and BigCommerce.

This module does NOT include price, stock, or add-to-cart selectors,
consistent with the project's protected-field policy.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------

_SHOPIFY_FINGERPRINTS = [
    "cdn.shopify.com",
    "/cdn/shop/",
    "Shopify.shop",
    "shopify-checkout",
    'window.Shopify',
    'window.BOOMR',
    'shopify_products',
    'data-shopify',
    'aria-label="shopify"',
]

_WOOCOMMERCE_FINGERPRINTS = [
    "wp-content/plugins/woocommerce",
    "wp-content/themes/*/woocommerce",
    "woocommerce",
    "add_to_cart_button",
    "wc-add-to-cart",
    "woocommerce-breadcrumb",
    "woocommerce-product-gallery",
    "woocommerce-product-details",
    "data-product_id",
    "data-product_sku",
]

_MAGENTO_FINGERPRINTS = [
    "Magento_",
    "/mage/",
    "static/version",
    "form_key",
    "mage/scripts",
    "mage/cookies",
    "product.info.details",
    "data-mage-init",
    "mage-toc",
    "_store=",
    "X-Magento",
]

_BIGCOMMERCE_FINGERPRINTS = [
    "bigcommerce.com",
    "cdn11.bigcommerce.com",
    "stencil",
    "bc-sf-filter",
    "data-store-id",
    "Stencil",
    "__stencil",
    "stencil-style",
    "StencilCLI",
    "bigcommerce-product-view",
]


def _check_fingerprints(text: str, fingerprints: list[str]) -> bool:
    """Check if any fingerprint string is present in the text."""
    text_lower = text.lower()
    for fp in fingerprints:
        if fp.lower() in text_lower:
            return True
    return False


def detect_platform(html: str, url: str) -> str | None:
    """Detect the e-commerce platform from HTML and URL.

    Checks URL first (faster), then scans HTML for platform-specific patterns.

    Returns:
        Platform name string: 'shopify', 'woocommerce', 'magento', 'bigcommerce',
        or None if unknown.
    """
    url_lower = url.lower()
    html_lower = html.lower()
    combined = f"{html_lower}\n{url_lower}"

    # URL-level checks (fast, no HTML parsing needed)
    if "myshopify.com" in url_lower or "shopify.com" in url_lower:
        return "shopify"
    if "wp-content/plugins/woocommerce" in combined or " wp-json/wc/" in url_lower:
        return "woocommerce"

    # HTML-level checks (requires full HTML)
    # Check in priority order: BigCommerce, Shopify, Magento, WooCommerce
    # BigCommerce is checked first because its CDN is distinctive
    if _check_fingerprints(html, _BIGCOMMERCE_FINGERPRINTS):
        return "bigcommerce"
    if _check_fingerprints(html, _SHOPIFY_FINGERPRINTS):
        return "shopify"
    if _check_fingerprints(html, _MAGENTO_FINGERPRINTS):
        return "magento"
    if _check_fingerprints(html, _WOOCOMMERCE_FINGERPRINTS):
        return "woocommerce"

    # URL-level heuristics for subdomain patterns
    # /products/, /product/, /collections/ on various platforms
    if "/products/" in url_lower or "/product/" in url_lower:
        # If URL has common commerce patterns but no platform fingerprint,
        # it might be a custom storefront on those platforms
        pass

    return None


# ---------------------------------------------------------------------------
# Curated platform schemas
# ---------------------------------------------------------------------------


def _build_common_selectors() -> list[dict[str, Any]]:
    """Common CSS selectors shared across multiple platforms."""
    return [
        # Name — try common class patterns
        {"name": "product_name", "selector": "h1", "type": "text"},
        {"name": "product_name", "selector": ".product-title", "type": "text"},
        {"name": "product_name", "selector": ".product__title", "type": "text"},
        {"name": "product_name", "selector": ".product-name", "type": "text"},
        {"name": "product_name", "selector": "[itemprop='name']", "type": "text"},
        # Brand
        {"name": "brand", "selector": ".product-brand, .brand, [itemprop='brand']", "type": "text"},
        # Description
        {"name": "description", "selector": "[itemprop='description'], .product-description, .description", "type": "text"},
        # SKU / UPC
        {"name": "sku", "selector": ".product-sku, .sku, [itemprop='sku']", "type": "text"},
        # Image URLs
        {"name": "images", "selector": (
            ".product-gallery img, .product__gallery img, .product-images img, "
            "[data-image] img, .gallery img"
        ), "type": "attribute", "attribute": "src"},
        # Category / breadcrumb
        {"name": "categories", "selector": ".breadcrumb, .breadcrumbs, nav[aria-label='Breadcrumb']", "type": "text"},
        # Specs / attributes table
        {"name": "specifications", "selector": ".product-specs, .product-attributes, .specs, table.attributes, .product-details", "type": "text"},
    ]


def _build_shopify_schema() -> dict[str, Any]:
    """Build a JsonCssExtractionStrategy schema for Shopify product pages."""
    return {
        "name": "shopify_product",
        "baseSelector": "main, .product, .product-single, [data-section-type='product'], .shopify-section",
        "fields": [
            # Name
            {"name": "product_name", "selector": "h1, .product__title, .product-single__title, [itemprop='name']", "type": "text"},
            # Brand
            {"name": "brand", "selector": ".product-vendor, .product__vendor, .brand, [itemprop='brand'] a", "type": "text"},
            # Description
            {"name": "description", "selector": (
                ".product-description, .product__description, [data-product-description], "
                "[itemprop='description']"
            ), "type": "text"},
            # SKU
            {"name": "sku", "selector": ".product-sku, .sku, .product__sku, [itemprop='sku']", "type": "text"},
            # Image URLs
            {"name": "images", "selector": (
                ".product-single__media img, .product__media img, .product-gallery img, "
                "[data-product-image], .featured-image img"
            ), "type": "attribute", "attribute": "src"},
            # Categories / breadcrumb
            {"name": "categories", "selector": ".breadcrumb, nav.breadcrumb, .breadcrumbs, .product__breadcrumb", "type": "text"},
            # Specs / attributes
            {"name": "specifications", "selector": ".product-specs, .product-attributes", "type": "text"},
        ],
    }


def _build_woocommerce_schema() -> dict[str, Any]:
    """Build a JsonCssExtractionStrategy schema for WooCommerce product pages."""
    return {
        "name": "woocommerce_product",
        "baseSelector": ".product, .single-product, div[itemtype='http://schema.org/Product'], main",
        "fields": [
            # Name
            {"name": "product_name", "selector": ".product_title, .product-title, h1[itemprop='name'], h1", "type": "text"},
            # Brand
            {"name": "brand", "selector": ".product-brand, .brand, .posted_in a, .tagged_as a", "type": "text"},
            # Description
            {"name": "description", "selector": (
                ".woocommerce-product-details__short-description, .product-description, "
                "#tab-description, [itemprop='description']"
            ), "type": "text"},
            # SKU
            {"name": "sku", "selector": ".sku, .product_meta .sku, [itemprop='sku']", "type": "text"},
            # Image URLs
            {"name": "images", "selector": (
                ".woocommerce-product-gallery__image img, .product-gallery img, "
                ".images img, .wp-post-image"
            ), "type": "attribute", "attribute": "src"},
            # Categories / breadcrumb
            {"name": "categories", "selector": ".woocommerce-breadcrumb, .breadcrumb, .product_meta .posted_in", "type": "text"},
            # Specs / attributes table
            {"name": "specifications", "selector": (
                ".woocommerce-product-attributes, .product-attributes, "
                "table.shop_attributes, .woocommerce-product-attributes-item"
            ), "type": "text"},
        ],
    }


def _build_magento_schema() -> dict[str, Any]:
    """Build a JsonCssExtractionStrategy schema for Magento product pages."""
    return {
        "name": "magento_product",
        "baseSelector": ".product-info-main, .product-view, .product-detail, .catalog-product-view, main",
        "fields": [
            # Name
            {"name": "product_name", "selector": ".page-title, .product-name, .product.name, h1, [itemprop='name']", "type": "text"},
            # Brand
            {"name": "brand", "selector": ".product-brand, .brand, .manufacturer, .product-attribute-brand, [itemprop='brand']", "type": "text"},
            # Description
            {"name": "description", "selector": (
                ".product-description, .product.info.description, #description, "
                "[itemprop='description']"
            ), "type": "text"},
            # SKU
            {"name": "sku", "selector": ".product-sku, .sku, .product.attribute.sku, [itemprop='sku']", "type": "text"},
            # Image URLs
            {"name": "images", "selector": (
                ".product.media img, .gallery-placeholder img, .fotorama__img, "
                ".gallery img, .product-image-photo"
            ), "type": "attribute", "attribute": "src"},
            # Categories / breadcrumb
            {"name": "categories", "selector": ".breadcrumbs, .breadcrumb, [itemprop='breadcrumb']", "type": "text"},
            # Specs / attributes
            {"name": "specifications", "selector": (
                ".product.attribute.overview, .product-attributes, "
                ".additional-attributes-wrapper, table#product-attribute-specs-table"
            ), "type": "text"},
        ],
    }


def _build_bigcommerce_schema() -> dict[str, Any]:
    """Build a JsonCssExtractionStrategy schema for BigCommerce product pages."""
    return {
        "name": "bigcommerce_product",
        "baseSelector": "[data-product-view], .product-view, .product-details, .productView, .product-page, main",
        "fields": [
            # Name
            {"name": "product_name", "selector": ".productView-title, .product-title, h1, [data-product-title], [itemprop='name']", "type": "text"},
            # Brand
            {"name": "brand", "selector": ".productView-brand, .product-brand, .brand, [itemprop='brand'] a", "type": "text"},
            # Description
            {"name": "description", "selector": (
                ".productView-description, .product-description, [data-product-description], "
                "[itemprop='description']"
            ), "type": "text"},
            # SKU
            {"name": "sku", "selector": ".productView-sku, .sku, [data-product-sku], [itemprop='sku']", "type": "text"},
            # Image URLs
            {"name": "images", "selector": (
                ".productView-image img, .productView-images img, [data-image-gallery] img, "
                ".product-gallery img, .product-thumbnail img"
            ), "type": "attribute", "attribute": "src"},
            # Categories / breadcrumb
            {"name": "categories", "selector": ".breadcrumbs, .breadcrumb, .product-breadcrumb, nav[aria-label='Breadcrumb']", "type": "text"},
            # Specs / attributes
            {"name": "specifications", "selector": ".productView-info, .product-info, .product-specifications, .product-detail-section", "type": "text"},
        ],
    }


def build_platform_schema(platform: str) -> dict[str, Any] | None:
    """Build a JsonCssExtractionStrategy schema for the given platform.

    Args:
        platform: Platform name from detect_platform().

    Returns:
        A schema dict compatible with JsonCssExtractionStrategy,
        or None if the platform is unsupported.
    """
    builders = {
        "shopify": _build_shopify_schema,
        "woocommerce": _build_woocommerce_schema,
        "magento": _build_magento_schema,
        "bigcommerce": _build_bigcommerce_schema,
    }
    builder = builders.get(platform)
    if builder is None:
        logger.warning("[Platform] No schema builder for platform: %s", platform)
        return None
    return builder()


# ---------------------------------------------------------------------------
# Payload normalization
# ---------------------------------------------------------------------------

# Non-product image patterns to filter out
_LOGO_REJECT_PATTERNS = re.compile(
    r"(logo|icon|placeholder|no-image|no_image|coming-soon|coming_soon|"
    r"default|avatar|swatch|color-swatch|color_swatch|"
    r"spacer|pixel|transparent|blank|bci-logo|favicon|sprite)", re.IGNORECASE
)


def _is_valid_product_image(url: str) -> bool:
    """Check if an image URL looks like a real product image (not logo/icon/placeholder)."""
    if not url:
        return False
    return not bool(_LOGO_REJECT_PATTERNS.search(url))


def _coerce_string_list(value: Any) -> list[str]:
    """Coerce various input types into a list of strings."""
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [str(v) for v in value if v and str(v).strip()]
    return []


def normalize_platform_payload(
    payload: dict[str, Any],
    url: str,
    upc: str | None = None,
    product_name: str | None = None,
    brand: str | None = None,
    *,
    platform: str | None = None,
) -> dict[str, Any]:
    """Normalize a Crawl4AI CSS extraction result into the flat dict shape used downstream.

    Args:
        payload: Raw output from JsonCssExtractionStrategy (list or dict).
        url: The source URL.
        upc: Optional UPC for matching.
        product_name: Optional expected product name.
        brand: Optional expected brand.
        platform: Optional platform name (from detect_platform).
            When None, inferred from the payload metadata.

    Returns:
        A normalized flat dict with keys: product_name, brand, description,
        images, categories, specifications, sku, upc, plus method metadata.
    """
    platform = platform or "unknown"
    result: dict[str, Any] = {
        "product_name": "",
        "brand": "",
        "description": "",
        "images": [],
        "categories": [],
        "specifications": "",
        "sku": "",
        "upc": upc or "",
        "url": url,
        "method": "platform-schema:unknown",
        "platform": "unknown",
        "success": False,
    }

    # Payload from JsonCssExtractionStrategy is typically a list of dicts
    # (one per baseSelector match), or a single dict if no baseSelector.
    items: list[dict[str, Any]] = []
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        # Check if it's a wrapped result
        extracted = payload.get("extracted_content")
        if isinstance(extracted, str):
            try:
                parsed = json.loads(extracted)
                if isinstance(parsed, list):
                    items = parsed
                elif isinstance(parsed, dict):
                    items = [parsed]
            except json.JSONDecodeError:
                pass
        elif extracted is None:
            # Direct dict payload
            items = [payload]
        else:
            items = [payload]
    else:
        logger.warning("[Platform] Unexpected payload type: %s", type(payload).__name__)
        return result

    if not items:
        return result

    # Merge all matched items, preferring the first non-empty value per field
    merged: dict[str, Any] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        for key, value in item.items():
            if key in merged and merged[key]:
                continue
            if value is not None and value != "" and value != []:
                merged[key] = value

    # Determine platform: explicit parameter > payload metadata > default "unknown"
    if platform is None:
        # Check if payload has embedded platform
        payload_platform = None
        if hasattr(payload, "get") and callable(getattr(payload, "get", None)):
            payload_platform = payload.get("platform", None)
        if not payload_platform:
            payload_platform = merged.get("platform", None)
        platform = payload_platform or "unknown"

    result["platform"] = platform
    result["method"] = f"platform-schema:{platform}"

    # Product name — try multiple field names
    name = merged.get("product_name") or merged.get("name") or merged.get("title") or ""
    if isinstance(name, list):
        name = " ".join(str(n) for n in name if n)
    result["product_name"] = str(name).strip()

    # Brand
    brand_val = merged.get("brand") or merged.get("brand_name") or ""
    if isinstance(brand_val, list):
        brand_val = " ".join(str(b) for b in brand_val if b)
    result["brand"] = str(brand_val).strip()

    # Description
    desc = merged.get("description") or merged.get("specifications") or ""
    if isinstance(desc, list):
        desc = " ".join(str(d) for d in desc if d)
    result["description"] = str(desc).strip()

    # Images
    raw_images = _coerce_string_list(merged.get("images", []))
    # JsonCssExtractionStrategy returns attribute values, so images may be list of URLs
    # or already a flat list from the strategy config
    image_urls = []
    for img in raw_images:
        if img and _is_valid_product_image(img):
            # Normalize protocol-relative URLs
            if img.startswith("//"):
                img = "https:" + img
            image_urls.append(img)
    # Deduplicate
    seen = set()
    result["images"] = []
    for img in image_urls:
        if img not in seen:
            seen.add(img)
            result["images"].append(img)

    # Categories
    raw_cats = _coerce_string_list(merged.get("categories", []))
    # Some selectors return breadcrumb as a single string — split by common separators
    cats: list[str] = []
    for cat in raw_cats:
        if ">" in cat or " / " in cat or " › " in cat:
            parts = re.split(r"\s*(?:>|\/|›)\s*", cat)
            cats.extend(p.strip() for p in parts if p.strip())
        else:
            cats.append(cat)
    result["categories"] = cats

    # Specifications (raw text from spec tables)
    specs = merged.get("specifications") or merged.get("specs") or ""
    if isinstance(specs, list):
        specs = " ".join(str(s) for s in specs if s)
    result["specifications"] = str(specs).strip()

    # SKU
    sku = merged.get("sku") or merged.get("item_number") or merged.get("upc") or ""
    if isinstance(sku, list):
        sku = sku[0] if sku else ""
    result["sku"] = str(sku).strip()

    result["success"] = bool(result["product_name"])

    return result


# ---------------------------------------------------------------------------
# Schema validation (for tests and introspection)
# ---------------------------------------------------------------------------

PLATFORM_NAMES = ["shopify", "woocommerce", "magento", "bigcommerce"]
"""All supported platform names."""


def verify_schema(platform: str) -> list[str]:
    """Verify that a platform schema has no protected fields.

    Returns a list of violations (empty list = clean).
    """
    schema = build_platform_schema(platform)
    if schema is None:
        return [f"No schema for platform: {platform}"]

    violations: list[str] = []
    protected_terms = ["price", "stock", "quantity", "add-to-cart", "add_to_cart", 
                       "availability", "checkout", "cart", "shipping"]

    # Check schema name
    schema_name = str(schema.get("name", "")).lower()
    for term in protected_terms:
        if term in schema_name:
            violations.append(f"Schema name contains protected term '{term}': {schema_name}")

    # Check field names
    fields = schema.get("fields", [])
    for field in fields:
        field_name = str(field.get("name", "")).lower()
        for term in protected_terms:
            if term in field_name:
                violations.append(
                    f"Field name contains protected term '{term}': {field.get('name')}"
                )

        # Check selectors
        selector = str(field.get("selector", "")).lower()
        for term in protected_terms:
            if term in selector and "image" not in field_name:
                violations.append(
                    f"Selector contains protected term '{term}' in field '{field.get('name')}'"
                )

    return violations


def build_generic_product_schema() -> dict[str, Any]:
    """Build a generic product schema with broad selectors for unknown platforms.

    This is a fallback that tries common patterns across all e-commerce sites.
    """
    return {
        "name": "generic_product",
        "baseSelector": "main, body",
        "fields": [
            # Name (broad selectors)
            {"name": "product_name", "selector": "h1, .product-title, .product__title, [itemprop='name']", "type": "text"},
            # Brand
            {"name": "brand", "selector": ".product-brand, .brand, [itemprop='brand'], .manufacturer", "type": "text"},
            # Description
            {"name": "description", "selector": "[itemprop='description'], .product-description, .description, .product__description", "type": "text"},
            # SKU / product ID
            {"name": "sku", "selector": ".sku, .product-sku, [itemprop='sku'], .product-id", "type": "text"},
            # Images
            {"name": "images", "selector": (
                ".product-gallery img, .product__gallery img, .gallery img, .product-image img, "
                "[data-image] img, img[data-zoom]"
            ), "type": "attribute", "attribute": "src"},
            # Categories
            {"name": "categories", "selector": (
                ".breadcrumb, .breadcrumbs, nav[aria-label='Breadcrumb'], [itemprop='breadcrumb']"
            ), "type": "text"},
            # Specs / attributes
            {"name": "specifications", "selector": (
                ".product-specs, .product-attributes, .specs, .additional-info, "
                ".product-details, table.attributes"
            ), "type": "text"},
        ],
    }
