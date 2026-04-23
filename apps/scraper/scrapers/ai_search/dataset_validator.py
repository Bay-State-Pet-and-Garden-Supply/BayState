"""Validation utilities for golden dataset."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, NamedTuple

ROOT = Path(__file__).resolve().parents[2]  # scrapers/ai_search -> scrapers -> apps/scraper
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

SCHEMA_PATH = ROOT / "data" / "golden_dataset_schema.json"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

SCHEMA_PATH = ROOT / "data" / "golden_dataset_schema.json"

# URL validation pattern - matches http/https URLs
URL_PATTERN = re.compile(r"^https?://.+$", re.IGNORECASE)

# Valid difficulty enum values
VALID_DIFFICULTIES: frozenset[str] = frozenset({"easy", "medium", "hard"})

# Valid optional benchmark source-tier annotations
VALID_EXPECTED_SOURCE_TIERS: frozenset[str] = frozenset(
    {
        "official",
        "official_variant",
        "major_retailer",
        "secondary_retailer",
        "marketplace",
        "retailer",
        "unknown",
    }
)


class ValidationError(NamedTuple):
    """A single validation error with location and message."""

    entry_index: int | None
    field: str | None
    message: str


class ValidationResult(NamedTuple):
    """Result of dataset validation."""

    valid: bool
    errors: list[ValidationError]
    entry_count: int
    duplicate_count: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "valid": self.valid,
            "entry_count": self.entry_count,
            "duplicate_count": self.duplicate_count,
            "errors": [
                {
                    "entry_index": e.entry_index,
                    "field": e.field,
                    "message": e.message,
                }
                for e in self.errors
            ],
        }


class DatasetValidator:
    """Validates golden dataset JSON files against the schema."""

    def __init__(self, schema_path: Path = SCHEMA_PATH) -> None:
        self._schema_path = schema_path
        self._schema: dict[str, Any] | None = None

    @property
    def schema(self) -> dict[str, Any]:
        """Lazy-load the JSON schema."""
        if self._schema is None:
            with open(self._schema_path, encoding="utf-8") as f:
                self._schema = json.load(f)
        return self._schema

    def validate_file(self, dataset_path: Path) -> ValidationResult:
        """Validate a dataset JSON file."""
        try:
            with open(dataset_path, encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            return ValidationResult(
                valid=False,
                errors=[ValidationError(entry_index=None, field=None, message=f"Invalid JSON: {e}")],
                entry_count=0,
                duplicate_count=0,
            )
        return self.validate_payload(data)

    def validate_payload(self, data: dict[str, Any]) -> ValidationResult:
        """Validate a dataset payload."""
        errors: list[ValidationError] = []

        # Validate top-level structure using JSON schema
        schema_errors = self._validate_schema(data)
        errors.extend(schema_errors)

        # Get entries for additional validation
        entries = data.get("entries", [])
        entry_count = len(entries)

        # Check for duplicate queries
        duplicate_errors, duplicate_count = self._check_duplicates(entries)
        errors.extend(duplicate_errors)

        # Validate each entry's URL format and enums
        entry_errors = self._validate_entries(entries)
        errors.extend(entry_errors)

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            entry_count=entry_count,
            duplicate_count=duplicate_count,
        )

    def _validate_schema(self, data: dict[str, Any]) -> list[ValidationError]:
        """Validate payload structure using JSON schema (jsonschema library)."""
        try:
            import jsonschema

            jsonschema.validate(instance=data, schema=self.schema)
            return []
        except ImportError:
            # Fall back to manual validation if jsonschema not installed
            return self._manual_schema_validation(data)
        except jsonschema.ValidationError as e:
            return [ValidationError(entry_index=None, field=None, message=f"Schema validation error: {e.message}")]
        except jsonschema.SchemaError as e:
            return [ValidationError(entry_index=None, field=None, message=f"Invalid schema: {e.message}")]

    def _manual_schema_validation(self, data: dict[str, Any]) -> list[ValidationError]:
        """Manual validation when jsonschema is not available."""
        errors: list[ValidationError] = []
        required_fields = ["version", "created_at", "provenance", "entries"]

        for field in required_fields:
            if field not in data:
                errors.append(ValidationError(entry_index=None, field=field, message=f"Missing required field: {field}"))

        if "entries" in data and not isinstance(data["entries"], list):
            errors.append(ValidationError(entry_index=None, field="entries", message="entries must be an array"))

        return errors

    def _check_duplicates(self, entries: list[dict[str, Any]]) -> tuple[list[ValidationError], int]:
        """Check for duplicate queries."""
        errors: list[ValidationError] = []
        seen: dict[str, int] = {}
        duplicate_count = 0

        for idx, entry in enumerate(entries):
            query = entry.get("query", "")
            if not query:
                continue

            if query in seen:
                duplicate_count += 1
                errors.append(
                    ValidationError(
                        entry_index=idx,
                        field="query",
                        message=f"Duplicate query at index {idx} (first seen at index {seen[query]}): {query!r}",
                    )
                )
            else:
                seen[query] = idx

        return errors, duplicate_count

    def _validate_entries(self, entries: list[dict[str, Any]]) -> list[ValidationError]:
        """Validate individual entries: URL format and difficulty enum."""
        errors: list[ValidationError] = []

        for idx, entry in enumerate(entries):
            # Validate required fields exist
            required_entry_fields = ["query", "expected_source_url", "category", "difficulty", "rationale"]
            for field in required_entry_fields:
                if field not in entry:
                    errors.append(
                        ValidationError(
                            entry_index=idx,
                            field=field,
                            message=f"Missing required field: {field}",
                        )
                    )

            # Validate URL format for expected_source_url
            url = entry.get("expected_source_url", "")
            if url and not URL_PATTERN.match(url):
                errors.append(
                    ValidationError(
                        entry_index=idx,
                        field="expected_source_url",
                        message=f"Invalid URL format: {url!r} (must start with http:// or https://)",
                    )
                )

            expected_family_url = entry.get("expected_family_url", "")
            if expected_family_url and not URL_PATTERN.match(expected_family_url):
                errors.append(
                    ValidationError(
                        entry_index=idx,
                        field="expected_family_url",
                        message=f"Invalid URL format: {expected_family_url!r} (must start with http:// or https://)",
                    )
                )

            expected_source_tier = str(entry.get("expected_source_tier", "") or "").strip()
            if expected_source_tier and expected_source_tier not in VALID_EXPECTED_SOURCE_TIERS:
                errors.append(
                    ValidationError(
                        entry_index=idx,
                        field="expected_source_tier",
                        message=(f"Invalid expected_source_tier: {expected_source_tier!r} (must be one of: {', '.join(sorted(VALID_EXPECTED_SOURCE_TIERS))})"),
                    )
                )

            # Validate difficulty enum
            difficulty = entry.get("difficulty", "")
            if difficulty and difficulty not in VALID_DIFFICULTIES:
                errors.append(
                    ValidationError(
                        entry_index=idx,
                        field="difficulty",
                        message=f"Invalid difficulty: {difficulty!r} (must be one of: {', '.join(sorted(VALID_DIFFICULTIES))})",
                    )
                )

        return errors


def validate_dataset(dataset_path: Path, schema_path: Path = SCHEMA_PATH) -> ValidationResult:
    """Convenience function to validate a dataset file."""
    try:
        validator = DatasetValidator(schema_path=schema_path)
        return validator.validate_file(dataset_path)
    except FileNotFoundError as e:
        return ValidationResult(
            valid=False,
            errors=[ValidationError(entry_index=None, field=None, message=str(e))],
            entry_count=0,
            duplicate_count=0,
        )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Validate a golden dataset JSON file")
    parser.add_argument("--dataset", type=Path, required=True, help="Path to the dataset JSON file")
    parser.add_argument("--schema", type=Path, default=SCHEMA_PATH, help="Path to the JSON schema")
    parser.add_argument("--verbose", action="store_true", help="Print detailed error messages")
    args = parser.parse_args()

    result = validate_dataset(args.dataset, schema_path=args.schema)

    if result.valid:
        print(f"✓ Dataset is valid ({result.entry_count} entries)")
        if result.duplicate_count > 0:
            print(f"  Warning: {result.duplicate_count} duplicate queries found")
    else:
        print(f"✗ Dataset is invalid ({len(result.errors)} errors):")
        for error in result.errors:
            if error.entry_index is not None:
                print(f"  Entry {error.entry_index} [{error.field}]: {error.message}")
            else:
                print(f"  [{error.field}]: {error.message}")

    raise SystemExit(0 if result.valid else 1)
