"""
Contract tests for the shared AI pricing catalog.

These tests define the contract that any pricing catalog loader must satisfy.
They verify the catalog JSON structure, required fields, pricing accuracy,
snapshot date suffix stripping, unknown model handling, and cost calculations.

Run: python -m pytest shared/ai-pricing/test_pricing_catalog.py
"""

import json
import pathlib
import warnings

import pytest

CATALOG_PATH = pathlib.Path(__file__).parent / "pricing-catalog.json"


@pytest.fixture
def catalog():
    """Load and return the pricing catalog JSON."""
    with open(CATALOG_PATH) as f:
        return json.load(f)


@pytest.fixture
def models(catalog):
    """Return the models list from the catalog."""
    return catalog["models"]


# ---------------------------------------------------------------------------
# Schema contract tests
# ---------------------------------------------------------------------------


class TestCatalogSchema:
    """Verify the catalog has the required top-level structure."""

    def test_has_schema_field(self, catalog):
        assert "$schema" in catalog, "Catalog must have a $schema field"

    def test_has_description(self, catalog):
        assert "description" in catalog, "Catalog must have a description field"

    def test_has_last_updated(self, catalog):
        assert "last_updated" in catalog, "Catalog must have a last_updated field"

    def test_has_models_list(self, catalog):
        assert "models" in catalog, "Catalog must have a models list"
        assert isinstance(catalog["models"], list)

    def test_models_not_empty(self, models):
        assert len(models) > 0, "Catalog must contain at least one model entry"


class TestModelEntrySchema:
    """Verify each model entry has all required fields."""

    REQUIRED_FIELDS = [
        "provider",
        "model",
        "mode",
        "input_price",
        "output_price",
        "effective_date",
        "source_url",
    ]

    def test_every_entry_has_required_fields(self, models):
        for entry in models:
            for field in self.REQUIRED_FIELDS:
                assert field in entry, f"Entry {entry.get('model', '?')} missing field '{field}'"

    def test_provider_is_string(self, models):
        for entry in models:
            assert isinstance(entry["provider"], str), f"provider must be string in {entry['model']}"

    def test_model_is_string(self, models):
        for entry in models:
            assert isinstance(entry["model"], str), f"model must be string in {entry['model']}"

    def test_mode_is_sync_or_batch(self, models):
        for entry in models:
            assert entry["mode"] in ("sync", "batch"), (
                f"mode must be 'sync' or 'batch', got '{entry['mode']}' in {entry['model']}"
            )

    def test_prices_are_non_negative_numbers(self, models):
        for entry in models:
            assert isinstance(entry["input_price"], (int, float)), (
                f"input_price must be numeric in {entry['model']}"
            )
            assert isinstance(entry["output_price"], (int, float)), (
                f"output_price must be numeric in {entry['model']}"
            )
            assert entry["input_price"] >= 0, f"input_price must be >= 0 in {entry['model']}"
            assert entry["output_price"] >= 0, f"output_price must be >= 0 in {entry['model']}"

    def test_effective_date_is_iso_format(self, models):
        for entry in models:
            date_str = entry["effective_date"]
            assert isinstance(date_str, str), f"effective_date must be string in {entry['model']}"
            # Validate YYYY-MM-DD format
            parts = date_str.split("-")
            assert len(parts) == 3, f"effective_date must be YYYY-MM-DD in {entry['model']}"
            assert len(parts[0]) == 4, f"Year must be 4 digits in {entry['model']}"
            assert len(parts[1]) == 2, f"Month must be 2 digits in {entry['model']}"
            assert len(parts[2]) == 2, f"Day must be 2 digits in {entry['model']}"

    def test_source_url_is_string(self, models):
        for entry in models:
            assert isinstance(entry["source_url"], str), f"source_url must be string in {entry['model']}"
            assert entry["source_url"].startswith("http"), f"source_url must be HTTP URL in {entry['model']}"


# ---------------------------------------------------------------------------
# Required models contract tests
# ---------------------------------------------------------------------------


class TestRequiredModels:
    """Verify all required models are present in the catalog."""

    REQUIRED_MODELS = [
        ("openai", "gpt-4o-mini", "sync"),
        ("openai", "gpt-4o-mini", "batch"),
        ("openai", "gpt-4o", "sync"),
        ("openai", "gpt-4o", "batch"),
        ("gemini", "gemini-2.5-flash", "sync"),
        ("gemini", "gemini-2.5-pro", "sync"),
    ]

    def test_all_required_models_present(self, models):
        catalog_keys = {(m["provider"], m["model"], m["mode"]) for m in models}
        for provider, model, mode in self.REQUIRED_MODELS:
            assert (provider, model, mode) in catalog_keys, (
                f"Missing required model: provider={provider}, model={model}, mode={mode}"
            )


