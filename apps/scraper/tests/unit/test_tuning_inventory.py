"""Validate the AI Search scorer tuning inventory."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scrapers.ai_search.scoring import SearchScorer


ALLOWED_STATUSES = {"allowed", "report-only", "forbidden"}


def _inventory_path() -> Path:
    return Path(__file__).resolve().parents[2] / "scrapers" / "ai_search" / "tuning_inventory.json"


def _load_inventory() -> dict[str, Any]:
    with _inventory_path().open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _entries_by_id() -> dict[str, dict[str, Any]]:
    return {entry["id"]: entry for entry in _load_inventory()["entries"]}


def test_inventory_entries_have_required_machine_readable_shape() -> None:
    inventory = _load_inventory()

    assert inventory["schema_version"] == 1
    assert set(inventory["status_values"]) == ALLOWED_STATUSES
    assert inventory["entries"]

    seen_ids: set[str] = set()
    for entry in inventory["entries"]:
        assert set(entry) >= {"id", "status", "kind", "source_file", "source_symbol", "description", "value"}
        assert entry["id"] not in seen_ids
        seen_ids.add(entry["id"])
        assert entry["status"] in ALLOWED_STATUSES
        assert entry["source_file"]
        assert entry["source_symbol"]


def test_inventory_covers_required_search_scorer_constants() -> None:
    entries = _entries_by_id()
    required_ids = {
        "scoring.brand_domain_aliases",
        "scoring.noisy_query_params",
        "scoring.retailer_groups",
        "scoring.blocked_domains",
        "scoring.low_quality_patterns",
        "scoring.low_quality_url_fragments",
        "scoring.category_patterns",
        "scoring.listing_path_segments",
        "scoring.category_domain_preferences",
        "scoring.lexical_variants",
        "scoring.multi_product_indicators",
    }

    assert required_ids.issubset(entries)
    assert entries["scoring.brand_domain_aliases"]["source_symbol"] == "SearchScorer.BRAND_DOMAIN_ALIASES"
    assert sorted(entries["scoring.noisy_query_params"]["value"]) == sorted(SearchScorer.NOISY_QUERY_PARAMS)
    assert sorted(entries["scoring.blocked_domains"]["value"]) == sorted(SearchScorer.BLOCKED_DOMAINS)
    assert sorted(entries["scoring.retailer_groups"]["value"]["trusted_retailers"]) == sorted(SearchScorer.TRUSTED_RETAILERS)
    assert entries["scoring.category_domain_preferences"]["value"][0]["domain_weights"]["petco.com"] == 6.0


def test_inventory_includes_required_sku_and_official_exact_weights_as_allowed() -> None:
    weights_entry = _entries_by_id()["scoring.score_search_result.weights"]
    weights = weights_entry["value"]

    assert weights_entry["status"] == "allowed"
    assert weights_entry["source_symbol"] == "SearchScorer.score_search_result"
    assert weights["sku_match_bonus"] == 5.0
    assert weights["official_exact_bonus"] == 6.0
    assert weights["official_exact_prefer_manufacturer_bonus"] == 8.0


def test_inventory_tracks_current_tuned_search_scorer_weights() -> None:
    weights = _entries_by_id()["scoring.score_search_result.weights"]["value"]

    assert weights["path_specific_token_overlap_each"] == 1.25
    assert weights["conflicting_variant_penalty"] == -12.0
    assert weights["official_generic_root_non_preferred_bonus"] == 11.0
    assert weights["official_root_missing_variant_penalty"] == -18.0


def test_inventory_includes_brand_source_selector_prompt_decision_criteria() -> None:
    entry = _entries_by_id()["brand_source_selector.prompt_and_schema"]
    value = entry["value"]

    assert entry["status"] == "allowed"
    assert entry["source_symbol"] == "BrandSourceSelector.score_snippet"
    assert "Domain matches brand perfectly" in value["positive_criteria"]
    assert "Barcode/UPC lookup databases" in value["negative_criteria"]
    assert value["response_keys"] == ["is_official", "confidence_score", "reason"]
    assert value["temperature"] == 0.0


def test_inventory_includes_validation_and_extraction_seed_metadata() -> None:
    entries = _entries_by_id()
    validation = entries["validation.extraction_thresholds"]
    extraction_seed = entries["official_brand_extraction_seed.dataset"]

    assert validation["source_file"] == "apps/scraper/scrapers/ai_search/validation.py"
    assert validation["value"]["default_confidence_threshold"] == 0.7
    assert validation["value"]["missing_sku_signal_confidence_floor"] == 0.83
    assert extraction_seed["source_file"] == "apps/scraper/benchmarks/official_brand/fixtures/extraction_seed.json"
    assert extraction_seed["value"]["entry_count"] == 10
    assert extraction_seed["value"]["requires_reviewed_ground_truth"] is True
    assert extraction_seed["value"]["live_benchmark_only"] is True


def test_inventory_marks_new_signals_and_algorithm_rewrites_forbidden() -> None:
    entries = _entries_by_id()

    assert entries["forbidden.add_new_scoring_signals"]["status"] == "forbidden"
    assert entries["forbidden.add_new_scoring_signals"]["value"]["forbidden_action"] == "add_new_scoring_signals"
    assert entries["forbidden.algorithm_rewrite"]["status"] == "forbidden"
    assert entries["forbidden.algorithm_rewrite"]["value"]["forbidden_action"] == "rewrite_scoring_algorithm"
