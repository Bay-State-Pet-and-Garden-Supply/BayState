"""Main AI Search Scraper implementation."""

import asyncio
import json
import logging
import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Optional, cast

from scrapers.ai_cost_tracker import AICostTracker
from scrapers.ai_metrics import record_ai_extraction
from scrapers.ai_search.models import AISearchResult
from scrapers.ai_search.scoring import SearchScorer
from scrapers.ai_search.matching import MatchingUtils
from scrapers.ai_search.extraction import ExtractionUtils
from scrapers.ai_search.search import SearchClient, normalize_search_provider
from scrapers.ai_search.query_builder import QueryBuilder
from scrapers.ai_search.two_step_refiner import TwoStepSearchRefiner
from scrapers.ai_search.validation import ExtractionValidator
from scrapers.ai_search.source_selector import LLMSourceSelector
from scrapers.ai_search.name_consolidator import NameConsolidator

logger = logging.getLogger(__name__)


def _read_int_env(name: str, default: int, minimum: int = 0) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    try:
        parsed = int(raw_value)
    except ValueError:
        logger.warning("[AI Search] Invalid integer for %s=%r, using %s", name, raw_value, default)
        return default

    return max(minimum, parsed)


def _read_float_env(name: str, default: float, minimum: float = 0.0) -> float:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    try:
        parsed = float(raw_value)
    except ValueError:
        logger.warning("[AI Search] Invalid float for %s=%r, using %s", name, raw_value, default)
        return default

    return max(minimum, parsed)


@dataclass
class _ScrapeCostContext:
    search_cost_usd: float = 0.0
    llm_cost_usd: float = 0.0
    refinement_cost_usd: float = 0.0

    def total_cost_usd(self, tracker_cost_usd: float = 0.0) -> float:
        return float(tracker_cost_usd or 0.0) + float(self.search_cost_usd or 0.0) + float(self.llm_cost_usd or 0.0) + float(self.refinement_cost_usd or 0.0)


