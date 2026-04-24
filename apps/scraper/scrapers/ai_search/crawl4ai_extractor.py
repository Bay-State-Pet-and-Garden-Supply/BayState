"""crawl4ai-based product extraction."""

from importlib import metadata as importlib_metadata
import json
import logging
import re
import time
from typing import Any, Optional
from urllib.parse import quote, urljoin, urlparse

import httpx

from scrapers.ai_search.extraction import ExtractionUtils
from scrapers.ai_search.google_redirects import (
    GroundingRedirectResolver,
    canonicalize_grounding_url,
    is_grounding_redirect_url,
)
from scrapers.ai_search.llm_runtime import resolve_llm_runtime
from scrapers.ai_search.matching import MatchingUtils
from scrapers.ai_search.scoring import SearchScorer
from scrapers.schemas.product import ProductData
from scrapers.utils.ai_utils import (
    build_extraction_instruction,
    extract_product_from_meta_tags,
    get_scroll_javascript,
)

# Using centralized engine
from src.crawl4ai_engine.engine import Crawl4AIEngine

logger = logging.getLogger(__name__)

# Log Crawl4AI version at module load for diagnostics
try:
    logger.info("[AI Search] Crawl4AI version: %s", importlib_metadata.version("crawl4ai"))
except importlib_metadata.PackageNotFoundError:
    logger.warning("[AI Search] Crawl4AI not installed")


async def _resolve_grounding_images(
    resolver: GroundingRedirectResolver,
    images: list[str],
) -> list[str]:
    resolved_redirects = await resolver.resolve_many(images, label="image URL")
    resolved_images: list[str] = []
    seen_images: set[str] = set()

    for raw_image in images:
        canonical_image = canonicalize_grounding_url(raw_image)
        resolved_image = resolved_redirects.get(canonical_image, canonical_image)
        if canonical_image and is_grounding_redirect_url(canonical_image) and not resolved_image:
            continue
        if not resolved_image or resolved_image in seen_images:
            continue
        seen_images.add(resolved_image)
        resolved_images.append(resolved_image)

    return resolved_images