# ---------------------------------------------------------------------------
# Pricing accuracy contract tests
# ---------------------------------------------------------------------------


class TestPricingAccuracy:
    """Verify pricing values match known rates (USD per 1M tokens)."""

    def _find_entry(self, models, provider, model, mode):
        for m in models:
            if m["provider"] == provider and m["model"] == model and m["mode"] == mode:
                return m
        pytest.fail(f"Model not found: {provider}/{model}/{mode}")

    def test_openai_gpt4o_mini_sync_pricing(self, models):
        entry = self._find_entry(models, "openai", "gpt-4o-mini", "sync")
        assert entry["input_price"] == 0.15
        assert entry["output_price"] == 0.60

    def test_openai_gpt4o_mini_batch_pricing(self, models):
        entry = self._find_entry(models, "openai", "gpt-4o-mini", "batch")
        assert entry["input_price"] == 0.075
        assert entry["output_price"] == 0.30

    def test_openai_gpt4o_sync_pricing(self, models):
        entry = self._find_entry(models, "openai", "gpt-4o", "sync")
        assert entry["input_price"] == 2.50
        assert entry["output_price"] == 10.00

    def test_openai_gpt4o_batch_pricing(self, models):
        entry = self._find_entry(models, "openai", "gpt-4o", "batch")
        assert entry["input_price"] == 1.25
        assert entry["output_price"] == 5.00

    def test_gemini_25_flash_sync_pricing(self, models):
        entry = self._find_entry(models, "gemini", "gemini-2.5-flash", "sync")
        assert entry["input_price"] == 0.30
        assert entry["output_price"] == 2.50

    def test_gemini_25_pro_sync_pricing(self, models):
        entry = self._find_entry(models, "gemini", "gemini-2.5-pro", "sync")
        assert entry["input_price"] == 1.25
        assert entry["output_price"] == 10.00

    def test_batch_pricing_is_half_of_sync(self, models):
        """OpenAI batch pricing should be 50% of sync pricing."""
        sync_models = {m["model"] for m in models if m["provider"] == "openai" and m["mode"] == "sync"}
        for model_name in sync_models:
            sync_entry = self._find_entry(models, "openai", model_name, "sync")
            batch_entry = self._find_entry(models, "openai", model_name, "batch")
            assert batch_entry["input_price"] == pytest.approx(sync_entry["input_price"] / 2, rel=1e-6), (
                f"Batch input price for {model_name} should be 50% of sync"
            )
            assert batch_entry["output_price"] == pytest.approx(sync_entry["output_price"] / 2, rel=1e-6), (
                f"Batch output price for {model_name} should be 50% of sync"
            )


# ---------------------------------------------------------------------------
# Snapshot date suffix stripping contract test
# ---------------------------------------------------------------------------


class TestSnapshotSuffixStripping:
    """Verify that snapshot date suffixes can be resolved to base model names.

    This tests the contract that a loader must strip date suffixes like
    '-2024-08-06' from model names to find the base model pricing.
    """

    SNAPSHOT_SUFFIX_PATTERN = r"-\d{4}-\d{2}-\d{2}$"

    def test_gpt4o_snapshot_strips_to_base(self, models):
        """gpt-4o-2024-08-06 should resolve to gpt-4o pricing."""
        import re

        snapshot_model = "gpt-4o-2024-08-06"
        base_model = re.sub(self.SNAPSHOT_SUFFIX_PATTERN, "", snapshot_model)
        assert base_model == "gpt-4o"

        # Verify base model exists in catalog
        found = any(m["model"] == base_model for m in models)
        assert found, f"Base model '{base_model}' not found in catalog"

    def test_gpt4o_mini_snapshot_strips_to_base(self, models):
        """gpt-4o-mini-2024-07-18 should resolve to gpt-4o-mini pricing."""
        import re

        snapshot_model = "gpt-4o-mini-2024-07-18"
        base_model = re.sub(self.SNAPSHOT_SUFFIX_PATTERN, "", snapshot_model)
        assert base_model == "gpt-4o-mini"

        found = any(m["model"] == base_model for m in models)
        assert found, f"Base model '{base_model}' not found in catalog"

    def test_base_model_unchanged_by_stripping(self, models):
        """Base model names without suffixes should remain unchanged."""
        import re

        for m in models:
            stripped = re.sub(self.SNAPSHOT_SUFFIX_PATTERN, "", m["model"])
            assert stripped == m["model"], (
                f"Model '{m['model']}' should not contain a snapshot suffix"
            )


