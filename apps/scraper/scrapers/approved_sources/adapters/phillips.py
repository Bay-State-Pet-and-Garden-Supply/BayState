"""Phillips Pet Distributor Adapter.

Legacy config: legacy-scraper-archive/configs/phillips.yaml
Base URL: https://shop.phillipspet.com
Search: Salesforce Commerce Cloud quickSearch
Auth: LOGIN REQUIRED — returns AUTH_REQUIRED when no credentials
"""

from __future__ import annotations

import logging
import re
from urllib.parse import urljoin, quote

from scrapers.approved_sources.adapters.base import BaseDistributorCrawl4AIAdapter
from scrapers.approved_sources.types import (
    ApprovedSourceExtractionResult,
    FailureCode,
)
from scrapers.approved_sources.auth import PHILLIPS_LOGIN

logger = logging.getLogger(__name__)


class PhillipsAdapter(BaseDistributorCrawl4AIAdapter):
    """Extract products from Phillips Pet (login required)."""

    adapter_slug = "phillips_crawl4ai"
    source_slug = "phillips"
    source_type = "distributor"
    base_url = "https://shop.phillipspet.com"
    search_url_template = (
        "https://shop.phillipspet.com/ccrz__ProductList"
        "?cartID=&operation=quickSearch&searchText={sku}"
        "&portalUser=&store=DefaultStore&cclcl=en_US"
    )
    requires_auth = True

    def get_login_config_class(self):
        """Return the Phillips login config."""
        return PHILLIPS_LOGIN

    def build_search_url(self, sku: str) -> str:
        """Build the Phillips Salesforce Commerce Cloud quick search URL."""
        return self.search_url_template.format(sku=quote(sku))

    def extract_from_html(
        self, html: str, sku: str, url: str
    ) -> ApprovedSourceExtractionResult:
        """Extract product data from Phillips HTML using legacy-inspired selectors.

        Legacy selectors:
        - Name: #plp-desktop-row .cc_product_name strong, h1
        - Brand: .product-brand .branded
        - UPC: .product-upc .cc_value
        - ItemNumber: .product-item-number .cc_value
        - Image URLs: #plp-desktop-row .cc_product_image img
        - Description: .product-description, .cc_product_description
        - Weight: .product-weight .cc_value, .product-ship-weight .cc_value
        - Features: .product-features li, .cc_product_features li
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

        # Check for login page (Salesforce CC)
        # Look for the actual login form, not just the word "password" in text
        try:
            from bs4 import BeautifulSoup
            login_soup = BeautifulSoup(html, "html.parser")
            has_email_field = bool(login_soup.select_one("#emailField"))
            has_password_field = bool(login_soup.select_one("#passwordField"))
            has_login_form = has_email_field or has_password_field
        except Exception:
            has_login_form = "login" in html.lower() and ("CCSiteLogin" in html or "password" in html.lower())

        if has_login_form:
            result.success = False
            result.failure_code = FailureCode.AUTH_REQUIRED
            result.failure_message = f"Authentication required for Phillips — received login page for SKU {sku}"
            result.auth_required = True
            return result

        try:
            from bs4 import BeautifulSoup
        except ImportError:
            return self._extract_with_regex(html, sku, url)

        soup = BeautifulSoup(html, "html.parser")

        # --- Check for no results ---
        empty_state = soup.select_one(".plp-empty-state-message-container h3")
        if empty_state:
            text = empty_state.get_text(strip=True).lower()
            if "no results" in text or "no products" in text or "no items" in text:
                result.success = False
                result.failure_code = FailureCode.NO_MATCH
                result.failure_message = f"No match found for SKU {sku}"
                return result

        # Also check common text patterns
        page_text = soup.get_text(" ", strip=True).lower()
        if any(
            pattern in page_text
            for pattern in [
                "no results found",
                "your search returned no results",
                "0 items",
            ]
        ):
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"No match found for SKU {sku}"
            return result

        # --- Name ---
        name_elem = soup.select_one("#plp-desktop-row .cc_product_name strong")
        if not name_elem:
            name_elem = soup.select_one("h1")
        if not name_elem:
            name_elem = soup.select_one("[data-testid='product-name']")
        if name_elem:
            product["name"] = name_elem.get_text(strip=True)
            matched.append("name")

        # --- Brand ---
        brand_elem = soup.select_one(".product-brand .branded")
        if brand_elem:
            btext = brand_elem.get_text(strip=True)
            if btext:
                product["brand"] = btext
                matched.append("brand")

        # --- UPC ---
        upc_elem = soup.select_one(".product-upc .cc_value")
        if upc_elem:
            uptext = upc_elem.get_text(strip=True)
            if uptext:
                product["upc"] = uptext
                matched.append("upc")

        # --- Item Number ---
        item_elem = soup.select_one(".product-item-number .cc_value")
        if item_elem:
            itext = item_elem.get_text(strip=True)
            if itext:
                product["item_number"] = itext
                matched.append("item_number")

        # --- Image URLs ---
        images = []
        plp_row = soup.select_one("#plp-desktop-row")
        if plp_row:
            for img in plp_row.select(".cc_product_image img"):
                src = img.get("src") or img.get("data-src") or ""
                if src:
                    if src.startswith("//"):
                        src = "https:" + src
                    elif src.startswith("/"):
                        src = urljoin(self.base_url, src)
                    images.append(src)
        # Fallback: any product image
        if not images:
            for img in soup.select("img[src*='product']"):
                src = img.get("src") or ""
                if src:
                    if src.startswith("//"):
                        src = "https:" + src
                    elif src.startswith("/"):
                        src = urljoin(self.base_url, src)
                    images.append(src)
        if images:
            product["image_urls"] = images
            matched.append("image_urls")

        # --- Weight ---
        weight_elem = soup.select_one(
            ".product-weight .cc_value, .product-ship-weight .cc_value"
        )
        if weight_elem:
            wtext = weight_elem.get_text(strip=True)
            if wtext:
                product["weight"] = wtext
                matched.append("weight")

        # --- Description ---
        desc_elem = soup.select_one(
            ".product-description, .cc_product_description"
        )
        if desc_elem:
            dtext = desc_elem.get_text(strip=True)
            if dtext:
                product["description"] = dtext
                matched.append("description")

        # --- Features ---
        features = []
        feats = soup.select(".product-features li, .cc_product_features li")
        for li in feats:
            text = li.get_text(strip=True)
            if text:
                features.append(text)
        if features:
            product["features"] = features
            matched.append("features")

        if not product.get("name"):
            # Maybe we're searching but Phillips returned the search page
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"No product match found for SKU {sku}"
            return result

        # Calculate confidence
        required = ["name", "brand"]
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
        """Fallback regex extraction."""
        result = ApprovedSourceExtractionResult(
            source_slug=self.source_slug,
            source_type=self.source_type,
        )

        # Check for login form elements specifically
        try:
            from bs4 import BeautifulSoup
            login_soup = BeautifulSoup(html, "html.parser")
            has_login_form = bool(login_soup.select_one("#emailField, #passwordField, #send2Dsk"))
        except Exception:
            has_login_form = bool(re.search(r"CCSiteLogin", html, re.I))

        if has_login_form:
            result.success = False
            result.failure_code = FailureCode.AUTH_REQUIRED
            result.failure_message = f"Authentication required for Phillips (SKU {sku})"
            result.auth_required = True
            return result

        product: dict = {}

        # Name from various patterns
        title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
        if title_match:
            product["name"] = title_match.group(1).strip()

        if not product.get("name"):
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"No match for SKU {sku}"
            return result

        # Try to get brand
        brand_match = re.search(
            r'class=["\']product-brand[^"\']*["\'][^>]*>\s*(.*?)</',
            html, re.I | re.S
        )
        if brand_match:
            product["brand"] = brand_match.group(1).strip()

        result.success = True
        result.product = product
        result.matched_fields = ["name"]
        result.confidence = 0.4
        return result

    def normalize_images(self, urls: list[str]) -> list[str]:
        """Apply Phillips image quality replacements.
        From legacy: /thumb/ -> /large/, _thumb -> _large
        """
        normalized = []
        for url in urls:
            url = re.sub(r"/thumb/", "/large/", url)
            url = re.sub(r"_thumb", "_large", url)
            normalized.append(url)
        return normalized