class Crawl4AIExtractor:
    """Handles product extraction using crawl4ai."""

    _PLACEHOLDER_TEXT = {
        "",
        "unknown",
        "n/a",
        "na",
        "none",
        "null",
        "not specified",
        "not available",
        "not provided",
    }
    _TITLE_PATTERN = re.compile(r"<title[^>]*>(.*?)</title>", flags=re.IGNORECASE | re.DOTALL)
    _OG_TITLE_PATTERN = re.compile(
        r"<meta[^>]+property=[\"']og:title[\"'][^>]+content=[\"']([^\"']+)[\"']",
        flags=re.IGNORECASE,
    )
    _NOT_FOUND_MARKERS = (
        "page not found",
        "whoops! 404",
        "404 it looks like you are lost",
        "product not found",
    )

    def __init__(
        self,
        headless: bool,
        llm_model: str,
        scoring: SearchScorer,
        matching: MatchingUtils,
        cache_enabled: bool = True,
        extraction_strategy: str = "llm",
        prompt_version: str = "v1",
        llm_provider: str = "openai",
        llm_base_url: str | None = None,
        llm_api_key: str | None = None,
    ):
        self.headless = headless
        self._llm_runtime = resolve_llm_runtime(
            provider=llm_provider,
            model=llm_model,
            base_url=llm_base_url,
            api_key=llm_api_key,
        )
        self.llm_model = self._llm_runtime.model
        self.cache_enabled = cache_enabled
        self.extraction_strategy = extraction_strategy
        self.prompt_version = prompt_version
        self._scoring = scoring
        self._matching = matching
        self._extraction = ExtractionUtils(scoring)
        self._grounding_redirect_resolver = GroundingRedirectResolver(logger_instance=logger)
        self._fallback_extractor = FallbackExtractor(scoring=scoring, matching=matching)
        # Pre-generate schema for performance
        self._product_schema = ProductData.model_json_schema()

    async def _extract_with_fallback(
        self,
        url: str,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        html: str,
        markdown: str,
    ) -> dict[str, Any]:
        fallback_content = html or markdown
        logger.info(
            f"[AI Search] Passing Crawl4AI-fetched HTML to fallback extractor (length={len(fallback_content)}, source={'html' if html else 'markdown'})"
        )
        return await self._fallback_extractor.extract(
            url,
            sku,
            product_name,
            brand,
            html=fallback_content,
        )

    async def extract_from_fixture(
        self,
        *,
        url: str,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        html: str,
        markdown: str = "",
        final_url: str | None = None,
        status_code: int | None = None,
    ) -> dict[str, Any]:
        """Replay extraction against captured page content without crawling."""
        response_url = str(final_url or url)
        html_text = html if isinstance(html, str) else ""
        markdown_text = markdown if isinstance(markdown, str) else ""
        parse_start = time.perf_counter()

        if not html_text and markdown_text:
            html_text = markdown_text

        if Crawl4AIExtractor._looks_like_not_found_page(html_text, markdown_text or html_text):
            return {
                "success": False,
                "error": "Fixture content landed on a not-found page",
            }

        jsonld_result = self._extraction.extract_product_from_html_jsonld(
            html_text=html_text or markdown_text,
            source_url=response_url,
            sku=sku,
            product_name=product_name,
            brand=brand,
            matching_utils=self._matching,
        )
        parse_time_ms = int((time.perf_counter() - parse_start) * 1000)
        if jsonld_result:
            jsonld_result["url"] = response_url
            jsonld_result["images"] = await _resolve_grounding_images(
                self._grounding_redirect_resolver, self._extraction.coerce_string_list(jsonld_result.get("images"))
            )
            self._log_telemetry(response_url, sku, "fixture-json-ld", True, 0, parse_time_ms, 0, None, float(jsonld_result.get("confidence", 0.0)))
            return jsonld_result

        meta_result = extract_product_from_meta_tags(
            extraction_utils=self._extraction,
            matching_utils=self._matching,
            html_text=html_text or markdown_text,
            source_url=response_url,
            product_name=product_name,
            brand=brand,
        )
        parse_time_ms = int((time.perf_counter() - parse_start) * 1000)
        if meta_result:
            meta_result["images"] = await _resolve_grounding_images(
                self._grounding_redirect_resolver, self._extraction.coerce_string_list(meta_result.get("images"))
            )
            self._log_telemetry(response_url, sku, "fixture-meta-tags", True, 0, parse_time_ms, 0, None, float(meta_result.get("confidence", 0.0)))
            return meta_result

        fallback_result = await self._fallback_extractor.extract(
            response_url,
            sku,
            product_name,
            brand,
            html=html_text or markdown_text,
        )
        if fallback_result.get("success"):
            return fallback_result

        if status_code is not None and status_code >= 400:
            return {
                "success": False,
                "error": f"Fixture extraction received HTTP {status_code} with no usable product data",
            }

        return fallback_result

    def _log_telemetry(
        self,
        url: str,
        sku: str,
        method: str,
        success: bool,
        fetch_time_ms: int,
        parse_time_ms: int,
        llm_time_ms: int,
        error: Optional[str] = None,
        confidence: float = 0.0,
        pruning_enabled: bool = False,
        fit_markdown_used: bool = False,
        fallback_triggered: bool = False,
    ) -> None:
        """Log structured extraction telemetry."""
        telemetry = {
            "url": url,
            "sku": sku,
            "method": method,
            "success": success,
            "fetch_time_ms": fetch_time_ms,
            "parse_time_ms": parse_time_ms,
            "llm_time_ms": llm_time_ms,
            "confidence": confidence,
            "pruning_enabled": pruning_enabled,
            "fit_markdown_used": fit_markdown_used,
            "fallback_triggered": fallback_triggered,
        }
        if error:
            telemetry["error"] = self._summarize_error(error)

        logger.info(f"[AI Search] Extraction telemetry: {json.dumps(telemetry)}")

    @staticmethod
    def _should_retry_with_relaxed_wait(result: dict[str, Any]) -> bool:
        """Detect navigation failures that should retry with a looser wait strategy."""
        error_text = str(result.get("error") or "").lower()
        if not error_text:
            return False
        return "timeout" in error_text or "networkidle" in error_text or "failed on navigating acs-goto" in error_text

    @staticmethod
    def _summarize_error(error: Any, *, max_length: int = 240) -> str:
        text = " ".join(str(error or "").split())
        if not text:
            return "unknown error"
        if len(text) <= max_length:
            return text
        return f"{text[: max_length - 3]}..."

    @classmethod
    def _looks_like_not_found_page(cls, html: str, markdown: str) -> bool:
        """Detect branded 404/soft-404 pages before extraction heuristics run."""
        snippets: list[str] = []
        if isinstance(html, str) and html:
            title_match = cls._TITLE_PATTERN.search(html)
            if title_match:
                snippets.append(title_match.group(1))
            og_title_match = cls._OG_TITLE_PATTERN.search(html)
            if og_title_match:
                snippets.append(og_title_match.group(1))
            snippets.append(html[:1500])
        if isinstance(markdown, str) and markdown:
            snippets.append(markdown[:1500])

        normalized = " ".join(snippets).lower()
        if not normalized:
            return False
        if any(marker in normalized for marker in cls._NOT_FOUND_MARKERS):
            return True
        return "404" in normalized and ("not found" in normalized or "you are lost" in normalized)

    @staticmethod
    def _is_llm_error_payload(payload: Any) -> bool:
        """Reject Crawl4AI/provider error payloads before normalizing them as products."""
        if not isinstance(payload, dict):
            return False

        error_value = payload.get("error")
        if error_value is True:
            return True
        if isinstance(error_value, str) and error_value.strip():
            return True

        tags = payload.get("tags")
        if isinstance(tags, list) and any(str(tag).lower() == "error" for tag in tags):
            return True

        content_text = str(payload.get("content") or "").lower()
        has_candidate_fields = (
            any(str(payload.get(field) or "").strip() for field in ("product_name", "description", "size_metrics"))
            or bool(payload.get("images"))
            or bool(payload.get("categories"))
        )
        if not has_candidate_fields and any(marker in content_text for marker in ("traceback", "exception", "authentication", "api", "failed", "error")):
            return True

        return False

    @classmethod
    def _is_placeholder_text(cls, value: Any) -> bool:
        text = str(value or "").strip().lower()
        if not text:
            return True
        if text in cls._PLACEHOLDER_TEXT:
            return True
        return text.startswith("not specified") or text.startswith("not explicitly stated")

    def _normalize_llm_product_data(
        self,
        product_data: dict[str, Any],
        *,
        url: str,
        html: str,
        expected_name: Optional[str],
        expected_brand: Optional[str],
    ) -> dict[str, Any]:
        """Normalize second-pass LLM output into the same shape as heuristic extraction."""
        normalized_name = self._extraction.normalize_product_title(product_data.get("product_name"))

        description = self._extraction.clean_text(product_data.get("description"))
        if self._is_placeholder_text(description):
            description = ""

        raw_brand = self._extraction.clean_text(product_data.get("brand"))
        explicit_brand = None if self._is_placeholder_text(raw_brand) else raw_brand
        normalized_brand = self._extraction.infer_brand(
            explicit_brand=explicit_brand or expected_brand,
            candidate_name=normalized_name,
            description=description,
            source_url=url,
            expected_name=expected_name,
        )

        raw_size = self._extraction.clean_text(product_data.get("size_metrics"))
        size_metrics = ""
        if not self._is_placeholder_text(raw_size):
            # Keep concise metric-like strings; collapse verbose/speculative text back
            # to an explicit package metric found in the trusted item text.
            extracted_metric = self._extraction.extract_size_metrics(raw_size)
            if extracted_metric and len(raw_size) > 40:
                size_metrics = self._extraction.clean_text(extracted_metric)
            elif len(raw_size) <= 40:
                size_metrics = raw_size

        if not size_metrics:
            inferred_metric = self._extraction.extract_size_metrics(f"{normalized_name} {description}")
            size_metrics = self._extraction.clean_text(inferred_metric) if inferred_metric else ""

        images = self._extraction.normalize_images(
            self._extraction.coerce_string_list(product_data.get("images")),
            url,
        )
        if not images and html:
            meta_images = [
                self._extraction.extract_meta_content(html, "og:image", property_attr=True) or "",
                self._extraction.extract_meta_content(html, "twitter:image", property_attr=False) or "",
            ]
            images = self._extraction.normalize_images([value for value in meta_images if value], url)

        categories = self._extraction.infer_categories(
            html_text=html,
            source_url=url,
            candidate_name=normalized_name,
            expected_name=expected_name,
            explicit_categories=product_data.get("categories"),
            explicit_brand=normalized_brand or expected_brand,
        )

        normalized = dict(product_data)
        normalized["product_name"] = normalized_name
        normalized["brand"] = normalized_brand or ""
        normalized["description"] = description
        normalized["size_metrics"] = size_metrics
        normalized["images"] = images
        normalized["categories"] = categories
        return normalized

    async def _resolve_official_family_variant(
        self,
        *,
        url: str,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        html: str,
    ) -> tuple[str, str, str]:
        """Resolve official family pages to a variant-specific Demandware payload when possible."""
        if not self._scoring.is_product_line_page(url):
            return url, html, ""

        domain = self._scoring.domain_from_url(url)
        if self._scoring.classify_source_domain(domain, brand) != "official":
            return url, html, ""

        variant_candidates = self._extraction.extract_demandware_variant_candidates(
            html_text=html,
            source_url=url,
            expected_name=product_name,
        )
        if not variant_candidates:
            return url, html, ""

        async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as client:
            for candidate in variant_candidates[:4]:
                candidate_url = str(candidate.get("url") or "").strip()
                if not candidate_url:
                    continue

                try:
                    response = await client.get(candidate_url, headers=FallbackExtractor._http_headers())
                    response.raise_for_status()
                    payload = response.json()
                except Exception as exc:
                    logger.info("[AI Search] Demandware variant lookup failed for %s: %s", candidate_url, self._summarize_error(exc))
                    continue

                selected_variant_identifier = self._extraction.selected_demandware_variant_id(payload)
                if sku and sku not in selected_variant_identifier and sku not in json.dumps(payload).lower():
                    variant_text = str(candidate.get("variant_text") or "")
                    if self._matching.has_conflicting_variant_tokens(product_name, variant_text):
                        continue
                    if not self._matching.has_variant_token_overlap(product_name, variant_text):
                        continue

                payload_text = json.dumps(payload)
                selected_product_url = ""
                if isinstance(payload, dict):
                    selected_product_url = str((payload.get("product") or {}).get("selectedProductUrl") or "").strip()
                resolved_url = urljoin(url, selected_product_url) if selected_product_url else url
                logger.info("[AI Search] Resolved official family page variant via Demandware endpoint: %s -> %s", url, resolved_url)
                return resolved_url, payload_text, payload_text

        return url, html, ""

    async def extract(
        self,
        url: str,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
    ) -> Optional[dict[str, Any]]:
        """Extract product data using centralized Crawl4AIEngine."""
        html = ""
        markdown = ""
        fetch_start = time.perf_counter()
        parse_start = fetch_start
        parse_time_ms = 0
        llm_time_ms = 0
        method = "llm" if self.extraction_strategy != "json_css" else self.extraction_strategy

        try:

            async def _fallback_wrapper(failed_url: str):
                # html and markdown may be populated by the first pass before failure
                return await self._extract_with_fallback(failed_url, sku, product_name, brand, html, markdown)

            # Centralized engine configuration leveraging new features
            engine_config = {
                "browser": {
                    "headless": self.headless,
                    "viewport": {"width": 1920, "height": 1080},
                },
                "crawler": {
                    "magic": True,
                    "simulate_user": True,
                    "remove_overlay_elements": True,
                    "cache_mode": "ENABLED" if self.cache_enabled else "BYPASS",
                    "js_code": get_scroll_javascript(),
                    "timeout": 30000,
                    "pruning_enabled": True,
                    "fallback_fetch_function": _fallback_wrapper,
                    "wait_until": "networkidle",
                },
            }

            # Debug log Crawl4AI configuration (without sensitive data)
            logger.debug(
                f"[AI Search] Crawl4AI config: provider={self._llm_runtime.provider}, model={self.llm_model}, timeout=30000, "
                f"strategy={self.extraction_strategy}, headless={self.headless}, "
                f"cache={self.cache_enabled}, base_url={self._llm_runtime.base_url}"
            )

            async with Crawl4AIEngine(engine_config) as engine:
                # FIRST CRAWL: Fetch raw content for lightweight extraction (JSON-LD/Meta)
                result = await engine.crawl(url)
                if not result.get("success") and self._should_retry_with_relaxed_wait(result):
                    logger.info("[AI Search] Retrying Crawl4AI fetch with domcontentloaded after networkidle navigation failure")
                    engine.config.setdefault("crawler", {})["wait_until"] = "domcontentloaded"
                    result = await engine.crawl(url)

                # Strict validation: ensure html and markdown are strings
                html_raw = result.get("html")
                fit_markdown_raw = result.get("fit_markdown")
                raw_markdown_raw = result.get("raw_markdown")
                markdown_raw = result.get("markdown")
                html = html_raw if isinstance(html_raw, str) else ""
                fit_markdown = fit_markdown_raw if isinstance(fit_markdown_raw, str) else ""
                raw_markdown = raw_markdown_raw if isinstance(raw_markdown_raw, str) else ""
                markdown_value = markdown_raw if isinstance(markdown_raw, str) else ""
                markdown = fit_markdown or raw_markdown or markdown_value

                if html_raw is not None and not isinstance(html_raw, str):
                    logger.warning(f"[AI Search] Crawl4AI returned non-string html (type={type(html_raw).__name__}), using empty string")
                if fit_markdown_raw is not None and not isinstance(fit_markdown_raw, str):
                    logger.warning(f"[AI Search] Crawl4AI returned non-string fit_markdown (type={type(fit_markdown_raw).__name__}), using empty string")
                if raw_markdown_raw is not None and not isinstance(raw_markdown_raw, str):
                    logger.warning(f"[AI Search] Crawl4AI returned non-string raw_markdown (type={type(raw_markdown_raw).__name__}), using empty string")
                if markdown_raw is not None and not isinstance(markdown_raw, str):
                    logger.warning(f"[AI Search] Crawl4AI returned non-string markdown (type={type(markdown_raw).__name__}), using empty string")

                fetch_time_ms = int((time.perf_counter() - fetch_start) * 1000)

                if result.get("success"):
                    raw_html_len = len(html)
                    raw_markdown_len = len(markdown)
                    logger.debug(f"[AI Search] Crawl4AI result: html_length={raw_html_len}, markdown_length={raw_markdown_len}")

                    resolved_url, resolved_html, resolved_markdown = await self._resolve_official_family_variant(
                        url=url,
                        sku=sku,
                        product_name=product_name,
                        brand=brand,
                        html=html,
                    )
                    if resolved_url != url or resolved_html != html:
                        url = resolved_url
                        html = resolved_html or html
                        if resolved_markdown:
                            markdown = resolved_markdown

                    if html or markdown:
                        if self._looks_like_not_found_page(html, markdown):
                            logger.info("[AI Search] Crawl4AI fetched a not-found page, routing to fallback recovery")
                            return await self._extract_with_fallback(url, sku, product_name, brand, html, markdown)

                        crawl4ai_content = html or markdown
                        parse_start = time.perf_counter()
                        jsonld_result = self._extraction.extract_product_from_html_jsonld(
                            html_text=crawl4ai_content,
                            source_url=url,
                            sku=sku,
                            product_name=product_name,
                            brand=brand,
                            matching_utils=self._matching,
                        )
                        parse_time_ms = int((time.perf_counter() - parse_start) * 1000)
                        if jsonld_result:
                            jsonld_result["url"] = url
                            jsonld_result["images"] = await _resolve_grounding_images(
                                self._grounding_redirect_resolver, self._extraction.coerce_string_list(jsonld_result.get("images"))
                            )
                            jsonld_result["confidence"] = max(float(jsonld_result.get("confidence", 0.0)), 0.8)
                            logger.info("[AI Search] Extraction method used: json-ld")
                            self._log_telemetry(
                                url,
                                sku,
                                "json-ld",
                                True,
                                fetch_time_ms,
                                parse_time_ms,
                                llm_time_ms,
                                None,
                                float(jsonld_result["confidence"]),
                                pruning_enabled=True,
                                fit_markdown_used=False,
                                fallback_triggered=result.get("fallback_triggered", False),
                            )
                            return jsonld_result

                        parse_start = time.perf_counter()
                        meta_result = extract_product_from_meta_tags(
                            extraction_utils=self._extraction,
                            matching_utils=self._matching,
                            html_text=crawl4ai_content,
                            source_url=url,
                            product_name=product_name,
                            brand=brand,
                        )
                        parse_time_ms = int((time.perf_counter() - parse_start) * 1000)
                        if meta_result:
                            meta_result["images"] = await _resolve_grounding_images(
                                self._grounding_redirect_resolver, self._extraction.coerce_string_list(meta_result.get("images"))
                            )
                            logger.info("[AI Search] Extraction method used: meta-tags")
                            self._log_telemetry(
                                url,
                                sku,
                                "meta-tags",
                                True,
                                fetch_time_ms,
                                parse_time_ms,
                                llm_time_ms,
                                None,
                                float(meta_result["confidence"]),
                                pruning_enabled=True,
                                fit_markdown_used=False,
                                fallback_triggered=result.get("fallback_triggered", False),
                            )
                            return meta_result

                if not result.get("success"):
                    error = result.get("error") or "Extraction failed or returned no content"
                    self._log_telemetry(url, sku, "crawl", False, fetch_time_ms, parse_time_ms, llm_time_ms, error)
                    if html or markdown:
                        return await self._extract_with_fallback(url, sku, product_name, brand, html, markdown)
                    return {
                        "success": False,
                        "error": error,
                    }

                # SECOND PASS: If lightweight extraction failed, use LLM/CSS strategy
                if self.extraction_strategy == "json_css":
                    from crawl4ai.extraction_strategy import JsonCssExtractionStrategy

                    strategy = JsonCssExtractionStrategy(schema=self._product_schema)
                    method = "json-css"
                else:
                    from crawl4ai import LLMConfig
                    from crawl4ai.extraction_strategy import LLMExtractionStrategy

                    if self._llm_runtime.provider == "openai" and not self._llm_runtime.api_key:
                        logger.info("[AI Search] OpenAI API key missing, using fallback extractor instead of LLM second pass")
                        return await self._extract_with_fallback(url, sku, product_name, brand, html, markdown)

                    if self._llm_runtime.provider == "gemini" and not self._llm_runtime.api_key:
                        logger.info("[AI Search] Gemini API key missing, using fallback extractor instead of LLM second pass")
                        return await self._extract_with_fallback(url, sku, product_name, brand, html, markdown)

                    if self._llm_runtime.provider == "openai_compatible" and not self._llm_runtime.base_url:
                        logger.info("[AI Search] OpenAI-compatible base URL missing, using fallback extractor instead of LLM second pass")
                        return await self._extract_with_fallback(url, sku, product_name, brand, html, markdown)

                    instruction = build_extraction_instruction(sku, brand, product_name, self.prompt_version)
                    strategy = LLMExtractionStrategy(
                        llm_config=LLMConfig(
                            provider=self._llm_runtime.crawl4ai_provider,
                            api_token=self._llm_runtime.api_key,
                            base_url=self._llm_runtime.base_url,
                        ),
                        schema=self._product_schema,
                        extraction_type="schema",
                        instruction=instruction,
                        input_format="markdown",
                        chunk_token_threshold=4000,
                        overlap_rate=0.1,
                    )
                    method = "llm"

                engine.config.setdefault("crawler", {})["extraction_strategy"] = strategy
                # The second pass changes extraction strategy for the same URL. Bypass
                # Crawl4AI's response cache here so we do not just replay the first crawl
                # result without running extraction.
                engine.config["crawler"]["cache_mode"] = "BYPASS"
                llm_start = time.perf_counter()
                result = await engine.crawl(url)
                if not result.get("success") and self._should_retry_with_relaxed_wait(result):
                    engine.config["crawler"]["wait_until"] = "domcontentloaded"
                    result = await engine.crawl(url)

                # Strict validation for second crawl results
                result_html = result.get("html")
                result_markdown = result.get("markdown")
                if isinstance(result_html, str):
                    html = result_html
                if isinstance(result_markdown, str):
                    markdown = result_markdown

                llm_time_ms = int((time.perf_counter() - llm_start) * 1000)

                if result.get("success") and result.get("extracted_content"):
                    extracted_content = result["extracted_content"]
                    if isinstance(extracted_content, str):
                        raw_content = extracted_content.strip()
                        if raw_content.startswith("[") and '"error"' in raw_content.lower() and "auth" in raw_content.lower():
                            self._log_telemetry(url, sku, method, False, fetch_time_ms, 0, llm_time_ms, "auth error")
                            return await self._extract_with_fallback(url, sku, product_name, brand, html, markdown)

                    try:
                        parse_start = time.perf_counter()
                        if isinstance(extracted_content, str):
                            data = json.loads(extracted_content)
                        elif isinstance(extracted_content, dict):
                            data = [extracted_content]
                        elif isinstance(extracted_content, list):
                            data = extracted_content
                        else:
                            raise TypeError(f"Unsupported extracted_content type: {type(extracted_content).__name__}")
                        parse_time_ms = int((time.perf_counter() - parse_start) * 1000)

                        if data and isinstance(data, list):
                            if self._is_llm_error_payload(data[0]):
                                error_payload = data[0]
                                llm_error = self._summarize_error(error_payload.get("content") or error_payload.get("error") or "LLM extraction error")
                                self._log_telemetry(url, sku, method, False, fetch_time_ms, parse_time_ms, llm_time_ms, llm_error)
                                logger.warning("[AI Search] Crawl4AI returned an error payload, using fallback extractor")
                                return await self._extract_with_fallback(url, sku, product_name, brand, html, markdown)

                            if not isinstance(data[0], dict):
                                raise TypeError(f"Unsupported extracted_content item type: {type(data[0]).__name__}")

                            product_data = self._normalize_llm_product_data(
                                data[0],
                                url=url,
                                html=html,
                                expected_name=product_name,
                                expected_brand=brand,
                            )
                            product_data["images"] = await _resolve_grounding_images(
                                self._grounding_redirect_resolver, self._extraction.coerce_string_list(product_data.get("images"))
                            )
                            product_data["success"] = True
                            product_data["url"] = url

                            required_fields = ["product_name", "brand", "description", "size_metrics", "images", "categories"]
                            filled = sum(1 for f in required_fields if product_data.get(f))
                            product_data["confidence"] = filled / len(required_fields)

                            # Log successful extraction telemetry
                            self._log_telemetry(
                                url,
                                sku,
                                method,
                                True,
                                fetch_time_ms,
                                parse_time_ms,
                                llm_time_ms,
                                None,
                                product_data["confidence"],
                                pruning_enabled=True,
                                fit_markdown_used=(method == "llm"),
                                fallback_triggered=result.get("fallback_triggered", False),
                            )
                            logger.info(f"[AI Search] Extraction method used: {method}")

                            return product_data
                    except (json.JSONDecodeError, TypeError):
                        parse_time_ms = int((time.perf_counter() - parse_start) * 1000)
                        self._log_telemetry(url, sku, method, False, fetch_time_ms, parse_time_ms, llm_time_ms, "JSON parse error")
                        logger.warning("[AI Search] Could not parse Crawl4AI extraction result, using fallback extractor")
                        return await self._extract_with_fallback(url, sku, product_name, brand, html, markdown)

                # Log failed extraction
                self._log_telemetry(
                    url,
                    sku,
                    method,
                    False,
                    fetch_time_ms,
                    0,
                    llm_time_ms,
                    self._summarize_error(result.get("error") or "No content"),
                )
                return await self._extract_with_fallback(url, sku, product_name, brand, html, markdown)

        except Exception as e:
            error_message = self._summarize_error(e)
            fetch_time_ms = int((time.perf_counter() - fetch_start) * 1000)

            logger.warning("[AI Search] Crawl4AI exception: %s", error_message)

            # Check for NoneType/empty content errors
            is_none_error = "expected string or bytes-like object" in error_message and "NoneType" in error_message
            is_type_error = "can only concatenate str" in error_message or "unsupported operand type" in error_message

            if is_none_error or is_type_error:
                logger.warning("[AI Search] Crawl4AI content handling error detected, using fallback extractor")
                self._log_telemetry(url, sku, method, False, fetch_time_ms, 0, llm_time_ms, "content type error")
                # Ensure html/markdown are strings before passing to fallback
                safe_html = html if isinstance(html, str) else ""
                safe_markdown = markdown if isinstance(markdown, str) else ""
                if safe_html or safe_markdown:
                    return await self._extract_with_fallback(url, sku, product_name, brand, safe_html, safe_markdown)
                return {
                    "success": False,
                    "error": "Crawl4AI returned invalid content type",
                }

            safe_html = html if isinstance(html, str) else ""
            safe_markdown = markdown if isinstance(markdown, str) else ""
            if safe_html or safe_markdown:
                self._log_telemetry(url, sku, method, False, fetch_time_ms, 0, llm_time_ms, error_message)
                return await self._extract_with_fallback(url, sku, product_name, brand, safe_html, safe_markdown)

            self._log_telemetry(url, sku, method, False, fetch_time_ms, 0, llm_time_ms, error_message)
            return {
                "success": False,
                "error": error_message,
            }