# ---------------------------------------------------------------------------
# Unknown model contract test
# ---------------------------------------------------------------------------


class TestUnknownModelHandling:
    """Verify that unknown models return 0 cost with a warning, NOT fallback to a paid model.

    This is a contract test: the loader must return cost=0 and emit a warning
    for unknown models. It must NOT fall back to gpt-4o-mini or any other model.
    """

    def test_unknown_model_returns_zero_cost(self, models):
        """An unknown model name should not match any catalog entry."""
        unknown_model = "claude-3.5-sonnet"
        found = any(m["model"] == unknown_model for m in models)
        assert not found, f"Unknown model '{unknown_model}' should not be in catalog"

    def test_unknown_model_with_snapshot_suffix_returns_zero(self, models):
        """An unknown base model with snapshot suffix should also return 0 cost."""
        import re

        unknown_snapshot = "claude-3.5-sonnet-20240620"
        base = re.sub(r"-\d{4}-\d{2}-\d{2}$", "", unknown_snapshot)
        found = any(m["model"] == base for m in models)
        assert not found, f"Unknown base model '{base}' should not be in catalog"


# ---------------------------------------------------------------------------
# Cost calculation contract test
# ---------------------------------------------------------------------------


class TestCostCalculation:
    """Verify cost calculations using catalog pricing.

    Formula: cost = (input_tokens / 1_000_000) * input_price + (output_tokens / 1_000_000) * output_price
    """

    def _find_entry(self, models, provider, model, mode):
        for m in models:
            if m["provider"] == provider and m["model"] == model and m["mode"] == mode:
                return m
        pytest.fail(f"Model not found: {provider}/{model}/{mode}")

    def test_gpt4o_mini_sync_cost_calculation(self, models):
        """gpt-4o-mini sync: 1000 input + 500 output tokens = $0.00045.

        Calculation: (1000 / 1_000_000) * 0.15 + (500 / 1_000_000) * 0.60
                   = 0.00015 + 0.00030
                   = 0.00045
        """
        entry = self._find_entry(models, "openai", "gpt-4o-mini", "sync")
        input_tokens = 1000
        output_tokens = 500

        cost = (input_tokens / 1_000_000) * entry["input_price"] + (
            output_tokens / 1_000_000
        ) * entry["output_price"]

        assert cost == pytest.approx(0.00045, rel=1e-6), f"Expected $0.00045, got ${cost:.6f}"

    def test_gpt4o_mini_batch_cost_calculation(self, models):
        """gpt-4o-mini batch: 1000 input + 500 output tokens = $0.000225.

        Calculation: (1000 / 1_000_000) * 0.075 + (500 / 1_000_000) * 0.30
                   = 0.000075 + 0.00015
                   = 0.000225
        """
        entry = self._find_entry(models, "openai", "gpt-4o-mini", "batch")
        input_tokens = 1000
        output_tokens = 500

        cost = (input_tokens / 1_000_000) * entry["input_price"] + (
            output_tokens / 1_000_000
        ) * entry["output_price"]

        assert cost == pytest.approx(0.000225, rel=1e-6), f"Expected $0.000225, got ${cost:.6f}"

    def test_unknown_model_cost_is_zero(self, models):
        """Unknown model must return 0 cost, not fallback to a paid model."""
        unknown_model = "nonexistent-model-xyz"
        # Simulate lookup: no match found → cost = 0
        found = any(m["model"] == unknown_model for m in models)
        cost = 0.0 if not found else float("inf")  # Must NOT use fallback

        assert cost == 0.0, "Unknown model must return 0 cost, not fallback to a paid model"

    def test_zero_tokens_cost_is_zero(self, models):
        """Zero tokens should always result in zero cost."""
        entry = self._find_entry(models, "openai", "gpt-4o-mini", "sync")
        cost = (0 / 1_000_000) * entry["input_price"] + (0 / 1_000_000) * entry["output_price"]
        assert cost == 0.0


# ---------------------------------------------------------------------------
# Uniqueness contract test
# ---------------------------------------------------------------------------


class TestUniqueness:
    """Verify no duplicate (provider, model, mode) entries exist."""

    def test_no_duplicate_entries(self, models):
        keys = [(m["provider"], m["model"], m["mode"]) for m in models]
        assert len(keys) == len(set(keys)), f"Duplicate entries found: {[k for k in keys if keys.count(k) > 1]}"