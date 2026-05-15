"""Central Pet Distributor Adapter.

Legacy config: legacy-scraper-archive/configs/central-pet.yaml
Base URL: https://www.centralpet.com
Search: /Search?criteria={sku}
Auth: credential_ref (optional for browsing)
"""

from __future__ import annotations

import logging
import re
from urllib.parse import urljoin

from scrapers.approved_sources.adapters.base import BaseDistributorCrawl4AIAdapter
from scrapers.approved_sources.types import (
    ApprovedSourceExtractionResult,
    FailureCode,
)

logger = logging.getLogger(__name__)


class CentralPetAdapter(BaseDistributorCrawl4AIAdapter):
    """Extract products from Central Pet (credential ref, may be optional)."""

    adapter_slug = "central_pet_crawl4ai"
    source_slug = "central_pet"
    source_type = "distributor"
    base_url = "https://www.centralpet.com"
    search_url_template = "https://www.centralpet.com/Search?criteria={sku}"
    requires_auth = False  # Some products may be visible without login

    def build_search_url(self, sku: str) -> str:
        """Build the Central Pet search URL from a SKU."""
        return self.search_url_template.format(sku=sku)

    def extract_from_html(
        self, html: str, sku: str, url: str
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
            return self._extract_with_regex(html, sku, url)

        soup = BeautifulSoup(html, "html.parser")

        # --- Check for no results ---
        no_results = soup.select_one("span.no-results-found")
        if no_results:
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"No match found for SKU {sku}"
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

        # --- Product # / SKU ---
        sku_elem = soup.select_one("span[itemprop='sku'], .item-num span")
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
            result.failure_message = f"Could not find product name for SKU {sku}"
            result.warnings = warnings
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
        result.warnings = warnings
        return result

    def _extract_with_regex(
        self, html: str, sku: str, url: str
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
            result.failure_message = f"No match found for SKU {sku}"
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
