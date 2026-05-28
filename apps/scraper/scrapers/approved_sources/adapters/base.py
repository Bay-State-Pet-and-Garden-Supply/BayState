"""Base classes for Approved Source adapters.

Provides:
- ApprovedSourceAdapter: abstract base for all adapters
- BaseDistributorCrawl4AIAdapter: shared implementation for distributor extraction
"""

from __future__ import annotations

import asyncio
import logging
import re
from abc import ABC, abstractmethod
from typing import Any

from scrapers.approved_sources.types import (
    ApprovedSourceExtractionResult,
    ApprovedSourcePlanEntry,
    ApprovedSourcePlan,
    FailureCode,
)
from scrapers.ai_search.enrichment_models import EnrichmentResultV1
from scrapers.approved_sources.auth import (
    get_default_login_manager,
    resolve_credentials,
)
import httpx

logger = logging.getLogger(__name__)

_IDENTIFIER_RE = re.compile(r"[^A-Z0-9]+")

_shared_browser_engine = None
_shared_browser_engine_lock = asyncio.Lock()


async def get_shared_browser_engine():
    global _shared_browser_engine
    if _shared_browser_engine is None:
        async with _shared_browser_engine_lock:
            if _shared_browser_engine is None:
                from src.crawl4ai_engine.engine import Crawl4AIEngine
                engine_config = {
                    "browser": {
                        "headless": True,
                        "viewport_width": 1280,
                        "viewport_height": 800,
                        "light_mode": True,
                        "enable_stealth": True,
                    },
                    "crawler": {
                        "page_timeout": 30000,
                        "delay_before_return_html": 1000,
                        "remove_overlay_elements": True,
                    },
                }
                engine = Crawl4AIEngine(engine_config)
                await engine.initialize()
                _shared_browser_engine = engine
    return _shared_browser_engine


class ApprovedSourceAdapter(ABC):
    """Abstract base class for source-specific extraction adapters."""

    def __init__(self, entry: ApprovedSourcePlanEntry, plan: ApprovedSourcePlan):
        self.entry = entry
        self.plan = plan

    @abstractmethod
    async def extract(self, extractor: Any) -> EnrichmentResultV1 | None:
        """Execute extraction for this source.

        Args:
            extractor: The ProductPageExtractor or equivalent crawler engine.

        Returns:
            An EnrichmentResultV1 if successful, or None if extraction failed
            or no match was found. The caller (executor) must handle None.
        """
        pass

    def _get_sku(self) -> str:
        """Get the UPC from the plan."""
        return self.plan.upc

    def _get_brand(self) -> str | None:
        """Get the brand name from the plan."""
        if self.plan.brand:
            return self.plan.brand.name
        return None

    def _get_product_name(self) -> str | None:
        """Get the product name from the plan input."""
        return self.plan.input.get("name") if self.plan.input else None


