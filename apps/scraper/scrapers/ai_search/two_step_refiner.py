from dataclasses import dataclass
from typing import cast
from urllib.parse import urlparse

import logging

from scrapers.ai_search.models import AISearchResult
from scrapers.ai_search.name_consolidator import NameConsolidator
from scrapers.ai_search.query_builder import QueryBuilder
from scrapers.ai_search.search import SearchClient

logger = logging.getLogger(__name__)

SearchResultPayload = dict[str, object]


@dataclass
class RefinementResult:
    """Result from two-step search refinement."""

    success: bool
    second_pass_results: list[AISearchResult] | None
    second_pass_confidence: float | None
    product_name_extracted: str | None
    cost_usd: float
    first_pass_confidence: float
    two_step_triggered: bool
    two_step_improved: bool | None


class TwoStepSearchRefiner:
    """Interface for two-step search refinement to improve low-confidence results.

    This refiner accepts an initial search result and determines whether a second
    search pass would improve the outcome. When first-pass confidence is below
    configurable thresholds, it triggers an enhanced search with refined queries.

    Args:
        search_client: Search client for executing searches.
        query_builder: Query builder for creating refined search queries.
        config: Configuration dict containing threshold values:
            - confidence_threshold_low: Threshold below which second pass triggers
            - confidence_threshold_high: Threshold above which result is considered good
            - min_improvement_delta: Minimum confidence improvement to accept second pass
        name_consolidator: Name consolidator for extracting canonical product names.
    """

    def __init__(
        self,
        search_client: SearchClient,
        query_builder: QueryBuilder,
        config: dict[str, float | int],
        name_consolidator: NameConsolidator,
    ) -> None:
        """Initialize the two-step search refiner."""
        self.search_client: SearchClient = search_client
        self.query_builder: QueryBuilder = query_builder
        self.config: dict[str, float | int] = config
        self.name_consolidator: NameConsolidator = name_consolidator
        self._active_brand: str | None = None
        self._last_name_consolidation_cost: float = 0.0

    async def refine(
        self,
        initial_result: AISearchResult,
        first_pass_results: list[SearchResultPayload],
        first_pass_confidence: float,
    ) -> RefinementResult:
        """Refine search results through optional second pass.

        Evaluates whether the initial search result warrants a second search
        pass with refined queries. Returns detailed refinement metadata
        regardless of whether second pass was triggered.

        Args:
            initial_result: The initial search result to potentially refine.
            first_pass_results: Raw search results from first pass.
            first_pass_confidence: Confidence score from first pass evaluation.

        Returns:
            RefinementResult containing refinement metadata and optionally
            improved results from second pass.
        """
        self._last_name_consolidation_cost = 0.0
        second_pass_search_cost = 0.0

        fallback_result = RefinementResult(
            success=initial_result.success,
            second_pass_results=None,
            second_pass_confidence=None,
            product_name_extracted=None,
            cost_usd=0.0,
            first_pass_confidence=first_pass_confidence,
            two_step_triggered=False,
            two_step_improved=None,
        )

        try:
            if not self._should_trigger_second_pass(first_pass_confidence, 0):
                return fallback_result

            self._active_brand = initial_result.brand
            product_name_extracted = await self._extract_product_name(
                {
                    "sku": initial_result.sku,
                    "product_name": initial_result.product_name,
                    "search_snippets": first_pass_results,
                }
            )

            if not product_name_extracted:
                fallback_result.cost_usd = self._last_name_consolidation_cost
                return fallback_result

            second_pass_raw_results, search_error, second_pass_search_cost = await self._execute_second_search(
                product_name_extracted,
                initial_result.sku,
            )

            if search_error:
                logger.warning(
                    "[TwoStepRefiner] Second-pass search for SKU %s returned error: %s",
                    initial_result.sku,
                    search_error,
                )

            second_pass_results = [self._candidate_to_ai_result(candidate, initial_result) for candidate in second_pass_raw_results]
            second_pass_confidence = None
            for candidate in second_pass_raw_results:
                candidate_confidence = self._confidence_value(candidate)
                if second_pass_confidence is None or candidate_confidence > second_pass_confidence:
                    second_pass_confidence = candidate_confidence

            selected_result = self._select_best_result(second_pass_raw_results, initial_result)
            two_step_improved = selected_result is not None and (
                selected_result.url != initial_result.url or selected_result.confidence > initial_result.confidence
            )

            return RefinementResult(
                success=(selected_result or initial_result).success,
                second_pass_results=second_pass_results or None,
                second_pass_confidence=second_pass_confidence,
                product_name_extracted=product_name_extracted,
                cost_usd=self._last_name_consolidation_cost + second_pass_search_cost,
                first_pass_confidence=first_pass_confidence,
                two_step_triggered=True,
                two_step_improved=two_step_improved,
            )
        except Exception as exc:
            logger.error(
                "[TwoStepRefiner] Refinement failed for SKU %s: %s",
                initial_result.sku,
                exc,
            )
            fallback_result.cost_usd = self._last_name_consolidation_cost + second_pass_search_cost
            return fallback_result
        finally:
            self._active_brand = None

    def _should_trigger_second_pass(
        self,
        initial_confidence: float,
        result_count: int,
    ) -> bool:
        """Determine whether second search pass should be triggered.

        Evaluates confidence thresholds and result quality to decide
        if a second search pass would be beneficial.

        Args:
            initial_confidence: Confidence score from first pass.
            result_count: Number of results from first pass.

        Returns:
            True if second pass should be executed.
        """
        try:
            high_threshold = float(self.config.get("confidence_threshold_high", 0.85) or 0.85)
            low_threshold = float(self.config.get("confidence_threshold_low", 0.75) or 0.75)
            max_follow_up_queries = int(self.config.get("max_follow_up_queries", 1) or 0)

            if max_follow_up_queries <= 0:
                return False

            if result_count >= max_follow_up_queries:
                return False

            if initial_confidence >= high_threshold:
                return False

            if initial_confidence < low_threshold:
                return True

            return False
        except Exception as exc:
            logger.error("[TwoStepRefiner] Failed to evaluate second-pass trigger: %s", exc)
            return False

    async def _extract_product_name(
        self,
        result: SearchResultPayload,
    ) -> str | None:
        """Extract product name from search result.

        Parses search result to extract the most relevant product name
        for use in refined second-pass queries.

        Args:
            result: Search result dictionary with title and description.

        Returns:
            Extracted product name or None if extraction fails.
        """
        self._last_name_consolidation_cost = 0.0

        try:
            sku = str(result.get("sku") or "").strip()
            abbreviated_name = str(result.get("product_name") or "").strip()
            raw_search_snippets = result.get("search_snippets")

            if not isinstance(raw_search_snippets, list):
                return None

            search_snippets: list[SearchResultPayload] = []
            for snippet in cast(list[object], raw_search_snippets):
                if not isinstance(snippet, dict):
                    continue
                snippet_payload = cast(dict[object, object], snippet)
                search_snippets.append({str(key): value for key, value in snippet_payload.items()})

            if not sku or not abbreviated_name:
                return None

            consolidated_name, cost_usd = await self.name_consolidator.consolidate_name(
                sku=sku,
                abbreviated_name=abbreviated_name,
                search_snippets=search_snippets,
            )
            self._last_name_consolidation_cost = float(cost_usd or 0.0)

            cleaned_name = str(consolidated_name or "").strip()
            return cleaned_name or None
        except Exception as exc:
            logger.warning("[TwoStepRefiner] Product name extraction failed: %s", exc)
            self._last_name_consolidation_cost = 0.0
            return None

    async def _execute_second_search(
        self,
        refined_query: str,
        original_sku: str,
    ) -> tuple[list[SearchResultPayload], str | None, float]:
        """Execute second search pass with refined query.

        Performs secondary search using refined query constructed from
        initial search context.

        Args:
            refined_query: Refined search query string.
            original_sku: Original product SKU for reference.

        Returns:
            Tuple of (results list, error message or None, search cost).
        """
        try:
            product_name = str(refined_query or "").strip()
            if not original_sku or not product_name:
                return [], "Missing SKU or extracted product name", 0.0

            query = self.query_builder.build_name_query(product_name)
            if not query:
                return [], "Unable to build refined search query", 0.0

            return await self.search_client.search_with_cost(query)
        except Exception as exc:
            logger.error(
                "[TwoStepRefiner] Second-pass search execution failed for SKU %s: %s",
                original_sku,
                exc,
            )
            return [], str(exc), 0.0

    def _select_best_result(
        self,
        candidates: list[SearchResultPayload],
        original_result: AISearchResult | None,
    ) -> AISearchResult | None:
        """Select best result from second pass candidates.

        Evaluates second-pass candidates against original result
        to determine if improvement was achieved.

        Args:
            candidates: List of second-pass search results.
            original_result: Original result for comparison.

        Returns:
            Best result converted to AISearchResult or None.
        """
        if not candidates:
            return original_result

        try:
            best_candidate = max(
                candidates,
                key=self._confidence_value,
            )
            second_confidence = self._confidence_value(best_candidate)
            first_confidence = float(original_result.confidence if original_result else 0.0)
            min_improvement_delta = float(self.config.get("min_improvement_delta", 0.1) or 0.1)

            if original_result is None or second_confidence >= first_confidence + min_improvement_delta:
                return self._candidate_to_ai_result(best_candidate, original_result)

            return original_result
        except Exception as exc:
            logger.error("[TwoStepRefiner] Best-result selection failed: %s", exc)
            return original_result

    def _candidate_to_ai_result(
        self,
        candidate: SearchResultPayload,
        original_result: AISearchResult | None,
    ) -> AISearchResult:
        url = str(candidate.get("url") or "").strip() or (original_result.url if original_result else None)
        source_website = urlparse(url).netloc if url else (original_result.source_website if original_result else None)

        return AISearchResult(
            success=True,
            sku=original_result.sku if original_result else str(candidate.get("sku") or ""),
            product_name=str(candidate.get("title") or "").strip() or (original_result.product_name if original_result else None),
            brand=original_result.brand if original_result else None,
            description=str(candidate.get("description") or "").strip() or None,
            url=url,
            source_website=source_website or None,
            confidence=self._confidence_value(candidate),
            selection_method="two-step-search",
        )

    def _confidence_value(self, candidate: SearchResultPayload) -> float:
        raw_confidence = candidate.get("confidence")
        if isinstance(raw_confidence, bool):
            return float(int(raw_confidence))
        if isinstance(raw_confidence, (int, float)):
            return float(raw_confidence)
        if isinstance(raw_confidence, str):
            try:
                return float(raw_confidence.strip() or 0.0)
            except ValueError:
                return 0.0
        return 0.0
