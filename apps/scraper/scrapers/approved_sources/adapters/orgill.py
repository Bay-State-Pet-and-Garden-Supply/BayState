"""Orgill Distributor Adapter.

Legacy config: legacy-scraper-archive/configs/orgill.yaml
Base URL: https://www.orgill.com
Search: /SearchResultN.aspx?ddlhQ={sku}
Auth: LOGIN REQUIRED — returns AUTH_REQUIRED when no credentials
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
from scrapers.approved_sources.auth import ORGILL_LOGIN

logger = logging.getLogger(__name__)


class OrgillAdapter(BaseDistributorCrawl4AIAdapter):
    """Extract products from Orgill (login required)."""

    adapter_slug = "orgill_crawl4ai"
    source_slug = "orgill"
    source_type = "distributor"
    base_url = "https://www.orgill.com"
    search_url_template = "https://www.orgill.com/SearchResultN.aspx?ddlhQ={sku}"
    requires_auth = True

    def get_login_config_class(self):
        """Return the Orgill login config."""
        return ORGILL_LOGIN

    def build_search_url(self, sku: str) -> str:
        """Build the Orgill search URL from a SKU."""
        return self.search_url_template.format(sku=sku)

    def extract_from_html(
        self, html: str, sku: str, url: str
    ) -> ApprovedSourceExtractionResult:
        """Extract product data from Orgill HTML using legacy-inspired selectors.

        Legacy selectors:
        - Name: #cphMainContent_ctl00_lblDescription, h1
        - Brand: #cphMainContent_ctl00_lblVendorName
        - model_number: #cphMainContent_ctl00_lblModelNumber
        - Weight: XPath (strong with 'Weight(lb)')
        - Image URLs: #multipleImagesCarousel img, img[id*='imgProductDetail']
        - UPC: #cphMainContent_ctl00_lblUPCCode
        - Description: #cphMainContent_ctl00_lblLongDescription / lblShortDescription
        - Dimensions, Features, Category
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

        # Check for login redirect / not authenticated
        # Check for specific login form elements to avoid false positives
        try:
            from bs4 import BeautifulSoup
            login_soup = BeautifulSoup(html, "html.parser")
            has_login_form = bool(login_soup.select_one(
                "#cphMainContent_ctl00_loginOrgillxs_UserName, "
                "#cphMainContent_ctl00_loginOrgillxs_Password"
            ))
        except Exception:
            has_login_form = "login" in html.lower() and ("password" in html.lower() or "sign in" in html.lower())

        if has_login_form:
            result.success = False
            result.failure_code = FailureCode.AUTH_REQUIRED
            result.failure_message = f"Authentication required for Orgill — received login page for SKU {sku}"
            result.auth_required = True
            return result

        try:
            from bs4 import BeautifulSoup
        except ImportError:
            return self._extract_with_regex(html, sku, url)

        soup = BeautifulSoup(html, "html.parser")

        # --- Check for no results ---
        error_elem = soup.select_one("#cphMainContent_ctl00_lblErrorMessage")
        if error_elem and error_elem.get_text(strip=True):
            error_text = error_elem.get_text(strip=True)
            if "no results" in error_text.lower():
                result.success = False
                result.failure_code = FailureCode.NO_MATCH
                result.failure_message = f"No match found for SKU {sku}: {error_text}"
                return result

        no_results_span = soup.find("span", string=re.compile(r"Found 0 results", re.I))
        if no_results_span:
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"No match found for SKU {sku}"
            return result

        # --- Name ---
        name_elem = soup.select_one("#cphMainContent_ctl00_lblDescription")
        if not name_elem:
            name_elem = soup.select_one("h1")
        if name_elem:
            product["name"] = name_elem.get_text(strip=True)
            matched.append("name")

        # --- Brand ---
        brand_elem = soup.select_one("#cphMainContent_ctl00_lblVendorName")
        if brand_elem:
            btext = brand_elem.get_text(strip=True)
            if btext:
                product["brand"] = btext
                matched.append("brand")

        # --- Model Number ---
        model_elem = soup.select_one("#cphMainContent_ctl00_lblModelNumber")
        if model_elem:
            mtext = model_elem.get_text(strip=True)
            if mtext:
                product["model_number"] = mtext
                matched.append("model_number")

        # --- UPC ---
        upc_elem = soup.select_one("#cphMainContent_ctl00_lblUPCCode")
        if upc_elem:
            uptext = upc_elem.get_text(strip=True)
            if uptext:
                product["upc"] = uptext
                matched.append("upc")

        # --- Image URLs ---
        images = []
        carousel = soup.select_one("#multipleImagesCarousel")
        if carousel:
            for img in carousel.select("img[src*='orgill.com']"):
                src = img.get("src") or ""
                if src:
                    if src.startswith("//"):
                        src = "https:" + src
                    elif src.startswith("/"):
                        src = urljoin(self.base_url, src)
                    images.append(src)
        # Also try direct product images
        if not images:
            for img in soup.select("img[id*='imgProductDetail']"):
                src = img.get("src") or ""
                if src and src != "#":
                    if src.startswith("//"):
                        src = "https:" + src
                    elif src.startswith("/"):
                        src = urljoin(self.base_url, src)
                    images.append(src)
        if images:
            product["image_urls"] = images
            matched.append("image_urls")

        # --- Weight ---
        weight_strong = soup.find("strong", string=re.compile(r"Weight\(lb\)", re.I))
        if weight_strong:
            parent_div = weight_strong.parent
            if parent_div:
                next_div = parent_div.find_next("div")
                if next_div:
                    product["weight"] = next_div.get_text(strip=True)
                    matched.append("weight")

        # --- Dimensions ---
        dim_strong = soup.find("strong", string=re.compile(r"Dimension", re.I))
        if dim_strong:
            parent_div = dim_strong.parent
            if parent_div:
                next_div = parent_div.find_next("div")
                if next_div:
                    product["dimensions"] = next_div.get_text(strip=True)
                    matched.append("dimensions")

        # --- Description ---
        desc_elem = soup.select_one(
            "#cphMainContent_ctl00_lblLongDescription, "
            "#cphMainContent_ctl00_lblShortDescription"
        )
        if desc_elem:
            dtext = desc_elem.get_text(strip=True)
            if dtext:
                product["description"] = dtext
                matched.append("description")

        # --- Category ---
        cat_elem = soup.select_one("#cphMainContent_ctl00_lblDepartment")
        if cat_elem:
            ctext = cat_elem.get_text(strip=True)
            if ctext:
                product["category"] = ctext
                matched.append("category")

        # --- Features ---
        features = []
        feats_elem = soup.select_one("#cphMainContent_ctl00_lblFeatures li")
        if feats_elem:
            feat_list = feats_elem.parent
            if feat_list:
                for li in feat_list.select("li"):
                    text = li.get_text(strip=True)
                    if text:
                        features.append(text)
        if features:
            product["features"] = features
            matched.append("features")

        if not product.get("name"):
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"Could not find product name for SKU {sku}"
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
        return result

    def _extract_with_regex(
        self, html: str, sku: str, url: str
    ) -> ApprovedSourceExtractionResult:
        """Fallback regex extraction."""
        result = ApprovedSourceExtractionResult(
            source_slug=self.source_slug,
            source_type=self.source_type,
        )

        # Check for login page - check for specific form elements
        try:
            from bs4 import BeautifulSoup
            login_soup = BeautifulSoup(html, "html.parser")
            has_login_form = bool(login_soup.select_one(
                "#cphMainContent_ctl00_loginOrgillxs_UserName, "
                "#cphMainContent_ctl00_loginOrgillxs_Password"
            ))
        except Exception:
            has_login_form = bool(re.search(r"login|sign.?in", html, re.I)) and bool(re.search(r"password|user.?name", html, re.I))

        if has_login_form:
            result.success = False
            result.failure_code = FailureCode.AUTH_REQUIRED
            result.failure_message = f"Authentication required for Orgill (SKU {sku})"
            result.auth_required = True
            return result

        product: dict = {}

        title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
        if title_match:
            product["name"] = title_match.group(1).strip()

        if not product.get("name"):
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"No match for SKU {sku}"
            return result

        result.success = True
        result.product = product
        result.matched_fields = ["name"]
        result.confidence = 0.3
        return result

    def normalize_images(self, urls: list[str]) -> list[str]:
        """Apply Orgill image quality replacements.
        From legacy: /websmall/ -> /web/, _thumb. -> .
        """
        normalized = []
        for url in urls:
            url = re.sub(r"/websmall/", "/web/", url)
            url = re.sub(r"_thumb\.", ".", url)
            normalized.append(url)
        return normalized
