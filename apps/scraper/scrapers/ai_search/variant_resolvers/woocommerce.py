import json
import re
import html as html_module
import logging
from typing import Optional
from urllib.parse import urlparse, urlunparse
from scrapers.ai_search.variant_resolvers.base import BaseVariantResolver

logger = logging.getLogger("scrapers.ai_search.variant_resolvers.woocommerce")

class WooCommerceVariantResolver(BaseVariantResolver):
    """Deterministic variant resolver for WooCommerce storefronts."""

    def _is_woocommerce(self, html: str) -> bool:
        """Detect if the page is a WooCommerce page."""
        return "woocommerce" in html or "wp-content/plugins/woocommerce" in html

    async def resolve(
        self,
        *,
        url: str,
        upc: str,
        product_name: Optional[str],
        brand: Optional[str],
        html: str,
    ) -> tuple[str, Optional[str], Optional[str], str]:
        if not self._is_woocommerce(html):
            return url, None, None, "ambiguous"

        # WooCommerce stores variants as a JSON array inside the data-product_variations attribute of a form
        # We can extract it using regex.
        match = re.search(r'data-product_variations=["\']([^"\']+)["\']', html)
        if not match:
            return url, None, None, "family_page_default"

        raw_variations = html_module.unescape(match.group(1)).strip()
        try:
            variations = json.loads(raw_variations)
        except Exception as exc:
            logger.info("[AI Search] WooCommerce variant JSON parsing failed: %s", str(exc))
            return url, None, None, "family_page_default"

        if not isinstance(variations, list):
            # WooCommerce sometimes encodes data-product_variations twice or as a string
            try:
                variations = json.loads(raw_variations)
            except Exception:
                return url, None, None, "family_page_default"

        if not isinstance(variations, list):
            return url, None, None, "family_page_default"

        matched_variant = None
        target_sku_clean = str(upc or "").strip().lower()

        # Try exact UPC match first
        if target_sku_clean:
            for variant in variations:
                if not isinstance(variant, dict):
                    continue
                var_sku = str(variant.get("upc") or "").strip().lower()
                if var_sku == target_sku_clean:
                    matched_variant = variant
                    break

            # Try substring match
            if not matched_variant:
                for variant in variations:
                    if not isinstance(variant, dict):
                        continue
                    var_sku = str(variant.get("upc") or "").strip().lower()
                    if var_sku and (target_sku_clean in var_sku or var_sku in target_sku_clean):
                        matched_variant = variant
                        break

            # Try exact id match
            if not matched_variant:
                for variant in variations:
                    if not isinstance(variant, dict):
                        continue
                    var_id = str(variant.get("variation_id") or "").strip().lower()
                    if var_id == target_sku_clean:
                        matched_variant = variant
                        break

        if not matched_variant:
            logger.info("[AI Search] WooCommerce found %d variants but could not match UPC '%s'", len(variations), upc)
            return url, None, None, "family_page_default"

        # Construct resolved variant URL
        variation_id = matched_variant.get("variation_id")
        resolved_url = url
        if variation_id:
            parsed = urlparse(url)
            query = f"variation_id={variation_id}"
            if parsed.query:
                query = f"{parsed.query}&{query}"
            resolved_url = urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, query, parsed.fragment))

        # Get variant details for custom payload
        attributes = matched_variant.get("attributes") or {}
        attr_desc = ", ".join(f"{k.replace('attribute_pa_', '')}: {v}" for k, v in attributes.items() if v)
        prod_title = product_name or ""
        full_title = f"{prod_title} - {attr_desc}" if attr_desc else prod_title

        var_price = float(matched_variant.get("display_price", 0))
        var_sku = matched_variant.get("upc") or upc
        
        var_img = None
        var_img_data = matched_variant.get("image")
        if isinstance(var_img_data, dict):
            var_img = var_img_data.get("src") or var_img_data.get("url")

        # Generate a beautiful, clean JSON-LD object representing the single resolved variant
        custom_jsonld = {
            "@context": "http://schema.org",
            "@type": "Product",
            "name": full_title,
            "upc": var_sku,
            "description": matched_variant.get("variation_description") or "",
            "brand": {
                "@type": "Brand",
                "name": brand or ""
            },
            "image": [var_img] if var_img else [],
            "offers": {
                "@type": "Offer",
                "price": str(var_price),
                "priceCurrency": "USD",
                "availability": "http://schema.org/InStock" if matched_variant.get("is_in_stock", True) else "http://schema.org/OutOfStock",
                "url": resolved_url
            }
        }

        # Embed custom JSON-LD inside a mock HTML string
        resolved_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>{full_title}</title>
            <script type="application/ld+json">
            {json.dumps(custom_jsonld)}
            </script>
        </head>
        <body>
            <h1>{full_title}</h1>
            <p>{matched_variant.get("variation_description") or ""}</p>
        </body>
        </html>
        """

        logger.info("[AI Search] Resolved WooCommerce family page variant: %s -> %s", url, resolved_url)
        return resolved_url, resolved_html, resolved_html, "exact_variant"
