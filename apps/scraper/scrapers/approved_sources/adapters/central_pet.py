"""Central Pet Distributor Adapter.

Legacy config: legacy-scraper-archive/configs/central-pet.yaml
Base URL: https://www.centralpet.com
Search: /Search?criteria={upc}
Auth: credential_ref (optional for browsing)
"""

from __future__ import annotations

import logging
import re
from urllib.parse import urljoin

from typing import Any

from scrapers.approved_sources.adapters.base import BaseDistributorCrawl4AIAdapter
from scrapers.approved_sources.types import (
    ApprovedSourceExtractionResult,
    FailureCode,
    ApprovedSourcePlanEntry,
    ApprovedSourcePlan,
)

logger = logging.getLogger(__name__)


class CentralPetAdapter(BaseDistributorCrawl4AIAdapter):
    """Extract products from Central Pet (credential ref, may be optional)."""

    adapter_slug = "central_pet_crawl4ai"
    source_slug = "central_pet"
    source_type = "distributor"
    base_url = "https://www.centralpet.com"
    search_url_template = "https://www.centralpet.com/Search?criteria={upc}"
    requires_auth = False  # Some products may be visible without login
    disable_stealth = True  # Central Pet's Angular client fails when stealth is enabled

    # Wait for either the PDP (erpDescription), product list container, or no-results indicator, or timeout after 10 seconds
    browser_wait_for = (
        "js:() => new Promise(resolve => { "
        "const check = () => "
        "  document.querySelector('#tst_productDetail_erpDescription') || "
        "  document.querySelector('.isc-productContainer') || "
        "  document.querySelector('.no-results-found') || "
        "  document.querySelector('.no-results'); "
        "if (check()) return resolve(true); "
        "let elapsed = 0; "
        "const interval = setInterval(() => { "
        "elapsed += 100; "
        "if (check() || elapsed >= 10000) { "
        "clearInterval(interval); "
        "resolve(true); "
        "} "
        "}, 100); "
        "})"
    )

    def __init__(self, entry: ApprovedSourcePlanEntry, plan: ApprovedSourcePlan):
        super().__init__(entry, plan)
        self._product_page_url: str | None = None

    def build_search_url(self, upc: str) -> str:
        """Build the Central Pet search URL from a UPC."""
        return self.search_url_template.format(upc=upc)

    async def _post_process_extraction(
        self,
        det_result: ApprovedSourceExtractionResult,
        search_url: str,
        source_policy: Any,
    ) -> ApprovedSourceExtractionResult | None:
        """Fetch the product detail page to get full metadata."""
        if not self._product_page_url:
            return det_result

        logger.info("[%s] Navigating to product details page for full metadata: %s", self.adapter_slug, self._product_page_url)

        try:
            html = await self._fetch_html(self._product_page_url)
            if html and self._needs_js_rendering(html):
                logger.info("[%s] PDP HTML needs JS rendering, falling back to browser", self.adapter_slug)
                browser_html = await self._fetch_html_with_browser(self._product_page_url, wait_for="css:#tst_productDetail_erpDescription")
                if browser_html:
                    html = browser_html

            if not html:
                logger.warning("[%s] Failed to fetch PDP HTML", self.adapter_slug)
                return det_result

            pdp_result = self.extract_from_html(html, self._get_sku(), self._product_page_url)
            if pdp_result.success:
                # Update product with full PDP details
                for k, v in pdp_result.product.items():
                    if v is not None and v != "" and v != []:
                        det_result.product[k] = v
                det_result.matched_fields = list(set(det_result.matched_fields + pdp_result.matched_fields))
                det_result.sku_match = pdp_result.sku_match
                logger.info("[%s] Successfully enriched product details from PDP: %s", self.adapter_slug, self._product_page_url)
            else:
                logger.warning("[%s] Failed to parse details from PDP HTML", self.adapter_slug)
        except Exception as e:
            logger.warning("[%s] Product page enrichment failed: %s", self.adapter_slug, e)

        return det_result

    def extract_from_html(
        self, html: str, upc: str, url: str
    ) -> ApprovedSourceExtractionResult:
        """Extract product data from Central Pet HTML using legacy-inspired selectors.

        Legacy selectors:
        - Name: #tst_productDetail_erpDescription, h1
        - Brand: a[ng-if='vm.product.brand.detailPagePath']
        - Weight: XPath (li with 'Product Gross Weight')
        - Image URLs: a#tst_productDetail_imageZoom img
        - Product #, UPC, Mfg Part #: spans
        - Description: #tst_productDetail_htmlContent
        - Features, Dimensions
        """
        result = ApprovedSourceExtractionResult(
            source_slug=self.source_slug,
            source_type=self.source_type,
        )

        if not html:
            result.failure_code = FailureCode.EXTRACTION_FAILED
            result.failure_message = "No HTML content to parse"
            return result

        product: dict = {}
        matched: list[str] = []
        warnings: list[str] = []

        try:
            from bs4 import BeautifulSoup
        except ImportError:
            return self._extract_with_regex(html, upc, url)

        soup = BeautifulSoup(html, "html.parser")

        # --- Check for no results ---
        no_results = soup.select_one("span.no-results-found")
        if no_results:
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"No match found for UPC {upc}"
            return result

        # Check if we are on a search results page versus a direct PDP page
        # Direct PDP landing has `#tst_productDetail_erpDescription`
        is_pdp = "#tst_productDetail_erpDescription" in html or bool(soup.select_one("#tst_productDetail_erpDescription"))
        
        if not is_pdp:
            # We are likely on a search results page. Let's find the correct matching product card.
            pdp_link_node = None
            sku_clean = re.sub(r'[^a-zA-Z0-9]', '', upc.lower())
            
            for a in soup.select("a[href]"):
                href = a.get("href", "")
                if not href or href == "#" or href == "/":
                    continue
                href_lower = href.lower()
                if any(x in href_lower for x in ["/cart", "/checkout", "/account", "/login", "/search", "comparison", "compare", "/products"]):
                    continue
                
                # Check link text to avoid generic actions
                link_text = a.get_text(strip=True).lower()
                if link_text in {"compare", "add to cart", "wishlist", "learn more", "details", "view product", "view details", "quick view", "printable view", "export text"}:
                    continue
                
                # Check parents up to 8 levels to find the card container
                parent = a.parent
                card_container = None
                depth = 0
                while parent and parent.name not in ("body", "html", "main") and depth < 8:
                    if parent.name in ("article", "li") or any(c in parent.get("class", []) for c in ("card", "product-card", "product-item", "item-row")):
                        card_container = parent
                        break
                    parent = parent.parent
                    depth += 1
                
                if not card_container:
                    card_container = a.parent or a
                
                container_text = card_container.get_text(" ", strip=True).lower()
                norm_container_text = re.sub(r'[^a-zA-Z0-9]', '', container_text)
                
                if sku_clean in norm_container_text or sku_clean in href_lower:
                    pdp_link_node = a
                    break
            
            if pdp_link_node:
                self._product_page_url = urljoin(self.base_url, pdp_link_node.get("href", ""))
                result.success = True
                result.sku_match = True
                result.product = {"name": pdp_link_node.get_text(strip=True) or "Product Details"}
                result.matched_fields = ["name"]
                logger.info("[%s] Found PDP link for UPC %s in search results: %s", self.adapter_slug, upc, self._product_page_url)
                return result
            else:
                result.success = False
                result.failure_code = FailureCode.NO_MATCH
                result.failure_message = f"No matching product card found on search page for UPC {upc}"
                return result

        # --- Name ---
        name_elem = soup.select_one("#tst_productDetail_erpDescription")
        if not name_elem:
            name_elem = soup.select_one("h1")
        if name_elem:
            product["name"] = name_elem.get_text(strip=True)
            matched.append("name")

        # --- Brand ---
        brand_elem = soup.select_one("a[ng-if='vm.product.brand.detailPagePath']")
        if brand_elem:
            btext = brand_elem.get_text(strip=True)
            # Filter out Angular expression artifacts
            if "{{" not in btext:
                product["brand"] = btext
                matched.append("brand")

        # --- Image URLs ---
        images = []
        img_link = soup.select_one("a#tst_productDetail_imageZoom img")
        if img_link:
            src = img_link.get("src") or ""
            if src:
                if src.startswith("//"):
                    src = "https:" + src
                elif src.startswith("/"):
                    src = urljoin(self.base_url, src)
                images.append(src)
        # Also try other product images
        if not images:
            for img in soup.select("[data-testid*='product-image'] img, .product-image img"):
                src = img.get("src") or img.get("data-src") or ""
                if src and "placeholder" not in src.lower():
                    if src.startswith("//"):
                        src = "https:" + src
                    elif src.startswith("/"):
                        src = urljoin(self.base_url, src)
                    images.append(src)
        if images:
            product["image_urls"] = images
            matched.append("image_urls")

        # --- Product # / UPC ---
        sku_elem = soup.select_one("span[itemprop='upc'], .item-num span")
        if sku_elem:
            pn = sku_elem.get_text(strip=True)
            if pn:
                product["product_number"] = pn
                matched.append("product_number")

        # --- UPC ---
        upc_elem = soup.select_one(".upc span")
        if upc_elem:
            upc = upc_elem.get_text(strip=True)
            if upc:
                product["upc"] = upc
                matched.append("upc")

        # --- Mfg Part # ---
        mfg_elem = soup.select_one(".mfg-part-num span")
        if mfg_elem:
            mpn = mfg_elem.get_text(strip=True)
            if mpn:
                product["manufacturer_number"] = mpn
                matched.append("manufacturer_number")

        # --- Weight ---
        weight_elem = soup.find("li", string=re.compile(r"Product Gross Weight", re.I))
        if weight_elem:
            span = weight_elem.find("span")
            if span:
                product["weight"] = span.get_text(strip=True)
                matched.append("weight")

        # --- Description ---
        desc_elem = soup.select_one("#tst_productDetail_htmlContent")
        if desc_elem:
            desc = desc_elem.get_text(strip=True)
            if desc:
                product["description"] = desc
                matched.append("description")

        # --- Features ---
        features = []
        features_container = soup.select_one(
            "#tst_productDetail_features li, .product-features li"
        )
        if features_container:
            # Get siblings
            feature_list = features_container.parent
            if feature_list:
                for li in feature_list.select("li"):
                    text = li.get_text(strip=True)
                    if text:
                        features.append(text)
        if features:
            product["features"] = features
            matched.append("features")

        # --- Dimensions ---
        dim_elem = soup.find("li", string=re.compile(r"Dimension", re.I))
        if dim_elem:
            span = dim_elem.find("span")
            if span:
                product["dimensions"] = span.get_text(strip=True)
                matched.append("dimensions")

        # Check if we found enough
        if not product.get("name"):
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"Could not find product name for UPC {upc}"
            result.warnings = warnings
            return result

        identifier_candidates = [
            product.get("product_number"),
            product.get("upc"),
            product.get("manufacturer_number"),
        ]
        has_identifier = any(candidate for candidate in identifier_candidates)
        identifier_match, matched_identifiers = self._match_identifier_candidates(
            upc,
            product.get("product_number"),
            product.get("upc"),
            product.get("manufacturer_number"),
        )
        if has_identifier and not identifier_match:
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = (
                f"Central Pet identifier mismatch for searched UPC {upc}: "
                f"saw {', '.join(matched for matched in identifier_candidates if matched)}"
            )
            return result

        # Calculate confidence
        required = ["name", "brand", "image_urls"]
        found_required = [f for f in required if f in product]
        confidence = len(found_required) / len(required) if required else 0.5
        bonus = min(len(matched) / 10, 0.3)
        confidence = min(confidence + bonus, 1.0)

        result.success = True
        result.product = product
        result.matched_fields = matched
        result.confidence = confidence
        result.sku_match = True if identifier_match else (False if has_identifier else None)
        result.warnings = warnings
        return result

    def _extract_with_regex(
        self, html: str, upc: str, url: str
    ) -> ApprovedSourceExtractionResult:
        """Fallback regex extraction when BeautifulSoup is unavailable."""
        result = ApprovedSourceExtractionResult(
            source_slug=self.source_slug,
            source_type=self.source_type,
        )

        product: dict = {}

        # Check for no results
        if re.search(r"No results found", html, re.I) and re.search(r"no-results", html, re.I):
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"No match found for UPC {upc}"
            return result

        # Title extraction
        title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
        if title_match:
            product["name"] = title_match.group(1).strip()
            # Split on common separators
            parts = re.split(r"\s*[|-]\s*", product["name"])
            if parts:
                product["name"] = parts[0].strip()

        if not product.get("name"):
            result.success = False
            result.failure_code = FailureCode.EXTRACTION_FAILED
            result.failure_message = "Could not extract product name via regex"
            return result

        result.matched_fields = ["name"]

        # Images
        img_matches = re.findall(
            r'<img[^>]+src=["\']([^"\']+centralpet[^"\']+)["\']', html, re.I
        )
        if img_matches:
            product["image_urls"] = [u for u in img_matches if "placeholder" not in u.lower()]
            result.matched_fields.append("image_urls")

        result.success = True
        result.product = product
        result.confidence = 0.5
        return result

    def normalize_images(self, urls: list[str]) -> list[str]:
        """Apply Central Pet image quality replacements.
        From legacy: /w_\\d+/ -> /w_1500/, /h_\\d+/ -> /h_1500/
        """
        normalized = []
        for url in urls:
            url = re.sub(r"/w_\d+/", "/w_1500/", url)
            url = re.sub(r"/h_\d+/", "/h_1500/", url)
            normalized.append(url)
        return normalized
