# apps/scraper/tests/test_ai_cost_tracker.py
from scrapers.ai_cost_tracker import AICostTracker
from unittest.mock import patch
import pytest

def test_cost_tracker_uses_litellm():
    tracker = AICostTracker()
    with patch("litellm.completion_cost") as mock_cost:
        mock_cost.return_value = 0.05
        cost = tracker.calculate_cost("gpt-4o", 1000, 500)
        assert cost == 0.05
        mock_cost.assert_called_once_with(
            model="gpt-4o",
            prompt_tokens=1000,
            completion_tokens=500
        )

def test_cost_tracker_fallback_on_error():
    tracker = AICostTracker()
    with patch("litellm.completion_cost") as mock_cost:
        mock_cost.side_effect = Exception("Unknown model")
        cost = tracker.calculate_cost("unknown-model", 1000, 500)
        assert cost == 0.0
