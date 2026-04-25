"""Tests for ground truth fixture validation.

Validates that:
1. The fixture file passes validation with all required fields
2. Invalid entries are correctly rejected with clear error messages
3. Edge cases (empty fields, wrong types, invalid enums) are caught
4. The fixture stays within the ≤50 SKU cap
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tests.evaluation.ground_truth_validator import (
    REQUIRED_FIELDS,
    VALID_DIFFICULTIES,
    VALID_EXPECTED_FIELDS,
    VALID_SOURCE_TIERS,
    validate_entry,
    validate_fixture,
    load_and_validate_fixture,
)

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"
GROUND_TRUTH_FILE = FIXTURES_DIR / "test_skus_ground_truth.json"


# ---------------------------------------------------------------------------
# Fixture validation tests
# ---------------------------------------------------------------------------


class TestValidateEntry:
    """Tests for validate_entry() on individual entries."""

    def test_valid_entry_passes(self):
        entry = {
            "sku": "032247886598",
            "brand": "Scotts",
            "name": "Scotts NatureScapes Mulch",
            "expected_source_url": "https://www.scotts.com/en-us/product",
            "expected_source_domain": "scotts.com",
            "expected_source_tier": "official",
            "expected_fields": ["name", "brand", "description"],
        }
        errors = validate_entry(entry, 0)
        assert errors == []

    def test_missing_required_field_sku(self):
        entry = {
            "brand": "Scotts",
            "name": "Scotts NatureScapes Mulch",
            "expected_source_url": "https://www.scotts.com/en-us/product",
            "expected_source_domain": "scotts.com",
            "expected_source_tier": "official",
            "expected_fields": ["name"],
        }
        errors = validate_entry(entry, 0)
        assert len(errors) == 1
        assert errors[0].field == "sku"
        assert "Missing required field" in errors[0].message

    def test_missing_required_field_brand(self):
        entry = {
            "sku": "032247886598",
            "name": "Scotts NatureScapes Mulch",
            "expected_source_url": "https://www.scotts.com/en-us/product",
            "expected_source_domain": "scotts.com",
            "expected_source_tier": "official",
            "expected_fields": ["name"],
        }
        errors = validate_entry(entry, 1)
        assert len(errors) == 1
        assert errors[0].field == "brand"

    def test_missing_required_field_name(self):
        entry = {
            "sku": "032247886598",
            "brand": "Scotts",
            "expected_source_url": "https://www.scotts.com/en-us/product",
            "expected_source_domain": "scotts.com",
            "expected_source_tier": "official",
            "expected_fields": ["name"],
        }
        errors = validate_entry(entry, 2)
        assert len(errors) == 1
        assert errors[0].field == "name"

    def test_missing_required_field_expected_source_url(self):
        entry = {
            "sku": "032247886598",
            "brand": "Scotts",
            "name": "Scotts NatureScapes Mulch",
            "expected_source_domain": "scotts.com",
            "expected_source_tier": "official",
            "expected_fields": ["name"],
        }
        errors = validate_entry(entry, 3)
        assert len(errors) == 1
        assert errors[0].field == "expected_source_url"

    def test_missing_required_field_expected_source_domain(self):
        entry = {
            "sku": "032247886598",
            "brand": "Scotts",
            "name": "Scotts NatureScapes Mulch",
            "expected_source_url": "https://www.scotts.com/en-us/product",
            "expected_source_tier": "official",
            "expected_fields": ["name"],
        }
        errors = validate_entry(entry, 4)
        assert len(errors) == 1
        assert errors[0].field == "expected_source_domain"

    def test_missing_required_field_expected_source_tier(self):
        entry = {
            "sku": "032247886598",
            "brand": "Scotts",
            "name": "Scotts NatureScapes Mulch",
            "expected_source_url": "https://www.scotts.com/en-us/product",
            "expected_source_domain": "scotts.com",
            "expected_fields": ["name"],
        }
        errors = validate_entry(entry, 5)
        assert len(errors) == 1
        assert errors[0].field == "expected_source_tier"

    def test_missing_required_field_expected_fields(self):
        entry = {
            "sku": "032247886598",
            "brand": "Scotts",
            "name": "Scotts NatureScapes Mulch",
            "expected_source_url": "https://www.scotts.com/en-us/product",
            "expected_source_domain": "scotts.com",
            "expected_source_tier": "official",
        }
        errors = validate_entry(entry, 6)
        assert len(errors) == 1
        assert errors[0].field == "expected_fields"

    def test_empty_required_field_rejected(self):
        entry = {
            "sku": "",
            "brand": "",
            "name": "",
            "expected_source_url": "",
            "expected_source_domain": "",
            "expected_source_tier": "",
            "expected_fields": [],
        }
        errors = validate_entry(entry, 0)
        # Should have errors for empty required fields
        assert len(errors) >= 5  # sku, brand, name, expected_source_url, expected_source_domain at minimum
        error_fields = {e.field for e in errors}
        assert "sku" in error_fields
        assert "brand" in error_fields
        assert "name" in error_fields

    def test_invalid_url_format_rejected(self):
        entry = {
            "sku": "032247886598",
            "brand": "Scotts",
            "name": "Scotts NatureScapes Mulch",
            "expected_source_url": "not-a-url",
            "expected_source_domain": "scotts.com",
            "expected_source_tier": "official",
            "expected_fields": ["name"],
        }
        errors = validate_entry(entry, 0)
        url_errors = [e for e in errors if e.field == "expected_source_url"]
        assert len(url_errors) == 1
        assert "Invalid URL format" in url_errors[0].message

    def test_invalid_source_tier_rejected(self):
        entry = {
            "sku": "032247886598",
            "brand": "Scotts",
            "name": "Scotts NatureScapes Mulch",
            "expected_source_url": "https://www.scotts.com/en-us/product",
            "expected_source_domain": "scotts.com",
            "expected_source_tier": "invalid_tier",
            "expected_fields": ["name"],
        }
        errors = validate_entry(entry, 0)
        tier_errors = [e for e in errors if e.field == "expected_source_tier"]
        assert len(tier_errors) == 1
        assert "Invalid expected_source_tier" in tier_errors[0].message

    def test_invalid_expected_field_name_rejected(self):
        entry = {
            "sku": "032247886598",
            "brand": "Scotts",
            "name": "Scotts NatureScapes Mulch",
            "expected_source_url": "https://www.scotts.com/en-us/product",
            "expected_source_domain": "scotts.com",
            "expected_source_tier": "official",
            "expected_fields": ["name", "invalid_field"],
        }
        errors = validate_entry(entry, 0)
        field_errors = [e for e in errors if e.field == "expected_fields"]
        assert len(field_errors) == 1
        assert "Invalid field name" in field_errors[0].message

    def test_invalid_difficulty_rejected(self):
        entry = {
            "sku": "032247886598",
            "brand": "Scotts",
            "name": "Scotts NatureScapes Mulch",
            "expected_source_url": "https://www.scotts.com/en-us/product",
            "expected_source_domain": "scotts.com",
            "expected_source_tier": "official",
            "expected_fields": ["name"],
            "difficulty": "extreme",
        }
        errors = validate_entry(entry, 0)
        diff_errors = [e for e in errors if e.field == "difficulty"]
        assert len(diff_errors) == 1
        assert "Invalid difficulty" in diff_errors[0].message

    def test_all_valid_source_tiers_accepted(self):
        for tier in VALID_SOURCE_TIERS:
            entry = {
                "sku": "032247886598",
                "brand": "Scotts",
                "name": "Scotts NatureScapes Mulch",
                "expected_source_url": "https://www.scotts.com/en-us/product",
                "expected_source_domain": "scotts.com",
                "expected_source_tier": tier,
                "expected_fields": ["name"],
            }
            errors = validate_entry(entry, 0)
            tier_errors = [e for e in errors if e.field == "expected_source_tier"]
            assert len(tier_errors) == 0, f"Tier {tier!r} should be valid"

    def test_all_valid_difficulties_accepted(self):
        for difficulty in VALID_DIFFICULTIES:
            entry = {
                "sku": "032247886598",
                "brand": "Scotts",
                "name": "Scotts NatureScapes Mulch",
                "expected_source_url": "https://www.scotts.com/en-us/product",
                "expected_source_domain": "scotts.com",
                "expected_source_tier": "official",
                "expected_fields": ["name"],
                "difficulty": difficulty,
            }
            errors = validate_entry(entry, 0)
            diff_errors = [e for e in errors if e.field == "difficulty"]
            assert len(diff_errors) == 0, f"Difficulty {difficulty!r} should be valid"

    def test_all_valid_expected_fields_accepted(self):
        entry = {
            "sku": "032247886598",
            "brand": "Scotts",
            "name": "Scotts NatureScapes Mulch",
            "expected_source_url": "https://www.scotts.com/en-us/product",
            "expected_source_domain": "scotts.com",
            "expected_source_tier": "official",
            "expected_fields": list(VALID_EXPECTED_FIELDS),
        }
        errors = validate_entry(entry, 0)
        field_errors = [e for e in errors if e.field == "expected_fields"]
        assert len(field_errors) == 0

    def test_images_must_be_list_of_strings(self):
        entry = {
            "sku": "032247886598",
            "brand": "Scotts",
            "name": "Scotts NatureScapes Mulch",
            "expected_source_url": "https://www.scotts.com/en-us/product",
            "expected_source_domain": "scotts.com",
            "expected_source_tier": "official",
            "expected_fields": ["name"],
            "images": "not-a-list",
        }
        errors = validate_entry(entry, 0)
        img_errors = [e for e in errors if e.field == "images"]
        assert len(img_errors) == 1

    def test_categories_must_be_list_of_strings(self):
        entry = {
            "sku": "032247886598",
            "brand": "Scotts",
            "name": "Scotts NatureScapes Mulch",
            "expected_source_url": "https://www.scotts.com/en-us/product",
            "expected_source_domain": "scotts.com",
            "expected_source_tier": "official",
            "expected_fields": ["name"],
            "categories": "not-a-list",
        }
        errors = validate_entry(entry, 0)
        cat_errors = [e for e in errors if e.field == "categories"]
        assert len(cat_errors) == 1

    def test_multiple_missing_fields_reported(self):
        entry = {}
        errors = validate_entry(entry, 0)
        missing_fields = {e.field for e in errors if "Missing required field" in e.message}
        assert missing_fields == set(REQUIRED_FIELDS)


class TestValidateFixture:
    """Tests for validate_fixture() on the full fixture array."""

    def test_valid_fixture_passes(self):
        data = [
            {
                "sku": "032247886598",
                "brand": "Scotts",
                "name": "Scotts NatureScapes Mulch",
                "expected_source_url": "https://www.scotts.com/en-us/product",
                "expected_source_domain": "scotts.com",
                "expected_source_tier": "official",
                "expected_fields": ["name", "brand"],
            }
        ]
        result = validate_fixture(data)
        assert result.valid
        assert result.entry_count == 1
        assert len(result.errors) == 0

    def test_duplicate_sku_rejected(self):
        data = [
            {
                "sku": "032247886598",
                "brand": "Scotts",
                "name": "Product A",
                "expected_source_url": "https://www.scotts.com/en-us/product-a",
                "expected_source_domain": "scotts.com",
                "expected_source_tier": "official",
                "expected_fields": ["name"],
            },
            {
                "sku": "032247886598",
                "brand": "Scotts",
                "name": "Product B",
                "expected_source_url": "https://www.scotts.com/en-us/product-b",
                "expected_source_domain": "scotts.com",
                "expected_source_tier": "official",
                "expected_fields": ["name"],
            },
        ]
        result = validate_fixture(data)
        assert not result.valid
        dup_errors = [e for e in result.errors if "Duplicate SKU" in e.message]
        assert len(dup_errors) == 1

    def test_max_entries_exceeded(self):
        data = [
            {
                "sku": f"SKU{i:04d}",
                "brand": "Brand",
                "name": f"Product {i}",
                "expected_source_url": "https://example.com/product",
                "expected_source_domain": "example.com",
                "expected_source_tier": "official",
                "expected_fields": ["name"],
            }
            for i in range(51)
        ]
        result = validate_fixture(data)
        max_errors = [e for e in result.errors if "maximum is 50" in e.message]
        assert len(max_errors) == 1

    def test_non_array_rejected(self):
        result = validate_fixture({"not": "an array"})
        assert not result.valid
        assert len(result.errors) == 1
        assert "array" in result.errors[0].message.lower()

    def test_warnings_for_missing_optional_fields(self):
        data = [
            {
                "sku": "032247886598",
                "brand": "Scotts",
                "name": "Scotts NatureScapes Mulch",
                "expected_source_url": "https://www.scotts.com/en-us/product",
                "expected_source_domain": "scotts.com",
                "expected_source_tier": "official",
                "expected_fields": ["name"],
            }
        ]
        result = validate_fixture(data)
        assert result.valid
        assert len(result.warnings) >= 1
        assert any("description" in w for w in result.warnings)

    def test_empty_array_passes(self):
        result = validate_fixture([])
        assert result.valid
        assert result.entry_count == 0


class TestLoadAndValidateFixture:
    """Tests for load_and_validate_fixture() loading from file."""

    def test_load_actual_fixture(self):
        if not GROUND_TRUTH_FILE.exists():
            pytest.skip("Ground truth fixture file not found")
        data, result = load_and_validate_fixture(GROUND_TRUTH_FILE)
        assert result.valid, f"Fixture validation failed:\n{result.summary()}"
        assert len(data) > 0
        assert len(data) <= 50, f"Fixture has {len(data)} entries, max is 50"

    def test_load_nonexistent_file_raises(self, tmp_path):
        nonexistent = tmp_path / "does_not_exist.json"
        with pytest.raises(FileNotFoundError):
            load_and_validate_fixture(nonexistent)

    def test_load_invalid_json_raises(self, tmp_path):
        bad_json = tmp_path / "bad.json"
        bad_json.write_text("{invalid json")
        with pytest.raises(json.JSONDecodeError):
            load_and_validate_fixture(bad_json)


class TestFixtureSchemaCompliance:
    """Integration tests verifying the actual fixture file complies with the schema."""

    def test_fixture_has_all_required_fields(self):
        if not GROUND_TRUTH_FILE.exists():
            pytest.skip("Ground truth fixture file not found")
        data, result = load_and_validate_fixture(GROUND_TRUTH_FILE)
        assert result.valid, f"Fixture validation failed:\n{result.summary()}"

    def test_fixture_entry_count_within_limit(self):
        if not GROUND_TRUTH_FILE.exists():
            pytest.skip("Ground truth fixture file not found")
        data, result = load_and_validate_fixture(GROUND_TRUTH_FILE)
        assert len(data) <= 50, f"Fixture has {len(data)} entries, max is 50"

    def test_fixture_no_duplicate_skus(self):
        if not GROUND_TRUTH_FILE.exists():
            pytest.skip("Ground truth fixture file not found")
        data, result = load_and_validate_fixture(GROUND_TRUTH_FILE)
        skus = [entry.get("sku", "") for entry in data]
        assert len(skus) == len(set(skus)), "Fixture contains duplicate SKUs"

    def test_fixture_all_source_tiers_valid(self):
        if not GROUND_TRUTH_FILE.exists():
            pytest.skip("Ground truth fixture file not found")
        data, result = load_and_validate_fixture(GROUND_TRUTH_FILE)
        for entry in data:
            tier = entry.get("expected_source_tier", "")
            assert tier in VALID_SOURCE_TIERS, f"Invalid source tier: {tier!r}"

    def test_fixture_all_expected_fields_valid(self):
        if not GROUND_TRUTH_FILE.exists():
            pytest.skip("Ground truth fixture file not found")
        data, result = load_and_validate_fixture(GROUND_TRUTH_FILE)
        for entry in data:
            fields = entry.get("expected_fields", [])
            for field in fields:
                assert field in VALID_EXPECTED_FIELDS, f"Invalid expected field: {field!r}"

    def test_fixture_all_urls_valid(self):
        if not GROUND_TRUTH_FILE.exists():
            pytest.skip("Ground truth fixture file not found")
        data, result = load_and_validate_fixture(GROUND_TRUTH_FILE)
        for entry in data:
            url = entry.get("expected_source_url", "")
            assert url.startswith(("http://", "https://")), f"Invalid URL: {url!r}"

    def test_fixture_brand_coverage(self):
        if not GROUND_TRUTH_FILE.exists():
            pytest.skip("Ground truth fixture file not found")
        data, result = load_and_validate_fixture(GROUND_TRUTH_FILE)
        brands = {entry.get("brand", "") for entry in data}
        assert len(brands) >= 3, f"Expected at least 3 brands, got {len(brands)}: {brands}"

    def test_fixture_difficulty_distribution(self):
        if not GROUND_TRUTH_FILE.exists():
            pytest.skip("Ground truth fixture file not found")
        data, result = load_and_validate_fixture(GROUND_TRUTH_FILE)
        difficulties = [entry.get("difficulty", "easy") for entry in data]
        for d in difficulties:
            assert d in VALID_DIFFICULTIES, f"Invalid difficulty: {d!r}"