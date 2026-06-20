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

    _QUALITATIVE_SIZE_ALIASES = {
        "xs": "extra-small",
        "xsmall": "extra-small",
        "x-small": "extra-small",
        "sm": "small",
        "small": "small",
        "md": "medium",
        "med": "medium",
        "medium": "medium",
        "lg": "large",
        "lrg": "large",
        "large": "large",
        "xl": "xl",
        "xxl": "xxl",
    }
    _QUALITATIVE_SIZE_RE = re.compile(r"\b(xs|x-small|sm|small|md|med|medium|lg|lrg|large|xl|xxl)\b", re.IGNORECASE)

    def _is_woocommerce(self, html: str) -> bool:
        """Detect if the page is a WooCommerce page."""
        lowered = html.lower()
        return (
            "woocommerce" in lowered
            or "wp-content/plugins/woocommerce" in lowered
            or "data-product_variations" in lowered
        )

    def _target_size_tokens(self, text: Optional[str]) -> set[str]:
        tokens: set[str] = set()
        for match in self._QUALITATIVE_SIZE_RE.finditer(text or ""):
            raw = match.group(1).lower()
            tokens.add(self._QUALITATIVE_SIZE_ALIASES.get(raw, raw))
        return tokens

    def _variation_text(self, variant: dict) -> str:
        attributes = variant.get("attributes") or {}
        image = variant.get("image") if isinstance(variant.get("image"), dict) else {}
        parts = [
            str(variant.get("sku") or ""),
            str(variant.get("upc") or ""),
            str(variant.get("variation_id") or ""),
            " ".join(str(value) for value in attributes.values()),
            str(variant.get("dimensions_html") or ""),
            str(image.get("title") or ""),
            str(image.get("alt") or ""),
            str(image.get("url") or ""),
        ]
        return " ".join(parts).lower()

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

        # WooCommerce stores variants as a JSON array inside the data-product_variations
        # attribute. Pages can also contain JavaScript strings mentioning the attribute,
        # so iterate all matches and parse the first actual JSON array.
        variations = None
        for match in re.finditer(r'data-product_variations\s*=\s*(["\'])(.*?)\1', html, re.IGNORECASE | re.DOTALL):
            raw_variations = html_module.unescape(match.group(2)).strip()
            if not raw_variations.startswith("["):
                continue
            try:
                parsed = json.loads(raw_variations)
            except Exception as exc:
                logger.info("[AI Search] WooCommerce variant JSON parsing failed: %s", str(exc))
                continue
            if isinstance(parsed, list):
                variations = parsed
                break

        if not isinstance(variations, list):
            return url, None, None, "family_page_default"

        matched_variant = None
        target_sku_clean = str(upc or "").strip().lower()

        # Try exact UPC/SKU match first.
        if target_sku_clean:
            for variant in variations:
                if not isinstance(variant, dict):
                    continue
                var_sku = str(variant.get("sku") or variant.get("upc") or "").strip().lower()
                if var_sku == target_sku_clean:
                    matched_variant = variant
                    break

            # Try substring match against SKU, UPC, variation id, image title/URL,
            # and the full variation JSON. Some WooCommerce sites (Earth Animal)
            # put the UPC only in image filenames such as 850068922000_MAIN.png.
            if not matched_variant:
                for variant in variations:
                    if not isinstance(variant, dict):
                        continue
                    var_sku = str(variant.get("sku") or variant.get("upc") or "").strip().lower()
                    var_text = self._variation_text(variant)
                    if (
                        (var_sku and (target_sku_clean in var_sku or var_sku in target_sku_clean))
                        or target_sku_clean in var_text
                    ):
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
            target_sizes = self._target_size_tokens(product_name)
            if target_sizes:
                size_matches = []
                for variant in variations:
                    if not isinstance(variant, dict):
                        continue
                    var_text = self._variation_text(variant)
                    if any(size in var_text for size in target_sizes):
                        size_matches.append(variant)
                if len(size_matches) == 1:
                    matched_variant = size_matches[0]

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
        var_sku = matched_variant.get("sku") or matched_variant.get("upc") or upc
        
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
