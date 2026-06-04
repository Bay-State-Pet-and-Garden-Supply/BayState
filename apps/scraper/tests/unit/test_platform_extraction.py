"""Unit tests for platform fingerprinting, schema generation, and payload normalization."""

from __future__ import annotations

import json

import pytest

from scrapers.ai_search.platform_extraction import (
    PLATFORM_NAMES,
    _is_valid_product_image,
    build_generic_product_schema,
    build_platform_schema,
    detect_platform,
    normalize_platform_payload,
    verify_schema,
)


# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------

_SHOPIFY_HTML = """
<html>
<head><title>Product</title></head>
<body>
<script src="https://cdn.shopify.com/shopifycloud/shopify.js"></script>
<script>window.Shopify = {}</script>
<div class="product">
  <h1 class="product__title">Dog Food</h1>
  <span class="product-vendor">Acme Brand</span>
</div>
</body>
</html>
"""

_WOOCOMMERCE_HTML = """
<html>
<head>
  <link rel="stylesheet" href="https://example.com/wp-content/plugins/woocommerce/assets/css/woocommerce.css">
</head>
<body>
<div class="product">
  <h1 class="product_title">Cat Toy</h1>
  <span class="sku">WC-123</span>
  <div class="woocommerce-product-gallery"><img src="cat.jpg"></div>
</div>
</body>
</html>
"""

_MAGENTO_HTML = """
<html>
<head>
  <script src="https://example.com/static/version123/mage/scripts.js"></script>
</head>
<body>
<div class="product-info-main">
  <h1 class="page-title">Fish Food</h1>
  <form><input type="hidden" name="form_key" value="abc123"></form>
  <div class="product attribute sku"><strong class="type">SKU</strong> MG-456</div>
</div>
</body>
</html>
"""

_BIGCOMMERCE_HTML = """
<html>
<head>
  <script src="https://cdn11.bigcommerce.com/s-rncilydun5/stencil/abc123/js/bundle.js"></script>
</head>
<body>
<div class="productView">
  <h1 class="productView-title">Bird Seed</h1>
  <span class="productView-brand">BC Brand</span>
  <div class="productView-images"><img src="bird.jpg"></div>
</div>
</body>
</html>
"""

_UNKNOWN_HTML = """
<html>
<body>
<h1>Custom Product</h1>
<div class="content">
  <p>This is a custom site with no platform fingerprints.</p>
</div>
</body>
</html>
"""


class TestDetectPlatform:
    """Test platform fingerprinting from HTML and URL."""

    def test_detect_shopify(self):
        assert detect_platform(_SHOPIFY_HTML, "https://example.com/products/dog-food") == "shopify"

    def test_detect_shopify_from_url(self):
        assert detect_platform("<html></html>", "https://test.myshopify.com/products/toy") == "shopify"

    def test_detect_woocommerce(self):
        assert detect_platform(_WOOCOMMERCE_HTML, "https://example.com/product/cat-toy") == "woocommerce"

    def test_detect_magento(self):
        assert detect_platform(_MAGENTO_HTML, "https://example.com/catalog/product/view/id/123") == "magento"

    def test_detect_bigcommerce(self):
        assert detect_platform(_BIGCOMMERCE_HTML, "https://example.com/product/bird-seed") == "bigcommerce"

    def test_detect_unknown_platform(self):
        assert detect_platform(_UNKNOWN_HTML, "https://example.com/custom-page") is None

    def test_detect_empty_html(self):
        assert detect_platform("", "https://example.com") is None


# ---------------------------------------------------------------------------
# Schema generation
# ---------------------------------------------------------------------------


class TestBuildPlatformSchema:
    """Test schema generation for each platform."""

    def test_all_platforms_have_schemas(self):
        for platform in PLATFORM_NAMES:
            schema = build_platform_schema(platform)
            assert schema is not None, f"Missing schema for {platform}"
            assert "name" in schema, f"Schema for {platform} missing 'name'"
            assert "fields" in schema, f"Schema for {platform} missing 'fields'"
            assert len(schema["fields"]) > 0, f"Schema for {platform} has no fields"

    def test_schema_has_required_field_types(self):
        """Each platform schema should have fields for name, brand, description, images."""
        for platform in PLATFORM_NAMES:
            schema = build_platform_schema(platform)
            field_names = [f.get("name") for f in schema["fields"]]
            assert "product_name" in field_names, f"{platform} schema missing product_name"
            assert "brand" in field_names, f"{platform} schema missing brand"
            assert "description" in field_names, f"{platform} schema missing description"
            assert "images" in field_names, f"{platform} schema missing images"

    def test_schema_has_no_protected_fields(self):
        """Verify no schema contains price, stock, or add-to-cart selectors."""
        for platform in PLATFORM_NAMES:
            violations = verify_schema(platform)
            assert violations == [], f"{platform} schema has violations: {violations}"

    def test_schema_has_image_attr_type(self):
        """Image fields should use attribute type (not text) to get src values."""
        for platform in PLATFORM_NAMES:
            schema = build_platform_schema(platform)
            for field in schema["fields"]:
                if field.get("name") == "images":
                    assert field.get("type") == "attribute", \
                        f"{platform} images field should be type='attribute'"
                    assert field.get("attribute") == "src", \
                        f"{platform} images field should have attribute='src'"

    def test_unsupported_platform_returns_none(self):
        assert build_platform_schema("unknown_platform") is None

    def test_build_generic_schema(self):
        schema = build_generic_product_schema()
        assert schema is not None
        assert schema["name"] == "generic_product"
        field_names = [f.get("name") for f in schema["fields"]]
        assert "product_name" in field_names
        assert "images" in field_names


