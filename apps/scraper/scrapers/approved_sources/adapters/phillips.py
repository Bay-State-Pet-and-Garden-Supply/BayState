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
    ApprovedSourcePlanEntry,
    ApprovedSourcePlan,
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
        "?cartID=&operation=quickSearch&searchText={upc}"
        "&portalUser=&store=DefaultStore&cclcl=en_US"
    )
    requires_auth = True

    def __init__(self, entry: ApprovedSourcePlanEntry, plan: ApprovedSourcePlan):
        super().__init__(entry, plan)
        self._product_page_url: str | None = None

    def get_login_config_class(self):
        """Return the Phillips login config."""
        return PHILLIPS_LOGIN

    def build_search_url(self, upc: str) -> str:
        """Build the Phillips Salesforce Commerce Cloud quick search URL."""
        return self.search_url_template.format(upc=quote(str(upc), safe=""))

    def extract_from_html(
        self, html: str, upc: str, url: str
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
            result.failure_message = f"Authentication required for Phillips — received login page for UPC {upc}"
            result.auth_required = True
            return result

        try:
            from bs4 import BeautifulSoup
        except ImportError:
            return self._extract_with_regex(html, upc, url)

        soup = BeautifulSoup(html, "html.parser")

        # Salesforce search pages can include unrelated scanner/test rows before the
        # actual quick-search match. Build per-card candidates and rank them instead
        # of taking the first global .product-item-number/.product-upc nodes.
        expected_name = self._get_product_name() or ""
        expected_brand = self._get_brand() or ""

        def _normalize_text(value: str | None) -> str:
            return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()

        def _token_overlap(candidate: str | None, expected: str | None) -> float:
            candidate_tokens = {token for token in _normalize_text(candidate).split() if len(token) > 1}
            expected_tokens = {token for token in _normalize_text(expected).split() if len(token) > 1}
            if not candidate_tokens or not expected_tokens:
                return 0.0
            return len(candidate_tokens & expected_tokens) / max(len(expected_tokens), 1)

        def _extract_text(container, selector: str) -> str | None:
            node = container.select_one(selector)
            if not node:
                return None
            text = node.get_text(" ", strip=True)
            return text or None

        def _extract_images(container) -> list[str]:
            urls: list[str] = []
            for img in container.select(".cc_product_image img, img[src*='product']"):
                src = img.get("src") or img.get("data-src") or ""
                if not src:
                    continue
                if src.startswith("//"):
                    src = "https:" + src
                elif src.startswith("/"):
                    src = urljoin(self.base_url, src)
                urls.append(src)
            return urls

        candidate_containers = []
        seen_container_ids: set[int] = set()
        for selector in (
            "#plp-desktop-row",
            ".cc_row_product_info",
            ".scanner-results-product-container",
            ".scanner-results-product-container-mobile",
        ):
            for container in soup.select(selector):
                container_id = id(container)
                if container_id in seen_container_ids:
                    continue
                seen_container_ids.add(container_id)
                candidate_containers.append(container)

        candidates: list[dict] = []
        for container in candidate_containers:
            candidate_name = _extract_text(container, ".cc_product_name strong") or _extract_text(container, ".cc_product_name")
            candidate_brand = _extract_text(container, ".product-brand .branded")
            candidate_upc = _extract_text(container, ".product-upc .cc_value")
            candidate_item = _extract_text(container, ".product-item-number .cc_value")
            candidate_weight = _extract_text(container, ".product-weight .cc_value, .product-ship-weight .cc_value")
            candidate_desc = _extract_text(container, ".product-description, .cc_product_description")
            candidate_features = [li.get_text(" ", strip=True) for li in container.select(".product-features li, .cc_product_features li") if li.get_text(" ", strip=True)]
            candidate_images = _extract_images(container)

            # Find PDP URL
            product_link_node = container.select_one(".cc_product_name a, .cc_product_image a, a")
            candidate_pdp_url = None
            if product_link_node:
                href = product_link_node.get("href")
                if href and ("ProductDetails" in href or "sku=" in href):
                    candidate_pdp_url = urljoin(self.base_url, href)
            
            if not candidate_pdp_url and candidate_item:
                candidate_pdp_url = f"https://shop.phillipspet.com/ccrz__ProductDetails?sku={candidate_item}"

            if not any([candidate_name, candidate_brand, candidate_upc, candidate_item]):
                continue

            identifier_match, matched_identifiers = self._match_identifier_candidates(
                upc,
                candidate_item,
                candidate_upc,
            )
            brand_match = bool(expected_brand) and _normalize_text(expected_brand) in _normalize_text(candidate_brand)
            name_overlap = _token_overlap(candidate_name, expected_name)
            score = (100 if identifier_match else 0) + (20 if brand_match else 0) + int(name_overlap * 50)

            candidates.append({
                "name": candidate_name,
                "brand": candidate_brand,
                "upc": candidate_upc,
                "item_number": candidate_item,
                "weight": candidate_weight,
                "description": candidate_desc,
                "features": candidate_features,
                "image_urls": candidate_images,
                "pdp_url": candidate_pdp_url,
                "identifier_match": identifier_match,
                "matched_identifiers": matched_identifiers,
                "brand_match": brand_match,
                "name_overlap": name_overlap,
                "score": score,
            })

        if not candidates:
            empty_state = soup.select_one(".plp-empty-state-message-container h3")
            if empty_state:
                text = empty_state.get_text(strip=True).lower()
                if "no results" in text or "no products" in text or "no items" in text:
                    result.success = False
                    result.failure_code = FailureCode.NO_MATCH
                    result.failure_message = f"No match found for UPC {upc}"
                    return result

            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"No product match found for UPC {upc}"
            return result

        best_candidate = max(candidates, key=lambda candidate: candidate["score"])
        self._product_page_url = best_candidate.get("pdp_url")

        if best_candidate.get("name"):
            product["name"] = best_candidate["name"]
            matched.append("name")
        if best_candidate.get("brand"):
            product["brand"] = best_candidate["brand"]
            matched.append("brand")
        if best_candidate.get("upc"):
            product["upc"] = best_candidate["upc"]
            matched.append("upc")
        if best_candidate.get("item_number"):
            product["item_number"] = best_candidate["item_number"]
            matched.append("item_number")
        if best_candidate.get("image_urls"):
            product["image_urls"] = best_candidate["image_urls"]
            matched.append("image_urls")
        if best_candidate.get("weight"):
            product["weight"] = best_candidate["weight"]
            matched.append("weight")
        if best_candidate.get("description"):
            product["description"] = best_candidate["description"]
            matched.append("description")
        if best_candidate.get("features"):
            product["features"] = best_candidate["features"]
            matched.append("features")

        if not product.get("name"):
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"No product match found for UPC {upc}"
            return result

        heuristic_match = best_candidate["brand_match"] and best_candidate["name_overlap"] >= 0.45
        if best_candidate["identifier_match"]:
            matched_identifiers = best_candidate["matched_identifiers"]
            sku_match = True
        elif heuristic_match:
            matched_identifiers = []
            sku_match = False
            warnings.append(
                "Phillips result matched by brand/name heuristic after quick-search; exact identifier differed.",
            )
        else:
            identifier_candidates = [best_candidate.get("item_number"), best_candidate.get("upc")]
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = (
                f"Phillips identifier mismatch for searched UPC {upc}: "
                f"saw {', '.join(matched for matched in identifier_candidates if matched)}"
            )
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
        result.sku_match = sku_match
        result.warnings = warnings
        return result

    async def _post_process_extraction(
        self,
        det_result: ApprovedSourceExtractionResult,
        search_url: str,
        source_policy: Any,
    ) -> ApprovedSourceExtractionResult | None:
        """Fetch the product detail page to get high-res images and full metadata."""
        if not self._product_page_url:
            return det_result

        logger.info("[%s] Navigating to product details page for full metadata: %s", self.adapter_slug, self._product_page_url)
        
        try:
            # Fetch HTML using authenticated fetch
            html, auth_err = await self._fetch_html_authenticated(self._product_page_url, getattr(self, "api_client", None))
            if auth_err or not html:
                logger.warning("[%s] Failed to fetch product details page: %s", self.adapter_slug, auth_err)
                return det_result

            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, "html.parser")

            # Extract detailed description
            desc_node = soup.select_one(".cc_product_detail_description, .product-description, .cc_product_description, #product-description")
            if desc_node:
                desc = desc_node.get_text(" ", strip=True)
                if desc:
                    det_result.product["description"] = desc
                    if "description" not in det_result.matched_fields:
                        det_result.matched_fields.append("description")

            # Extract detailed features
            features = [
                li.get_text(" ", strip=True)
                for li in soup.select(".product-features li, .cc_product_features li, .cc_features li")
                if li.get_text(" ", strip=True)
            ]
            if features:
                det_result.product["features"] = features
                if "features" not in det_result.matched_fields:
                    det_result.matched_fields.append("features")

            # Extract high-res images from details page
            images = []
            for img in soup.select(".cc_product_detail_image img, img.cc_product_detail_image, .cc_product_image img, .cc_alternate_images img, .cc_alternate_image img"):
                src = img.get("src") or img.get("data-src") or ""
                if not src:
                    continue
                if src.startswith("//"):
                    src = "https:" + src
                elif src.startswith("/"):
                    src = urljoin(self.base_url, src)
                if src not in images:
                    images.append(src)

            # Fallback/broad scan for any images matching /products/ or bigcommerce/insitecloud/cloudfront
            for img in soup.select("img[src*='product'], img[src*='large']"):
                src = img.get("src") or img.get("data-src") or ""
                if src:
                    if src.startswith("//"):
                        src = "https:" + src
                    elif src.startswith("/"):
                        src = urljoin(self.base_url, src)
                    if src not in images:
                        images.append(src)

            if images:
                normalized_images = self.normalize_images(images)
                from scrapers.approved_sources.policy import filter_allowed_assets
                filtered_images = filter_allowed_assets(normalized_images, source_policy)
                if filtered_images:
                    det_result.product["image_urls"] = filtered_images
                    if "image_urls" not in det_result.matched_fields:
                        det_result.matched_fields.append("image_urls")
                    logger.info("[%s] Successfully enriched product images from PDP. Count: %d", self.adapter_slug, len(filtered_images))

        except Exception as e:
            logger.warning("[%s] Error during product details page post-processing: %s", self.adapter_slug, e)

        return det_result

    def _extract_with_regex(
        self, html: str, upc: str, url: str
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
            result.failure_message = f"Authentication required for Phillips (UPC {upc})"
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
            result.failure_message = f"No match for UPC {upc}"
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
