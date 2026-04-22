"""Tests for dataset_validator module."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scrapers.ai_search.dataset_validator import (
    DatasetValidator,
    URL_PATTERN,
    VALID_DIFFICULTIES,
    ValidationError,
    ValidationResult,
    validate_dataset,
)


def _valid_entry(
    query: str = "Blue Buffalo Adult Dog Food 5lb",
    url: str = "https://example.com/product",
    category: str = "Pet Food > Dog Food",
    difficulty: str = "easy",
    rationale: str = "Top-ranked result",
) -> dict[str, Any]:
    """Create a valid dataset entry."""
    return {
        "query": query,
        "expected_source_url": url,
        "category": category,
        "difficulty": difficulty,
        "rationale": rationale,
    }


def _valid_dataset_payload(entries: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Create a valid dataset payload."""
    actual_entries = entries if entries is not None else [_valid_entry()]
    return {
        "version": "1.0",
        "created_at": "2026-04-16T12:00:00",
        "provenance": {
            "annotator": "qa-bot",
            "source": "fixtures.json",
            "mode": "batch",
            "product_count": len(actual_entries),
            "max_calls": 100,
            "serper_calls_used": 1,
        },
        "entries": actual_entries,
    }
    """Create a valid dataset payload."""
    return {
        "version": "1.0",
        "created_at": "2026-04-16T12:00:00",
        "provenance": {
            "annotator": "qa-bot",
            "source": "fixtures.json",
            "mode": "batch",
            "product_count": len(entries) if entries else 1,
            "max_calls": 100,
            "serper_calls_used": 1,
        },
        "entries": entries or [_valid_entry()],
    }


class TestURLPattern:
    """Tests for URL validation pattern."""

    def test_valid_http_url(self) -> None:
        assert URL_PATTERN.match("http://example.com/product")

    def test_valid_https_url(self) -> None:
        assert URL_PATTERN.match("https://example.com/product")

    def test_valid_https_url_with_port(self) -> None:
        assert URL_PATTERN.match("https://example.com:8080/product")

    def test_invalid_relative_url(self) -> None:
        assert not URL_PATTERN.match("/product/123")

    def test_invalid_no_scheme(self) -> None:
        assert not URL_PATTERN.match("example.com/product")

    def test_invalid_ftp_url(self) -> None:
        assert not URL_PATTERN.match("ftp://example.com/file")


class TestValidDifficulties:
    """Tests for difficulty enum validation."""

    def test_valid_easy(self) -> None:
        assert "easy" in VALID_DIFFICULTIES

    def test_valid_medium(self) -> None:
        assert "medium" in VALID_DIFFICULTIES

    def test_valid_hard(self) -> None:
        assert "hard" in VALID_DIFFICULTIES

    def test_invalid_difficulty(self) -> None:
        assert "expert" not in VALID_DIFFICULTIES


