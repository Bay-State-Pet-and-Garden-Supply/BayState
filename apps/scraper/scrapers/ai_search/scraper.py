"""Main AI Search Scraper implementation."""

import asyncio
import json
import logging
import os
from typing import Any, Optional

from scrapers.ai_cost_tracker import AICostTracker
from scrapers.ai_metrics import record_ai_extraction
from scrapers.ai_search.models import AISearchResult
from scrapers.ai_search.scoring import SearchScorer
from scrapers.ai_search.matching import MatchingUtils
from scrapers.ai_search.extraction import ExtractionUtils
from scrapers.ai_search.search import BraveSearchClient
from scrapers.ai_search.query_builder import QueryBuilder
from scrapers.ai_search.validation import ExtractionValidator
from scrapers.ai_search.source_selector import LLMSourceSelector
from scrapers.ai_search.name_consolidator import NameConsolidator

logger = logging.getLogger(__name__)


class AISearchScraper:
    """AI-powered search scraper for universal product extraction.

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
        cache_enabled: bool = True,
        extraction_strategy: str = "llm",
        prompt_version: str = "v1",
    ):
        """Initialize the AI discovery scraper.

        Args:
            headless: Whether to run browser in headless mode
            max_search_results: Number of search results to analyze
            max_steps: Maximum browser actions per extraction
            confidence_threshold: Minimum confidence score to accept result
            llm_model: LLM model to use for AI extraction
            cache_enabled: Whether to enable/disable Crawl4AI caching
            extraction_strategy: Strategy for data extraction (llm, json_ld, etc)
            prompt_version: Which prompt version to use (v1, v2, etc)
        """
        self.headless = headless
        self.max_search_results = max_search_results
        self.max_steps = max_steps
        self.confidence_threshold = confidence_threshold
        self.llm_model = llm_model
        self.cache_enabled = cache_enabled
        self.extraction_strategy = extraction_strategy
        self.prompt_version = prompt_version
        self.use_ai_source_selection = os.getenv("AI_SEARCH_USE_LLM_SOURCE_RANKING", "false").lower() == "true"
        self._cost_tracker = AICostTracker()
        self._browser: Any = None
        self._llm: Any = None
        # Telemetry tracking for job-level summary
        self._telemetry: dict[str, Any] = {
            "urls": [],
            "llm_heuristic_agreement": [],
            "by_stage": {
                "source_selected": 0,
                "fetch_attempt": 0,
                "fetch_ok": 0,
                "fetch_fail": 0,
                "extraction": 0,
                "validation": 0,
                "validation_pass": 0,
                "validation_fail": 0,
            },
        }

        # Initialize submodules
        self._scoring = SearchScorer()
        self._matching = MatchingUtils()
        self._extraction = ExtractionUtils(self._scoring)
        self._search_client = BraveSearchClient(max_results=max_search_results)
        self._query_builder = QueryBuilder()
        self._validator = ExtractionValidator(confidence_threshold)
        self._source_selector = LLMSourceSelector(model=llm_model)
        self._name_consolidator = NameConsolidator(model=llm_model)

        # Load unified extractors
        from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor, FallbackExtractor

        self._crawl4ai_extractor = Crawl4AIExtractor(
            headless=headless,
            llm_model=llm_model,
            scoring=self._scoring,
            matching=self._matching,
            cache_enabled=cache_enabled,
            extraction_strategy=extraction_strategy,
            prompt_version=prompt_version,
        )
        self.extractor = self._crawl4ai_extractor  # Alias for QA
        self._fallback_extractor = FallbackExtractor(
            scoring=self._scoring,
            matching=self._matching,
        )

    def _log_telemetry(self, sku: str, url: str, stage: str, success: bool, details: str = "", selection_method: Optional[str] = None) -> None:
        """Log structured telemetry for a URL attempt."""
        telemetry_entry = {
            "sku": sku,
            "url": url,
            "stage": stage,
            "success": success,
            "details": details,
            "selection_method": selection_method,
        }
        self._telemetry["urls"].append(telemetry_entry)
        if success:
            self._telemetry["by_stage"][f"{stage}_ok"] = self._telemetry["by_stage"].get(f"{stage}_ok", 0) + 1
        else:
            self._telemetry["by_stage"][f"{stage}_fail"] = self._telemetry["by_stage"].get(f"{stage}_fail", 0) + 1
        logger.info(f"[AI Search] URL telemetry: {json.dumps(telemetry_entry)}")

    def _log_telemetry_summary(self, sku: str) -> None:
        """Log job-level summary at completion."""
        urls = self._telemetry["urls"]
        total = len(urls)
        successful = sum(1 for u in urls if u.get("stage") == "validation" and u.get("success"))
        failed = total - successful
        
        # Calculate agreement if LLM was used
        agreement_rate = 0.0
        if self._telemetry["llm_heuristic_agreement"]:
            agreement_rate = sum(1 for a in self._telemetry["llm_heuristic_agreement"] if a) / len(self._telemetry["llm_heuristic_agreement"])

        summary = {
            "sku": sku,
            "total_urls": total,
            "successful": successful,
            "failed": failed,
            "llm_heuristic_agreement_rate": agreement_rate,
            "by_stage": self._telemetry["by_stage"],
        }
        logger.info(f"[AI Search] Job telemetry summary: {json.dumps(summary)}")

    async def scrape_products_batch(
        self,
        items: list[dict[str, Any]],
        max_concurrency: int = 4,
    ) -> list[AISearchResult]:
        """Scrape multiple products in batch."""
        semaphore = asyncio.Semaphore(max(1, max_concurrency))

        async def _run_one(item: dict[str, Any]) -> AISearchResult:
            async with semaphore:
                sku = str(item.get("sku", "")).strip()
                if not sku:
                    return AISearchResult(success=False, sku="", error="Missing sku")
                return await self.scrape_product(
                    sku=sku,
                    product_name=item.get("product_name"),
                    brand=item.get("brand"),
                    category=item.get("category"),
                )

        return await asyncio.gather(*[_run_one(item) for item in items])

    async def _identify_best_source(
        self,
        search_results: list[dict[str, Any]],
        sku: str,
        brand: Optional[str],
        product_name: Optional[str],
    ) -> Optional[str]:
        """Select the best source URL.

        We currently use deterministic scoring for reliability. This method remains
        async so LLM-based ranking can be reintroduced without changing callers.
        """
        if self.use_ai_source_selection:
            logger.info(f"[AI Search] Using LLM source selection for SKU {sku}")
            heuristic_url = self._heuristic_source_selection(
                search_results=search_results,
                sku=sku,
                brand=brand,
                product_name=product_name,
            )
            
            best_url, cost = await self._source_selector.select_best_url(
                results=search_results,
                sku=sku,
                product_name=product_name or "",
            )
            
            # Track agreement
            if best_url and heuristic_url:
                agreement = best_url == heuristic_url
                self._telemetry["llm_heuristic_agreement"].append(agreement)
                logger.info(f"[AI Search] LLM/Heuristic agreement: {agreement}")

            if best_url:
                logger.info(f"[AI Search] LLM selected source: {best_url}")
                return best_url
            logger.info("[AI Search] LLM failed to select a clear source, falling back to heuristics")
            return heuristic_url

        return self._heuristic_source_selection(
            search_results=search_results,
            sku=sku,
            brand=brand,
            product_name=product_name,
        )

    def _heuristic_source_selection(
        self,
        search_results: list[dict[str, Any]],
        sku: str,
        brand: Optional[str] = None,
        product_name: Optional[str] = None,
        category: Optional[str] = None,
    ) -> Optional[str]:
        """Pick the highest-signal candidate URL using existing scoring logic."""
        if not search_results:
            return None

        strong_url = self._scoring.pick_strong_candidate_url(
            search_results=search_results,
            sku=sku,
            brand=brand,
            product_name=product_name,
            category=category,
        )
        if strong_url:
            return strong_url

        ranked_candidates: list[tuple[float, str]] = []
        filtered_results: list[dict[str, Any]] = []
        for result in search_results:
            url = str(result.get("url") or "").strip()
            if not url:
                continue

            domain = self._scoring.domain_from_url(url.lower())
            if domain and any(domain == blocked or domain.endswith(f".{blocked}") for blocked in self._scoring.BLOCKED_DOMAINS):
                continue

            filtered_results.append(result)

        for result in filtered_results:
            url = str(result.get("url") or "").strip()
            domain = self._scoring.domain_from_url(url.lower())
            if domain and any(domain == blocked or domain.endswith(f".{blocked}") for blocked in self._scoring.BLOCKED_DOMAINS):
                continue
            if self._scoring.is_low_quality_result(result):
                continue
            score = self._scoring.score_search_result(
                result=result,
                sku=sku,
                brand=brand,
                product_name=product_name,
                category=category,
            )
            ranked_candidates.append((score, url))

        if ranked_candidates:
            ranked_candidates.sort(key=lambda item: item[0], reverse=True)
            return ranked_candidates[0][1]

        logger.warning("[AI Search] No valid sources found after filtering")
        return None

    async def scrape_product(
        self,
        sku: str,
        product_name: Optional[str] = None,
        brand: Optional[str] = None,
        category: Optional[str] = None,
    ) -> AISearchResult:
        """Scrape a product using AI search.

        Args:
            sku: Product SKU or identifier
            product_name: Product name (optional, helps search)
            brand: Product brand (optional, helps identify manufacturer site)
            category: Product category (optional)

        Returns:
            AISearchResult with extracted data
        """
        try:
            # Step 1: Reconnaissance Search (Initial Pass)
            # Use SKU and abbreviated name to gather context
            initial_query = self._query_builder.build_search_query(sku, product_name, brand, category)
            logger.info(f"[AI Search] Phase 1 Reconnaissance: {initial_query}")
            
            raw_results, _ = await self._search_client.search(initial_query)
            
            # Step 2: Name Consolidation
            # Use LLM to infer the canonical "real" name from search snippets
            consolidated_name = product_name
            if self.use_ai_source_selection and raw_results:
                logger.info(f"[AI Search] Consolidating name for '{product_name}'...")
                consolidated_name, _ = await self._name_consolidator.consolidate_name(
                    sku=sku,
                    abbreviated_name=product_name or "",
                    search_snippets=raw_results
                )
            
            # Step 3: Targeted Search (Final Pass)
            # Conduct another search using the new consolidated name for better manufacturer targeting
            search_query = self._query_builder.build_search_query(sku, consolidated_name, brand, category)
            logger.info(f"[AI Search] Phase 2 Targeted Search: {search_query}")

            # Step 4: Search for product pages (Targeted)
            search_results: list[dict[str, Any]] = []
            search_error: Optional[str] = None
            best_score_seen = float("-inf")
            for query_variant in self._query_builder.build_query_variants(
                sku=sku,
                product_name=consolidated_name,
                brand=brand,
                category=category,
            ):
                raw_results, raw_error = await self._search_client.search(query_variant)
                prepared_results = self._scoring.prepare_search_results(raw_results, sku, brand, consolidated_name, category)
                if prepared_results:
                    top_score = self._scoring.score_search_result(
                        result=prepared_results[0],
                        sku=sku,
                        brand=brand,
                        product_name=consolidated_name,
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
                return AISearchResult(success=False, sku=sku, error=error_msg)

            # Update working name for the rest of the flow
            product_name = consolidated_name

            # Step 5: Optimization - If brand is missing, use PARALLEL discovery
            # We crawl the top 3 results simultaneously using arun_many
            if not brand:
                logger.info("[AI Search] Brand missing - initiating parallel candidate discovery")
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
                            target_url = self._heuristic_source_selection(
                                search_results,
                                sku,
                                brand,
                                product_name,
                            )
                else:
                    if not search_results:
                        break
                    target_url = str(search_results[0].get("url") or "")

                if not target_url or target_url in tried_urls:
                    if attempt < max_attempts - 1:
                        search_results = [r for r in search_results if r.get("url") != target_url]
                        continue
                # Telemetry: source selected
                self._log_telemetry(sku, target_url, "source_selected", True, f"attempt {attempt + 1}")
                logger.info(f"[AI Search] Selected source (attempt {attempt + 1}): {target_url}")

                logger.info(f"[AI Search] Selected source (attempt {attempt + 1}): {target_url}")

                selected_result = next((result for result in search_results if result.get("url") == target_url), None)
                if selected_result and self._scoring.is_low_quality_result(selected_result):
                    last_rejection_reason = "Selected source appears to be a non-product/review/aggregator page"
                    self._log_telemetry(sku, target_url, "source_selected", False, last_rejection_reason)
                    search_results = [r for r in search_results if r.get("url") != target_url]
                    continue
                    last_rejection_reason = "Selected source appears to be a non-product/review/aggregator page"
                    search_results = [r for r in search_results if r.get("url") != target_url]
                    continue

                tried_urls.add(target_url)
                # Telemetry: fetch attempt
                self._log_telemetry(sku, target_url, "fetch_attempt", True, "initiated")
                extraction_result = await self._extract_product_data(target_url, sku, product_name, brand)
                # Telemetry: extraction result
                fetch_ok = extraction_result is not None and extraction_result.get("success")
                self._log_telemetry(sku, target_url, "fetch_attempt", fetch_ok, extraction_result.get("error") if not fetch_ok else "ok")
                # Telemetry: validation attempt
                self._log_telemetry(sku, target_url, "validation", True, "initiated")
                is_acceptable, rejection_reason = self._validator.validate_extraction_match(
                    extraction_result=extraction_result,
                    sku=sku,
                    product_name=product_name,
                    brand=brand,
                    source_url=target_url,
                )
                # Telemetry: validation result
                self._log_telemetry(sku, target_url, "validation", is_acceptable, rejection_reason if not is_acceptable else "ok")
                if is_acceptable:
                    accepted_result = extraction_result
                    break

                last_rejection_reason = rejection_reason
                search_results = [r for r in search_results if r.get("url") != target_url]

            if not accepted_result:
                if extraction_result and extraction_result.get("error"):
                    error_msg = extraction_result.get("error")
                elif last_rejection_reason:
                    error_msg = last_rejection_reason
                else:
                    error_msg = "Extraction failed"
                # Telemetry: job summary on failure
                self._log_telemetry_summary(sku)
                return AISearchResult(success=False, sku=sku, error=str(error_msg))

            # Telemetry: job summary on success
            self._log_telemetry_summary(sku)
            return self._build_discovery_result(accepted_result, sku, product_name, brand, target_url)

        except Exception as e:
            logger.error(f"[AI Search] Error scraping {sku}: {e}")
            return AISearchResult(success=False, sku=sku, error=str(e))

    def _build_discovery_result(
        self, result: dict[str, Any], sku: str, product_name: Optional[str], brand: Optional[str], url: Optional[str]
    ) -> AISearchResult:
        """Build a finalized AISearchResult from raw extraction."""
        cost_summary = self._cost_tracker.get_cost_summary()
        record_ai_extraction(
            scraper_name=f"ai_search_{brand or 'unknown'}",
            success=True,
            cost_usd=cost_summary.get("total_cost_usd", 0),
            duration_seconds=0.0,
            anti_bot_detected=bool(result.get("anti_bot_detected", False)),
        )

        return AISearchResult(
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
        """Extract product data from multiple URLs in parallel."""
        # Note: Crawl4AIEngine.crawl_many is still directly used here
        # because the original code parallelizes at the engine level
        # To reuse Crawl4AIExtractor gracefully requires refactoring its signature to support batch,
        # but for safety/minimal disruption, we use asyncio.gather across single extractions

        async def _run_extract(url: str) -> Optional[dict[str, Any]]:
            result = await self._extract_product_data(url, sku, product_name, brand)
            if result and result.get("success"):
                return result
            return None

        results = await asyncio.gather(*[_run_extract(url) for url in urls])
        return [r for r in results if r is not None]

    async def _extract_product_data(
        self,
        url: str,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
    ) -> dict[str, Any]:
        """Extract product data from the selected URL, delegating to child extractors."""
        result = await self._crawl4ai_extractor.extract(url, sku, product_name, brand)

        # Signal to fallback means the result was None
        if result is None:
            result = await self._fallback_extractor.extract(url, sku, product_name, brand)

        if not result or not result.get("success"):
            # If standard extraction failed completely, try HTTP fallback
            fallback_result = await self._fallback_extractor.extract(url, sku, product_name, brand)
            if fallback_result and fallback_result.get("success"):
                return fallback_result
            return result or {"success": False, "error": "Extraction returned no content"}

        return result


# Convenience function for direct usage
async def scrape_product(sku: str, product_name: Optional[str] = None, brand: Optional[str] = None, **kwargs) -> AISearchResult:
    """Scrape a product using AI search.

    Convenience function that creates a scraper instance and runs extraction.
    """
    scraper = AISearchScraper(**kwargs)
    return await scraper.scrape_product(sku, product_name, brand)
