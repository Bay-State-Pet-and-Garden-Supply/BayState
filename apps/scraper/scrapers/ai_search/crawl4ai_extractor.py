"""crawl4ai-based product extraction."""

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Optional

from scrapers.ai_search.extraction import ExtractionUtils
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
    import crawl4ai

    logger.info(f"[AI Search] Crawl4AI version: {getattr(crawl4ai, '__version__', 'unknown')}")
except ImportError:
    logger.warning("[AI Search] Crawl4AI not installed")


class Crawl4AIExtractor:
    """Handles product extraction using crawl4ai."""

    def __init__(
        self,
        headless: bool,
        llm_model: str,
        scoring: SearchScorer,
        matching: MatchingUtils,
        cache_enabled: bool = True,
        extraction_strategy: str = "llm",
        prompt_version: str = "v1",
    ):
        self.headless = headless
        self.llm_model = llm_model
        self.cache_enabled = cache_enabled
        self.extraction_strategy = extraction_strategy
        self.prompt_version = prompt_version
        self._scoring = scoring
        self._matching = matching
        self._extraction = ExtractionUtils(scoring)
        self._fallback_extractor = FallbackExtractor(scoring=scoring, matching=matching)

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
        }
        if error:
            telemetry["error"] = error

        logger.info(f"[AI Search] Extraction telemetry: {json.dumps(telemetry)}")

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
                },
            }

            # Debug log Crawl4AI configuration (without sensitive data)
            logger.debug(
                f"[AI Search] Crawl4AI config: model={self.llm_model}, timeout=30000, "
                f"strategy={self.extraction_strategy}, headless={self.headless}, "
                f"cache={self.cache_enabled}"
            )

            async with Crawl4AIEngine(engine_config) as engine:
                # FIRST CRAWL: Fetch raw content for lightweight extraction (JSON-LD/Meta)
                result = await engine.crawl(url)
                
                # Strict validation: ensure html and markdown are strings
                html_raw = result.get("html")
                markdown_raw = result.get("markdown")
                html = html_raw if isinstance(html_raw, str) else ""
                markdown = markdown_raw if isinstance(markdown_raw, str) else ""
                
                if html_raw is not None and not isinstance(html_raw, str):
                    logger.warning(f"[AI Search] Crawl4AI returned non-string html (type={type(html_raw).__name__}), using empty string")
                if markdown_raw is not None and not isinstance(markdown_raw, str):
                    logger.warning(f"[AI Search] Crawl4AI returned non-string markdown (type={type(markdown_raw).__name__}), using empty string")
                
                fetch_time_ms = int((time.perf_counter() - fetch_start) * 1000)

                if result.get("success"):
                    raw_html_len = len(html)
                    raw_markdown_len = len(markdown)
                    logger.debug(
                        f"[AI Search] Crawl4AI result: html_length={raw_html_len}, markdown_length={raw_markdown_len}"
                    )

                    if html or markdown:
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
                    strategy = JsonCssExtractionStrategy(schema=ProductData.model_json_schema())
                    method = "json-css"
                else:
                    from crawl4ai import LLMConfig
                    from crawl4ai.extraction_strategy import LLMExtractionStrategy

                    api_key = os.environ.get("OPENAI_API_KEY")
                    if not api_key:
                        self._log_telemetry(url, sku, method, False, fetch_time_ms, 0, 0, "OPENAI_API_KEY not set")
                        return {"success": False, "error": "OPENAI_API_KEY not set"}

                    instruction = build_extraction_instruction(sku, brand, product_name, self.prompt_version)
                    strategy = LLMExtractionStrategy(
                        llm_config=LLMConfig(
                            provider=f"openai/{self.llm_model}",
                            api_token=api_key,
                        ),
                        schema=ProductData.model_json_schema(),
                        extraction_type="schema",
                        instruction=instruction,
                        input_format="fit_markdown",
                        chunk_token_threshold=4000,
                        overlap_rate=0.1,
                    )
                    method = "llm"

                engine.config.setdefault("crawler", {})["extraction_strategy"] = strategy
                llm_start = time.perf_counter()
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
                        data = json.loads(extracted_content)
                        parse_time_ms = int((time.perf_counter() - parse_start) * 1000)

                        if data and isinstance(data, list):
                            product_data = data[0]
                            product_data["success"] = True
                            product_data["url"] = url

                            required_fields = ["product_name", "brand", "description", "size_metrics", "images", "categories"]
                            filled = sum(1 for f in required_fields if product_data.get(f))
                            product_data["confidence"] = filled / len(required_fields)

                            # Log successful extraction telemetry
                            self._log_telemetry(url, sku, method, True, fetch_time_ms, parse_time_ms, llm_time_ms, None, product_data["confidence"])
                            logger.info(f"[AI Search] Extraction method used: {method}")

                            return product_data
                    except json.JSONDecodeError:
                        parse_time_ms = int((time.perf_counter() - parse_start) * 1000)
                        self._log_telemetry(url, sku, method, False, fetch_time_ms, parse_time_ms, llm_time_ms, "JSON parse error")
                        logger.warning("[AI Search] Could not parse Crawl4AI extraction result, using fallback extractor")
                        return await self._extract_with_fallback(url, sku, product_name, brand, html, markdown)

                # Log failed extraction
                self._log_telemetry(url, sku, method, False, fetch_time_ms, 0, llm_time_ms, result.get("error") or "No content")
                return await self._extract_with_fallback(url, sku, product_name, brand, html, markdown)

        except Exception as e:
            error_message = str(e)
            fetch_time_ms = int((time.perf_counter() - fetch_start) * 1000)

            # Log actual exception message for debugging before masking
            logger.warning(f"[AI Search] Crawl4AI exception: {error_message}")
            
            # Check for NoneType/empty content errors
            is_none_error = ("expected string or bytes-like object" in error_message and "NoneType" in error_message)
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

            logger.error(f"[AI Search] Extraction failed: {e}")
            self._log_telemetry(url, sku, method, False, fetch_time_ms, 0, llm_time_ms, str(e))
            return {
                "success": False,
                "error": str(e),
            }