# ---------------------------------------------------------------------------
# Payload normalization
# ---------------------------------------------------------------------------


class TestNormalizePlatformPayload:
    """Test normalization of CSS extraction results."""

    def test_normalize_simple_payload(self):
        payload = {
            "product_name": "Premium Dog Food",
            "brand": "Acme",
            "description": "High-quality dog food",
            "images": ["https://example.com/dog-food.jpg"],
            "categories": ["Pet Supplies > Dog Food"],
            "sku": "AF-123",
        }
        result = normalize_platform_payload(
            payload, url="https://example.com/product", upc="123456789012",
        )
        assert result["success"] is True
        assert result["product_name"] == "Premium Dog Food"
        assert result["brand"] == "Acme"
        assert result["description"] == "High-quality dog food"
        assert "https://example.com/dog-food.jpg" in result["images"]
        assert "Dog Food" in result["categories"]
        assert result["sku"] == "AF-123"
        assert result["upc"] == "123456789012"

    def test_normalize_list_payload(self):
        """JsonCssExtractionStrategy may return a list from multiple baseSelector matches."""
        payload = [
            {"product_name": "Cat Treats", "brand": "Kitty Co", "images": ["cat.jpg"]},
            {"description": "Delicious treats for cats", "categories": ["Cat Supplies"]},
        ]
        result = normalize_platform_payload(payload, url="https://example.com/product")
        assert result["product_name"] == "Cat Treats"
        assert result["brand"] == "Kitty Co"
        assert result["description"] == "Delicious treats for cats"
        assert "Cat Supplies" in result["categories"]

    def test_normalize_empty_payload(self):
        result = normalize_platform_payload([], url="https://example.com")
        assert result["success"] is False

    def test_normalize_none_payload(self):
        result = normalize_platform_payload(
            {"extracted_content": None}, url="https://example.com"
        )
        # Should handle gracefully
        assert result["success"] is False

    def test_normalize_string_payload(self):
        """Handle raw JSON string in extracted_content."""
        payload = {"extracted_content": json.dumps([{"product_name": "Raw JSON Product"}])}
        result = normalize_platform_payload(payload, url="https://example.com")
        assert result["product_name"] == "Raw JSON Product"

    def test_images_filter_logos(self):
        """Logo/images should be filtered out."""
        payload = {
            "product_name": "Test Product",
            "images": [
                "https://example.com/product.jpg",
                "https://example.com/logo.png",
                "https://example.com/icon.svg",
                "https://example.com/stencil/bci-logo__49486.png",
            ],
        }
        result = normalize_platform_payload(payload, url="https://example.com")
        assert "https://example.com/product.jpg" in result["images"]
        assert "logo.png" not in str(result["images"])
        assert "icon.svg" not in str(result["images"])
        assert "bci-logo" not in str(result["images"])

    def test_breadcrumb_splitting(self):
        """Breadcrumb strings should be split into individual categories."""
        payload = {
            "product_name": "Dog Food",
            "categories": ["Home > Pet Supplies > Dog Food"],
        }
        result = normalize_platform_payload(payload, url="https://example.com")
        assert "Home" in result["categories"]
        assert "Pet Supplies" in result["categories"]
        assert "Dog Food" in result["categories"]

    def test_method_metadata(self):
        payload = {"product_name": "Test", "images": []}
        result = normalize_platform_payload(
            payload, url="https://shopify.com/product"
        )
        assert "platform-schema:" in result["method"]
        assert "platform" in result

    def test_protocol_relative_images(self):
        payload = {
            "product_name": "Test",
            "images": ["//cdn.example.com/product.jpg"],
        }
        result = normalize_platform_payload(payload, url="https://example.com")
        assert result["images"] == ["https://cdn.example.com/product.jpg"]