class TestDatasetValidator:
    """Tests for DatasetValidator class."""

    def test_validate_valid_payload(self) -> None:
        validator = DatasetValidator()
        payload = _valid_dataset_payload([_valid_entry()])
        result = validator.validate_payload(payload)

        assert result.valid is True
        assert result.errors == []
        assert result.entry_count == 1
        assert result.duplicate_count == 0

    def test_validate_valid_payload_multiple_entries(self) -> None:
        validator = DatasetValidator()
        entries = [
            _valid_entry(query="Product A", url="https://example.com/a"),
            _valid_entry(query="Product B", url="https://example.com/b"),
            _valid_entry(query="Product C", url="https://example.com/c"),
        ]
        payload = _valid_dataset_payload(entries)
        result = validator.validate_payload(payload)

        assert result.valid is True
        assert result.entry_count == 3
        assert result.duplicate_count == 0

    def test_validate_duplicate_queries(self) -> None:
        validator = DatasetValidator()
        entries = [
            _valid_entry(query="Same Query", url="https://example.com/first"),
            _valid_entry(query="Different Query", url="https://example.com/second"),
            _valid_entry(query="Same Query", url="https://example.com/third"),  # Duplicate
        ]
        payload = _valid_dataset_payload(entries)
        result = validator.validate_payload(payload)

        assert result.valid is False
        assert result.duplicate_count == 1
        assert len(result.errors) == 1
        assert result.errors[0].entry_index == 2
        assert result.errors[0].field == "query"

    def test_validate_invalid_url_format(self) -> None:
        validator = DatasetValidator()
        entries = [_valid_entry(url="/relative/path")]
        payload = _valid_dataset_payload(entries)
        result = validator.validate_payload(payload)

        assert result.valid is False
        error = result.errors[0]
        assert error.entry_index == 0
        assert error.field == "expected_source_url"
        assert "Invalid URL format" in error.message

    def test_validate_invalid_url_missing_scheme(self) -> None:
        validator = DatasetValidator()
        entries = [_valid_entry(url="example.com/product")]
        payload = _valid_dataset_payload(entries)
        result = validator.validate_payload(payload)

        assert result.valid is False
        assert any("Invalid URL format" in e.message for e in result.errors)

    def test_validate_invalid_difficulty(self) -> None:
        validator = DatasetValidator()
        entries = [_valid_entry(difficulty="expert")]
        payload = _valid_dataset_payload(entries)
        result = validator.validate_payload(payload)

        assert result.valid is False
        # Error caught by jsonschema at schema level (entry_index=None)
        # or by entry-level validation (entry_index=0)
        error = result.errors[0]
        assert error.field in ("difficulty", None)
        assert "expert" in error.message or "is not one of" in error.message

    def test_validate_invalid_expected_family_url_format(self) -> None:
        validator = DatasetValidator()
        entries = [
            {
                **_valid_entry(),
                "expected_source_tier": "official_variant",
                "expected_family_url": "not-a-url",
                "expected_variant_label": "Sierra Red 1.5 CF",
                "cohort_key": "scotts-naturescapes-1-5cf",
            }
        ]
        payload = _valid_dataset_payload(entries)

        result = validator.validate_payload(payload)

        assert result.valid is False
        assert any(error.field == "expected_family_url" and "Invalid URL format" in error.message for error in result.errors)

    def test_validate_invalid_expected_source_tier_value(self) -> None:
        validator = DatasetValidator()
        entries = [
            {
                **_valid_entry(),
                "expected_source_tier": "offical",
                "expected_family_url": "https://brand.example/family",
                "expected_variant_label": "Blue / Large",
                "cohort_key": "brand-family",
            }
        ]
        payload = _valid_dataset_payload(entries)

        result = validator.validate_payload(payload)

        assert result.valid is False
        assert any(error.field == "expected_source_tier" and "Invalid expected_source_tier" in error.message for error in result.errors)

    def test_validate_accepts_official_variant_expected_source_tier(self) -> None:
        validator = DatasetValidator()
        entries = [
            {
                **_valid_entry(),
                "expected_source_tier": "official_variant",
                "expected_family_url": "https://brand.example/family",
                "expected_variant_label": "Blue / Large",
                "cohort_key": "brand-family",
            }
        ]
        payload = _valid_dataset_payload(entries)

        result = validator.validate_payload(payload)

        assert result.valid is True

    def test_validate_missing_required_entry_field(self) -> None:
        validator = DatasetValidator()
        invalid_entry: dict[str, Any] = {"query": "test"}  # Missing other required fields
        payload = _valid_dataset_payload([invalid_entry])
        result = validator.validate_payload(payload)

        assert result.valid is False
        assert any(e.field == "expected_source_url" for e in result.errors)

    def test_validate_missing_top_level_fields(self) -> None:
        validator = DatasetValidator()
        payload: dict[str, Any] = {"entries": []}
        result = validator.validate_payload(payload)

        assert result.valid is False
        # jsonschema catches missing required fields
        assert len(result.errors) > 0

    def test_validate_empty_entries_array(self) -> None:
        validator = DatasetValidator()
        payload = _valid_dataset_payload([])
        result = validator.validate_payload(payload)

        # Empty entries is valid (just warns about duplicates)
        assert result.valid is True
        assert result.entry_count == 0

    def test_validate_to_dict(self) -> None:
        validator = DatasetValidator()
        payload = _valid_dataset_payload([_valid_entry()])
        result = validator.validate_payload(payload)
        d = result.to_dict()

        assert d["valid"] is True
        assert d["entry_count"] == 1
        assert d["duplicate_count"] == 0
        assert d["errors"] == []


