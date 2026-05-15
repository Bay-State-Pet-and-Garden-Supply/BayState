"""Bradley Caldwell Distributor Adapter.

Legacy config: legacy-scraper-archive/configs/bradley.yaml
Base URL: https://www.bradleycaldwell.com
Search: /search?term={sku}
Auth: None
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


class BradleyAdapter(BaseDistributorCrawl4AIAdapter):
    """Extract products from Bradley Caldwell (no auth)."""

    adapter_slug = "bradley_crawl4ai"
    source_slug = "bradley"
    source_type = "distributor"
    base_url = "https://www.bradleycaldwell.com"
    search_url_template = "https://www.bradleycaldwell.com/search?term={sku}"
    requires_auth = False

    def build_search_url(self, sku: str) -> str:
        """Build the Bradley search URL from a SKU."""
        return self.search_url_template.format(sku=sku)

    def extract_from_html(
        self, html: str, sku: str, url: str
    ) -> ApprovedSourceExtractionResult:
        """Extract product data from Bradley Caldwell HTML using legacy-inspired selectors.

        Legacy selectors (translated for HTML parsing):
        - Name: main h1
        - Brand: main h1 preceding p a
        - Image URLs: [class*='product-gallery'] img[src*='products/']
        - BCI Item Number, Manufacturer #, UPC, Case Pack, Unit of Measure: dt+dd pairs
        - Dimensions, Ingredients: li containing text
        - Description: main [class*='product-description']
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
            # Fallback: basic string-based extraction
            return self._extract_with_regex(html, sku, url)

        soup = BeautifulSoup(html, "html.parser")

        # --- Name ---
        # main h1 (not "Search results for...")
        name = None
        for h1 in soup.select("main h1"):
            text = h1.get_text(strip=True)
            if "search results" not in text.lower():
                name = text
                break
        if name:
            product["name"] = name
            matched.append("name")

        # --- Brand ---
        # main h1 preceding-sibling::p[1]/a
        brand = None
        main_h1 = soup.select_one("main h1")
        if main_h1:
            prev_p = main_h1.find_previous("p")
            if prev_p:
                brand_link = prev_p.find("a")
                if brand_link:
                    brand = brand_link.get_text(strip=True)
        if brand:
            product["brand"] = brand
            matched.append("brand")

        # --- Image URLs ---
        images = []
        # Find product gallery images
        gallery = soup.select_one("[class*='product-gallery']")
        if gallery:
            for img in gallery.select("img[src*='products/']"):
                src = img.get("src") or img.get("data-src") or ""
                if src:
                    if src.startswith("//"):
                        src = "https:" + src
                    elif src.startswith("/"):
                        src = urljoin(self.base_url, src)
                    images.append(src)
        if images:
            product["image_urls"] = images
            matched.append("image_urls")

        # --- Detail fields (dt+dd pairs) ---
        detail_map = {
            "BCI Item Number": "bci_item_number",
            "Manufacturer #": "manufacturer_number",
            "UPC": "upc",
            "Case Pack": "case_pack",
            "Unit of Measure": "unit_of_measure",
        }
        for dt in soup.select("dt"):
            dt_text = dt.get_text(strip=True)
            if dt_text in detail_map:
                dd = dt.find_next("dd")
                if dd:
                    value = dd.get_text(strip=True)
                    product[detail_map[dt_text]] = value
                    matched.append(detail_map[dt_text])

        # --- Weight ---
        weight_elem = soup.find("li", string=re.compile(r"Weight:", re.I))
        if weight_elem:
            weight = weight_elem.get_text(strip=True)
            product["weight"] = weight
            matched.append("weight")

        # --- Description ---
        desc = None
        for cls in ["product-description", "prose"]:
            desc_elem = soup.select_one(f"main [class*='{cls}']")
            if desc_elem:
                desc = desc_elem.get_text(strip=True)
                break
        if not desc:
            # fallback: main section p
            section = soup.select_one("main section")
            if section:
                desc = section.get_text(strip=True)[:500]
        if desc:
            product["description"] = desc
            matched.append("description")

        # Check if we found enough
        if not product.get("name"):
            # Check for no-results message
            no_results = soup.find(
                "h3", string=re.compile(r"Sorry, no results for", re.I)
            )
            if no_results:
                result.success = False
                result.failure_code = FailureCode.NO_MATCH
                result.failure_message = f"No match found for SKU {sku}"
            else:
                result.success = False
                result.failure_code = FailureCode.EXTRACTION_FAILED
                result.failure_message = "Could not extract product name from HTML"
            result.warnings = warnings
            return result

        # Calculate confidence
        required = ["name", "brand"]
        found_required = [f for f in required if f in product]
        confidence = len(found_required) / len(required) if required else 0.5
        # Bonus for more fields
        bonus = min(len(matched) / 8, 0.3)
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
        """Fallback regex-based extraction when BeautifulSoup is not available."""
        result = ApprovedSourceExtractionResult(
            source_slug=self.source_slug,
            source_type=self.source_type,
        )

        product: dict = {}
        matched: list[str] = []

        # Try to extract title from <title> tag
        title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
        if title_match:
            title = title_match.group(1).strip()
            if "search" not in title.lower():
                product["name"] = title
                matched.append("name")

        # Check for no-results
        if re.search(r"Sorry, no results for", html, re.I):
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"No match found for SKU {sku}"
            return result

        if not product.get("name"):
            result.success = False
            result.failure_code = FailureCode.EXTRACTION_FAILED
            result.failure_message = "Could not extract product name via regex"
            return result

        # Minimal: try to get images
        img_matches = re.findall(
            r'<img[^>]+src=["\']([^"\']*products/[^"\']+)["\']', html
        )
        if img_matches:
            images = []
            for img_src in img_matches:
                if img_src.startswith("//"):
                    img_src = "https:" + img_src
                elif img_src.startswith("/"):
                    img_src = urljoin(self.base_url, img_src)
                images.append(img_src)
            product["image_urls"] = images
            matched.append("image_urls")

        result.success = True
        result.product = product
        result.matched_fields = matched
        result.confidence = 0.5
        return result

    def normalize_images(self, urls: list[str]) -> list[str]:
        """Apply Bradley image quality replacements.
        From legacy: /small/ -> /large/, _small -> _large, _thumbnail -> _large
        """
        normalized = []
        for url in urls:
            url = re.sub(r"/small/", "/large/", url)
            url = re.sub(r"_small", "_large", url)
            url = re.sub(r"_thumbnail", "_large", url)
            normalized.append(url)
        return normalized