# ---------------------------------------------------------------------------
# Image validation
# ---------------------------------------------------------------------------


class TestIsValidProductImage:
    """Test product image URL validation."""

    def test_valid_image(self):
        assert _is_valid_product_image("https://example.com/product-123.jpg") is True
        assert _is_valid_product_image("https://cdn.example.com/images/dog-food.webp") is True

    def test_empty_url(self):
        assert _is_valid_product_image("") is False

    def test_logo_url(self):
        assert _is_valid_product_image("https://example.com/logo.png") is False
        assert _is_valid_product_image("https://example.com/header-logo.svg") is False

    def test_placeholder_url(self):
        assert _is_valid_product_image("https://example.com/placeholder.jpg") is False
        assert _is_valid_product_image("https://example.com/no-image.png") is False

    def test_stencil_bci_logo(self):
        """BCI logo specifically — the one that appears in Bradley's results."""
        url = ("https://cdn11.bigcommerce.com/s-rncilydun5/"
               "images/stencil/256w/bci-logo_1740685359__49486.original.png")
        assert _is_valid_product_image(url) is False

    def test_favicon(self):
        assert _is_valid_product_image("https://example.com/favicon.ico") is False


# ---------------------------------------------------------------------------
# Schema verification
# ---------------------------------------------------------------------------


class TestVerifySchema:
    """Test schema verification."""

    def test_all_platforms_pass_verification(self):
        for platform in PLATFORM_NAMES:
            violations = verify_schema(platform)
            assert violations == [], f"{platform}: {violations}"

    def test_unknown_platform(self):
        violations = verify_schema("unknown")
        assert len(violations) > 0


# ---------------------------------------------------------------------------
# Integration: platform detection + schema + normalization
# ---------------------------------------------------------------------------


class TestPlatformExtractionPipeline:
    """End-to-end tests: detect → schema → normalize."""

    def test_shopify_pipeline(self):
        url = "https://test.myshopify.com/products/dog-treats"
        platform = detect_platform(_SHOPIFY_HTML, url)
        assert platform == "shopify"

        schema = build_platform_schema(platform)
        assert schema is not None
        assert schema["name"] == "shopify_product"

        # Simulate what JsonCssExtractionStrategy would return
        mock_payload = [
            {"product_name": "Dog Food", "brand": "Acme Brand",
             "description": "Healthy dog food", "images": ["https://cdn.shopify.com/dog.jpg"],
             "sku": "SF-123", "categories": ["Pet Supplies > Dog Food"]}
        ]
        result = normalize_platform_payload(mock_payload, url=url, platform=platform)
        assert result["product_name"] == "Dog Food"
        assert result["brand"] == "Acme Brand"
        assert result["method"] == "platform-schema:shopify"
        assert "Pet Supplies" in result["categories"]

    def test_bigcommerce_pipeline(self):
        url = "https://example.com/product/bird-seed"
        platform = detect_platform(_BIGCOMMERCE_HTML, url)
        assert platform == "bigcommerce"

        schema = build_platform_schema(platform)
        assert schema is not None
        assert schema["name"] == "bigcommerce_product"

        mock_payload = [{"product_name": "Bird Seed", "images": ["https://cdn11.bigcommerce.com/bird.jpg"]}]
        result = normalize_platform_payload(mock_payload, url=url, platform=platform)
        assert result["product_name"] == "Bird Seed"
        assert result["method"] == "platform-schema:bigcommerce"

    def test_woocommerce_pipeline(self):
        url = "https://example.com/product/cat-toy"
        platform = detect_platform(_WOOCOMMERCE_HTML, url)
        assert platform == "woocommerce"

        schema = build_platform_schema(platform)
        assert schema is not None
        assert schema["name"] == "woocommerce_product"

        violations = verify_schema("woocommerce")
        assert violations == []

    def test_magento_pipeline(self):
        url = "https://example.com/fish-food"
        platform = detect_platform(_MAGENTO_HTML, url)
        assert platform == "magento"

        schema = build_platform_schema(platform)
        assert schema is not None
        assert schema["name"] == "magento_product"

    def test_unknown_site_falls_back_to_generic(self):
        platform = detect_platform(_UNKNOWN_HTML, "https://custom-site.com/product")
        assert platform is None

        schema = build_generic_product_schema()
        assert schema is not None
        assert schema["name"] == "generic_product"

        # Verify generic schema also has no protected fields
        field_names = [f.get("name") for f in schema["fields"]]
        protected = ["price", "stock", "quantity", "add-to-cart", "availability"]
        for name in field_names:
            name_lower = name.lower() if name else ""
            for term in protected:
                assert term not in name_lower, f"Generic schema contains protected field: {name}"
