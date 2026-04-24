"""RED tests for runner test execution mode.

These tests reference CLI flags, config fields, and callback payload shapes
that do not exist yet, ensuring they FAIL in the RED phase of TDD.

Task 3 of Scraper QA Integration: Runner --test-mode flag, test_assertions
SKU selection, and callback payload with test_type discriminator.
"""

from __future__ import annotations

import argparse
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# 1. parse_args should accept --test-mode flag
# ---------------------------------------------------------------------------


class TestTestModeFlag:
    """Verify that the CLI parser recognises --test-mode."""

    def test_parse_args_has_test_mode_attribute(self):
        """parse_args() should expose a test_mode attribute when --test-mode is passed."""
        from runner.cli import parse_args

        with patch("sys.argv", ["runner", "--local", "--config", "dummy.yaml", "--test-mode"]):
            args = parse_args()

        assert hasattr(args, "test_mode"), "parse_args result should have a test_mode attribute"
        assert args.test_mode is True, "--test-mode flag should set test_mode to True"

    def test_parse_args_test_mode_defaults_false(self):
        """When --test-mode is not passed, test_mode should default to False."""
        from runner.cli import parse_args

        with patch("sys.argv", ["runner", "--local", "--config", "dummy.yaml"]):
            args = parse_args()

        assert hasattr(args, "test_mode"), "parse_args result should have a test_mode attribute"
        assert args.test_mode is False, "test_mode should default to False"


# ---------------------------------------------------------------------------
# 2. Test mode reads test_assertions from config instead of test_skus
# ---------------------------------------------------------------------------


class TestTestModeSkuSelection:
    """Verify that --test-mode changes SKU selection logic."""

    @pytest.fixture()
    def mock_config_with_assertions(self):
        """Build a mock ScraperConfig that has both test_skus and test_assertions."""
        from scrapers.models.config import SkuAssertion

        config = MagicMock()
        config.name = "test-vendor"
        config.base_url = "https://example.com"
        config.test_skus = ["SKU-LEGACY"]
        config.test_assertions = [
            SkuAssertion(sku="SKU-ASSERT-1", expected={"name": "Product A"}),
            SkuAssertion(sku="SKU-ASSERT-2", expected={"name": "Product B"}),
        ]
        config.display_name = None
        config.selectors = []
        config.workflows = []
        config.timeout = 30
        config.use_stealth = True
        config.retries = 2
        config.validation = None
        config.login = None
        config.credential_refs = []
        return config

    def test_test_mode_uses_assertion_skus_not_test_skus(self, mock_config_with_assertions):
        """In test mode, SKUs should come from test_assertions, not test_skus.

        The run_local_mode function should extract SKUs from test_assertions
        when --test-mode is active, ignoring the legacy test_skus field.
        """
        from runner.cli import run_test_mode

        args = argparse.Namespace(
            local=True,
            config="dummy.yaml",
            test_mode=True,
            sku=None,
            no_headless=False,
            output=None,
            validate=False,
            strict_validate=False,
        )

        # run_test_mode should select SKUs from test_assertions, not test_skus
        result = run_test_mode(args, _config=mock_config_with_assertions)

        # The selected SKUs should be from test_assertions
        assert "SKU-ASSERT-1" in result.skus, "test mode should include assertion SKU-ASSERT-1"
        assert "SKU-ASSERT-2" in result.skus, "test mode should include assertion SKU-ASSERT-2"
        assert "SKU-LEGACY" not in result.skus, "test mode should NOT include legacy test_skus"

    def test_test_mode_without_assertions_falls_back_to_test_skus(self, mock_config_with_assertions):
        """When test_assertions is empty, test mode should fall back to test_skus."""
        from runner.cli import run_test_mode

        mock_config_with_assertions.test_assertions = None

        args = argparse.Namespace(
            local=True,
            config="dummy.yaml",
            test_mode=True,
            sku=None,
            no_headless=False,
            output=None,
            validate=False,
            strict_validate=False,
        )

        result = run_test_mode(args, _config=mock_config_with_assertions)

        assert "SKU-LEGACY" in result.skus, "test mode should fall back to test_skus when no assertions"


# ---------------------------------------------------------------------------
# 3. Test mode POSTs results with test_type discriminator
# ---------------------------------------------------------------------------


class TestTestModeCallbackPayload:
    """Verify that test mode callback payloads include a test_type discriminator."""

    @pytest.fixture()
    def mock_config_with_assertions(self):
        """Build a minimal mock config with test_assertions."""
        from scrapers.models.config import SkuAssertion

        config = MagicMock()
        config.name = "test-vendor"
        config.base_url = "https://example.com"
        config.test_skus = ["SKU-1"]
        config.test_assertions = [
            SkuAssertion(sku="SKU-1", expected={"name": "Product A"}),
        ]
        config.display_name = None
        config.selectors = []
        config.workflows = []
        config.timeout = 30
        config.use_stealth = True
        config.retries = 2
        config.validation = None
        config.login = None
        config.credential_refs = []
        return config

    def test_callback_payload_includes_test_type_discriminator(self, mock_config_with_assertions):
        """The callback payload from test mode must include test_type='qa' to
        distinguish it from normal scrape results.

        This ensures the coordinator can route QA results differently from
        production scrape results.
        """
        from runner.cli import build_test_mode_payload

        payload = build_test_mode_payload(
            config=mock_config_with_assertions,
            results=[{"sku": "SKU-1", "name": "Product A", "price": "$9.99"}],
        )

        assert "test_type" in payload, "payload must include test_type discriminator"
        assert payload["test_type"] == "qa", "test_type should be 'qa' for test mode results"

    def test_callback_payload_includes_assertion_results(self, mock_config_with_assertions):
        """The callback payload should include assertion comparison results
        alongside the scraped data.

        Each assertion result should pair the expected values from
        test_assertions with the actual scraped values.
        """
        from runner.cli import build_test_mode_payload

        payload = build_test_mode_payload(
            config=mock_config_with_assertions,
            results=[{"sku": "SKU-1", "name": "Product A", "price": "$9.99"}],
        )

        assert "assertion_results" in payload, "payload must include assertion_results"
        assert len(payload["assertion_results"]) == 1, "should have one assertion result per SKU"
        assertion = payload["assertion_results"][0]
        assert "sku" in assertion, "each assertion result must have a sku"
        assert "expected" in assertion, "each assertion result must have expected values"
        assert "actual" in assertion, "each assertion result must have actual values"
        assert "passed" in assertion, "each assertion result must have a passed flag"