class TestValidateDatasetFunction:
    """Tests for the validate_dataset convenience function."""

    def test_validate_file_not_found(self, tmp_path: Path) -> None:
        result = validate_dataset(tmp_path / "nonexistent.json")
        assert result.valid is False
        # Error message contains 'No such file or directory' or 'not found'
        assert any("no such file" in e.message.lower() or "not found" in e.message.lower() for e in result.errors)


class TestValidationError:
    """Tests for ValidationError named tuple."""

    def test_validation_error_creation(self) -> None:
        error = ValidationError(entry_index=5, field="query", message="Test error")
        assert error.entry_index == 5
        assert error.field == "query"
        assert error.message == "Test error"

    def test_validation_error_top_level(self) -> None:
        error = ValidationError(entry_index=None, field=None, message="Top-level error")
        assert error.entry_index is None
        assert error.field is None


class TestValidationResult:
    """Tests for ValidationResult named tuple."""

    def test_validation_result_valid(self) -> None:
        result = ValidationResult(valid=True, errors=[], entry_count=5, duplicate_count=0)
        assert result.valid is True
        assert len(result.errors) == 0

    def test_validation_result_invalid_with_errors(self) -> None:
        errors = [
            ValidationError(entry_index=0, field="difficulty", message="Invalid"),
            ValidationError(entry_index=1, field="query", message="Duplicate"),
        ]
        result = ValidationResult(valid=False, errors=errors, entry_count=2, duplicate_count=1)
        assert result.valid is False
        assert len(result.errors) == 2


class TestIntegration:
    """Integration tests with file-based validation."""

    def test_validate_valid_dataset_file(self, tmp_path: Path) -> None:
        dataset_path = tmp_path / "valid_dataset.json"
        payload = _valid_dataset_payload(
            [
                _valid_entry(query="Product 1", url="https://example.com/1"),
                _valid_entry(query="Product 2", url="https://example.com/2"),
            ]
        )
        dataset_path.write_text(json.dumps(payload), encoding="utf-8")

        validator = DatasetValidator()
        result = validator.validate_file(dataset_path)

        assert result.valid is True
        assert result.entry_count == 2
        assert result.duplicate_count == 0

    def test_validate_invalid_dataset_file(self, tmp_path: Path) -> None:
        dataset_path = tmp_path / "invalid_dataset.json"
        payload = _valid_dataset_payload(
            [
                _valid_entry(query="Same", url="https://example.com/1"),
                _valid_entry(query="Same", url="https://example.com/2"),  # Duplicate
                _valid_entry(query="Bad URL", url="/relative/path"),  # Invalid URL
                _valid_entry(query="Bad difficulty", url="https://example.com/4", difficulty="impossible"),
            ]
        )
        dataset_path.write_text(json.dumps(payload), encoding="utf-8")

        validator = DatasetValidator()
        result = validator.validate_file(dataset_path)

        assert result.valid is False
        assert result.duplicate_count == 1
        assert len(result.errors) >= 2  # At least 2 errors (duplicate + bad url + bad difficulty)

    def test_validate_invalid_json_file(self, tmp_path: Path) -> None:
        dataset_path = tmp_path / "invalid.json"
        dataset_path.write_text("{ invalid json", encoding="utf-8")

        validator = DatasetValidator()
        result = validator.validate_file(dataset_path)

        assert result.valid is False
        assert any("Invalid JSON" in e.message for e in result.errors)
