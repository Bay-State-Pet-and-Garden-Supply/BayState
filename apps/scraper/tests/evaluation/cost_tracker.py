"""Cost tracking module for AI scraper evaluation.

Tracks LLM and search costs separately, calculates cost per successful
extraction, and integrates with evaluation reports.
"""

import os
from dataclasses import dataclass, field
from typing import Any


# Default pricing (can be overridden via environment variables)
DEFAULT_LLM_COST_PER_1K_TOKENS = 0.015  # gpt-4o-mini pricing
DEFAULT_SEARCH_COST_PER_CALL = 0.00  # Brave free tier


def _load_env_float(key: str, default: float) -> float:
    """Load float from environment variable with fallback to default."""
    value = os.environ.get(key)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


# Pricing loaded from environment (with defaults)
LLM_COST_PER_1K_TOKENS = _load_env_float("LLM_COST_PER_1K_TOKENS", DEFAULT_LLM_COST_PER_1K_TOKENS)
SEARCH_COST_PER_CALL = _load_env_float("SEARCH_COST_PER_CALL", DEFAULT_SEARCH_COST_PER_CALL)


@dataclass
class LLMCost:
    """Cost data for a single LLM API call."""

    tokens: int
    model: str
    cost_usd: float


@dataclass
class SearchCost:
    """Cost data for a single search API call."""

    cost_usd: float = SEARCH_COST_PER_CALL


@dataclass
class EvaluationCostReport:
    """Complete cost report for an evaluation run."""

    total_llm_calls: int = 0
    total_llm_tokens: int = 0
    total_llm_cost_usd: float = 0.0

    total_search_calls: int = 0
    total_search_cost_usd: float = 0.0

    total_cost_usd: float = 0.0
    success_count: int = 0
    cost_per_success_usd: float = 0.0

    llm_calls: list[LLMCost] = field(default_factory=list)
    search_calls: list[SearchCost] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert report to dictionary for JSON export."""
        return {
            "total_llm_calls": self.total_llm_calls,
            "total_llm_tokens": self.total_llm_tokens,
            "total_llm_cost_usd": round(self.total_llm_cost_usd, 6),
            "total_search_calls": self.total_search_calls,
            "total_search_cost_usd": round(self.total_search_cost_usd, 6),
            "total_cost_usd": round(self.total_cost_usd, 6),
            "success_count": self.success_count,
            "cost_per_success_usd": round(self.cost_per_success_usd, 6),
        }


class EvaluationCostTracker:
    """Tracks costs for evaluation runs.

    Separately tracks LLM API calls and search API calls, then calculates
    cost efficiency metrics.

    Usage:
        tracker = EvaluationCostTracker()

        # Track an LLM call (e.g., 1500 tokens with gpt-4o-mini)
        tracker.add_llm_call(tokens=1500, model="gpt-4o-mini")

        # Track a Brave search call
        tracker.add_search_call()

        # Get total cost
        print(f"Total: ${tracker.total_cost:.4f}")

        # Calculate cost per successful extraction
        print(f"Per success: ${tracker.cost_per_success(10):.4f}")

        # Export for reports
        report = tracker.get_report()
    """

    # Model pricing per 1K tokens (input = output for simplicity)
    MODEL_PRICING = {
        "gpt-4o": 0.01,  # ~0.005 input + 0.015 output averaged
        "gpt-4o-mini": 0.00075,  # ~0.00015 + 0.0006 averaged
        "gpt-4": 0.09,  # ~0.03 + 0.06 averaged
        "gpt-3.5-turbo": 0.002,  # ~0.0005 + 0.0015 averaged
    }

    def __init__(self):
        self._llm_calls: list[LLMCost] = []
        self._search_calls: list[SearchCost] = []

    def add_llm_call(self, tokens: int, model: str = "gpt-4o-mini") -> LLMCost:
        """Track an LLM API call.

        Args:
            tokens: Total tokens used (input + output)
            model: Model name (e.g., "gpt-4o-mini")

        Returns:
            LLMCost object with cost details
        """
        # Use model-specific pricing if available, otherwise use env var
        model_key = model.lower()
        if model_key in self.MODEL_PRICING:
            cost_per_1k = self.MODEL_PRICING[model_key]
        else:
            cost_per_1k = LLM_COST_PER_1K_TOKENS

        cost_usd = (tokens / 1000) * cost_per_1k
        llm_cost = LLMCost(tokens=tokens, model=model, cost_usd=cost_usd)
        self._llm_calls.append(llm_cost)
        return llm_cost

    def add_search_call(self) -> SearchCost:
        """Track a Brave search API call.

        Returns:
            SearchCost object with cost details
        """
        search_cost = SearchCost(cost_usd=SEARCH_COST_PER_CALL)
        self._search_calls.append(search_cost)
        return search_cost

    @property
    def total_cost(self) -> float:
        """Total cost across all LLM and search calls."""
        llm_total = sum(c.cost_usd for c in self._llm_calls)
        search_total = sum(c.cost_usd for c in self._search_calls)
        return llm_total + search_total

    @property
    def total_llm_cost(self) -> float:
        """Total LLM API cost."""
        return sum(c.cost_usd for c in self._llm_calls)

    @property
    def total_search_cost(self) -> float:
        """Total search API cost."""
        return sum(c.cost_usd for c in self._search_calls)

    @property
    def total_llm_tokens(self) -> int:
        """Total tokens used across all LLM calls."""
        return sum(c.tokens for c in self._llm_calls)

    @property
    def llm_call_count(self) -> int:
        """Number of LLM API calls."""
        return len(self._llm_calls)

    @property
    def search_call_count(self) -> int:
        """Number of search API calls."""
        return len(self._search_calls)

    def cost_per_success(self, success_count: int) -> float:
        """Calculate cost per successful extraction.

        Args:
            success_count: Number of successful extractions

        Returns:
            Cost per success in USD, or 0.0 if no successes
        """
        if success_count <= 0:
            return 0.0
        return self.total_cost / success_count

    def get_report(self) -> EvaluationCostReport:
        """Generate a complete cost report for the evaluation run.

        Returns:
            EvaluationCostReport with all cost metrics
        """
        return EvaluationCostReport(
            total_llm_calls=len(self._llm_calls),
            total_llm_tokens=self.total_llm_tokens,
            total_llm_cost_usd=self.total_llm_cost,
            total_search_calls=len(self._search_calls),
            total_search_cost_usd=self.total_search_cost,
            total_cost_usd=self.total_cost,
            success_count=0,  # Set by caller
            cost_per_success_usd=0.0,  # Set by caller
            llm_calls=self._llm_calls.copy(),
            search_calls=self._search_calls.copy(),
        )

    def reset(self):
        """Reset all tracked costs."""
        self._llm_calls.clear()
        self._search_calls.clear()


__all__ = [
    "EvaluationCostTracker",
    "EvaluationCostReport",
    "LLMCost",
    "SearchCost",
    "LLM_COST_PER_1K_TOKENS",
    "SEARCH_COST_PER_CALL",
]