class BaseDistributorCrawl4AIAdapter(ApprovedSourceAdapter):
    """Shared base for Crawl4AI distributor adapters.

    Subclasses implement:
    - build_search_url(upc) -> str
    - extract_from_html(html, upc) -> ApprovedSourceExtractionResult (deterministic)
    - search_patterns_workflow() -> additional search/navigation hints

    The main extract() method handles:
    1. Credential check (if requiresAuth)
    2. Build search URL
    3. Crawl via extractor
    4. Deterministic extraction from HTML
    5. Field filtering by allowedFields
    6. Image normalization and policy filtering
    7. Return EnrichmentResultV1
    """

    # Subclass metadata
    adapter_slug: str = ""
    source_slug: str = ""
    source_type: str = "distributor"
    base_url: str = ""
    search_url_template: str = ""
    requires_auth: bool = False

    def __init__(self, entry: ApprovedSourcePlanEntry, plan: ApprovedSourcePlan):
        super().__init__(entry, plan)
        self._override_from_entry()

    def _override_from_entry(self) -> None:
        """Allow entry-level override of adapter defaults."""
        if self.entry.adapterSlug:
            self.adapter_slug = self.entry.adapterSlug
        if self.entry.sourceSlug:
            self.source_slug = self.entry.sourceSlug
        if self.entry.requiresAuth:
            self.requires_auth = True

    @staticmethod
    def _normalize_identifier(value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = _IDENTIFIER_RE.sub("", value.strip().upper())
        if cleaned:
            for suffix in ("UNIT", "CASE", "CS", "BOX", "BX", "EACH", "EA", "PACK", "PK", "PKG"):
                if cleaned.endswith(suffix) and len(cleaned) > len(suffix):
                    cleaned = cleaned[:-len(suffix)]
                    break
        return cleaned or None

    def _match_identifier_candidates(
        self,
        upc: str,
        *candidates: str | None,
    ) -> tuple[bool, list[str]]:
        normalized_sku = self._normalize_identifier(upc)
        if not normalized_sku:
            return False, []

        matches: list[str] = []
        for candidate in candidates:
            normalized_candidate = self._normalize_identifier(candidate)
            if normalized_candidate and normalized_candidate == normalized_sku:
                matches.append(candidate or "")

        return len(matches) > 0, matches

    @abstractmethod
    def build_search_url(self, upc: str) -> str:
        """Build the URL to search for a product by UPC."""
        pass

    @abstractmethod
    def extract_from_html(
        self, html: str, upc: str, url: str
    ) -> ApprovedSourceExtractionResult:
        """Extract product data from HTML using legacy-distilled selectors.

        Returns an ApprovedSourceExtractionResult with success=True and
        populated product dict, or success=False and failure_code set.
        """
        pass

    def normalize_images(self, urls: list[str]) -> list[str]:
        """Apply image quality replacements from legacy configs.

        Override in subclass for distributor-specific patterns.
        Default: no transformation.
        """
        return list(urls)

    def check_credentials(
        self, api_client: Any | None
    ) -> tuple[bool, str | None]:
        """Check if credentials are available for auth-gated distributors.

        Returns (available, credential_ref_or_message).
        If no auth needed or credentials found, returns (True, None).
        If auth needed but no credentials, returns (False, message).

        api_client.get_credentials() is synchronous. We call it directly.
        """
        if not self.requires_auth:
            return True, None

        # Check from entry credentialRef
        credential_ref = self.entry.credentialRef or self.source_slug

        # Try api_client first
        if api_client and hasattr(api_client, "get_credentials"):
            try:
                creds = api_client.get_credentials(credential_ref)
                if creds:
                    return True, credential_ref
            except Exception as e:
                logger.warning("[%s] Credential check via api_client failed: %s", self.adapter_slug, e)

        # Fallback: check environment variables via resolve_credentials
        from scrapers.approved_sources.auth import resolve_credentials
        env_creds = resolve_credentials(self.source_slug, None, credential_ref)
        if env_creds:
            return True, credential_ref

        return False, f"AUTH_REQUIRED: Authentication required for {self.source_slug}: no credentials found for '{credential_ref}' in api_client or environment"

    def filter_images(
        self, urls: list[str], policy: Any
    ) -> list[str]:
        """Filter image URLs through the source policy.

        Imports policy inline to avoid circular imports.
        """
        from scrapers.approved_sources.policy import filter_allowed_assets

        return filter_allowed_assets(urls, policy)

    def get_login_config_class(self):
        """Get the login config for this adapter.

        Override in auth-required subclasses to return the LoginAutomationConfig.
        Base implementation returns None (no login needed).
        """
        return None

    async def _fetch_html_authenticated(
        self,
        url: str,
        api_client: Any | None = None,
    ) -> tuple[str | None, str | None]:
        """Fetch HTML using authenticated Crawl4AI session.

        For auth-gated distributors, this method:
        1. Gets the login config for this adapter
        2. Resolves credentials
        3. Ensures logged-in session via LoginManager
        4. Uses Crawl4AI with the authenticated session to fetch the URL
        5. Returns (html, None) on success, or (None, error_message) on failure

        Returns:
            (html, None) on success.
            (None, "AUTH_REQUIRED") if no credentials available.
            (None, "AUTH_FAILED") if login fails.
            (None, "AUTH_EXPIRED") if session expired and re-login failed.
            (None, error_message) on other failures.
        """
        login_config = self.get_login_config_class()
        if login_config is None:
            # Fall back to public fetch if no login config
            html = await self._fetch_html(url)
            return html, None

        credential_ref = self.entry.credentialRef or self.source_slug

        # Check credentials are available
        creds = resolve_credentials(self.source_slug, api_client, credential_ref)
        if creds is None:
            logger.info(
                "[%s] No credentials for authenticated fetch",
                self.adapter_slug,
            )
            return None, "AUTH_REQUIRED"

        # Ensure logged-in session via LoginManager
        login_manager = get_default_login_manager()
        login_result = await login_manager.ensure_logged_in(
            source_slug=self.source_slug,
            login_config=login_config,
            api_client=api_client,
            credential_ref=credential_ref,
        )

        if not login_result.success:
            logger.warning(
                "[%s] Login failed: %s",
                self.adapter_slug,
                login_result.error_message,
            )
            return None, login_result.failure_type or "AUTH_FAILED"

        # Fetch using the authenticated Playwright page from the login manager.
        # The login manager keeps the page alive for subsequent fetches.
        try:
            html = await login_manager.fetch_authenticated_html(
                login_result.session_id, url
            )
            if html:
                return html, None
            return None, "EXTRACTION_FAILED: Authenticated fetch returned empty HTML"

        except Exception as e:
            logger.error(
                "[%s] Authenticated fetch error for %s: %s",
                self.adapter_slug, url, e,
            )
            return None, f"EXTRACTION_FAILED: {e}"

    async def _post_process_extraction(
        self,
        det_result: ApprovedSourceExtractionResult,
        search_url: str,
        source_policy: Any,
    ) -> ApprovedSourceExtractionResult | None:
        """Post-process extraction to enrich images. Override in subclasses."""
        return None

    async def extract(self, extractor: Any = None) -> EnrichmentResultV1 | None:
        """Execute distributor extraction by fetching HTML directly and parsing.

        Distributor adapters do NOT use ProductPageExtractor for extraction.
        Instead, they:
        1. Check auth - if no credentials, return AUTH_REQUIRED
        2. Build search URL from UPC
        3a. For public distributors: Fetch HTML directly via httpx
        3b. For auth-required distributors: Fetch HTML via authenticated Crawl4AI
        4. Parse HTML deterministically with BeautifulSoup
        5. Filter images through policy
        6. Build and return EnrichmentResultV1

        The extractor argument is accepted for API compatibility but distributor
        adapters handle their own HTTP fetching.
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

        upc = self._get_sku()

        # Extract api_client from extractor or executor
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
        from scrapers.approved_sources.policy import validate_url_allowed

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

        # 4. Fetch HTML
        html = None
        auth_error = None
        if self.requires_auth:
            # Use authenticated fetch for auth-gated distributors
            html, auth_error = await self._fetch_html_authenticated(search_url, api_client)
            if auth_error:
                logger.info(
                    "[%s] Auth result for %s: %s",
                    self.adapter_slug, upc, auth_error,
                )
                if auth_error == "AUTH_REQUIRED":
                    return build_auth_required_result(
                        upc=upc,
                        source_slug=self.source_slug,
                        evidence_url=search_url,
                    )
                elif auth_error == "AUTH_FAILED":
                    return build_auth_failed_result(
                        upc=upc,
                        source_slug=self.source_slug,
                        evidence_url=search_url,
                    )
                elif auth_error == "AUTH_EXPIRED":
                    return build_auth_expired_result(
                        upc=upc,
                        source_slug=self.source_slug,
                        evidence_url=search_url,
                    )
                else:
                    return build_failed_result(
                        upc=upc,
                        source_slug=self.source_slug,
                        error_message=auth_error,
                        evidence_url=search_url,
                    )
        else:
            # Public fetch for no-auth distributors
            html = await self._fetch_html(search_url)

            # Check if HTML needs JS rendering (skeleton loaders, Angular templates)
            if html and self._needs_js_rendering(html):
                logger.info(
                    "[%s] HTML appears JS-rendered, trying browser fallback for %s",
                    self.adapter_slug, search_url,
                )
                browser_html = await self._fetch_html_with_browser(search_url)
                if browser_html:
                    html = browser_html
                else:
                    logger.warning(
                        "[%s] Browser fallback failed, using httpx result",
                        self.adapter_slug,
                    )

        if not html:
            logger.warning(
                "[%s] Failed to fetch HTML for %s", self.adapter_slug, search_url
            )
            return build_no_match_result(
                upc=upc,
                source_slug=self.source_slug,
                evidence_url=search_url,
            )

        # 5. Parse HTML deterministically
        det_result = self.extract_from_html(html, upc, search_url)

        if det_result.success and det_result.sku_match is None:
            generic_identifier_candidates = [
                det_result.product.get("upc"),
                det_result.product.get("upc"),
                det_result.product.get("item_number"),
                det_result.product.get("model_number"),
                det_result.product.get("manufacturer_number"),
                det_result.product.get("bci_item_number"),
            ]
            has_generic_identifiers = any(candidate for candidate in generic_identifier_candidates)
            matched_identifier, _ = self._match_identifier_candidates(
                upc,
                *generic_identifier_candidates,
            )
            if has_generic_identifiers:
                det_result.sku_match = matched_identifier

        # 6. Process and filter images
        if det_result.success and det_result.product.get("image_urls"):
            raw_images = self.normalize_images(det_result.product["image_urls"])
            det_result.product["image_urls"] = self.filter_images(raw_images, source_policy)

        # 6b. Post-process: allow adapters to enrich results (e.g., fetch product page images)
        if det_result.success:
            post_processed = await self._post_process_extraction(det_result, search_url, source_policy)
            if post_processed:
                det_result = post_processed

        # 6c. Download login-protected images if needed
        if det_result.success and self.requires_auth and det_result.product.get("image_urls"):
            login_config = self.get_login_config_class()
            if login_config:
                credential_ref = self.entry.credentialRef or self.source_slug
                login_manager = get_default_login_manager()
                session_id = login_manager._get_stable_session_id(self.source_slug, credential_ref)
                page = await login_manager.create_session_page(session_id)
                if page:
                    try:
                        from scrapers.approved_sources.image_capture import capture_images_authenticated
                        logger.info("[%s] Capturing %d authenticated images...", self.adapter_slug, len(det_result.product["image_urls"]))
                        captured = await capture_images_authenticated(page, det_result.product["image_urls"])
                        det_result.product["image_urls"] = captured
                    except Exception as e:
                        logger.error("[%s] Failed to capture authenticated images: %s", self.adapter_slug, e)
                    finally:
                        try:
                            await page.close()
                        except Exception as close_err:
                            logger.warning("[%s] Failed to close page after image capture: %s", self.adapter_slug, close_err)
                else:
                    logger.warning("[%s] No active Playwright page available for authenticated image capture", self.adapter_slug)

        # 7. Apply allowedFields filter
        if det_result.success and self.entry.allowedFields:
            # Map 'images' to 'image_urls' for field matching
            allowed = set(self.entry.allowedFields)
            if 'images' in allowed:
                allowed.add('image_urls')
            det_result.product = {
                k: v
                for k, v in det_result.product.items()
                if k in allowed
            }

        # 8. Build final EnrichmentResultV1
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
        elif det_result.failure_code == FailureCode.NO_MATCH:
            return build_no_match_result(
                upc=upc,
                source_slug=self.source_slug,
                evidence_url=evidence_url,
            )
        else:
            return build_failed_result(
                upc=upc,
                source_slug=self.source_slug,
                error_message=det_result.failure_message or "Extraction failed",
                evidence_url=evidence_url,
            )

    async def _fetch_html(self, url: str) -> str | None:
        """Fetch HTML from a URL using httpx.

        Uses a short timeout and simple headers. Returns the HTML text
        or None if the request fails or returns a non-OK status.
        """
        try:
            async with httpx.AsyncClient(
                timeout=30.0,
                follow_redirects=True,
                headers={
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                                  "Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                },
            ) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    return response.text
                else:
                    logger.warning(
                        "[%s] HTTP %d fetching %s",
                        self.adapter_slug, response.status_code, url,
                    )
                    return None
        except Exception as e:
            logger.warning(
                "[%s] Error fetching %s: %s",
                self.adapter_slug, url, e,
            )
            return None

    def _needs_js_rendering(self, html: str) -> bool:
        """Detect if HTML appears to be a JS-rendered shell without product data.

        Checks for common indicators:
        - Skeleton loaders (CSS class patterns)
        - Angular/Vue/React template placeholders ({{ }})
        - "Loading..." text in product areas
        - Empty product containers
        """
        indicators = [
            'skeleton',
            '{{product.',
            '{{vm.',
            'Loading...',
            'animate-pulse',
            'Loading...',
        ]
        html_lower = html.lower()
        count = sum(1 for ind in indicators if ind.lower() in html_lower)
        # If 2+ indicators present, likely JS-rendered
        return count >= 2

    async def _fetch_html_with_browser(self, url: str) -> str | None:
        """Fetch HTML using Crawl4AI headless browser for JS-rendered sites.

        Falls back gracefully if Crawl4AI is not available.
        Uses a short page timeout to avoid blocking too long.
        """
        try:
            from crawl4ai import CrawlerRunConfig, CacheMode

            engine = await get_shared_browser_engine()
            if not engine:
                logger.warning("[%s] Crawl4AI engine is not available for browser fetch", self.adapter_slug)
                return None

            run_config = CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                page_timeout=30000,
                wait_until="networkidle",
                remove_overlay_elements=True,
                simulate_user=True,
                magic=True,
                override_navigator=True,
            )

            result = await engine.crawler.arun(url=url, config=run_config)

            if result and getattr(result, "success", False):
                html = getattr(result, "html", None) or ""
                if html:
                    logger.info(
                        "[%s] Browser fetch succeeded for %s (%d chars)",
                        self.adapter_slug, url, len(html),
                    )
                    return html
            return None
        except ImportError:
            logger.debug("[%s] Crawl4AI not available for browser fetch", self.adapter_slug)
            return None
        except Exception as e:
            logger.warning("[%s] Browser fetch failed for %s: %s", self.adapter_slug, url, e)
            return None

    async def _extract_from_html_fixture(
        self,
        html: str,
        upc: str,
        url: str = "https://fixture.local/product",
    ) -> EnrichmentResultV1 | None:
        """Extract from a fixture HTML file (for deterministic testing).

        This method is the public entry point for fixture-based testing.
        It skips auth checks, URL validation, and network fetching,
        going directly to HTML parsing.
        """
        from scrapers.approved_sources.result_builder import (
            build_success_result,
            build_partial_result,
            build_no_match_result,
            build_failed_result,
        )

        source_policy = self.plan.sourcePolicy

        det_result = self.extract_from_html(html, upc, url)

        # Process and filter images
        if det_result.success and det_result.product.get("image_urls"):
            raw_images = self.normalize_images(det_result.product["image_urls"])
            det_result.product["image_urls"] = self.filter_images(raw_images, source_policy)

        # Apply allowedFields filter
        if det_result.success and self.entry.allowedFields:
            det_result.product = {
                k: v
                for k, v in det_result.product.items()
                if k in self.entry.allowedFields
            }

        if det_result.success:
            confidence = det_result.confidence or 0.75
            matched = det_result.matched_fields or list(det_result.product.keys())
            if confidence >= 0.7:
                return build_success_result(
                    upc=upc,
                    source_slug=self.source_slug,
                    source_type=self.source_type,
                    evidence_url=url,
                    product_fields=det_result.product,
                    matched_fields=matched,
                    overall_confidence=confidence,
                )
            else:
                return build_partial_result(
                    upc=upc,
                    source_slug=self.source_slug,
                    source_type=self.source_type,
                    evidence_url=url,
                    product_fields=det_result.product,
                    matched_fields=matched,
                    overall_confidence=confidence,
                    warnings=det_result.warnings,
                )
        elif det_result.failure_code == FailureCode.NO_MATCH:
            return build_no_match_result(
                upc=upc,
                source_slug=self.source_slug,
                evidence_url=url,
            )
        else:
            return build_failed_result(
                upc=upc,
                source_slug=self.source_slug,
                error_message=det_result.failure_message or "Extraction failed",
                evidence_url=url,
            )
