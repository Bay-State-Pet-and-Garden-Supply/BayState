from __future__ import annotations

import json
import os
from pathlib import Path
from unittest import mock

import pytest

from core.adaptive_retry_strategy import AdaptiveRetryStrategy, FailureType


class TestAdaptiveRetryStrategy:
    @pytest.fixture
    def strategy(self):
        # Ensure no history file interferes
        return AdaptiveRetryStrategy(history_file=None)

    def test_default_max_retries_is_three(self, strategy):
        """Test that the default global max retries is 3."""
        # We need to re-initialize to pick up default since __init__ reads it
        with mock.patch.dict(os.environ, {}, clear=False):
             s = AdaptiveRetryStrategy(history_file=None)
             # Check a type that uses the global default (like Network Error)
             config = s.get_adaptive_config(FailureType.NETWORK_ERROR, "test_site")
             assert config.max_retries == 3

    def test_per_failure_type_policies(self, strategy):
        """Test the specific policies for different failure types."""
        # Network Error: 3 retries
        config = strategy.get_adaptive_config(FailureType.NETWORK_ERROR, "test_site")
        assert config.max_retries == 3

        # Element Missing: 2 retries
        config = strategy.get_adaptive_config(FailureType.ELEMENT_MISSING, "test_site")
        assert config.max_retries == 2

        # Access Denied: 0 retries
        config = strategy.get_adaptive_config(FailureType.ACCESS_DENIED, "test_site")
        assert config.max_retries == 0

        # Timeout: 2 retries
        config = strategy.get_adaptive_config(FailureType.TIMEOUT, "test_site")
        assert config.max_retries == 2

        # No Results: 0 retries
        config = strategy.get_adaptive_config(FailureType.NO_RESULTS, "test_site")
        assert config.max_retries == 0

    def test_global_env_var_override(self):
        """Test that SCRAPER_MAX_RETRIES env var overrides defaults."""
        with mock.patch.dict(os.environ, {"SCRAPER_MAX_RETRIES": "5"}):
            strategy = AdaptiveRetryStrategy(history_file=None)
            
            # Network Error should now be 3 (since min(3, 5) = 3)
            config = strategy.get_adaptive_config(FailureType.NETWORK_ERROR, "test_site")
            assert config.max_retries == 3
            
            # If we set it to 1
            with mock.patch.dict(os.environ, {"SCRAPER_MAX_RETRIES": "1"}):
                strategy2 = AdaptiveRetryStrategy(history_file=None)
                config = strategy2.get_adaptive_config(FailureType.NETWORK_ERROR, "test_site")
                assert config.max_retries == 1

    def test_load_history_rehydrates_persisted_failure_records(self, tmp_path: Path) -> None:
        history_path = tmp_path / "retry-history.json"
        _ = history_path.write_text(
            json.dumps(
                {
                    "failure_history": [
                        {
                            "timestamp": 123.0,
                            "failure_context": {
                                "site_name": "amazon",
                                "action": "click",
                                "retry_count": 2,
                                "context": {"selector": ".price"},
                                "failure_type": "element_missing",
                            },
                            "success_after_retry": False,
                            "final_success": False,
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )

        strategy = AdaptiveRetryStrategy(history_file=str(history_path))

        assert len(strategy.failure_history) == 1
        record = strategy.failure_history[0]
        assert record.site_name == "amazon"
        assert record.action == "click"
        assert record.retry_count == 2
        assert record.failure_type == FailureType.ELEMENT_MISSING
