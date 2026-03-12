"""Main AI Discovery Scraper implementation."""

import asyncio
import json
import logging
import os
from typing import Any, Optional

from scrapers.ai_cost_tracker import AICostTracker
from scrapers.ai_metrics import record_ai_extraction
from scrapers.ai_discovery.models import DiscoveryResult
from scrapers.ai_discovery.scoring import SearchScorer
from scrapers.ai_discovery.telemetry import RetailerTelemetry

# pyright: reportMissingImports=false, reportRedeclaration=false, reportGeneralTypeIssues=false, reportUnknownMemberType=false, reportAttributeAccessIssue=false
from scrapers.ai_discovery.matching import MatchingUtils
from scrapers.ai_discovery.extraction import ExtractionUtils
from scrapers.ai_discovery.search import BraveSearchClient
from scrapers.ai_discovery.site_search import SiteSpecificSearchClient
from scrapers.ai_discovery.query_builder import QueryBuilder
from scrapers.ai_discovery.validation import ExtractionValidator
from scrapers.schemas.product import ProductData
from scrapers.utils.ai_utils import (
    build_extraction_instruction,
    get_scroll_javascript,
    extract_product_from_meta_tags,
)

# Using centralized engine
# crawl4ai_engine is an optional runtime dependency; import lazily where used to avoid import-time errors

logger = logging.getLogger(__name__)


