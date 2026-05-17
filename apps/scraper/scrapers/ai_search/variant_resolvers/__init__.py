import logging
from typing import Optional
from scrapers.ai_search.variant_resolvers.shopify import ShopifyVariantResolver
from scrapers.ai_search.variant_resolvers.woocommerce import WooCommerceVariantResolver
from scrapers.ai_search.variant_resolvers.demandware import DemandwareVariantResolver

logger = logging.getLogger("scrapers.ai_search.variant_resolvers")

async def resolve_family_variant(
    *,
    url: str,
    sku: str,
    product_name: Optional[str],
    brand: Optional[str],
    html: str,
    scoring_utils=None,
    matching_utils=None,
    extraction_utils=None,
) -> tuple[str, Optional[str], Optional[str], str]:
    """Coordinate platform-specific resolvers to deterministically resolve family pages.

    Returns:
        tuple: (resolved_url, resolved_html, resolved_markdown, resolver_status)
    """
    # 1. Shopify Resolver
    shopify = ShopifyVariantResolver(
        scoring_utils=scoring_utils,
        matching_utils=matching_utils,
        extraction_utils=extraction_utils,
    )
    res_url, res_html, res_md, status = await shopify.resolve(
        url=url, sku=sku, product_name=product_name, brand=brand, html=html
    )
    if status == "exact_variant":
        return res_url, res_html, res_md, status

    # 2. WooCommerce Resolver
    woocommerce = WooCommerceVariantResolver(
        scoring_utils=scoring_utils,
        matching_utils=matching_utils,
        extraction_utils=extraction_utils,
    )
    res_url, res_html, res_md, status = await woocommerce.resolve(
        url=url, sku=sku, product_name=product_name, brand=brand, html=html
    )
    if status == "exact_variant":
        return res_url, res_html, res_md, status

    # 3. Demandware Resolver
    demandware = DemandwareVariantResolver(
        scoring_utils=scoring_utils,
        matching_utils=matching_utils,
        extraction_utils=extraction_utils,
    )
    res_url, res_html, res_md, status = await demandware.resolve(
        url=url, sku=sku, product_name=product_name, brand=brand, html=html
    )
    if status == "exact_variant":
        return res_url, res_html, res_md, status

    # If it was classified as a family page, return family_page_default
    if scoring_utils and scoring_utils.is_product_line_page(url):
        return url, None, None, "family_page_default"

    return url, None, None, "ambiguous"