class FallbackExtractor:
    """Fallback extraction using HTTP and JSON-LD."""

    _PRODUCT_PATH_MARKERS = ("/product/", "/products/", "/shop/")
    _LINK_PATTERN = re.compile(r"<a[^>]+href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", flags=re.IGNORECASE | re.DOTALL)
    _TAG_PATTERN = re.compile(r"<[^>]+>")
    _IMAGE_PATH_PATTERN = re.compile(r"\.(?:png|jpe?g|webp|gif|svg)(?:\?.*)?$", flags=re.IGNORECASE)

    def __init__(self, scoring: SearchScorer, matching: MatchingUtils):
        self._scoring = scoring
        self._matching = matching
        self._extraction = ExtractionUtils(scoring)
        self._grounding_redirect_resolver = GroundingRedirectResolver(logger_instance=logger)

    def _log_telemetry(
        self,
        url: str,
        sku: str,
        method: str,
        success: bool,
        fetch_time_ms: int,
        parse_time_ms: int,
        error: Optional[str] = None,
        confidence: float = 0.0,
    ) -> None:
        """Log structured extraction telemetry."""
        telemetry = {
            "url": url,
            "sku": sku,
            "method": method,
            "success": success,
            "fetch_time_ms": fetch_time_ms,
            "parse_time_ms": parse_time_ms,
            "llm_time_ms": 0,
            "confidence": confidence,
        }
        if error:
            telemetry["error"] = error

        logger.info(f"[AI Search] Extraction telemetry: {json.dumps(telemetry)}")

    @staticmethod
    def _http_headers() -> dict[str, str]:
        return {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }

    def _build_search_queries(
        self,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
    ) -> list[str]:
        queries: list[str] = []

        def _append(value: Optional[str]) -> None:
            text = self._extraction.clean_text(value)
            if text and text not in queries:
                queries.append(text)

        _append(sku)
        _append(product_name)
        if product_name and brand:
            brand_prefix = re.compile(rf"^\s*{re.escape(self._extraction.clean_text(brand))}[\s:,\-]*", flags=re.IGNORECASE)
            stripped_name = brand_prefix.sub("", self._extraction.clean_text(product_name)).strip()
            _append(stripped_name)

        return queries

    def _has_strong_search_name_match(
        self,
        product_name: Optional[str],
        brand: Optional[str],
        candidate_label: str,
    ) -> bool:
        if not product_name:
            return False

        expected_tokens = self._matching.tokenize_keywords(product_name)
        actual_tokens = self._matching.tokenize_keywords(candidate_label)
        brand_tokens = self._matching.tokenize_keywords(brand)
        specific_expected = expected_tokens.difference(brand_tokens)
        if not specific_expected:
            return self._matching.is_name_match(product_name, candidate_label)

        overlap = specific_expected.intersection(actual_tokens)
        overlap_ratio = len(overlap) / max(1, len(specific_expected))
        return overlap_ratio >= 0.6

    def _collect_search_candidate_urls(
        self,
        *,
        source_url: str,
        search_url: str,
        search_html: str,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
    ) -> list[str]:
        normalized_search = search_html.lower()
        if '"resultscount":0' in normalized_search or '"resultscount": 0' in normalized_search or "no results found" in normalized_search:
            return []

        source_host = urlparse(source_url).netloc.lower()
        candidates: list[tuple[float, str]] = []
        seen_urls: set[str] = set()

        for href, inner_html in self._LINK_PATTERN.findall(search_html):
            absolute_url = urljoin(search_url, href).split("#", 1)[0]
            parsed = urlparse(absolute_url)
            if parsed.scheme not in {"http", "https"}:
                continue
            if parsed.netloc.lower() != source_host:
                continue
            if absolute_url == source_url:
                continue
            if parsed.query and not parsed.path:
                continue
            if self._IMAGE_PATH_PATTERN.search(parsed.path):
                continue
            if not any(marker in parsed.path.lower() for marker in self._PRODUCT_PATH_MARKERS):
                continue

            label = self._extraction.normalize_product_title(self._TAG_PATTERN.sub(" ", inner_html))
            if not label:
                label = self._extraction.normalize_product_title(parsed.path.rstrip("/").split("/")[-1].replace("-", " "))

            score = 0.0
            has_exact_identifier = bool(sku) and sku.lower() in f"{label} {absolute_url}".lower()
            name_matches = self._has_strong_search_name_match(product_name, brand, label)
            if has_exact_identifier:
                score += 6.0
            if name_matches:
                score += 5.0
            if brand and self._matching.is_brand_match(brand, label or brand, absolute_url):
                score += 2.0

            if not has_exact_identifier and not name_matches:
                continue
            if score <= 0.0 or absolute_url in seen_urls:
                continue

            seen_urls.add(absolute_url)
            candidates.append((score, absolute_url))

        candidates.sort(key=lambda item: item[0], reverse=True)
        return [candidate_url for _, candidate_url in candidates[:5]]

    async def _recover_from_site_search(
        self,
        *,
        source_url: str,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        client: Any | None = None,
    ) -> Optional[dict[str, Any]]:
        import httpx

        queries = self._build_search_queries(sku, product_name, brand)
        if not queries:
            return None

        parsed_source = urlparse(source_url)
        if not parsed_source.scheme or not parsed_source.netloc:
            return None

        base_url = f"{parsed_source.scheme}://{parsed_source.netloc}"

        async def _run_with_client(search_client: Any) -> Optional[dict[str, Any]]:
            for query in queries:
                for search_path in ("/?s={query}&post_type=product", "/?s={query}"):
                    search_url = f"{base_url}{search_path.format(query=quote(query))}"
                    response = await search_client.get(search_url, headers=self._http_headers())
                    search_html = response.text or ""
                    for candidate_url in self._collect_search_candidate_urls(
                        source_url=source_url,
                        search_url=str(response.url),
                        search_html=search_html,
                        sku=sku,
                        product_name=product_name,
                        brand=brand,
                    ):
                        logger.info(f"[AI Search] Attempting stale-URL recovery via site search: {source_url} -> {candidate_url}")
                        recovered = await self.extract(
                            candidate_url,
                            sku,
                            product_name,
                            brand,
                            recovery_attempted=True,
                        )
                        if recovered.get("success"):
                            return recovered
            return None

        if client is not None:
            return await _run_with_client(client)

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as search_client:
            return await _run_with_client(search_client)

    async def extract(
        self,
        url: str,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        html: Optional[str] = None,
        recovery_attempted: bool = False,
    ) -> dict[str, Any]:
        """Extract product data using provided HTML or an HTTP fetch fallback.

        Args:
            url: Product page URL.
            sku: Expected product SKU.
            product_name: Expected product name, if known.
            brand: Expected brand, if known.
            html: Pre-fetched HTML to parse. When empty or omitted, the extractor
                fetches the page over HTTP as a fallback.
        """
        # Initialize timing for telemetry
        fetch_start = time.perf_counter()
        parse_start = 0.0

        try:
            response_url = url
            html_text = html or ""
            http_status: int | None = None

            if html_text:
                logger.info("[AI Search] Using pre-fetched HTML for extraction")
            else:
                logger.info("[AI Search] Fetching HTML via HTTP")
                import httpx

                async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                    response = await client.get(url, headers=self._http_headers())
                    html_text = response.text
                    response_url = str(response.url)
                    http_status = response.status_code

                    if Crawl4AIExtractor._looks_like_not_found_page(html_text, html_text):
                        recovered = None
                        if not recovery_attempted:
                            recovered = await self._recover_from_site_search(
                                source_url=response_url,
                                sku=sku,
                                product_name=product_name,
                                brand=brand,
                                client=client,
                            )
                        if recovered is not None:
                            return recovered

            # Record fetch time
            fetch_time_ms = int((time.perf_counter() - fetch_start) * 1000)
            parse_start = time.perf_counter()

            if Crawl4AIExtractor._looks_like_not_found_page(html_text, html_text):
                recovered = None
                if not recovery_attempted:
                    recovered = await self._recover_from_site_search(
                        source_url=response_url,
                        sku=sku,
                        product_name=product_name,
                        brand=brand,
                    )
                if recovered is not None:
                    return recovered
                self._log_telemetry(response_url, sku, "fallback", False, fetch_time_ms, 0, "not found page")
                return {
                    "success": False,
                    "error": "Fallback extraction landed on a not-found page",
                }

            jsonld_result = self._extraction.extract_product_from_html_jsonld(
                html_text=html_text,
                source_url=response_url,
                sku=sku,
                product_name=product_name,
                brand=brand,
                matching_utils=self._matching,
            )

            parse_time_ms = int((time.perf_counter() - parse_start) * 1000)

            if jsonld_result:
                jsonld_result["url"] = response_url
                jsonld_result["images"] = await _resolve_grounding_images(
                    self._grounding_redirect_resolver, self._extraction.coerce_string_list(jsonld_result.get("images"))
                )
                # Log JSON-LD extraction success
                self._log_telemetry(response_url, sku, "jsonld", True, fetch_time_ms, parse_time_ms, None, jsonld_result.get("confidence", 0.0))
                return jsonld_result

            # Fallback to meta tags
            import re

            title_match = re.search(r"<title[^>]*>(.*?)</title>", html_text, flags=re.IGNORECASE | re.DOTALL)
            title_text = self._extraction.normalize_product_title(title_match.group(1)) if title_match else ""
            og_title = self._extraction.normalize_product_title(self._extraction.extract_meta_content(html_text, "og:title", property_attr=True) or "")
            og_description = self._extraction.clean_text(self._extraction.extract_meta_content(html_text, "og:description", property_attr=True) or "")
            og_image = self._extraction.extract_meta_content(html_text, "og:image", property_attr=True) or ""
            meta_brand = self._extraction.extract_meta_content(html_text, "product:brand", property_attr=True) or ""
            # Check for JSON-LD structured data presence (even if extraction failed)
            has_jsonld = bool(re.search(r"<script[^>]*type=[\"']application/ld\+json[\"']", html_text, flags=re.IGNORECASE))
            has_structured_data = has_jsonld or bool(og_title) or bool(og_description)

            images = self._extraction.normalize_images([og_image], response_url) if og_image else []
            images = await _resolve_grounding_images(self._grounding_redirect_resolver, images)

            candidate_name = og_title or title_text
            inferred_brand = self._extraction.infer_brand(
                explicit_brand=meta_brand or brand,
                candidate_name=candidate_name,
                description=og_description or title_text,
                source_url=response_url,
                expected_name=product_name,
            )
            if candidate_name and product_name and not self._matching.is_name_match(product_name, candidate_name):
                self._log_telemetry(response_url, sku, "meta", False, fetch_time_ms, parse_time_ms, "title mismatch")
                return {
                    "success": False,
                    "error": "Fallback extraction title does not match expected product",
                }

            if brand and candidate_name and not self._matching.is_brand_match(brand, inferred_brand or candidate_name, response_url):
                self._log_telemetry(response_url, sku, "meta", False, fetch_time_ms, parse_time_ms, "brand mismatch")
                return {
                    "success": False,
                    "error": "Fallback extraction brand/domain does not match expected context",
                }

            if not candidate_name or not images:
                if http_status is not None and http_status >= 400:
                    self._log_telemetry(response_url, sku, "fallback", False, fetch_time_ms, parse_time_ms, f"http {http_status}")
                    return {
                        "success": False,
                        "error": f"Fallback extraction received HTTP {http_status} with no usable product data",
                    }
                self._log_telemetry(response_url, sku, "meta", False, fetch_time_ms, parse_time_ms, "no structured data")
                return {
                    "success": False,
                    "error": "Fallback extraction found no structured product data",
                }

            fallback_description = og_description or title_text
            fallback_categories = self._extraction.infer_categories(
                html_text=html_text,
                source_url=response_url,
                candidate_name=candidate_name,
                expected_name=product_name,
                explicit_brand=inferred_brand or brand,
            )
            fallback_size = self._extraction.extract_size_metrics(f"{candidate_name} {self._extraction.strip_instructional_copy(fallback_description)}")
            # Confidence formula (FallbackExtractor):
            # Base: 0.65 (increased from 0.58 for Crawl4AI HTML reuse)
            # +0.15 if JSON-LD or structured data present
            # +0.1 if name match (product_name matches candidate_name)
            # +0.1 if brand match (brand matches domain/title)
            # Max: 0.85 (was 0.78)
            # Single match (name OR brand) reaches 0.75 (0.65 + 0.1), passing 0.70 threshold
            confidence = 0.65
            if has_structured_data:
                confidence += 0.15
            if product_name and self._matching.is_name_match(product_name, candidate_name):
                confidence += 0.1
            if brand and self._matching.is_brand_match(brand, candidate_name, response_url):
                confidence += 0.1
            confidence = min(confidence, 0.85)

            # Log meta extraction success
            self._log_telemetry(response_url, sku, "meta", True, fetch_time_ms, parse_time_ms, None, confidence)

            return {
                "success": True,
                "product_name": candidate_name,
                "brand": inferred_brand,
                "description": fallback_description,
                "size_metrics": fallback_size,
                "images": images,
                "categories": fallback_categories or ["Product"],
                "confidence": confidence,
                "url": response_url,
            }

        except Exception as error:
            fetch_time_ms = int((time.perf_counter() - fetch_start) * 1000)
            self._log_telemetry(url, sku, "fallback", False, fetch_time_ms, 0, str(error))
            return {
                "success": False,
                "error": f"Fallback extraction failed: {error}",
            }
