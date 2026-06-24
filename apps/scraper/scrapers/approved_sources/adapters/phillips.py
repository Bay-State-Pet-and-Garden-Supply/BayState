"""Phillips Pet Distributor Adapter.

Legacy config: legacy-scraper-archive/configs/phillips.yaml
Base URL: https://shop.phillipspet.com
Search: Salesforce Commerce Cloud quickSearch
Auth: LOGIN REQUIRED — returns AUTH_REQUIRED when no credentials
"""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import urljoin, quote

from scrapers.ai_search.enrichment_models import EnrichmentResultV1
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

            # Ignore Phillips' hidden scanner/template rows. They can contain
            # placeholder identifiers but no product name/brand, and should not
            # be allowed to win or synthesize a PDP URL.
            if not any([candidate_name, candidate_brand]):
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

    async def extract(self, extractor: Any = None) -> EnrichmentResultV1 | None:
        """Custom extraction for Phillips Pet using Playwright interactions to navigate to PDP.

        Performs:
        1. Authentication and login validation.
        2. Navigation to the search results page.
        3. Transition to the Product Details Page (PDP) via Playwright element click
           to maintain Single Page App (Backbone) session context.
        4. Waits specifically for client-side templates/selectors to render.
        5. Extracts details (description, specs, alternate images) from PDP.
        """
        from scrapers.approved_sources.result_builder import (
            build_auth_required_result,
            build_auth_failed_result,
            build_auth_expired_result,
            build_failed_result,
            build_no_match_result,
            build_partial_result,
            build_success_result,
        )
        from scrapers.approved_sources.auth import get_default_login_manager, resolve_credentials
        from scrapers.approved_sources.policy import validate_url_allowed

        upc = self._get_sku()
        api_client = getattr(extractor, "api_client", None) if extractor else None
        self.api_client = api_client

        # 1. Build search URL
        search_url = self.build_search_url(upc)
        logger.info("[%s] Searching: %s", self.adapter_slug, search_url)

        # 2. Credential check
        cred_ok, cred_msg = self.check_credentials(api_client)
        if not cred_ok:
            logger.info("[%s] Auth required for %s: %s", self.adapter_slug, upc, cred_msg)
            return build_auth_required_result(
                upc=upc,
                source_slug=self.source_slug,
                message=cred_msg,
                evidence_url=search_url,
            )

        # 3. Validate URL against policy
        source_policy = self.plan.sourcePolicy
        url_ok, url_err = validate_url_allowed(search_url, source_policy)
        if not url_ok:
            logger.warning("[%s] URL blocked by policy: %s", self.adapter_slug, url_err)
            from scrapers.approved_sources.result_builder import build_policy_blocked_result
            return build_policy_blocked_result(
                upc=upc,
                source_slug=self.source_slug,
                blocked_url=search_url,
                reason=f"Search URL blocked: {url_err}",
            )

        # 4. Resolve credentials
        credential_ref = self.entry.credentialRef or self.source_slug
        creds = resolve_credentials(self.source_slug, api_client, credential_ref)
        if creds is None:
            return build_auth_required_result(
                upc=upc,
                source_slug=self.source_slug,
                evidence_url=search_url,
            )

        # 5. Ensure logged-in session via LoginManager
        login_manager = get_default_login_manager()
        login_result = await login_manager.ensure_logged_in(
            source_slug=self.source_slug,
            login_config=self.get_login_config_class(),
            api_client=api_client,
            credential_ref=credential_ref,
        )

        if not login_result.success:
            logger.warning("[%s] Login failed: %s", self.adapter_slug, login_result.error_message)
            if login_result.failure_type == "AUTH_FAILED":
                return build_auth_failed_result(upc=upc, source_slug=self.source_slug, evidence_url=search_url)
            elif login_result.failure_type == "AUTH_EXPIRED":
                return build_auth_expired_result(upc=upc, source_slug=self.source_slug, evidence_url=search_url)
            else:
                return build_failed_result(
                    upc=upc,
                    source_slug=self.source_slug,
                    error_message=login_result.error_message or "Login failed",
                    evidence_url=search_url,
                )

        # Create session page
        page = await login_manager.create_session_page(login_result.session_id)
        if not page:
            return build_failed_result(
                upc=upc,
                source_slug=self.source_slug,
                error_message="Failed to create authenticated page",
                evidence_url=search_url,
            )

        try:
            # 6. Navigate to search URL
            await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
            
            # Dismiss overlay elements (e.g. Attentive SMS popup) if already present in the DOM
            try:
                await page.evaluate("""() => {
                    for (const id of ['attentive_overlay', 'attentive_creative']) {
                        const el = document.getElementById(id);
                        if (el) el.remove();
                    }
                }""")
            except Exception as overlay_err:
                logger.debug("[%s] Error removing overlay elements: %s", self.adapter_slug, overlay_err)

            # Wait for the *rendered* quick-search result, not merely attached
            # templates. Phillips keeps hidden scanner template rows in the DOM
            # (e.g. item #100122 / UPC 128937128937) before Backbone finishes
            # hydrating the real PLP. Parsing immediately causes false no-match
            # results and navigation to the wrong PDP.
            try:
                await page.wait_for_function(
                    """(searchedUpc) => {
                        const bodyText = document.body?.innerText || '';
                        if (/sorry,? no results were found|no results were found|no products/i.test(bodyText)) {
                            return true;
                        }

                        const isVisible = (el) => !!(
                            el.offsetWidth || el.offsetHeight || el.getClientRects().length
                        );
                        const rows = Array.from(document.querySelectorAll(
                            '#plp-desktop-row, .cc_row_product_info'
                        ));
                        return rows.some((row) => isVisible(row) && row.innerText.includes(searchedUpc));
                    }""",
                    arg=upc,
                    timeout=20000,
                )
            except Exception as e:
                logger.warning("[%s] Timeout waiting for rendered Phillips search results: %s", self.adapter_slug, e)

            try:
                await page.wait_for_load_state("networkidle", timeout=5000)
            except Exception:
                pass

            search_html = await page.content()
            det_result = self.extract_from_html(search_html, upc, search_url)

            if not det_result.success:
                if det_result.failure_code == FailureCode.NO_MATCH:
                    return build_no_match_result(upc=upc, source_slug=self.source_slug, evidence_url=search_url)
                return build_failed_result(
                    upc=upc,
                    source_slug=self.source_slug,
                    error_message=det_result.failure_message or "Extraction failed",
                    evidence_url=search_url,
                )

            # 7. Navigate to Product Details Page (PDP)
            if self._product_page_url:
                logger.info("[%s] Navigating to product details page: %s", self.adapter_slug, self._product_page_url)
                
                # Check if we can find a product link to click and transition inside Backbone SPA
                product_link_selector = ".cc_product_name a, .cc_product_image a, #plp-desktop-row a, .cc_row_product_info a"
                link_clicked = False
                try:
                    # Dismiss overlays that intercept clicks
                    await page.evaluate("""() => {
                        for (const id of ['attentive_overlay', 'attentive_creative']) {
                            const el = document.getElementById(id);
                            if (el) el.remove();
                        }
                    }""")
                    link_element = await page.query_selector(product_link_selector)
                    if link_element:
                        # Use force=True to bypass pointer-interception checks and set a shorter timeout
                        await link_element.click(force=True, timeout=5000)
                        link_clicked = True
                        logger.info("[%s] Clicked product details link successfully", self.adapter_slug)
                except Exception as click_err:
                    logger.warning("[%s] Link click failed, falling back to direct navigation: %s", self.adapter_slug, click_err)

                if not link_clicked:
                    await page.goto(self._product_page_url, wait_until="domcontentloaded", timeout=30000)

                # Wait for PDP selectors to render
                pdp_selectors = [
                    ".cc_product_detail_description",
                    ".product-description",
                    ".cc_product_description",
                    ".product-brand",
                    ".product-item-number"
                ]
                pdp_combined = ", ".join(pdp_selectors)
                try:
                    # Use state="attached" to avoid timeouts if elements are present but hidden/obscured
                    await page.wait_for_selector(pdp_combined, state="attached", timeout=15000)
                except Exception as pdp_wait_err:
                    logger.warning("[%s] Timeout waiting for PDP elements to render: %s", self.adapter_slug, pdp_wait_err)

                pdp_html = await page.content()
                det_result = self._enrich_from_pdp_html(det_result, pdp_html, self._product_page_url, source_policy)

            # 8. Post-process images (normalize and filter)
            if det_result.success and det_result.product.get("image_urls"):
                raw_images = self.normalize_images(det_result.product["image_urls"])
                det_result.product["image_urls"] = self.filter_images(raw_images, source_policy)

            # 9. Download login-protected images
            if det_result.success and det_result.product.get("image_urls"):
                try:
                    from scrapers.approved_sources.image_capture import capture_images_authenticated
                    logger.info("[%s] Capturing %d authenticated images...", self.adapter_slug, len(det_result.product["image_urls"]))
                    captured = await capture_images_authenticated(page, det_result.product["image_urls"])
                    det_result.product["image_urls"] = captured
                except Exception as img_err:
                    logger.error("[%s] Authenticated image capture failed: %s", self.adapter_slug, img_err)
                    det_result.product["image_urls"] = [
                        {
                            "status": "error",
                            "error_type": "unknown",
                            "error_message": f"Authenticated image capture failed: {img_err}",
                            "original_url": url,
                        }
                        for url in det_result.product.get("image_urls", [])
                        if isinstance(url, str) and url
                    ]

            # 10. Filter allowed fields
            if det_result.success and self.entry.allowedFields:
                allowed = set(self.entry.allowedFields)
                if 'images' in allowed:
                    allowed.add('image_urls')
                det_result.product = {
                    k: v
                    for k, v in det_result.product.items()
                    if k in allowed
                }

            # 11. Build and return final EnrichmentResultV1
            evidence_url = det_result.evidence_url or search_url
            if det_result.success:
                confidence = det_result.confidence or 0.75
                matched = det_result.matched_fields or list(det_result.product.keys())
                warnings = list(det_result.warnings or [])
                missing_required: list[str] = []

                resolved_sku_match = det_result.sku_match
                if self.source_type == "distributor":
                    if resolved_sku_match is not False:
                        confidence = 1.0
                        resolved_sku_match = True

                heuristic_warning = any("heuristic" in warning.lower() for warning in warnings)

                if resolved_sku_match is not True:
                    missing_required.append("sku_match")
                    if resolved_sku_match is False:
                        if not heuristic_warning:
                            warnings.append(
                                "Returned product page did not deterministically verify the searched UPC.",
                            )
                        confidence = min(confidence, 0.69 if heuristic_warning else 0.59)
                    else:
                        warnings.append(
                            "No deterministic UPC/UPC/item identifier was available on the returned product page.",
                        )
                        confidence = min(confidence, 0.59)

                if confidence >= 0.7 and resolved_sku_match is True:
                    return build_success_result(
                        upc=upc,
                        source_slug=self.source_slug,
                        source_type=self.source_type,
                        evidence_url=evidence_url,
                        product_fields=det_result.product,
                        matched_fields=matched,
                        overall_confidence=confidence,
                        warnings=warnings,
                        sku_match=True,
                    )

                return build_partial_result(
                    upc=upc,
                    source_slug=self.source_slug,
                    source_type=self.source_type,
                    evidence_url=evidence_url,
                    product_fields=det_result.product,
                    matched_fields=matched,
                    overall_confidence=confidence,
                    warnings=warnings,
                    missing_required=missing_required,
                    sku_match=resolved_sku_match is True,
                )
            else:
                return build_failed_result(
                    upc=upc,
                    source_slug=self.source_slug,
                    error_message=det_result.failure_message or "Extraction failed",
                    evidence_url=evidence_url,
                )

        except Exception as exc:
            logger.error("[%s] PhillipsAdapter extraction failed: %s", self.adapter_slug, exc)
            return build_failed_result(
                upc=upc,
                source_slug=self.source_slug,
                error_message=f"Extraction exception: {exc}",
                evidence_url=search_url,
            )
        finally:
            try:
                await page.close()
            except Exception as close_err:
                logger.warning("[%s] Failed to close page: %s", self.adapter_slug, close_err)

    def _enrich_from_pdp_html(
        self,
        det_result: ApprovedSourceExtractionResult,
        html: str,
        pdp_url: str,
        source_policy: Any,
    ) -> ApprovedSourceExtractionResult:
        """Enrich extracted data from PDP HTML.

        Extracts: description, features, images, weight, dimensions, UPC,
        pet facets (animal_type, food_form, flavor, life_stage, breed_size,
        primary_protein, diet_type), and category breadcrumb.
        """
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        
        # Override evidence URL to point to the actual PDP URL
        det_result.evidence_url = pdp_url

        # --- Detailed description ---
        desc_node = soup.select_one(".cc_product_detail_description, .product-description, .cc_product_description, #product-description")
        if desc_node:
            desc = desc_node.get_text(" ", strip=True)
            if desc:
                det_result.product["description"] = desc
                if "description" not in det_result.matched_fields:
                    det_result.matched_fields.append("description")

        # --- Detailed features ---
        features = [
            li.get_text(" ", strip=True)
            for li in soup.select(".product-features li, .cc_product_features li, .cc_features li")
            if li.get_text(" ", strip=True)
        ]
        if features:
            det_result.product["features"] = features
            if "features" not in det_result.matched_fields:
                det_result.matched_fields.append("features")

        # --- Weight from PDP spec labels ---
        spec_text = soup.get_text(" ", strip=True)
        weight_labels = [r"Weight:\s*(.+?)(?:\s{2,}|$)", r"Ship Weight:\s*(.+?)(?:\s{2,}|$)"]
        for pattern in weight_labels:
            match = re.search(pattern, spec_text, re.IGNORECASE)
            if match:
                val = match.group(1).strip()
                if val and val.lower() not in ("n/a", "none", ""):
                    det_result.product["weight"] = val
                    if "weight" not in det_result.matched_fields:
                        det_result.matched_fields.append("weight")
                    break

        # --- Dimensions from PDP spec labels ---
        dim_match = re.search(r"Dimensions?:\s*(.+?)(?:\s{2,}|$)", spec_text, re.IGNORECASE)
        if dim_match:
            val = dim_match.group(1).strip()
            if val:
                det_result.product["dimensions"] = val
                if "dimensions" not in det_result.matched_fields:
                    det_result.matched_fields.append("dimensions")

        # --- UPC from PDP ---
        upc_match = re.search(r"UPC:\s*(\d{8,14})", spec_text, re.IGNORECASE)
        if upc_match and "upc" not in det_result.product:
            det_result.product["upc"] = upc_match.group(1).strip()
            if "upc" not in det_result.matched_fields:
                det_result.matched_fields.append("upc")

        # --- Pet facets from labeled specs on PDP ---
        facet_spec_labels = {
            "animal_type": r"Animal\s*Type:\s*(.+?)(?:\s{2,}|$)",
            "life_stage": r"Life\s*Stage:\s*(.+?)(?:\s{2,}|$)",
            "breed_size": r"Breed\s*Size:\s*(.+?)(?:\s{2,}|$)",
            "food_form": r"Food\s*Form:\s*(.+?)(?:\s{2,}|$)",
            "flavor": r"Flavor:\s*(.+?)(?:\s{2,}|$)",
            "primary_protein": r"(?:Primary\s*)?Protein:\s*(.+?)(?:\s{2,}|$)",
        }
        for facet_key, pattern in facet_spec_labels.items():
            match = re.search(pattern, spec_text, re.IGNORECASE)
            if match:
                val = match.group(1).strip()
                if val and val.lower() not in ("n/a", "none", ""):
                    det_result.product[facet_key] = val
                    if facet_key not in det_result.matched_fields:
                        det_result.matched_fields.append(facet_key)

        # --- Textual facet fallback from product name + description ---
        name_desc = f"{det_result.product.get('name', '')} {det_result.product.get('description', '')}"
        text_facets = self._extract_textual_facets(name_desc)
        for key, value in text_facets.items():
            if key not in det_result.product:
                det_result.product[key] = value
                if key not in det_result.matched_fields:
                    det_result.matched_fields.append(key)

        # --- Category / Breadcrumb ---
        breadcrumb = self._extract_breadcrumb(soup)
        if breadcrumb:
            det_result.product["category"] = breadcrumb
            if "category" not in det_result.matched_fields:
                det_result.matched_fields.append("category")

        # Extract high-res images from details page. Phillips' real PDP image is
        # currently emitted as <img class="mainProdImage prodDetail" src="...cloudfront.../{item}.jpg">.
        # The page also keeps hidden scanner templates with unrelated placeholder
        # images, so prefer URLs/classes tied to the matched item/UPC.
        images = []
        product_identifiers = {
            str(value).strip()
            for value in (
                det_result.product.get("item_number"),
                det_result.product.get("upc"),
            )
            if value
        }

        def _normalize_src(src: str) -> str:
            if src.startswith("//"):
                return "https:" + src
            if src.startswith("/"):
                return urljoin(self.base_url, src)
            return src

        def _is_relevant_image(src: str, class_text: str) -> bool:
            if not src:
                return False
            lowered = src.lower()
            classes = class_text.lower()
            if "ccrz__productdetails" in lowered:
                return False
            if "category-thumbnail" in classes or "promo-banner" in classes:
                return False
            if "mainprodimage" in classes or "proddetail" in classes:
                return True
            if product_identifiers and any(identifier in src for identifier in product_identifiers):
                return True
            return False

        image_selectors = (
            ".mainProdImage, img.prodDetail, .prodDetail img, "
            ".cc_product_detail_image img, img.cc_product_detail_image, "
            ".cc_product_image img, .cc_alternate_images img, .cc_alternate_image img, "
            "img[src*='d56ygyjv466yj.cloudfront.net'], img[src*='cloudfront.net'], "
            "img[src*='/products/'], img[src*='large']"
        )
        for img in soup.select(image_selectors):
            src = _normalize_src(img.get("src") or img.get("data-src") or "")
            class_text = " ".join(img.get("class") or [])
            if _is_relevant_image(src, class_text) and src not in images:
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

        return det_result

    async def _post_process_extraction(
        self,
        det_result: ApprovedSourceExtractionResult,
        search_url: str,
        source_policy: Any,
    ) -> ApprovedSourceExtractionResult | None:
        """Fetch the product detail page to get high-res images and full metadata.

        Note: This is retained for base class compatibility and unit testing.
        """
        if not self._product_page_url:
            return det_result

        logger.info("[%s] Navigating to product details page for full metadata: %s", self.adapter_slug, self._product_page_url)
        
        try:
            # Fetch HTML using authenticated fetch
            html, auth_err = await self._fetch_html_authenticated(self._product_page_url, getattr(self, "api_client", None))
            if auth_err or not html:
                logger.warning("[%s] Failed to fetch product details page: %s", self.adapter_slug, auth_err)
                return det_result

            return self._enrich_from_pdp_html(det_result, html, self._product_page_url, source_policy)

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

        Phillips product images are served from d56ygyjv466yj.cloudfront.net.
        Do not rewrite that CDN to shop.phillipspet.com/images/products: those
        URLs return HTML/404 and the downstream capture step drops them. For CDN
        thumbs, prefer the root ``/{item}.jpg`` asset, which is the actual PDP
        image; keep the original CDN host so policy/capture can fetch it.
        """
        normalized = []
        for url in urls:
            if not url:
                continue

            url = url.replace("http://d56ygyjv466yj.cloudfront.net/", "https://d56ygyjv466yj.cloudfront.net/")
            url = re.sub(
                r"https://d56ygyjv466yj\.cloudfront\.net/thumb/([^/_]+)_t\.jpg$",
                r"https://d56ygyjv466yj.cloudfront.net/\1.jpg",
                url,
            )

            if "d56ygyjv466yj.cloudfront.net" not in url:
                url = re.sub(r"/thumb/", "/large/", url)
                url = re.sub(r"_thumb", "_large", url)
            normalized.append(url)
        return normalized
