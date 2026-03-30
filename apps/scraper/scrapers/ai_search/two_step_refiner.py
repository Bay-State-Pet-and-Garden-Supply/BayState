"""Two-step search refinement interface."""

from dataclasses import dataclass
from typing import Any, Optional

from scrapers.ai_search.models import AISearchResult
from scrapers.ai_search.name_consolidator import NameConsolidator
from scrapers.ai_search.query_builder import QueryBuilder
from scrapers.ai_search.search import SearchClient


@dataclass
class RefinementResult:
    """Result from two-step search refinement."""

    success: bool
    second_pass_results: Optional[list[AISearchResult]]
    second_pass_confidence: Optional[float]
    product_name_extracted: Optional[str]
    cost_usd: float
    first_pass_confidence: float
    two_step_triggered: bool
    two_step_improved: Optional[bool]


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
        config: dict[str, Any],
        name_consolidator: NameConsolidator,
    ) -> None:
        """Initialize the two-step search refiner."""
        self.search_client = search_client
        self.query_builder = query_builder
        self.config = config
        self.name_consolidator = name_consolidator

    async def refine(
        self,
        initial_result: AISearchResult,
        first_pass_results: list[dict[str, Any]],
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
        ...

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
        ...

    def _extract_product_name(
        self,
        result: dict[str, Any],
    ) -> Optional[str]:
        """Extract product name from search result.

        Parses search result to extract the most relevant product name
        for use in refined second-pass queries.

        Args:
            result: Search result dictionary with title and description.

        Returns:
            Extracted product name or None if extraction fails.
        """
        ...

    async def _execute_second_search(
        self,
        refined_query: str,
        original_sku: str,
    ) -> tuple[list[dict[str, Any]], Optional[str]]:
        """Execute second search pass with refined query.

        Performs secondary search using refined query constructed from
        initial search context.

        Args:
            refined_query: Refined search query string.
            original_sku: Original product SKU for reference.

        Returns:
            Tuple of (results list, error message or None).
        """
        ...

    def _select_best_result(
        self,
        candidates: list[dict[str, Any]],
        original_result: Optional[AISearchResult],
    ) -> Optional[AISearchResult]:
        """Select best result from second pass candidates.

        Evaluates second-pass candidates against original result
        to determine if improvement was achieved.

        Args:
            candidates: List of second-pass search results.
            original_result: Original result for comparison.

        Returns:
            Best result converted to AISearchResult or None.
        """
        ...
