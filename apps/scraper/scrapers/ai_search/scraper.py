"""Main AI Search Scraper implementation."""

import asyncio
import json
import logging
import os
from collections import OrderedDict, defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Optional, cast

from scrapers.ai_cost_tracker import AICostTracker
from scrapers.ai_metrics import record_ai_extraction
from scrapers.ai_search.models import AISearchResult
from scrapers.ai_search.scoring import SearchScorer, record_domain_attempt
from scrapers.ai_search.matching import MatchingUtils
from scrapers.ai_search.extraction import ExtractionUtils
from scrapers.ai_search.llm_runtime import resolve_llm_runtime
from scrapers.ai_search.batch_search import BatchSearchOrchestrator, ProductInput
from scrapers.ai_search.search import SearchClient, normalize_search_provider
from scrapers.ai_search.query_builder import QueryBuilder
from scrapers.ai_search.cohort_state import _BatchCohortState
from scrapers.ai_search.name_consolidator import NameConsolidator
from scrapers.ai_search.source_selector import LLMSourceSelector
from scrapers.ai_search.two_step_refiner import TwoStepSearchRefiner
from scrapers.ai_search.validation import ExtractionValidator

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


class _BatchExtractorAdapter:
    """Adapt the scraper's extraction pipeline to the batch orchestrator interface."""

    def __init__(self, scraper: "AISearchScraper") -> None:
        self._scraper = scraper

    async def extract(
        self,
        url: str,
        sku: str,
        product_name: str | None,
        brand: str | None,
    ) -> dict[str, Any]:
        return await self._scraper._extract_product_data(url, sku, product_name, brand)


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
        llm_provider: str = "openai",
        llm_base_url: str | None = None,
        llm_api_key: str | None = None,
        crawl4ai_llm_provider: str | None = None,
        crawl4ai_llm_model: str | None = None,
        crawl4ai_llm_base_url: str | None = None,
        crawl4ai_llm_api_key: str | None = None,
        cache_enabled: bool = True,
        extraction_strategy: str = "llm",
        prompt_version: str = "v1",
        search_provider: str | None = None,
        prefer_manufacturer: bool = True,
    ):
        """Initialize the AI discovery scraper.

        Args:
            headless: Whether to run browser in headless mode
            max_search_results: Number of search results to analyze
            max_steps: Maximum browser actions per extraction
            confidence_threshold: Minimum confidence score to accept result
            llm_model: LLM model to use for AI extraction
            llm_provider: LLM provider type (openai, openai_compatible, or gemini)
            llm_base_url: OpenAI-compatible base URL override
            llm_api_key: Provider API key override
            crawl4ai_llm_provider: Optional provider override for crawl4ai extraction
            crawl4ai_llm_model: Optional model override for crawl4ai extraction
            crawl4ai_llm_base_url: Optional base URL override for crawl4ai extraction
            crawl4ai_llm_api_key: Optional API key override for crawl4ai extraction
            cache_enabled: Whether to enable/disable Crawl4AI caching
            extraction_strategy: Strategy for data extraction (llm, json_ld, etc)
            prompt_version: Which prompt version to use (v1, v2, etc)
            search_provider: Search provider preference (auto, serpapi, gemini)
        """
        self._llm_runtime = resolve_llm_runtime(
            provider=llm_provider,
            model=llm_model,
            base_url=llm_base_url,
            api_key=llm_api_key,
        )
        self._crawl4ai_runtime = resolve_llm_runtime(
            provider=crawl4ai_llm_provider or llm_provider,
            model=crawl4ai_llm_model or llm_model,
            base_url=crawl4ai_llm_base_url or llm_base_url,
            api_key=crawl4ai_llm_api_key or llm_api_key,
        )
        self.headless = headless
        self.max_search_results = max_search_results
        self.max_steps = max_steps
        self.confidence_threshold = confidence_threshold
        self.llm_model = self._llm_runtime.model
        self.llm_provider = self._llm_runtime.provider
        self.llm_base_url = self._llm_runtime.base_url
        self.llm_api_key = self._llm_runtime.api_key
        self.cache_enabled = cache_enabled
        self.extraction_strategy = extraction_strategy
        self.prompt_version = prompt_version
        self.search_provider = normalize_search_provider(search_provider or os.getenv("AI_SEARCH_PROVIDER"))
        self.prefer_manufacturer = prefer_manufacturer
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

        # Cohort state cache: persists domain/brand preferences across batch calls
        # within the same AISearchScraper instance lifetime. Bounded to prevent
        # unbounded growth during marathon scraping sessions.
        self._cohort_cache: OrderedDict[str, _BatchCohortState] = OrderedDict()
        self._cohort_cache_max = 128

        # Initialize submodules
        self._scoring = SearchScorer()
        self._matching = MatchingUtils()
        self._extraction = ExtractionUtils(self._scoring)
        self._search_client = SearchClient(
            max_results=max_search_results,
            provider=self.search_provider,
            api_key=self.llm_api_key,
        )
        self._query_builder = QueryBuilder()
        self._validator = ExtractionValidator(confidence_threshold)
        self._source_selector = LLMSourceSelector(
            model=self.llm_model,
            provider=self.llm_provider,
            base_url=self.llm_base_url,
            api_key=self.llm_api_key,
        )
        self._name_consolidator = NameConsolidator(
            model=self.llm_model,
            provider=self.llm_provider,
            base_url=self.llm_base_url,
            api_key=self.llm_api_key,
        )
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
            llm_model=self._crawl4ai_runtime.model,
            llm_provider=self._crawl4ai_runtime.provider,
            llm_base_url=self._crawl4ai_runtime.base_url,
            llm_api_key=self._crawl4ai_runtime.api_key,
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

    def _is_blocked_url(self, url: str) -> bool:
        """Check if URL should be skipped before launching an extraction.

        This is a lightweight pre-check that avoids expensive browser
        launches for obviously non-PDP URLs.
        """
        domain = self._scoring.domain_from_url(url)
        if not domain:
            return True

        # Check against blocked domains
        if self._scoring._domain_matches_candidates(domain, self._scoring.BLOCKED_DOMAINS):
            return True

        # Check for category-like URL patterns
        if self._scoring.is_category_like_url(url):
            return True

        return False

    async def _should_skip_url(self, url: str) -> bool:
        """Determine if URL should be skipped based on pre-check."""

        # Skip if explicitly disabled
        if os.getenv("AI_SEARCH_PRECHECK_STRUCTURED_DATA", "true").lower() != "true":
            return False

        # Quick check
        has_data = await self._scoring.has_structured_data(url)
        if has_data is False:
            logger.info("[AI Search] Skipping %s - no structured data detected", url)
            return True

        return False

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
        preferred_domains: Optional[list[str]] = None,
    ) -> tuple[list[dict[str, Any]], Optional[str], Optional[str]]:
        """Search identifier-first, then expand into broader queries only when needed."""
        initial_query = self._query_builder.build_identifier_query(sku)
        if initial_query and self._query_builder.is_ambiguous_identifier(sku) and any([product_name, brand, category]):
            initial_query = self._query_builder.build_search_query(sku, product_name, brand, category)
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

        search_brand = brand or self._infer_search_brand_hint(aggregated_results, working_name or product_name)

        prepared_results = self._prepare_candidate_pool(
            search_results=aggregated_results,
            sku=sku,
            brand=search_brand,
            product_name=working_name,
            category=category,
            preferred_domains=preferred_domains,
        )
        has_preferred_domain_match = self._has_preferred_domain_candidate(prepared_results, preferred_domains)
        if not self._should_expand_search(
            search_results=prepared_results,
            sku=sku,
            brand=search_brand,
            product_name=working_name,
            category=category,
        ) and (not preferred_domains or has_preferred_domain_match):
            logger.info("[AI Search] Primary search produced a strong candidate pool; skipping follow-up searches")
            return prepared_results, working_name, search_error

        preferred_query_plan = (
            self._query_builder.build_site_query_variants(
                domains=preferred_domains,
                sku=sku,
                product_name=working_name,
                brand=search_brand,
                category=category,
            )
            if preferred_domains and not has_preferred_domain_match
            else []
        )

        preferred_query_budget = 2
        for query in preferred_query_plan[:preferred_query_budget]:
            await run_query(query)
            prepared_results = self._prepare_candidate_pool(
                search_results=aggregated_results,
                sku=sku,
                brand=search_brand,
                product_name=working_name,
                category=category,
                preferred_domains=preferred_domains,
            )
            has_preferred_domain_match = self._has_preferred_domain_candidate(prepared_results, preferred_domains)
            if not self._should_expand_search(
                search_results=prepared_results,
                sku=sku,
                brand=search_brand,
                product_name=working_name,
                category=category,
            ) and (not preferred_domains or has_preferred_domain_match):
                logger.info("[AI Search] Preferred-domain follow-up produced a strong candidate pool for SKU %s", sku)
                return prepared_results, working_name, search_error

        query_plan = [
            *self._query_builder.build_query_variants(
                sku=sku,
                product_name=working_name,
                brand=search_brand,
                category=category,
            ),
            self._query_builder.build_search_query(sku, working_name, search_brand, category),
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
                brand=search_brand,
                product_name=working_name,
                category=category,
                preferred_domains=preferred_domains,
            )
            has_preferred_domain_match = self._has_preferred_domain_candidate(prepared_results, preferred_domains)
            if not self._should_expand_search(
                search_results=prepared_results,
                sku=sku,
                brand=search_brand,
                product_name=working_name,
                category=category,
            ) and (not preferred_domains or has_preferred_domain_match):
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
            brand=search_brand,
            product_name=working_name,
            category=category,
            preferred_domains=preferred_domains,
        )
        return prepared_results, working_name, search_error

    def _prepare_candidate_pool(
        self,
        search_results: list[dict[str, Any]],
        sku: str,
        brand: Optional[str],
        product_name: Optional[str],
        category: Optional[str],
        preferred_domains: Optional[list[str]] = None,
    ) -> list[dict[str, Any]]:
        return self._scoring.prepare_search_results(
            search_results,
            sku,
            brand,
            product_name,
            category,
            prefer_manufacturer=self.prefer_manufacturer,
            preferred_domains=preferred_domains,
        )

    def _build_cohort_key(self, item: dict[str, Any]) -> str:
        brand = self._matching.normalize_token_text(str(item.get("brand") or ""))
        product_name = str(item.get("product_name") or "")
        brand_tokens = self._matching.tokenize_keywords(str(item.get("brand") or ""))
        cohort_variant_hints = {
            "small",
            "medium",
            "large",
            "xlarge",
            "xl",
            "jumbo",
            "mini",
            "fresh",
            "scented",
            "unscented",
            "original",
            "natural",
            "count",
            "gray",
            "grey",
            "white",
            "black",
            "blue",
            "red",
        }
        name_tokens = [
            token
            for token in self._matching.tokenize_keywords(product_name)
            if (token not in brand_tokens and token not in cohort_variant_hints and not any(character.isdigit() for character in token))
        ]
        family_tokens = name_tokens[:4]
        if family_tokens:
            family_key = "-".join(family_tokens)
        else:
            normalized_name = self._matching.normalize_token_text(product_name)
            family_key = normalized_name[:32] or self._matching.normalize_token_text(str(item.get("sku") or ""))

        return f"{brand or 'unknown'}::{family_key or 'unknown'}"

    def _score_item_context(self, item: dict[str, Any]) -> int:
        score = 0
        if item.get("brand"):
            score += 4
        if item.get("category"):
            score += 2

        product_name = str(item.get("product_name") or "")
        score += min(4, len(self._matching.tokenize_keywords(product_name)))
        if self._matching.extract_variant_tokens(product_name):
            score += 2

        return score

    def _has_preferred_domain_candidate(self, search_results: list[dict[str, Any]], preferred_domains: Optional[list[str]]) -> bool:
        if not search_results or not preferred_domains:
            return False

        for result in search_results:
            domain = self._scoring.domain_from_url(str(result.get("url") or ""))
            if domain and any(domain == preferred or domain.endswith(f".{preferred}") for preferred in preferred_domains):
                return True

        return False

    def _infer_search_brand_hint(self, search_results: list[dict[str, Any]], product_name: Optional[str]) -> Optional[str]:
        if not search_results or not product_name:
            return None

        brand_counts: dict[str, int] = {}
        for result in search_results[:5]:
            source_url = str(result.get("url") or "")
            for candidate_text in (result.get("title"), result.get("description")):
                brand_hint = self._matching.infer_brand_prefix(str(candidate_text or ""), product_name, source_url)
                if not brand_hint:
                    continue
                brand_counts[brand_hint] = brand_counts.get(brand_hint, 0) + 1

        if not brand_counts:
            return None

        inferred_brand = sorted(
            brand_counts.items(),
            key=lambda item: (-item[1], item[0].lower()),
        )[0][0]
        logger.info("[AI Search] Inferred search brand hint '%s' from search snippets", inferred_brand)
        return inferred_brand

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

        expected_variant_tokens = self._matching.extract_variant_tokens(product_name)
        if expected_variant_tokens:
            top_variant_match = any(
                (
                    self._matching.has_variant_token_overlap(
                        product_name,
                        " ".join(
                            [
                                str(result.get("url") or ""),
                                str(result.get("title") or ""),
                                str(result.get("description") or ""),
                            ]
                        ),
                    )
                    and not self._matching.has_conflicting_variant_tokens(
                        product_name,
                        " ".join(
                            [
                                str(result.get("url") or ""),
                                str(result.get("title") or ""),
                                str(result.get("description") or ""),
                            ]
                        ),
                    )
                )
                for result in search_results[:3]
                if not self._scoring.is_low_quality_result(result)
            )
            if not top_variant_match:
                return True

        strong_candidate_url = self._scoring.pick_strong_candidate_url(
            search_results=search_results,
            sku=sku,
            brand=brand,
            product_name=product_name,
            category=category,
            prefer_manufacturer=self.prefer_manufacturer,
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
                    prefer_manufacturer=self.prefer_manufacturer,
                )
                >= 4.5
            ):
                high_signal_count += 1
                if high_signal_count >= 2:
                    return False

        return True

    def _get_cached_cohort_state(self, cohort_key: str) -> _BatchCohortState:
        """Retrieve or create cohort state, merging cached preferences."""
        cached = self._cohort_cache.get(cohort_key)
        if cached is not None:
            self._cohort_cache.move_to_end(cohort_key)
            logger.info(
                "[AI Search] Loaded cached cohort state for '%s' (domains=%d, brands=%d)",
                cohort_key,
                len(cached.preferred_domain_counts),
                len(cached.preferred_brand_counts),
            )
            return _BatchCohortState(
                key=cohort_key,
                preferred_domain_counts=dict(cached.preferred_domain_counts),
                preferred_brand_counts=dict(cached.preferred_brand_counts),
            )

        return _BatchCohortState(
            key=cohort_key,
            preferred_domain_counts={},
            preferred_brand_counts={},
        )

    def _save_cohort_state(self, cohort_state: _BatchCohortState) -> None:
        """Persist cohort state to cache for future batch runs."""
        key = cohort_state.key
        self._cohort_cache[key] = cohort_state
        self._cohort_cache.move_to_end(key)

        while len(self._cohort_cache) > self._cohort_cache_max:
            self._cohort_cache.popitem(last=False)

    def _should_use_orchestrated_batch_path(self) -> bool:
        """Route the base production batch path through the shared orchestrator.

        Test subclasses often override single-product hooks to isolate behavior.
        Keep those on the legacy path so the focused regression tests stay hermetic.
        """
        return self.__class__ is AISearchScraper and not bool(getattr(self, "sku_first_mode", False))

    async def _run_orchestrated_cohort_batch(
        self,
        cohort_batch: list[tuple[int, dict[str, Any]]],
        cohort_state: _BatchCohortState,
        max_concurrency: int,
    ) -> list[tuple[int, AISearchResult]]:
        orchestrator = BatchSearchOrchestrator(
            search_client=self._search_client,
            extractor=_BatchExtractorAdapter(self),
            scorer=self._scoring,
            name_consolidator=self._name_consolidator,
            cohort_state=cohort_state,
            validator=self._validator,
        )

        valid_batch: list[tuple[int, dict[str, Any]]] = []
        product_inputs: list[ProductInput] = []
        cohort_results: list[tuple[int, AISearchResult]] = []

        for original_index, product in cohort_batch:
            sku = str(product.get("sku", "")).strip()
            if not sku:
                cohort_results.append((original_index, AISearchResult(success=False, sku="", error="Missing sku")))
                continue

            valid_batch.append((original_index, product))
            product_inputs.append(
                ProductInput(
                    sku=sku,
                    name=str(product.get("product_name") or ""),
                    brand=str(product.get("brand") or "").strip() or None,
                )
            )

        if not product_inputs:
            return cohort_results

        batch_result = await orchestrator.search_cohort(
            product_inputs,
            max_search_concurrent=max(1, max_concurrency),
            max_extract_concurrent=max(1, max_concurrency),
        )
        extracted_results = batch_result.to_search_results()

        for (original_index, _), result in zip(valid_batch, extracted_results):
            cohort_results.append((original_index, result))
            domain = self._scoring.domain_from_url(result.url or "")
            if result.success and domain and not self._scoring.is_marketplace(domain):
                cohort_state.remember_domain(domain)
            if result.success and result.brand:
                cohort_state.remember_brand(result.brand)

        return cohort_results

    async def scrape_products_batch(
        self,
        products: list[dict[str, Any]],
        max_concurrency: int = 4,
    ) -> list[AISearchResult]:
        """Scrape multiple products in batch while carrying cohort context."""
        if not products:
            return []

        semaphore = asyncio.Semaphore(max(1, max_concurrency))
        indexed_products = list(enumerate(products))
        cohort_items: dict[str, list[tuple[int, dict[str, Any]]]] = defaultdict(list)

        for index, product in indexed_products:
            cohort_items[self._build_cohort_key(product)].append((index, product))

        async def _run_cohort(
            cohort_key: str,
            cohort_batch: list[tuple[int, dict[str, Any]]],
        ) -> list[tuple[int, AISearchResult]]:
            async with semaphore:
                cohort_state = self._get_cached_cohort_state(cohort_key)
                ordered_batch = sorted(
                    cohort_batch,
                    key=lambda item: self._score_item_context(item[1]),
                    reverse=True,
                )
                item_by_index = {index: item for index, item in cohort_batch}
                cohort_results: list[tuple[int, AISearchResult]] = []

                if self._should_use_orchestrated_batch_path():
                    cohort_results = await self._run_orchestrated_cohort_batch(
                        ordered_batch,
                        cohort_state,
                        max_concurrency,
                    )
                    self._save_cohort_state(cohort_state)
                    return cohort_results

                for original_index, product in ordered_batch:
                    sku = str(product.get("sku", "")).strip()
                    if not sku:
                        cohort_results.append((original_index, AISearchResult(success=False, sku="", error="Missing sku")))
                        continue

                    result = await self.scrape_product(
                        sku=sku,
                        product_name=product.get("product_name"),
                        brand=product.get("brand"),
                        category=product.get("category"),
                        cohort_state=cohort_state,
                    )
                    cohort_results.append((original_index, result))

                    domain = self._scoring.domain_from_url(result.url or "")
                    if result.success and domain and not self._scoring.is_marketplace(domain):
                        cohort_state.remember_domain(domain)
                    if result.success and result.brand:
                        cohort_state.remember_brand(result.brand)

                dominant_domain = cohort_state.dominant_domain()
                if dominant_domain:
                    locked_state = _BatchCohortState(
                        key=cohort_key,
                        preferred_domain_counts={
                            dominant_domain: cohort_state.preferred_domain_counts.get(dominant_domain, 0),
                        },
                        preferred_brand_counts=dict(cohort_state.preferred_brand_counts),
                    )
                    normalized_results: list[tuple[int, AISearchResult]] = []

                    for original_index, existing_result in cohort_results:
                        existing_domain = self._scoring.domain_from_url(existing_result.url or "")
                        product = item_by_index.get(original_index, {})
                        product_sku = str(product.get("sku", "")).strip()
                        if not product_sku:
                            normalized_results.append((original_index, existing_result))
                            continue

                        should_retry = (not existing_result.success) or existing_domain != dominant_domain
                        if not should_retry:
                            normalized_results.append((original_index, existing_result))
                            continue

                        retry_result = await self.scrape_product(
                            sku=product_sku,
                            product_name=product.get("product_name"),
                            brand=product.get("brand"),
                            category=product.get("category"),
                            cohort_state=locked_state,
                        )
                        retry_domain = self._scoring.domain_from_url(retry_result.url or "")
                        if retry_result.success and retry_domain == dominant_domain:
                            normalized_results.append((original_index, retry_result))
                            continue

                        normalized_results.append((original_index, existing_result))

                    cohort_results = normalized_results

                self._save_cohort_state(cohort_state)
                return cohort_results

        gathered_results = await asyncio.gather(
            *[
                _run_cohort(cohort_key, cohort_batch)
                for cohort_key, cohort_batch in cohort_items.items()
            ]
        )

        ordered_results: list[AISearchResult | None] = [None] * len(products)
        for cohort_result_set in gathered_results:
            for index, result in cohort_result_set:
                ordered_results[index] = result

        return [
            result if result is not None else AISearchResult(success=False, sku="", error="Missing batch result")
            for result in ordered_results
        ]

    async def _extract_sku_first_batch_result(
        self,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        search_results: list[Any],
    ) -> AISearchResult:
        if not search_results:
            return AISearchResult(
                success=False,
                sku=sku,
                error="No results found",
            )

        candidate_pool = [
            {
                "url": str(getattr(result, "url", "") or "").strip(),
                "title": str(getattr(result, "title", "") or "").strip(),
                "description": str(getattr(result, "description", "") or "").strip(),
            }
            for result in search_results
            if str(getattr(result, "url", "") or "").strip()
        ]
        if not candidate_pool:
            return AISearchResult(
                success=False,
                sku=sku,
                error="No valid URLs found in SKU-first search results",
            )

        ordered_results = self._scoring.prepare_search_results(
            search_results=candidate_pool,
            sku=sku,
            brand=brand,
            product_name=product_name,
            category=None,
            prefer_manufacturer=self.prefer_manufacturer,
        )
        if not ordered_results:
            ordered_results = candidate_pool

        prioritized_url = self._heuristic_source_selection(
            search_results=ordered_results,
            sku=sku,
            brand=brand,
            product_name=product_name,
        )
        if prioritized_url:
            ordered_results = sorted(
                ordered_results,
                key=lambda result: 0 if str(result.get("url") or "") == prioritized_url else 1,
            )

        accepted_result: Optional[dict[str, Any]] = None
        last_error = "Extraction failed"
        tried_urls: set[str] = set()

        for candidate in ordered_results[:3]:
            target_url = str(candidate.get("url") or "").strip()
            if not target_url or target_url in tried_urls:
                continue
            tried_urls.add(target_url)

            if self._scoring.is_low_quality_result(candidate):
                last_error = "Selected source appears to be a non-product/review/aggregator page"
                continue

            if self._is_blocked_url(target_url):
                last_error = "URL blocked by pre-extraction validation (domain or category pattern)"
                continue

            if await self._should_skip_url(target_url):
                last_error = "No structured data detected"
                continue

            extraction_result = await self._extract_product_data(target_url, sku, product_name, brand)
            normalized_result = dict(extraction_result)
            normalized_result.setdefault("url", target_url)

            is_acceptable, rejection_reason = self._validator.validate_extraction_match(
                extraction_result=normalized_result,
                sku=sku,
                product_name=product_name,
                brand=brand,
                source_url=target_url,
            )
            if is_acceptable:
                accepted_result = normalized_result
                break

            last_error = rejection_reason or str(normalized_result.get("error") or last_error)

        if accepted_result:
            return self._build_discovery_result(
                accepted_result,
                sku,
                product_name,
                brand,
                accepted_result.get("url"),
            )

        return AISearchResult(
            success=False,
            sku=sku,
            error=last_error,
        )

    async def _identify_best_source(
        self,
        search_results: list[dict[str, Any]],
        sku: str,
        brand: Optional[str],
        product_name: Optional[str],
        cost_context: _ScrapeCostContext | None = None,
        preferred_domains: Optional[list[str]] = None,
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
                preferred_domains=preferred_domains,
            )

            best_url, cost = await self._source_selector.select_best_url(
                results=search_results,
                sku=sku,
                product_name=product_name or "",
                brand=brand,
                preferred_domains=preferred_domains,
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
            preferred_domains=preferred_domains,
        )

    def _heuristic_source_selection(
        self,
        search_results: list[dict[str, Any]],
        sku: str,
        brand: Optional[str] = None,
        product_name: Optional[str] = None,
        category: Optional[str] = None,
        preferred_domains: Optional[list[str]] = None,
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
            prefer_manufacturer=self.prefer_manufacturer,
            preferred_domains=preferred_domains,
        )
        if strong_url:
            return strong_url

        ranked_results = self._scoring.prepare_search_results(
            search_results=search_results,
            sku=sku,
            brand=brand,
            product_name=product_name,
            category=category,
            prefer_manufacturer=self.prefer_manufacturer,
            preferred_domains=preferred_domains,
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
            prefer_manufacturer=self.prefer_manufacturer,
        )
        second_score = 0.0
        if len(search_results) > 1:
            second_score = self._scoring.score_search_result(
                result=search_results[1],
                sku=sku,
                brand=brand,
                product_name=product_name,
                category=category,
                prefer_manufacturer=self.prefer_manufacturer,
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
            prefer_manufacturer=self.prefer_manufacturer,
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
        cohort_state: _BatchCohortState | None = None,
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
            preferred_domains = cohort_state.ranked_domains() if cohort_state is not None else None
            inferred_brand = None
            if not brand and cohort_state is not None:
                ranked_brands = cohort_state.ranked_brands()
                if ranked_brands:
                    inferred_brand = ranked_brands[0]
            effective_brand = brand or inferred_brand

            search_results, product_name, search_error = await self._collect_search_candidates(
                sku=sku,
                product_name=product_name,
                brand=effective_brand,
                category=category,
                cost_context=cost_context,
                preferred_domains=preferred_domains,
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
                brand=effective_brand,
                category=category,
                cost_context=cost_context,
            )

            if not effective_brand and not preferred_domains:
                logger.info("[AI Search] Brand missing - initiating parallel candidate discovery")
                top_candidates = search_results[:3]
                candidate_urls = [str(r.get("url")) for r in top_candidates if r.get("url")]

                parallel_results = await self._extract_candidates_parallel(candidate_urls, sku, product_name, effective_brand)

                # Pick the best result from the parallel set
                parallel_accepted_result: dict[str, Any] | None = None
                parallel_target_url: str | None = None
                for res in parallel_results:
                    is_acceptable, _ = self._validator.validate_extraction_match(
                        extraction_result=res,
                        sku=sku,
                        product_name=product_name,
                        brand=effective_brand,
                        source_url=res.get("url", ""),
                    )
                    if is_acceptable:
                        parallel_accepted_result = res
                        parallel_target_url = str(res.get("url") or "") or None
                        break

                if parallel_accepted_result:
                    return self._build_discovery_result(
                        parallel_accepted_result,
                        sku,
                        product_name,
                        effective_brand,
                        parallel_target_url,
                        cost_context=cost_context,
                    )

            ordered_results = list(search_results)
            prioritized_url = None
            if self.use_ai_source_selection:
                prioritized_url = await self._identify_best_source(
                    ordered_results[:5],
                    sku,
                    effective_brand,
                    product_name,
                    cost_context=cost_context,
                    preferred_domains=preferred_domains,
                )
            if not prioritized_url:
                prioritized_url = self._heuristic_source_selection(
                    ordered_results,
                    sku,
                    effective_brand,
                    product_name,
                    category,
                    preferred_domains=preferred_domains,
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

                # Pre-extraction URL validation: skip blocked domains and
                # category-like URLs without launching a browser.
                if self._is_blocked_url(target_url):
                    last_rejection_reason = "URL blocked by pre-extraction validation (domain or category pattern)"
                    self._log_telemetry(sku, target_url, "pre_extraction_block", False, last_rejection_reason)
                    logger.info("[AI Search] Pre-extraction block: %s", target_url)
                    continue

                # Optional: Structured data pre-check before browser launch
                if await self._should_skip_url(target_url):
                    last_rejection_reason = "No structured data detected"
                    self._log_telemetry(sku, target_url, "pre_extraction_block", False, last_rejection_reason)
                    logger.info("[AI Search] Pre-check skip: %s", target_url)
                    continue

                tried_urls.add(target_url)
                self._log_telemetry(sku, target_url, "fetch_attempt", True, "initiated")
                extraction_result = await self._extract_product_data(target_url, sku, product_name, effective_brand)
                fetch_ok = bool(extraction_result.get("success"))
                fetch_details = str(extraction_result.get("error") or "ok") if not fetch_ok else "ok"
                self._log_telemetry(sku, target_url, "fetch_attempt", fetch_ok, fetch_details)
                self._log_telemetry(sku, target_url, "validation", True, "initiated")
                is_acceptable, rejection_reason = self._validator.validate_extraction_match(
                    extraction_result=extraction_result,
                    sku=sku,
                    product_name=product_name,
                    brand=effective_brand,
                    source_url=target_url,
                )
                self._log_telemetry(sku, target_url, "validation", is_acceptable, rejection_reason if not is_acceptable else "ok")
                if is_acceptable:
                    accepted_result = extraction_result
                    break

                last_rejection_reason = rejection_reason
                # Record domain failure for history tracking
                if target_url:
                    domain = self._scoring.domain_from_url(target_url)
                    record_domain_attempt(domain, False)

            if not accepted_result:
                # Change 5: Parallel candidate discovery fallback.
                # If the primary extraction loop exhausted its attempts, try
                # parallel extraction of remaining untried candidates as a
                # last resort before returning failure.
                fallback_urls = [
                    str(r.get("url") or "").strip()
                    for r in ordered_results
                    if str(r.get("url") or "").strip()
                    and str(r.get("url") or "").strip() not in tried_urls
                    and not self._is_blocked_url(str(r.get("url") or "").strip())
                    and not self._scoring.is_low_quality_result(r)
                ][:3]

                if fallback_urls:
                    logger.info(
                        "[AI Search] Primary extraction failed — attempting parallel fallback with %d untried URLs",
                        len(fallback_urls),
                    )
                    parallel_results = await self._extract_candidates_parallel(fallback_urls, sku, product_name, effective_brand)
                    for res in parallel_results:
                        is_acceptable, _ = self._validator.validate_extraction_match(
                            extraction_result=res,
                            sku=sku,
                            product_name=product_name,
                            brand=effective_brand,
                            source_url=res.get("url", ""),
                        )
                        if is_acceptable:
                            self._log_telemetry_summary(sku)
                            return self._build_discovery_result(
                                res,
                                sku,
                                product_name,
                                effective_brand,
                                res.get("url"),
                                cost_context=cost_context,
                            )

                if extraction_result and extraction_result.get("error"):
                    error_msg = str(extraction_result.get("error") or "Extraction failed")
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
                effective_brand,
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

        # Record domain success for history tracking
        if url:
            domain = self._scoring.domain_from_url(url)
            record_domain_attempt(domain, True)

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
                normalized_result = dict(result)
                normalized_result.setdefault("url", url)
                return normalized_result
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