class AIDiscoveryScraper:
    """AI-powered discovery scraper for universal product extraction.

    This scraper doesn't require pre-configured site definitions. Instead, it:
    1. Searches for the product using Brave Search API
    2. Uses AI to identify the most likely manufacturer/official product page
    3. Navigates to that page and extracts structured data
    4. Returns results in a standardized format
    """

    def __init__(
        self,
        headless: bool = True,
        max_search_results: int = 5,
        max_steps: int = 15,
        confidence_threshold: float = 0.7,
        llm_model: str = "gpt-4o-mini",
        search_mode: Optional[str] = None,  # None = use env var
        max_retailers: Optional[int] = None,  # None = use env var
    ):
        """Initialize the AI discovery scraper.

        Args:
            headless: Whether to run browser in headless mode
            max_search_results: Number of search results to analyze
            max_steps: Maximum browser actions per extraction
            confidence_threshold: Minimum confidence score to accept result
            llm_model: LLM model to use for AI extraction
            search_mode: Search mode - "site_specific" or "open_web". None = use env var.
            max_retailers: Maximum number of retailers to search in site_specific mode. None = use env var.
        """
        self.headless = headless
        self.max_search_results = max_search_results
        self.max_steps = max_steps
        self.confidence_threshold = confidence_threshold
        self.llm_model = llm_model
        self.search_mode = search_mode or os.getenv("AI_DISCOVERY_SEARCH_MODE", "site_specific")
        self.max_retailers = max_retailers or int(os.getenv("AI_DISCOVERY_MAX_RETAILERS", "5"))
        self.use_ai_source_selection = os.getenv("AI_DISCOVERY_USE_LLM_SOURCE_RANKING", "false").lower() == "true"
        self._cost_tracker = AICostTracker()
        self._browser: Any = None
        self._llm: Any = None

        # Initialize submodules
        self._scoring = SearchScorer()
        self._matching = MatchingUtils()
        self._extraction = ExtractionUtils(self._scoring)
        self._search_client = BraveSearchClient(max_results=max_search_results)
        self._site_search_client = SiteSpecificSearchClient(max_results=max_search_results)
        self._query_builder = QueryBuilder()
        self._validator = ExtractionValidator(confidence_threshold)
        # Retailer telemetry (in-memory)
        self._retailer_telemetry = RetailerTelemetry()

    async def scrape_products_batch(
        self,
        items: list[dict[str, Any]],
        max_concurrency: int = 4,
    ) -> list[DiscoveryResult]:
        """Scrape multiple products in batch."""
        semaphore = asyncio.Semaphore(max(1, max_concurrency))

        async def _run_one(item: dict[str, Any]) -> DiscoveryResult:
            async with semaphore:
                sku = str(item.get("sku", "")).strip()
                if not sku:
                    return DiscoveryResult(success=False, sku="", error="Missing sku")
                return await self.scrape_product(
                    sku=sku,
                    product_name=item.get("product_name"),
                    brand=item.get("brand"),
                    category=item.get("category"),
                )

        return await asyncio.gather(*[_run_one(item) for item in items])

    async def scrape_product(
        self,
        sku: str,
        product_name: Optional[str] = None,
        brand: Optional[str] = None,
        category: Optional[str] = None,
    ) -> DiscoveryResult:
        """Scrape a product using AI discovery.

        Args:
            sku: Product SKU or identifier
            product_name: Product name (optional, helps search)
            brand: Product brand (optional, helps identify manufacturer site)
            category: Product category (optional)

        Returns:
            DiscoveryResult with extracted data
        """
        try:
            # Step 1: Build search query
            search_query = self._query_builder.build_search_query(sku, product_name, brand, category)
            logger.info(f"[AI Discovery] Searching for: {search_query} (mode: {self.search_mode})")

            # Step 2: Search for product pages
            search_results: list[dict[str, Any]] = []
            search_error: Optional[str] = None

            # Try site-specific search first if mode is site_specific
            if self.search_mode == "site_specific":
                # Compute prioritized retailers from telemetry, falling back to trusted list
                try:
                    all_retailers = list(SearchScorer.TRUSTED_RETAILERS)
                    retailers = self._retailer_telemetry.get_prioritized_retailers(all_retailers, self.max_retailers)
                    if not retailers:
                        retailers = all_retailers[: self.max_retailers]
                except Exception:
                    logger.exception("Failed to compute prioritized retailers; using defaults")
                    retailers = list(SearchScorer.TRUSTED_RETAILERS)[: self.max_retailers]

                logger.info(f"[AI Discovery] Searching across {len(retailers)} retailers")

                site_results, site_error = await self._site_search_client.search_across_retailers(search_query, retailers)

                if site_results:
                    # Prepare and score site-specific results
                    prepared_results = self._scoring.prepare_search_results(site_results, sku, brand, product_name, category)
                    if prepared_results:
                        search_results = prepared_results
                        logger.info(f"[AI Discovery] Site-specific search found {len(site_results)} results")
                    else:
                        logger.info("[AI Discovery] Site-specific results filtered out, falling back to open-web")
                else:
                    logger.info("[AI Discovery] Site-specific search returned no results, falling back to open-web")
                    if site_error:
                        logger.warning(f"[AI Discovery] Site-specific search error: {site_error}")
                # Update prioritized retailers for future searches
                try:
                    all_retailers = list(SearchScorer.TRUSTED_RETAILERS)
                    retailers = self._retailer_telemetry.get_prioritized_retailers(all_retailers, self.max_retailers)
                    # If telemetry has no history, fallback to default slice
                    if not retailers:
                        retailers = all_retailers[: self.max_retailers]
                    # Replace retailers used for site-specific search
                    # Note: we don't mutate SearchScorer.TRUSTED_RETAILERS
                    # SiteSpecificSearchClient expects an iterable of domains
                    # This operation is cheap and non-blocking
                except Exception:
                    logger.exception("Failed to compute prioritized retailers; using defaults")

            # Fallback to open-web search if site-specific didn't find results or mode is open_web
            if not search_results:
                best_score_seen = float("-inf")
                for query_variant in self._query_builder.build_query_variants(
                    sku=sku,
                    product_name=product_name,
                    brand=brand,
                    category=category,
                ):
                    raw_results, raw_error = await self._search_client.search(query_variant)
                    prepared_results = self._scoring.prepare_search_results(raw_results, sku, brand, product_name, category)
                    if prepared_results:
                        top_score = self._scoring.score_search_result(
                            result=prepared_results[0],
                            sku=sku,
                            brand=brand,
                            product_name=product_name,
                            category=category,
                        )
                        if top_score > best_score_seen:
                            best_score_seen = top_score
                            search_results = prepared_results
                            search_error = None
                        if top_score >= 8.0:
                            break
                    search_error = raw_error
            search_query = self._query_builder.build_search_query(sku, product_name, brand, category)
            logger.info(f"[AI Discovery] Searching for: {search_query}")

            # Step 2: Search for product pages
            search_results: list[dict[str, Any]] = []
            search_error: Optional[str] = None
            best_score_seen = float("-inf")
            for query_variant in self._query_builder.build_query_variants(
                sku=sku,
                product_name=product_name,
                brand=brand,
                category=category,
            ):
                raw_results, raw_error = await self._search_client.search(query_variant)
                prepared_results = self._scoring.prepare_search_results(raw_results, sku, brand, product_name, category)
                if prepared_results:
                    top_score = self._scoring.score_search_result(
                        result=prepared_results[0],
                        sku=sku,
                        brand=brand,
                        product_name=product_name,
                        category=category,
                    )
                    if top_score > best_score_seen:
                        best_score_seen = top_score
                        search_results = prepared_results
                        search_error = None
                    if top_score >= 8.0:
                        break
                search_error = raw_error

            if not search_results:
                error_msg = search_error or "No search results found"
                return DiscoveryResult(success=False, sku=sku, error=error_msg)

            # Step 3: Optimization - If brand is missing, use PARALLEL discovery
            # We crawl the top 3 results simultaneously using arun_many
            if not brand:
                logger.info("[AI Discovery] Brand missing - initiating parallel candidate discovery")
                top_candidates = search_results[:3]
                candidate_urls = [str(r.get("url")) for r in top_candidates if r.get("url")]

                parallel_results = await self._extract_candidates_parallel(candidate_urls, sku, product_name, brand)

                # Pick the best result from the parallel set
                accepted_result = None
                target_url = None
                for res in parallel_results:
                    is_acceptable, _ = self._validator.validate_extraction_match(
                        extraction_result=res,
                        sku=sku,
                        product_name=product_name,
                        brand=brand,
                        source_url=res.get("url", ""),
                    )
                    # Record telemetry per candidate (non-blocking, safe)
                    try:
                        url = res.get("url")
                        domain = self._scoring.domain_from_url(url) if url else ""
                        self._retailer_telemetry.record_attempt(domain, bool(is_acceptable))
                    except Exception:
                        logger.exception("Failed to record telemetry for parallel candidate")

                    if is_acceptable:
                        accepted_result = res
                        target_url = res.get("url")
                        break

                if accepted_result:
                    return self._build_discovery_result(accepted_result, sku, product_name, brand, target_url)

            # Step 4: Serial fallback / brand-aware discovery (existing logic)
            max_attempts = 3
            extraction_result: Optional[dict[str, Any]] = None
            accepted_result: Optional[dict[str, Any]] = None
            last_rejection_reason: Optional[str] = None
            target_url = None
            tried_urls: set[str] = set()

            for attempt in range(max_attempts):
                if attempt == 0:
                    target_url = self._scoring.pick_strong_candidate_url(
                        search_results=search_results,
                        sku=sku,
                        brand=brand,
                        product_name=product_name,
                        category=category,
                    )
                    if not target_url:
                        if self.use_ai_source_selection:
                            target_url = await self._identify_best_source(search_results, sku, brand, product_name)
                        else:
                            target_url = self._heuristic_source_selection(search_results, brand)
                else:
                    if search_results:
                        target_url = str(search_results[0].get("url") or "")
                    else:
                        target_url = None
                if not target_url or target_url in tried_urls:
                    if attempt < max_attempts - 1:
                        search_results = [r for r in search_results if r.get("url") != target_url]
                        continue
                    break

                logger.info(f"[AI Discovery] Selected source (attempt {attempt + 1}): {target_url}")

                selected_result = next((result for result in search_results if result.get("url") == target_url), None)
                if selected_result and self._scoring.is_low_quality_result(selected_result):
                    last_rejection_reason = "Selected source appears to be a non-product/review/aggregator page"
                    search_results = [r for r in search_results if r.get("url") != target_url]
                    continue

                tried_urls.add(target_url)
                extraction_result = await self._extract_product_data(target_url, sku, product_name, brand)

                is_acceptable, rejection_reason = self._validator.validate_extraction_match(
                    extraction_result=extraction_result,
                    sku=sku,
                    product_name=product_name,
                    brand=brand,
                    source_url=target_url,
                )
                # Record telemetry for this attempted extraction (non-blocking)
                try:
                    domain = self._scoring.domain_from_url(target_url) if target_url else ""
                    self._retailer_telemetry.record_attempt(domain, bool(is_acceptable))
                except Exception:
                    logger.exception("Failed to record telemetry for extraction attempt")

                if is_acceptable:
                    accepted_result = extraction_result
                    break

                last_rejection_reason = rejection_reason
                search_results = [r for r in search_results if r.get("url") != target_url]

            if not accepted_result:
                error_msg = extraction_result.get("error") if extraction_result else last_rejection_reason or "Extraction failed"
                return DiscoveryResult(success=False, sku=sku, error=error_msg)

            return self._build_discovery_result(accepted_result, sku, product_name, brand, target_url)

        except Exception as e:
            logger.error(f"[AI Discovery] Error scraping {sku}: {e}")
            return DiscoveryResult(success=False, sku=sku, error=str(e))

    def _build_discovery_result(
        self, result: dict[str, Any], sku: str, product_name: Optional[str], brand: Optional[str], url: Optional[str]
    ) -> DiscoveryResult:
        """Build a finalized DiscoveryResult from raw extraction."""
        cost_summary = self._cost_tracker.get_cost_summary()
        record_ai_extraction(
            scraper_name=f"ai_discovery_{brand or 'unknown'}",
            success=True,
            cost_usd=cost_summary.get("total_cost_usd", 0),
            duration_seconds=0.0,
            anti_bot_detected=bool(result.get("anti_bot_detected", False)),
        )

        return DiscoveryResult(
            success=True,
            sku=sku,
            product_name=result.get("product_name") or product_name,
            brand=result.get("brand") or brand,
            description=result.get("description"),
            size_metrics=result.get("size_metrics"),
            images=result.get("images", []),
            categories=result.get("categories", []),
            url=url,
            source_website=str(__import__("urllib.parse", fromlist=["urlparse"]).urlparse(url).netloc if url else "unknown"),
            confidence=float(result.get("confidence", 0) or 0),
            cost_usd=cost_summary.get("total_cost_usd", 0),
        )

    async def _extract_candidates_parallel(self, urls: list[str], sku: str, product_name: Optional[str], brand: Optional[str]) -> list[dict[str, Any]]:
        """Extract product data from multiple URLs in parallel using arun_many."""
        try:
            from crawl4ai.extraction_strategy import LLMExtractionStrategy
            from crawl4ai import LLMConfig

            # crawl4ai_engine is optional at runtime; import here to avoid import-time failures
            try:
                from crawl4ai_engine.engine import Crawl4AIEngine
            except Exception:
                Crawl4AIEngine = None  # type: ignore

            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                return []

            instruction = build_extraction_instruction(sku, brand, product_name)
            llm_strategy = LLMExtractionStrategy(
                llm_config=LLMConfig(provider=f"openai/{self.llm_model}", api_token=api_key),
                schema=ProductData.model_json_schema(),
                extraction_type="schema",
                instruction=instruction,
            )

            engine_config = {
                "browser": {"headless": self.headless},
                "crawler": {
                    "magic": True,
                    "simulate_user": True,
                    "remove_overlay_elements": True,
                    "js_code": get_scroll_javascript(),
                    "extraction_strategy": llm_strategy,
                    "concurrency_limit": len(urls),
                },
            }

            if Crawl4AIEngine is None:
                logger.warning("Crawl4AIEngine not available; parallel extraction disabled")
                return []

            # Use the imported Crawl4AIEngine symbol if present
            try:
                EngineClass = Crawl4AIEngine
            except NameError:
                logger.warning("Crawl4AIEngine not available in runtime; parallel extraction disabled")
                return []

            async with EngineClass(engine_config) as engine:
                raw_results = await engine.crawl_many(urls)

                final_results = []
                for r in raw_results:
                    if r.get("success") and r.get("extracted_content"):
                        try:
                            data = json.loads(r["extracted_content"])
                            if data and isinstance(data, list):
                                product_data = data[0]
                                product_data["success"] = True
                                product_data["url"] = r.get("url")
                                final_results.append(product_data)
                        except json.JSONDecodeError:
                            continue
                return final_results

        except Exception as e:
            logger.error(f"[AI Discovery] Parallel extraction failed: {e}")
            return []

    async def _extract_product_data(
        self,
        url: str,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
    ) -> dict[str, Any]:
        """Extract product data from the selected URL using centralized Crawl4AIEngine."""
        try:
            from crawl4ai.extraction_strategy import LLMExtractionStrategy
            from crawl4ai import LLMConfig

            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                return {"success": False, "error": "OPENAI_API_KEY not set"}

            instruction = build_extraction_instruction(sku, brand, product_name)

            llm_strategy = LLMExtractionStrategy(
                llm_config=LLMConfig(
                    provider=f"openai/{self.llm_model}",
                    api_token=api_key,
                ),
                schema=ProductData.model_json_schema(),
                extraction_type="schema",
                instruction=instruction,
            )

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
                    "cache_mode": "BYPASS",  # Discovery usually wants fresh data
                    "js_code": get_scroll_javascript(),
                    "extraction_strategy": llm_strategy,
                    "timeout": 30000,
                },
            }

            # Crawl4AIEngine may not be importable in test environments; import lazily
            try:
                from crawl4ai_engine.engine import Crawl4AIEngine as _Crawl4AIEngine
            except Exception:
                _Crawl4AIEngine = None  # type: ignore

            if _Crawl4AIEngine is None:
                logger.warning("Crawl4AIEngine not available; extraction disabled")
                return {"success": False, "error": "Crawl4AIEngine not available"}

            async with _Crawl4AIEngine(engine_config) as engine:
                result = await engine.crawl(url)

                if result.get("success") and result.get("extracted_content"):
                    extracted_content = result["extracted_content"]
                    if isinstance(extracted_content, str):
                        raw_content = extracted_content.strip()
                        if raw_content.startswith("[") and '"error"' in raw_content.lower() and "auth" in raw_content.lower():
                            return await self._extract_product_data_fallback(
                                url=url,
                                sku=sku,
                                product_name=product_name,
                                brand=brand,
                            )

                    try:
                        data = json.loads(extracted_content)
                        if data and isinstance(data, list):
                            product_data = data[0]
                            product_data["success"] = True
                            product_data["url"] = url

                            # Calculate confidence based on filled fields
                            required_fields = ["product_name", "brand", "description", "size_metrics", "images", "categories"]
                            filled = sum(1 for f in required_fields if product_data.get(f))
                            product_data["confidence"] = filled / len(required_fields)

                            return product_data
                    except json.JSONDecodeError:
                        return {
                            "success": False,
                            "error": "Could not parse extraction result",
                            "raw_response": extracted_content[:500],
                        }

                return {
                    "success": False,
                    "error": result.get("error") or "Extraction failed or returned no content",
                }

        except Exception as e:
            logger.error(f"[AI Discovery] Extraction failed: {e}")
            # Fallback to manual HTTP extraction if crawl4ai fails completely
            return await self._extract_product_data_fallback(
                url=url,
                sku=sku,
                product_name=product_name,
                brand=brand,
            )

    async def _extract_product_data_fallback(
        self,
        url: str,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
    ) -> dict[str, Any]:
        """Fallback extraction using HTTP fetch and JSON-LD parsing."""
        try:
            import httpx

            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                html_text = response.text

            jsonld_result = self._extraction.extract_product_from_html_jsonld(
                html_text=html_text,
                source_url=str(response.url),
                sku=sku,
                product_name=product_name,
                brand=brand,
                matching_utils=self._matching,
            )
            if jsonld_result:
                jsonld_result["url"] = str(response.url)
                return jsonld_result

            # Fallback to meta tags using shared utility
            meta_result = extract_product_from_meta_tags(self._extraction, self._matching, html_text, str(response.url), product_name, brand)
            if meta_result:
                return meta_result

            return {
                "success": False,
                "error": "Fallback extraction found no structured product data",
            }

        except Exception as error:
            return {
                "success": False,
                "error": f"Fallback extraction failed: {error}",
            }

    def _heuristic_source_selection(
        self,
        search_results: list[dict[str, Any]],
        brand: Optional[str],
    ) -> Optional[str]:
        """Heuristically select the best source URL from search results.

        Args:
            search_results: List of search result dictionaries
            brand: Expected brand name

        Returns:
            URL of the best candidate, or None if no suitable candidate found
        """
        if not search_results:
            return None

        for result in search_results:
            url = result.get("url")
            if not url:
                continue

            domain = self._scoring.domain_from_url(url)

            # Prefer brand domain if brand is provided
            if brand and self._scoring.is_brand_domain(domain, brand):
                return url

            # Prefer trusted retailers
            if self._scoring.is_trusted_retailer(domain):
                return url

        # Fallback to first result if no brand/trusted match
        return search_results[0].get("url")


# Convenience function for direct usage
async def scrape_product(sku: str, product_name: Optional[str] = None, brand: Optional[str] = None, **kwargs) -> DiscoveryResult:
    """Scrape a product using AI discovery.

    Convenience function that creates a scraper instance and runs extraction.
    """
    scraper = AIDiscoveryScraper(**kwargs)
    return await scraper.scrape_product(sku, product_name, brand)


async def scrape_product(sku: str, product_name: Optional[str] = None, brand: Optional[str] = None, **kwargs) -> DiscoveryResult:
    """Scrape a product using AI discovery.

    Convenience function that creates a scraper instance and runs extraction.
    """
    scraper = AIDiscoveryScraper(**kwargs)
    return await scraper.scrape_product(sku, product_name, brand)


# Convenience function for direct usage
async def scrape_product(sku: str, product_name: Optional[str] = None, brand: Optional[str] = None, **kwargs) -> DiscoveryResult:
    """Scrape a product using AI discovery.

    Convenience function that creates a scraper instance and runs extraction.
    """
    scraper = AIDiscoveryScraper(**kwargs)
    return await scraper.scrape_product(sku, product_name, brand)
