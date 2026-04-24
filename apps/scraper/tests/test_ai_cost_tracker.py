# apps/scraper/tests/test_ai_cost_tracker.py
"""
TDD tests for AICostTracker using shared pricing catalog.

These tests verify that calculate_cost() uses the shared pricing catalog
for cost calculation.
"""
import json
import inspect
import logging
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from scrapers.ai_cost_tracker import (
    AICostTracker,
    MAX_COST_PER_PAGE,
    CIRCUIT_BREAKER_THRESHOLD,
)

# ---------------------------------------------------------------------------
# Pricing catalog fixture
# ---------------------------------------------------------------------------

PRICING_CATALOG_PATH = Path(__file__).resolve().parents[3] / "shared" / "ai-pricing" / "pricing-catalog.json"


def _load_catalog() -> dict:
    """Load the shared pricing catalog JSON."""
    with open(PRICING_CATALOG_PATH) as f:
        return json.load(f)


def _catalog_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate cost from the pricing catalog (per-1M-token pricing)."""
    catalog = _load_catalog()
    # Find the first sync entry for the given model name
    for entry in catalog["models"]:
        if entry["model"] == model and entry.get("mode", "sync") == "sync":
            input_cost = (input_tokens / 1_000_000) * entry["input_price"]
            output_cost = (output_tokens / 1_000_000) * entry["output_price"]
            return round(input_cost + output_cost, 8)
    return 0.0


# ---------------------------------------------------------------------------
# calculate_cost() — pricing catalog tests
# ---------------------------------------------------------------------------


class TestCalculateCostFromCatalog:
    """Tests that calculate_cost() uses the shared pricing catalog."""

    def test_known_model_returns_catalog_cost(self):
        """calculate_cost('gpt-4o-mini', 1000, 500) should return the
        exact cost computed from the shared pricing catalog."""
        tracker = AICostTracker()
        expected = _catalog_cost("gpt-4o-mini", 1000, 500)
        # gpt-4o-mini sync: input $0.15/1M, output $0.60/1M
        # expected = (1000/1M)*0.15 + (500/1M)*0.60 = 0.00015 + 0.00030 = 0.00045
        assert expected > 0, "Catalog should have pricing for gpt-4o-mini"
        result = tracker.calculate_cost("gpt-4o-mini", 1000, 500)
        assert result == pytest.approx(expected, rel=1e-6), (
            f"Expected {expected} from catalog, got {result}"
        )

    def test_gpt4o_model_returns_catalog_cost(self):
        """calculate_cost('gpt-4o', 1000, 500) should use catalog pricing."""
        tracker = AICostTracker()
        expected = _catalog_cost("gpt-4o", 1000, 500)
        assert expected > 0, "Catalog should have pricing for gpt-4o"
        result = tracker.calculate_cost("gpt-4o", 1000, 500)
        assert result == pytest.approx(expected, rel=1e-6)

    def test_unknown_model_returns_zero_with_warning(self):
        """calculate_cost() should return 0.0 for unknown models and log a warning."""
        tracker = AICostTracker()
        result = tracker.calculate_cost("nonexistent-model-xyz", 1000, 500)
        assert result == 0.0

    def test_unknown_model_logs_warning(self, caplog):
        """calculate_cost() should emit a warning log for unknown models."""
        tracker = AICostTracker()
        with caplog.at_level(logging.WARNING):
            tracker.calculate_cost("nonexistent-model-xyz", 1000, 500)
        # Should have at least one warning mentioning the unknown model
        assert any("nonexistent-model-xyz" in record.message for record in caplog.records), (
            "Expected a warning log for unknown model"
        )

    def test_zero_tokens_returns_zero_cost(self):
        """calculate_cost() with zero tokens should return 0.0."""
        tracker = AICostTracker()
        result = tracker.calculate_cost("gpt-4o-mini", 0, 0)
        assert result == 0.0

    def test_calculate_cost_uses_catalog_only(self):
        """calculate_cost() should use only the shared pricing catalog for cost calculation."""
        source = inspect.getsource(AICostTracker.calculate_cost)
        assert "completion_cost" not in source, (
            "calculate_cost() still references the legacy cost function — migration incomplete"
        )


# ---------------------------------------------------------------------------
# Circuit breaker tests (preserved from original, semantics unchanged)
# ---------------------------------------------------------------------------


class TestCircuitBreaker:
    """Circuit breaker behavior should be preserved after catalog migration."""

    def test_circuit_breaker_triggers_after_three_overruns(self):
        """After 3 consecutive pages exceeding MAX_COST_PER_PAGE, breaker opens."""
        tracker = AICostTracker()
        scraper_name = "test-scraper"

        # Patch calculate_cost to return a cost above MAX_COST_PER_PAGE
        with patch.object(tracker, "calculate_cost", return_value=0.20):
            for i in range(CIRCUIT_BREAKER_THRESHOLD):
                extraction = tracker.track_extraction(
                    input_tokens=1000,
                    output_tokens=500,
                    model="gpt-4o",
                    scraper_name=scraper_name,
                )
                assert extraction.cost_usd > MAX_COST_PER_PAGE

        assert tracker.is_circuit_breaker_active(scraper_name)

    def test_circuit_breaker_resets_on_success(self):
        """Circuit breaker count resets when a page comes in under budget."""
        tracker = AICostTracker()
        scraper_name = "test-scraper"

        # 2 overruns (below threshold)
        with patch.object(tracker, "calculate_cost", return_value=0.20):
            tracker.track_extraction(1000, 500, "gpt-4o", scraper_name)
            tracker.track_extraction(1000, 500, "gpt-4o", scraper_name)

        # Under-budget extraction resets the counter
        with patch.object(tracker, "calculate_cost", return_value=0.01):
            tracker.track_extraction(100, 50, "gpt-4o-mini", scraper_name)

        assert not tracker.is_circuit_breaker_active(scraper_name)

    def test_check_cost_budget_rejects_over_limit(self):
        """check_cost_budget() returns False when cost exceeds MAX_COST_PER_PAGE."""
        tracker = AICostTracker()
        assert not tracker.check_cost_budget(current_cost=0.20)

    def test_check_cost_budget_allows_under_limit(self):
        """check_cost_budget() returns True when cost is under MAX_COST_PER_PAGE."""
        tracker = AICostTracker()
        assert tracker.check_cost_budget(current_cost=0.05)

    def test_check_cost_budget_rejects_when_breaker_active(self):
        """check_cost_budget() returns False when circuit breaker is active."""
        tracker = AICostTracker()
        scraper_name = "test-scraper"

        # Trigger circuit breaker by simulating 3 overruns
        with patch.object(tracker, "calculate_cost", return_value=0.20):
            for _ in range(CIRCUIT_BREAKER_THRESHOLD):
                tracker.track_extraction(1_000_000, 1_000_000, "gpt-4o", scraper_name)

        assert not tracker.check_cost_budget(current_cost=0.01, scraper_name=scraper_name)

    def test_reset_circuit_breaker(self):
        """reset_circuit_breaker() clears the breaker state."""
        tracker = AICostTracker()
        scraper_name = "test-scraper"

        # Trigger breaker
        with patch.object(tracker, "calculate_cost", return_value=0.20):
            for _ in range(CIRCUIT_BREAKER_THRESHOLD):
                tracker.track_extraction(1_000_000, 1_000_000, "gpt-4o", scraper_name)

        assert tracker.is_circuit_breaker_active(scraper_name)

        tracker.reset_circuit_breaker(scraper_name)
        assert not tracker.is_circuit_breaker_active(scraper_name)


# ---------------------------------------------------------------------------
# Constants preserved
# ---------------------------------------------------------------------------


class TestConstants:
    """Verify that cost limit constants are preserved."""

    def test_max_cost_per_page_value(self):
        assert MAX_COST_PER_PAGE == 0.15

    def test_circuit_breaker_threshold_value(self):
        assert CIRCUIT_BREAKER_THRESHOLD == 3


# ---------------------------------------------------------------------------
# Cost summary tests
# ---------------------------------------------------------------------------


class TestCostSummary:
    """get_cost_summary() should work correctly with catalog-based costs."""

    def test_empty_summary(self):
        tracker = AICostTracker()
        summary = tracker.get_cost_summary()
        assert summary["total_extractions"] == 0
        assert summary["total_cost_usd"] == 0.0

    def test_summary_after_extractions(self):
        tracker = AICostTracker()
        with patch.object(tracker, "calculate_cost", return_value=0.00045):
            tracker.track_extraction(1000, 500, "gpt-4o-mini", "scraper1")
            tracker.track_extraction(1000, 500, "gpt-4o-mini", "scraper1")

        summary = tracker.get_cost_summary()
        assert summary["total_extractions"] == 2
        assert summary["total_cost_usd"] == pytest.approx(0.0009)
        assert summary["average_cost_usd"] == pytest.approx(0.00045)