class AISearchScraper:
    """AI-powered search scraper for universal product extraction.

    This scraper doesn't require pre-configured site definitions. Instead, it:
    1. Searches for the product using SerpAPI/Google search with provider fallbacks
    2. Uses AI to identify the most likely manufacturer/official product page
    3. Navigates to that page and extracts structured data
    4. Returns results in a standardized format
    """

    def __init__(
        self,
        headless: bool = True,
        max_search_results: int = 15,
        max_steps: int = 15,
        confidence_threshold: float = 0.7,
        llm_model: str = "gpt-4o-mini",
        cache_enabled: bool = True,
        extraction_strategy: str = "llm",
        prompt_version: str = "v1",
        search_provider: str | None = None,
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
            search_provider: Search provider preference (auto, serpapi, brave)
        """
        self.headless = headless
        self.max_search_results = max_search_results
        self.max_steps = max_steps
        self.confidence_threshold = confidence_threshold
        self.llm_model = llm_model
        self.cache_enabled = cache_enabled
        self.extraction_strategy = extraction_strategy
        self.prompt_version = prompt_version
        self.search_provider = normalize_search_provider(search_provider or os.getenv("AI_SEARCH_PROVIDER"))
        self.use_ai_source_selection = os.getenv("AI_SEARCH_USE_LLM_SOURCE_RANKING", "false").lower() == "true"
        self.max_follow_up_queries = _read_int_env("AI_SEARCH_MAX_FOLLOW_UP_QUERIES", default=2)
        # Two-step search refinement configuration
        self.enable_two_step = os.getenv("AI_SEARCH_ENABLE_TWO_STEP", "false").lower() == "true"
        self.secondary_threshold = _read_float_env("AI_SEARCH_SECONDARY_THRESHOLD", default=0.75)
        self.circuit_breaker_threshold = _read_float_env("AI_SEARCH_CIRCUIT_BREAKER_THRESHOLD", default=0.85)
        self.confidence_delta = _read_float_env("AI_SEARCH_CONFIDENCE_DELTA", default=0.1)
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
        self._search_client = SearchClient(max_results=max_search_results, provider=self.search_provider)
        self._query_builder = QueryBuilder()
        self._validator = ExtractionValidator(confidence_threshold)
        self._source_selector = LLMSourceSelector(model=llm_model)
        self._name_consolidator = NameConsolidator(model=llm_model)
        self._two_step_refiner: TwoStepSearchRefiner | None = None
        if self.enable_two_step:
            self._two_step_refiner = TwoStepSearchRefiner(
                search_client=self._search_client,
                query_builder=self._query_builder,
                config={
                    "confidence_threshold_low": self.secondary_threshold,
                    "confidence_threshold_high": self.circuit_breaker_threshold,
                    "min_improvement_delta": self.confidence_delta,
                    "max_follow_up_queries": self.max_follow_up_queries,
                },
                name_consolidator=self._name_consolidator,
            )

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

    async def _search_with_cost(self, query: str) -> tuple[list[dict[str, Any]], str | None, float]:
        search_with_cost = getattr(self._search_client, "search_with_cost", None)
        if callable(search_with_cost):
            typed_search_with_cost = cast(
                Callable[[str], Awaitable[tuple[list[dict[str, Any]], str | None, float]]],
                search_with_cost,
            )
            return await typed_search_with_cost(query)

        raw_results, raw_error = await self._search_client.search(query)
        return raw_results, raw_error, 0.0

    async def _collect_search_candidates(
        self,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        category: Optional[str],
        cost_context: _ScrapeCostContext | None = None,
    ) -> tuple[list[dict[str, Any]], Optional[str], Optional[str]]:
        """Search identifier-first, then expand into broader queries only when needed."""
        initial_query = self._query_builder.build_identifier_query(sku)
        if not initial_query:
            initial_query = self._query_builder.build_search_query(sku, product_name, brand, category)
        logger.info(f"[AI Search] Primary search: {initial_query}")

        seen_queries: set[str] = set()
        aggregated_results: list[dict[str, Any]] = []
        search_error: Optional[str] = None

        async def run_query(query: str) -> None:
            nonlocal search_error
            if not query or query in seen_queries:
                return
            seen_queries.add(query)
            raw_results, raw_error, query_cost = await self._search_with_cost(query)
            if cost_context is not None:
                cost_context.search_cost_usd += float(query_cost or 0.0)
            if raw_results:
                aggregated_results.extend(raw_results)
                search_error = None
            elif raw_error:
                search_error = raw_error

        await run_query(initial_query)

        working_name = product_name
        if self.use_ai_source_selection and aggregated_results and product_name:
            logger.info(f"[AI Search] Consolidating product name for '{product_name}'")
            working_name, consolidation_cost = await self._name_consolidator.consolidate_name(
                sku=sku,
                abbreviated_name=product_name,
                search_snippets=aggregated_results[:5],
            )
            if cost_context is not None:
                cost_context.llm_cost_usd += float(consolidation_cost or 0.0)

        prepared_results = self._prepare_candidate_pool(
            search_results=aggregated_results,
            sku=sku,
            brand=brand,
            product_name=working_name,
            category=category,
        )
        if not self._should_expand_search(
            search_results=prepared_results,
            sku=sku,
            brand=brand,
            product_name=working_name,
            category=category,
        ):
            logger.info("[AI Search] Primary search produced a strong candidate pool; skipping follow-up searches")
            return prepared_results, working_name, search_error

        query_plan = [
            *self._query_builder.build_query_variants(
                sku=sku,
                product_name=working_name,
                brand=brand,
                category=category,
            ),
            self._query_builder.build_search_query(sku, working_name, brand, category),
        ]

        pending_queries: list[str] = []
        for query in query_plan:
            if not query or query in seen_queries:
                continue
            seen_queries.add(query)
            pending_queries.append(query)

        follow_up_queries_run = 0
        for query in pending_queries:
            if follow_up_queries_run >= self.max_follow_up_queries:
                logger.info(
                    "[AI Search] Reached follow-up search budget (%s) for SKU %s",
                    self.max_follow_up_queries,
                    sku,
                )
                break

            raw_results, raw_error, query_cost = await self._search_with_cost(query)
            follow_up_queries_run += 1
            if cost_context is not None:
                cost_context.search_cost_usd += float(query_cost or 0.0)
            if raw_results:
                aggregated_results.extend(raw_results)
                search_error = None
            elif raw_error:
                search_error = raw_error

            prepared_results = self._prepare_candidate_pool(
                search_results=aggregated_results,
                sku=sku,
                brand=brand,
                product_name=working_name,
                category=category,
            )
            if not self._should_expand_search(
                search_results=prepared_results,
                sku=sku,
                brand=brand,
                product_name=working_name,
                category=category,
            ):
                logger.info(
                    "[AI Search] Search expansion stopped after %s follow-up quer%s for SKU %s",
                    follow_up_queries_run,
                    "y" if follow_up_queries_run == 1 else "ies",
                    sku,
                )
                break

        prepared_results = self._prepare_candidate_pool(
            search_results=aggregated_results,
            sku=sku,
            brand=brand,
            product_name=working_name,
            category=category,
        )
        return prepared_results, working_name, search_error

    def _prepare_candidate_pool(
        self,
        search_results: list[dict[str, Any]],
        sku: str,
        brand: Optional[str],
        product_name: Optional[str],
        category: Optional[str],
    ) -> list[dict[str, Any]]:
        return self._scoring.prepare_search_results(
            search_results,
            sku,
            brand,
            product_name,
            category,
        )

    def _should_expand_search(
        self,
        search_results: list[dict[str, Any]],
        sku: str,
        brand: Optional[str],
        product_name: Optional[str],
        category: Optional[str],
    ) -> bool:
        """Return True when we need more search coverage before extraction."""
        if not search_results:
            return True

        strong_candidate_url = self._scoring.pick_strong_candidate_url(
            search_results=search_results,
            sku=sku,
            brand=brand,
            product_name=product_name,
            category=category,
        )
        if strong_candidate_url:
            return False

        high_signal_count = 0
        for result in search_results[:5]:
            if self._scoring.is_low_quality_result(result):
                continue

            if (
                self._scoring.score_search_result(
                    result=result,
                    sku=sku,
                    brand=brand,
                    product_name=product_name,
                    category=category,
                )
                >= 4.5
            ):
                high_signal_count += 1
                if high_signal_count >= 2:
                    return False

        return True

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
        cost_context: _ScrapeCostContext | None = None,
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
            if cost_context is not None:
                cost_context.llm_cost_usd += float(cost or 0.0)

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

        ranked_results = self._scoring.prepare_search_results(
            search_results=search_results,
            sku=sku,
            brand=brand,
            product_name=product_name,
            category=category,
        )
        if ranked_results:
            return str(ranked_results[0].get("url") or "") or None

        logger.warning("[AI Search] No valid sources found after ranking")
        return None

    def _parse_candidate_confidence(self, value: Any) -> Optional[float]:
        if isinstance(value, bool):
            return float(int(value))
        if isinstance(value, (int, float)):
            return max(0.0, min(1.0, float(value)))
        if isinstance(value, str):
            try:
                return max(0.0, min(1.0, float(value.strip() or 0.0)))
            except ValueError:
                return None
        return None

    def _estimate_first_pass_confidence(
        self,
        search_results: list[dict[str, Any]],
        sku: str,
        brand: Optional[str],
        product_name: Optional[str],
        category: Optional[str],
    ) -> float:
        if not search_results:
            return 0.0

        top_result = search_results[0]
        raw_confidence = self._parse_candidate_confidence(top_result.get("confidence"))
        if raw_confidence is not None:
            return raw_confidence

        top_score = self._scoring.score_search_result(
            result=top_result,
            sku=sku,
            brand=brand,
            product_name=product_name,
            category=category,
        )
        second_score = 0.0
        if len(search_results) > 1:
            second_score = self._scoring.score_search_result(
                result=search_results[1],
                sku=sku,
                brand=brand,
                product_name=product_name,
                category=category,
            )

        gap_signal = max(0.0, min(1.0, (top_score - second_score) / 3.0))
        top_signal = max(0.0, min(1.0, top_score / 8.0))
        quality_bonus = 0.0 if self._scoring.is_low_quality_result(top_result) else 0.2
        confidence = max(0.0, min(0.99, (0.55 * top_signal) + (0.25 * gap_signal) + quality_bonus))

        strong_candidate_url = self._scoring.pick_strong_candidate_url(
            search_results=search_results,
            sku=sku,
            brand=brand,
            product_name=product_name,
            category=category,
        )
        top_url = str(top_result.get("url") or "").strip()
        if strong_candidate_url and top_url == strong_candidate_url:
            confidence = max(confidence, min(0.99, self.circuit_breaker_threshold))

        return confidence

    def _build_first_pass_result(
        self,
        search_results: list[dict[str, Any]],
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        category: Optional[str],
    ) -> AISearchResult:
        top_result = search_results[0] if search_results else {}
        target_url = str(top_result.get("url") or "").strip() or None
        description = str(top_result.get("description") or "").strip() or None
        confidence = self._estimate_first_pass_confidence(
            search_results=search_results,
            sku=sku,
            brand=brand,
            product_name=product_name,
            category=category,
        )

        return AISearchResult(
            success=True,
            sku=sku,
            product_name=product_name,
            brand=brand,
            description=description,
            url=target_url,
            source_website=self._scoring.domain_from_url(target_url) if target_url else None,
            confidence=confidence,
            selection_method="first-pass-search",
        )

    def _refined_results_to_candidates(self, refined_results: list[AISearchResult]) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []
        for refined_result in refined_results:
            target_url = str(refined_result.url or "").strip()
            if not target_url:
                continue
            candidates.append(
                {
                    "url": target_url,
                    "title": refined_result.product_name or "",
                    "description": refined_result.description or "",
                    "confidence": float(refined_result.confidence or 0.0),
                    "provider": "two-step-search",
                    "result_type": "organic",
                }
            )

        candidates.sort(key=lambda candidate: float(candidate.get("confidence") or 0.0), reverse=True)
        return candidates

    async def _maybe_refine_search_results(
        self,
        search_results: list[dict[str, Any]],
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        category: Optional[str],
        cost_context: _ScrapeCostContext | None = None,
    ) -> list[dict[str, Any]]:
        if not self.enable_two_step or self._two_step_refiner is None or not search_results:
            return search_results

        first_pass_result = self._build_first_pass_result(
            search_results=search_results,
            sku=sku,
            product_name=product_name,
            brand=brand,
            category=category,
        )
        if first_pass_result.confidence >= self.secondary_threshold:
            return search_results

        try:
            refinement_result = await self._two_step_refiner.refine(
                first_pass_result,
                search_results,
                first_pass_result.confidence,
            )
        except Exception as exc:
            logger.warning("[AI Search] Two-step refinement failed for SKU %s: %s", sku, exc)
            return search_results

        if cost_context is not None:
            cost_context.refinement_cost_usd += float(refinement_result.cost_usd or 0.0)

        if not refinement_result.two_step_triggered or not refinement_result.two_step_improved:
            return search_results

        refined_results = refinement_result.second_pass_results or []
        refined_candidates = self._refined_results_to_candidates(refined_results)
        if not refined_candidates:
            return search_results

        prepared_refined_results = self._prepare_candidate_pool(
            search_results=refined_candidates,
            sku=sku,
            brand=brand,
            product_name=product_name,
            category=category,
        )
        if not prepared_refined_results:
            return search_results

        logger.info(
            "[AI Search] Using two-step refined results for SKU %s (%.2f -> %.2f)",
            sku,
            first_pass_result.confidence,
            refinement_result.second_pass_confidence or first_pass_result.confidence,
        )
        return prepared_refined_results

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
        cost_context = _ScrapeCostContext()
        try:
            search_results, product_name, search_error = await self._collect_search_candidates(
                sku=sku,
                product_name=product_name,
                brand=brand,
                category=category,
                cost_context=cost_context,
            )

            if not search_results:
                error_msg = search_error or "No search results found"
                return AISearchResult(
                    success=False,
                    sku=sku,
                    error=error_msg,
                    cost_usd=cost_context.total_cost_usd(),
                )

            search_results = await self._maybe_refine_search_results(
                search_results=search_results,
                sku=sku,
                product_name=product_name,
                brand=brand,
                category=category,
                cost_context=cost_context,
            )

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
                    return self._build_discovery_result(
                        accepted_result,
                        sku,
                        product_name,
                        brand,
                        target_url,
                        cost_context=cost_context,
                    )

            ordered_results = list(search_results)
            prioritized_url = None
            if self.use_ai_source_selection:
                prioritized_url = await self._identify_best_source(
                    ordered_results[:5],
                    sku,
                    brand,
                    product_name,
                    cost_context=cost_context,
                )
            if not prioritized_url:
                prioritized_url = self._heuristic_source_selection(
                    ordered_results,
                    sku,
                    brand,
                    product_name,
                    category,
                )

            if prioritized_url:
                ordered_results.sort(key=lambda result: 0 if str(result.get("url") or "") == prioritized_url else 1)

            max_attempts = min(3, len(ordered_results))
            extraction_result: Optional[dict[str, Any]] = None
            accepted_result: Optional[dict[str, Any]] = None
            last_rejection_reason: Optional[str] = None
            target_url: Optional[str] = None
            tried_urls: set[str] = set()

            for attempt, candidate in enumerate(ordered_results[:max_attempts], start=1):
                target_url = str(candidate.get("url") or "").strip()
                if not target_url or target_url in tried_urls:
                    continue

                self._log_telemetry(sku, target_url, "source_selected", True, f"attempt {attempt}")
                logger.info(f"[AI Search] Selected source (attempt {attempt}): {target_url}")

                if self._scoring.is_low_quality_result(candidate):
                    last_rejection_reason = "Selected source appears to be a non-product/review/aggregator page"
                    self._log_telemetry(sku, target_url, "source_selected", False, last_rejection_reason)
                    continue

                tried_urls.add(target_url)
                self._log_telemetry(sku, target_url, "fetch_attempt", True, "initiated")
                extraction_result = await self._extract_product_data(target_url, sku, product_name, brand)
                fetch_ok = bool(extraction_result.get("success"))
                fetch_details = str(extraction_result.get("error") or "ok") if not fetch_ok else "ok"
                self._log_telemetry(sku, target_url, "fetch_attempt", fetch_ok, fetch_details)
                self._log_telemetry(sku, target_url, "validation", True, "initiated")
                is_acceptable, rejection_reason = self._validator.validate_extraction_match(
                    extraction_result=extraction_result,
                    sku=sku,
                    product_name=product_name,
                    brand=brand,
                    source_url=target_url,
                )
                self._log_telemetry(sku, target_url, "validation", is_acceptable, rejection_reason if not is_acceptable else "ok")
                if is_acceptable:
                    accepted_result = extraction_result
                    break

                last_rejection_reason = rejection_reason

            if not accepted_result:
                if extraction_result and extraction_result.get("error"):
                    error_msg = extraction_result.get("error")
                elif last_rejection_reason:
                    error_msg = last_rejection_reason
                else:
                    error_msg = "Extraction failed"
                # Telemetry: job summary on failure
                self._log_telemetry_summary(sku)
                return AISearchResult(
                    success=False,
                    sku=sku,
                    error=str(error_msg),
                    cost_usd=cost_context.total_cost_usd(),
                )

            # Telemetry: job summary on success
            self._log_telemetry_summary(sku)
            return self._build_discovery_result(
                accepted_result,
                sku,
                product_name,
                brand,
                target_url,
                cost_context=cost_context,
            )

        except Exception as e:
            logger.error(f"[AI Search] Error scraping {sku}: {e}")
            return AISearchResult(
                success=False,
                sku=sku,
                error=str(e),
                cost_usd=cost_context.total_cost_usd(),
            )

    def _build_discovery_result(
        self,
        result: dict[str, Any],
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        url: Optional[str],
        cost_context: _ScrapeCostContext | None = None,
    ) -> AISearchResult:
        """Build a finalized AISearchResult from raw extraction."""
        cost_summary = self._cost_tracker.get_cost_summary()
        total_cost_usd = (
            cost_context.total_cost_usd(cost_summary.get("total_cost_usd", 0))
            if cost_context is not None
            else float(cost_summary.get("total_cost_usd", 0) or 0.0)
        )
        record_ai_extraction(
            scraper_name=f"ai_search_{brand or 'unknown'}",
            success=True,
            cost_usd=total_cost_usd,
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
            cost_usd=total_cost_usd,
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
