import json
import httpx
import logging
from typing import Optional
from urllib.parse import urlparse, urlunparse
from scrapers.ai_search.variant_resolvers.base import BaseVariantResolver

logger = logging.getLogger("scrapers.ai_search.variant_resolvers.shopify")

class ShopifyVariantResolver(BaseVariantResolver):
    """Deterministic variant resolver for Shopify storefronts."""

    def _is_shopify(self, url: str, html: str) -> bool:
        """Detect if the page is a Shopify page."""
        if "cdn.shopify.com" in html or "window.Shopify" in html or "Shopify.theme" in html:
            return True
        return False

    def _get_base_product_url(self, url: str) -> str:
        """Strip query params and trailing slashes to get base product URL."""
        parsed = urlparse(url)
        path = parsed.path.rstrip("/")
        return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))

    async def resolve(
        self,
        *,
        url: str,
        upc: str,
        product_name: Optional[str],
        brand: Optional[str],
        html: str,
    ) -> tuple[str, Optional[str], Optional[str], str]:
        if not self._is_shopify(url, html):
            return url, None, None, "ambiguous"

        base_url = self._get_base_product_url(url)

        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, "html.parser")
            canonical_link = soup.find("link", rel="canonical")
            if canonical_link and canonical_link.get("href"):
                canonical_href = str(canonical_link["href"]).strip()
                if canonical_href.startswith("http"):
                    base_url = self._get_base_product_url(canonical_href)
                    logger.debug("[AI Search] Using canonical URL for Shopify .js fetch: %s", base_url)
        except Exception as e:
            logger.warning("[AI Search] Failed to parse canonical URL: %s", e)

        js_url = f"{base_url}.js"

        logger.info("[AI Search] Attempting Shopify variant resolution via: %s", js_url)
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client:
                response = await client.get(js_url, headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36"
                    )
                })
                response.raise_for_status()
                product_data = response.json()
        except Exception as exc:
            logger.info("[AI Search] Shopify .js fetch failed for %s: %s", js_url, str(exc))
            return url, None, None, "family_page_default"

        if not isinstance(product_data, dict) or "variants" not in product_data:
            return url, None, None, "family_page_default"

        variants = product_data.get("variants") or []
        matched_variant = None
        target_sku_clean = str(upc or "").strip().lower()

        # Try exact UPC match first
        if target_sku_clean:
            for variant in variants:
                var_sku = str(variant.get("upc") or "").strip().lower()
                if var_sku == target_sku_clean:
                    matched_variant = variant
                    break

            # Try substring match
            if not matched_variant:
                for variant in variants:
                    var_sku = str(variant.get("upc") or "").strip().lower()
                    if var_sku and (target_sku_clean in var_sku or var_sku in target_sku_clean):
                        matched_variant = variant
                        break

            # Try exact id match if UPC is numeric and matches variant ID
            if not matched_variant:
                for variant in variants:
                    var_id = str(variant.get("id") or "").strip().lower()
                    if var_id == target_sku_clean:
                        matched_variant = variant
                        break

        # Try matching tokens using MatchingUtils
        if not matched_variant and self.matching and product_name:
            best_matches = []
            for variant in variants:
                var_title = variant.get("title") or ""
                if self.matching.has_variant_token_overlap(product_name, var_title):
                    if not self.matching.has_conflicting_variant_tokens(product_name, var_title):
                        best_matches.append(variant)
            
            if len(best_matches) == 1:
                matched_variant = best_matches[0]

        # If no UPC match but we have a single variant, or if we couldn't match UPC,
        # we can't be sure it's the exact one if multiple variants exist.
        if not matched_variant:
            if len(variants) == 1:
                matched_variant = variants[0]
            else:
                logger.info("[AI Search] Shopify found %d variants but could not match UPC '%s'", len(variants), upc)
                return url, None, None, "family_page_default"

        # Construct resolved variant URL
        variant_id = matched_variant.get("id")
        resolved_url = f"{base_url}?variant={variant_id}"
        
        # Get variant details for custom payload
        var_title = matched_variant.get("title") or ""
        prod_title = product_data.get("title") or product_name or ""
        full_title = f"{prod_title} - {var_title}" if var_title and var_title.lower() != "default title" else prod_title
        
        var_price = float(matched_variant.get("price", 0)) / 100.0 if matched_variant.get("price") is not None else 0.0
        var_sku = matched_variant.get("upc") or upc
        feat_img = matched_variant.get("featured_image")
        var_img = feat_img.get("src") if isinstance(feat_img, dict) else product_data.get("featured_image")
        if not var_img and product_data.get("images"):
            var_img = product_data["images"][0]

        # Generate a beautiful, clean JSON-LD object representing the single resolved variant
        custom_jsonld = {
            "@context": "http://schema.org",
            "@type": "Product",
            "name": full_title,
            "upc": var_sku,
            "description": product_data.get("description") or "",
            "brand": {
                "@type": "Brand",
                "name": brand or ""
            },
            "image": [var_img] if var_img else [],
            "offers": {
                "@type": "Offer",
                "price": str(var_price),
                "priceCurrency": "USD",
                "availability": "http://schema.org/InStock" if matched_variant.get("available", True) else "http://schema.org/OutOfStock",
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
            <p>{product_data.get("description") or ""}</p>
        </body>
        </html>
        """

        logger.info("[AI Search] Resolved Shopify family page variant: %s -> %s", url, resolved_url)
        return resolved_url, resolved_html, resolved_html, "exact_variant"
