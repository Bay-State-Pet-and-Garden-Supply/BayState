from __future__ import annotations

import os
from unittest.mock import patch

from scrapers.ai_search.scraper import AISearchScraper, _read_float_env
from scrapers.ai_search.two_step_refiner import TwoStepSearchRefiner


class TestTwoStepConfigDefaults:
    """Test that two-step search refinement config has correct defaults."""

    def test_enable_two_step_defaults_to_false(self) -> None:
        """enable_two_step should default to False (opt-in feature)."""
        scraper = AISearchScraper()
        assert scraper.enable_two_step is False

    def test_secondary_threshold_defaults_to_075(self) -> None:
        """secondary_threshold should default to 0.75."""
        scraper = AISearchScraper()
        assert scraper.secondary_threshold == 0.75

    def test_circuit_breaker_threshold_defaults_to_085(self) -> None:
        """circuit_breaker_threshold should default to 0.85."""
        scraper = AISearchScraper()
        assert scraper.circuit_breaker_threshold == 0.85

    def test_confidence_delta_defaults_to_01(self) -> None:
        """confidence_delta should default to 0.1."""
        scraper = AISearchScraper()
        assert scraper.confidence_delta == 0.1


class TestTwoStepConfigOverrides:
    """Test that two-step search refinement config can be overridden via env vars."""

    def test_enable_two_step_can_be_enabled(self) -> None:
        """enable_two_step can be set to True for the explicit Gemini flow."""
        with patch.dict(os.environ, {"AI_SEARCH_ENABLE_TWO_STEP": "true", "AI_SEARCH_PROVIDER": "gemini"}):
            scraper = AISearchScraper()
            assert scraper.enable_two_step is True
            assert isinstance(scraper._two_step_refiner, TwoStepSearchRefiner)

    def test_enable_two_step_false_case_insensitive(self) -> None:
        """enable_two_step is case-insensitive for boolean parsing."""
        with patch.dict(os.environ, {"AI_SEARCH_ENABLE_TWO_STEP": "TRUE", "AI_SEARCH_PROVIDER": "gemini"}):
            scraper = AISearchScraper()
            assert scraper.enable_two_step is True

    def test_secondary_threshold_custom_value(self) -> None:
        """secondary_threshold can be set via env var."""
        with patch.dict(os.environ, {"AI_SEARCH_SECONDARY_THRESHOLD": "0.6"}):
            scraper = AISearchScraper()
            assert scraper.secondary_threshold == 0.6

    def test_circuit_breaker_threshold_custom_value(self) -> None:
        """circuit_breaker_threshold can be set via env var."""
        with patch.dict(os.environ, {"AI_SEARCH_CIRCUIT_BREAKER_THRESHOLD": "0.9"}):
            scraper = AISearchScraper()
            assert scraper.circuit_breaker_threshold == 0.9

    def test_confidence_delta_custom_value(self) -> None:
        """confidence_delta can be set via env var."""
        with patch.dict(os.environ, {"AI_SEARCH_CONFIDENCE_DELTA": "0.15"}):
            scraper = AISearchScraper()
            assert scraper.confidence_delta == 0.15


class TestReadFloatEnv:
    """Test the _read_float_env helper function."""

    def test_returns_default_when_env_not_set(self) -> None:
        """Should return default when env var is not set."""
        with patch.dict(os.environ, {}, clear=True):
            result = _read_float_env("NONEXISTENT_VAR", default=0.5)
            assert result == 0.5

    def test_parses_valid_float(self) -> None:
        """Should parse valid float string."""
        with patch.dict(os.environ, {"TEST_FLOAT": "0.123"}):
            result = _read_float_env("TEST_FLOAT", default=0.0)
            assert result == 0.123

    def test_returns_default_for_invalid_float(self) -> None:
        """Should return default for invalid float string."""
        with patch.dict(os.environ, {"TEST_FLOAT": "not-a-float"}):
            result = _read_float_env("TEST_FLOAT", default=0.5)
            assert result == 0.5

    def test_enforces_minimum(self) -> None:
        """Should enforce minimum value."""
        with patch.dict(os.environ, {"TEST_FLOAT": "-0.5"}):
            result = _read_float_env("TEST_FLOAT", default=0.0, minimum=0.0)
            assert result == 0.0
