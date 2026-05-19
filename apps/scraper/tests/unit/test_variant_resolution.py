import json
import html as html_module
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from scrapers.ai_search.variant_resolvers import resolve_family_variant
from scrapers.ai_search.variant_resolvers.shopify import ShopifyVariantResolver
from scrapers.ai_search.variant_resolvers.woocommerce import WooCommerceVariantResolver
from scrapers.ai_search.variant_resolvers.demandware import DemandwareVariantResolver


@pytest.fixture
def mock_scoring_utils():
    utils = MagicMock()
    utils.is_product_line_page.return_value = False
    utils.domain_from_url.return_value = "example-dw.com"
    utils.classify_source_domain.return_value = "official"
    return utils


@pytest.fixture
def mock_matching_utils():
    utils = MagicMock()
    utils.is_sku_match.return_value = True
    utils.has_conflicting_variant_tokens.return_value = False
    utils.has_variant_token_overlap.return_value = True
    return utils


@pytest.fixture
def mock_extraction_utils():
    utils = MagicMock()
    utils.clean_text.side_effect = lambda x: x.strip()
    utils.extract_demandware_variant_candidates.return_value = [
        {"url": "https://example-dw.com/variant?pid=DW-5678"}
    ]
    utils.selected_demandware_variant_id.return_value = "dw-5678"
    return utils


def mock_httpx_client(mock_json_data, status_code=200):
    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    
    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    mock_resp.json.return_value = mock_json_data
    mock_resp.text = json.dumps(mock_json_data) if isinstance(mock_json_data, dict) else str(mock_json_data)
    
    mock_client.get = AsyncMock(return_value=mock_resp)
    return mock_client


@pytest.mark.asyncio
async def test_shopify_variant_resolver_success(mock_scoring_utils, mock_matching_utils, mock_extraction_utils):
    resolver = ShopifyVariantResolver(
        scoring_utils=mock_scoring_utils,
        matching_utils=mock_matching_utils,
        extraction_utils=mock_extraction_utils,
    )

    url = "https://example-shopify.com/products/dog-food"
    sku = "DF-123"

    mock_product_js = {
        "title": "Dog Food",
        "vendor": "SuperBrand",
        "description": "Premium dog food.",
        "variants": [
            {"id": 4567, "sku": "DF-999", "title": "Small Bag", "price": 1000},
            {"id": 1234, "sku": "DF-123", "title": "Large Bag", "price": 4500},
        ],
    }

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = mock_httpx_client(mock_product_js)
        mock_client_cls.return_value = mock_client

        res_url, res_html, res_md, status = await resolver.resolve(
            url=url, sku=sku, product_name="Dog Food", brand="SuperBrand", html="<html><body>window.Shopify=true;</body></html>"
        )

        assert status == "exact_variant"
        assert res_url == "https://example-shopify.com/products/dog-food?variant=1234"
        assert "application/ld+json" in res_html
        assert "DF-123" in res_html
        assert "45.0" in res_html


@pytest.mark.asyncio
async def test_woocommerce_variant_resolver_success(mock_scoring_utils, mock_matching_utils, mock_extraction_utils):
    resolver = WooCommerceVariantResolver(
        scoring_utils=mock_scoring_utils,
        matching_utils=mock_matching_utils,
        extraction_utils=mock_extraction_utils,
    )

    url = "https://example-woocommerce.com/shop/dog-collar"
    sku = "DC-BLUE-M"

    variations_json = (
        '[{"variation_id": 999, "sku": "DC-BLUE-S", "display_price": 15, '
        '"attributes": {"attribute_pa_color": "blue", "attribute_pa_size": "s"}}, '
        '{"variation_id": 1234, "sku": "DC-BLUE-M", "display_price": 20, '
        '"attributes": {"attribute_pa_color": "blue", "attribute_pa_size": "m"}}]'
    )
    escaped_variations = html_module.escape(variations_json)
    html = f'<html><body><form class="variations_form" data-product_variations="{escaped_variations}"></form>woocommerce</body></html>'

    res_url, res_html, res_md, status = await resolver.resolve(
        url=url, sku=sku, product_name="Dog Collar", brand="SuperBrand", html=html
    )

    assert status == "exact_variant"
    assert res_url == "https://example-woocommerce.com/shop/dog-collar?variation_id=1234"
    assert "application/ld+json" in res_html
    assert "DC-BLUE-M" in res_html
    assert "20" in res_html


@pytest.mark.asyncio
async def test_demandware_variant_resolver_success(mock_scoring_utils, mock_matching_utils, mock_extraction_utils):
    # Set DW specific scoring mock
    mock_scoring_utils.is_product_line_page.return_value = True
    
    resolver = DemandwareVariantResolver(
        scoring_utils=mock_scoring_utils,
        matching_utils=mock_matching_utils,
        extraction_utils=mock_extraction_utils,
    )

    url = "https://example-dw.com/on/demandware.store/Sites-Super-Site/default/Product-Show"
    sku = "dw-5678"

    html = '<html><body><div id="dw-variant-url" data-action="https://example-dw.com/on/demandware.store/Sites-Super-Site/default/Product-Variation"></div></body></html>'

    mock_ajax_response = {
        "product": {
            "uuid": "uuid-12345",
            "id": "dw-5678",
            "price": {"sales": {"value": 55.00, "currency": "USD"}},
            "images": {"large": [{"url": "https://example-dw.com/image.jpg"}]},
            "shortDescription": "Premium Salesforce product.",
            "selectedProductUrl": "https://example-dw.com/variant?pid=DW-5678"
        }
    }

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = mock_httpx_client(mock_ajax_response)
        mock_client_cls.return_value = mock_client

        res_url, res_html, res_md, status = await resolver.resolve(
            url=url, sku=sku, product_name="Dw Product", brand="Brand", html=html
        )

        assert status == "exact_variant"
        assert res_url == "https://example-dw.com/variant?pid=DW-5678"
        assert "dw-5678" in res_html
        assert "55.0" in res_html



@pytest.mark.asyncio
async def test_resolve_family_variant_coordinator_shopify_falls_through(
    mock_scoring_utils, mock_matching_utils, mock_extraction_utils
):
    url = "https://example.com/products/unknown"
    sku = "UNKNOWN-SKU"

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = mock_httpx_client({}, status_code=404)
        mock_client_cls.return_value = mock_client

        res_url, res_html, res_md, status = await resolve_family_variant(
            url=url,
            sku=sku,
            product_name="Unknown Product",
            brand="Brand",
            html="<html><body>window.Shopify=true;</body></html>",
            scoring_utils=mock_scoring_utils,
            matching_utils=mock_matching_utils,
            extraction_utils=mock_extraction_utils,
        )

        assert status == "ambiguous"
        assert res_url == url
        assert res_html is None
