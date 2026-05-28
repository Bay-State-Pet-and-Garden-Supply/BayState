"""Pet Food Experts Distributor Adapter.

Legacy config: legacy-scraper-archive/configs/petfoodex.yaml
Base URL: https://orders.petfoodexperts.com
Search: /Search?query={upc}
Auth: LOGIN REQUIRED — returns AUTH_REQUIRED when no credentials

Note: Pet Food Experts uses data-test-selector attributes heavily.
Fields like Brand, Item Number, UPC are extracted via regex transforms
on the 'Attributes' and 'Product Meta' fields.
"""

from __future__ import annotations

import logging
import re
from urllib.parse import urljoin, quote

from typing import Any

from scrapers.approved_sources.adapters.base import BaseDistributorCrawl4AIAdapter
from scrapers.approved_sources.types import (
    ApprovedSourceExtractionResult,
    FailureCode,
    ApprovedSourcePlanEntry,
    ApprovedSourcePlan,
)
from scrapers.approved_sources.auth import PFE_LOGIN

logger = logging.getLogger(__name__)


class PetFoodExpertsAdapter(BaseDistributorCrawl4AIAdapter):
    """Extract products from Pet Food Experts (login required)."""

    adapter_slug = "pet_food_experts_crawl4ai"
    source_slug = "pet_food_experts"
    source_type = "distributor"
    base_url = "https://orders.petfoodexperts.com"
    search_url_template = "https://orders.petfoodexperts.com/Search?query={upc}"
    requires_auth = True

    def __init__(self, entry: ApprovedSourcePlanEntry, plan: ApprovedSourcePlan):
        super().__init__(entry, plan)
        self._product_page_url: str | None = None

    def get_login_config_class(self):
        """Return the Pet Food Experts login config."""
        return PFE_LOGIN

    def build_search_url(self, upc: str) -> str:
        """Build the Pet Food Experts search URL from a UPC."""
        return self.search_url_template.format(upc=quote(str(upc), safe=""))

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
            # PFE requires auth, so fetch using fetch_html_authenticated
            html, auth_err = await self._fetch_html_authenticated(self._product_page_url, getattr(self, "api_client", None))
            if auth_err or not html:
                logger.warning("[%s] Failed to fetch product details page: %s", self.adapter_slug, auth_err)
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
                logger.warning("[%s] Failed to parse product details from PDP HTML", self.adapter_slug)
        except Exception as e:
            logger.warning("[%s] Product page enrichment failed: %s", self.adapter_slug, e)

        return det_result

    def extract_from_html(
        self, html: str, upc: str, url: str
    ) -> ApprovedSourceExtractionResult:
        """Extract product data from Pet Food Experts HTML.

        Legacy selectors:
        - Name: h1, [data-test-selector='product-name']
        - Attributes: [data-test-selector='productDetails_specifications']
        - Product Meta: [data-test-selector^='productDetails_productId_']
        - UoM: [data-test-selector='productPrice_unitOfMeasureLabel']
        - Image URLs: img[data-test-selector='productDetails_mainImage']
        - Description: [data-test-selector='productDetails_description']
        - Weight: [data-test-selector='productDetails_specifications'] li:has-text('Weight')
        - Features, Ingredients

        Transform regexes from legacy:
        - Brand extracted from Attributes via: Brand:\\s*([^\\n]+)
        - Item # from Product Meta via: Item #\\s*([A-Z0-9-]+)
        - UPC from Product Meta via: (?:UPC#:\\s*(?:[A-Z]+:\\s*)?|EA:\\s*)([0-9]{8,14})
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

        # Check for login page (be specific to avoid false positives on product pages)
        # Sign-in page has a userName INPUT element, product pages have productDetails
        # The actual login page has <input id="userName" while product pages have data-test-selector="header_signIn"
        if ('id="userName"' in html or 'name="userName"' in html or
            html.lower().count('sign in') > 20) and 'productDetails' not in html:
            result.success = False
            result.failure_code = FailureCode.AUTH_REQUIRED
            result.failure_message = (
                f"Authentication required for Pet Food Experts — "
                f"received sign-in page for UPC {upc}"
            )
            result.auth_required = True
            return result

        try:
            from bs4 import BeautifulSoup
        except ImportError:
            return self._extract_with_regex(html, upc, url)

        soup = BeautifulSoup(html, "html.parser")

        # --- Check for no results ---
        no_items = soup.find(["h2", "p"], string=re.compile(r"\b0 item[s]?\b", re.I))
        if no_items:
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"No match found for UPC {upc}"
            return result

        page_title_text = soup.get_text(" ", strip=True).lower()
        if any(
            p in page_title_text
            for p in ["0 items found", "0 item found", "no results found"]
        ):
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"No match found for UPC {upc}"
            return result

        # Check if we are on a search results page versus a direct PDP page
        # Direct PDP landing has specifications or page_ProductDetailsPage
        is_pdp = "productDetails" in html or bool(soup.select_one("[data-test-selector='page_ProductDetailsPage']"))
        
        if not is_pdp:
            # We are likely on a search results list page. Let's find the product card matching the searched UPC/SKU.
            pdp_link_node = None
            sku_clean = re.sub(r'[^a-zA-Z0-9]', '', upc.lower())
            
            for a in soup.select("a[href]"):
                href = a.get("href", "")
                if not href or href == "#" or href == "/":
                    continue
                href_lower = href.lower()
                if any(x in href_lower for x in ["/cart", "/checkout", "/account", "/login", "/search"]):
                    continue
                
                # Check parents up to 5 levels to find the card container
                parent = a.parent
                card_container = None
                depth = 0
                while parent and parent.name not in ("body", "html", "main") and depth < 5:
                    if parent.name == "article" or any(c in parent.get("class", []) for c in ("card", "product-card", "product-item", "item-row", "row")):
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
        name_elem = soup.select_one("h1")
        if not name_elem:
            name_elem = soup.select_one("[data-test-selector='product-name']")
        if name_elem:
            product["name"] = name_elem.get_text(strip=True)
            matched.append("name")

        # --- Attributes (raw text for regex extraction) ---
        attrs_elem = soup.select_one(
            "[data-test-selector='productDetails_specifications']"
        )
        attrs_text = attrs_elem.get_text(" ", strip=True) if attrs_elem else ""

        # --- Product Meta (raw text for regex extraction) ---
        meta_elem = soup.select_one(
            "[data-test-selector^='productDetails_productId_']"
        )
        meta_text = meta_elem.get_text(" ", strip=True) if meta_elem else ""

        # --- Extract Brand from Attributes via regex ---
        brand_match = re.search(
            r"Brand:\s*(.+?)(?=\s+(?:Flavor|Animal|Diet|Food Form|Ingredients|Protein|Weight|Breed Size|Life Stage):|$)",
            attrs_text,
        )
        if brand_match:
            product["brand"] = brand_match.group(1).strip()
            matched.append("brand")

        # --- Extract Item Number from Product Meta ---
        item_match = re.search(r"Item #\s*([A-Z0-9-]+)", meta_text)
        if item_match:
            product["item_number"] = item_match.group(1).strip()
            matched.append("item_number")

        # --- Extract UPC from Product Meta ---
        upc_match = re.search(
            r"(?:UPC#:\s*(?:[A-Z]+:\s*)?|EA:\s*)([0-9]{8,14})",
            meta_text,
        )
        if upc_match:
            product["upc"] = upc_match.group(1).strip()
            matched.append("upc")

        # --- UoM ---
        uom_elem = soup.select_one(
            "[data-test-selector='productPrice_unitOfMeasureLabel']"
        )
        if uom_elem:
            uom_text = uom_elem.get_text(strip=True)
            if uom_text:
                product["unit_of_measure"] = uom_text.strip("/ ")
                matched.append("unit_of_measure")

        # --- Image URLs ---
        images = []
        main_img = soup.select_one(
            "img[data-test-selector='productDetails_mainImage'], "
            "img[data-test-selector*='productImage'], "
            "[data-test-selector='product-image'] img"
        )
        if main_img:
            src = main_img.get("src") or main_img.get("data-src") or ""
            if src:
                if src.startswith("//"):
                    src = "https:" + src
                elif src.startswith("/"):
                    src = urljoin(self.base_url, src)
                images.append(src)
        # Fallback for multiple images
        if not images:
            for img in soup.select("[data-test-selector*='productImage'] img"):
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

        # --- Description ---
        desc_elem = soup.select_one(
            "[data-test-selector='productDetails_description'], "
            ".product-description, "
            "[data-test-selector='productDetails_longDescription'], "
            ".product-detail-description"
        )
        if desc_elem:
            dtext = desc_elem.get_text(strip=True)
            if dtext:
                product["description"] = dtext
                matched.append("description")

        # --- Weight (from spec list) ---
        weight_found = False
        spec_div = soup.select_one(
            "[data-test-selector='productDetails_specifications']"
        )
        if spec_div:
            for li in spec_div.select("li"):
                text = li.get_text(strip=True)
                if re.search(r"weight", text, re.I) and ":" in text:
                    product["weight"] = text
                    matched.append("weight")
                    weight_found = True
                    break
        if not weight_found:
            # Try XPath equivalent
            for li in soup.find_all("li"):
                text = li.get_text(strip=True)
                if re.search(r"weight", text, re.I):
                    product["weight"] = text
                    matched.append("weight")
                    break

        # --- Features ---
        features = []
        feat_elem = soup.select_one(
            "[data-test-selector='productDetails_features'] li, "
            ".product-features li"
        )
        if feat_elem:
            feat_list = feat_elem.parent
            if feat_list:
                for li in feat_list.select("li"):
                    text = li.get_text(strip=True)
                    if text:
                        features.append(text)
        if features:
            product["features"] = features
            matched.append("features")

        # --- Ingredients ---
        ing_elem = soup.select_one(
            "[data-test-selector='productDetails_ingredients'], "
            ".product-ingredients"
        )
        if ing_elem:
            itext = ing_elem.get_text(strip=True)
            if itext:
                product["ingredients"] = itext
                matched.append("ingredients")

        if not product.get("name"):
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"No product name found for UPC {upc}"
            return result

        # Gather all potential identifier candidates
        identifier_candidates = [product.get("item_number"), product.get("upc")]
        
        # Extract potential item IDs from image URLs (e.g. 33011808_md.jpg)
        if product.get("image_urls"):
            for img_url in product["image_urls"]:
                filename = img_url.split("/")[-1]
                img_id_match = re.search(r"(\d+)", filename)
                if img_id_match:
                    identifier_candidates.append(img_id_match.group(1))

        # Also extract from productDetails_productId_ data-test-selector
        id_div = soup.select_one("[data-test-selector^='productDetails_productId_']")
        if id_div:
            sel = id_div.get("data-test-selector", "")
            match = re.search(r"productDetails_productId_(\d+)", sel)
            if match:
                val = match.group(1)
                if val != "0":
                    identifier_candidates.append(val)

        has_identifier = any(candidate for candidate in identifier_candidates)
        identifier_match, matched_identifiers = self._match_identifier_candidates(
            upc,
            *identifier_candidates,
        )
        if has_identifier and not identifier_match:
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = (
                f"Pet Food Experts identifier mismatch for searched UPC {upc}: "
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
        """Fallback regex extraction."""
        result = ApprovedSourceExtractionResult(
            source_slug=self.source_slug,
            source_type=self.source_type,
        )

        # Check for sign-in page (be specific to avoid false positives on product pages)
        if (html.count("sign in") > 3 and "#userName" in html) or "SignInPage" in html:
            result.success = False
            result.failure_code = FailureCode.AUTH_REQUIRED
            result.failure_message = f"Authentication required for Pet Food Experts (UPC {upc})"
            result.auth_required = True
            return result

        product: dict = {}

        title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
        if title_match:
            title = title_match.group(1).strip()
            if "search" not in title.lower():
                product["name"] = title

        if not product.get("name"):
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"No match for UPC {upc}"
            return result

        result.success = True
        result.product = product
        result.matched_fields = ["name"]
        result.confidence = 0.3
        return result

    def normalize_images(self, urls: list[str]) -> list[str]:
        """Apply Pet Food Experts image quality replacements.
        From legacy: _md -> _lg, _sm -> _lg, _thumbnail -> _lg
        """
        normalized = []
        for url in urls:
            url = re.sub(r"_md", "_lg", url)
            url = re.sub(r"_sm", "_lg", url)
            url = re.sub(r"_thumbnail", "_lg", url)
            normalized.append(url)
        return normalized