class FallbackExtractor:
    """Fallback extraction using HTTP and JSON-LD."""

    def __init__(self, scoring: SearchScorer, matching: MatchingUtils):
        self._scoring = scoring
        self._matching = matching
        self._extraction = ExtractionUtils(scoring)

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

    async def extract(
        self,
        url: str,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        html: Optional[str] = None,
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

            if html_text:
                logger.info("[AI Search] Using pre-fetched HTML for extraction")
            else:
                logger.info("[AI Search] Fetching HTML via HTTP")
                import httpx

                headers = {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                }
                async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                    response = await client.get(url, headers=headers)
                    response.raise_for_status()
                    html_text = response.text
                    response_url = str(response.url)

            # Record fetch time
            fetch_time_ms = int((time.perf_counter() - fetch_start) * 1000)
            parse_start = time.perf_counter()

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
                # Log JSON-LD extraction success
                self._log_telemetry(response_url, sku, "jsonld", True, fetch_time_ms, parse_time_ms, None, jsonld_result.get("confidence", 0.0))
                return jsonld_result

            # Fallback to meta tags
            import re
            import html as html_module

            title_match = re.search(r"<title[^>]*>(.*?)</title>", html_text, flags=re.IGNORECASE | re.DOTALL)
            title_text = html_module.unescape(title_match.group(1)).strip() if title_match else ""
            og_title = self._extraction.extract_meta_content(html_text, "og:title", property_attr=True) or ""
            og_description = self._extraction.extract_meta_content(html_text, "og:description", property_attr=True) or ""
            og_image = self._extraction.extract_meta_content(html_text, "og:image", property_attr=True) or ""
            # Check for JSON-LD structured data presence (even if extraction failed)
            has_jsonld = bool(re.search(r"<script[^>]*type=[\"']application/ld\+json[\"']", html_text, flags=re.IGNORECASE))
            has_structured_data = has_jsonld or bool(og_title) or bool(og_description)

            images = self._extraction.normalize_images([og_image], response_url) if og_image else []

            candidate_name = og_title or title_text
            if candidate_name and product_name and not self._matching.is_name_match(product_name, candidate_name):
                self._log_telemetry(response_url, sku, "meta", False, fetch_time_ms, parse_time_ms, "title mismatch")
                return {
                    "success": False,
                    "error": "Fallback extraction title does not match expected product",
                }

            if brand and candidate_name and not self._matching.is_brand_match(brand, candidate_name, response_url):
                self._log_telemetry(response_url, sku, "meta", False, fetch_time_ms, parse_time_ms, "brand mismatch")
                return {
                    "success": False,
                    "error": "Fallback extraction brand/domain does not match expected context",
                }

            if not candidate_name or not images:
                self._log_telemetry(response_url, sku, "meta", False, fetch_time_ms, parse_time_ms, "no structured data")
                return {
                    "success": False,
                    "error": "Fallback extraction found no structured product data",
                }

            fallback_description = og_description or title_text
            fallback_size = self._extraction.extract_size_metrics(f"{candidate_name} {fallback_description}")
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
                "brand": brand,
                "description": fallback_description,
                "size_metrics": fallback_size,
                "images": images,
                "categories": ["Product"],
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
