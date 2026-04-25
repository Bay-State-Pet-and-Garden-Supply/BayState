"""Ground truth fixture validation helper.

Validates test_skus_ground_truth.json entries against the required schema,
ensuring every SKU has the mandatory fields for OBS regression testing.

Required fields per entry:
  - sku: non-empty string (UPC/product identifier)
  - brand: non-empty string (canonical brand name)
  - name: non-empty string (full product name)
  - expected_source_url: valid http/https URL
  - expected_source_domain: non-empty string (e.g. 'scotts.com')
  - expected_source_tier: one of the defined enum values
  - expected_fields: non-empty list of extractable field names

Optional fields:
  - description, size_metrics, images, categories, source, difficulty, price
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, NamedTuple

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"
GROUND_TRUTH_FILE = FIXTURES_DIR / "test_skus_ground_truth.json"
SCHEMA_FILE = FIXTURES_DIR / "ground_truth_schema.json"

# Required fields that MUST be present and non-empty in every entry
REQUIRED_FIELDS: tuple[str, ...] = (
    "sku",
    "brand",
    "name",
    "expected_source_url",
    "expected_source_domain",
    "expected_source_tier",
    "expected_fields",
)

# Valid enum values for expected_source_tier
VALID_SOURCE_TIERS: frozenset[str] = frozenset(
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

# Valid field names for expected_fields
VALID_EXPECTED_FIELDS: frozenset[str] = frozenset(
    {
        "name",
        "brand",
        "description",
        "price",
        "images",
        "size_metrics",
        "sku",
        "categories",
    }
)

# Valid difficulty values
VALID_DIFFICULTIES: frozenset[str] = frozenset({"easy", "medium", "hard"})

# URL validation pattern
URL_PATTERN = re.compile(r"^https?://.+$", re.IGNORECASE)

# Maximum entries allowed in the fixture
MAX_ENTRIES = 50


# ---------------------------------------------------------------------------
# Validation result types
# ---------------------------------------------------------------------------


class FieldError(NamedTuple):
    """A single field-level validation error."""

    entry_index: int
    field: str
    message: str


class FixtureValidationResult(NamedTuple):
    """Result of fixture validation."""

    valid: bool
    errors: list[FieldError]
    entry_count: int
    warnings: list[str]

    def summary(self) -> str:
        """Return a human-readable summary of the validation result."""
        lines: list[str] = []
        if self.valid:
            lines.append(f"✓ Fixture is valid ({self.entry_count} entries)")
        else:
            lines.append(f"✗ Fixture is INVALID ({len(self.errors)} errors):")
            for err in self.errors:
                lines.append(f"  Entry {err.entry_index} [{err.field}]: {err.message}")
        if self.warnings:
            lines.append(f"⚠ Warnings ({len(self.warnings)}):")
            for w in self.warnings:
                lines.append(f"  - {w}")
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Validation functions
# ---------------------------------------------------------------------------


def validate_entry(entry: dict[str, Any], index: int) -> list[FieldError]:
    """Validate a single fixture entry against the required schema.

    Args:
        entry: A single product entry from the fixture.
        index: The 0-based index of the entry in the fixture array.

    Returns:
        List of FieldError objects (empty if entry is valid).
    """
    errors: list[FieldError] = []

    # Check required fields exist and are non-empty
    for field in REQUIRED_FIELDS:
        if field not in entry:
            errors.append(FieldError(index, field, f"Missing required field: {field}"))
        elif entry[field] is None or entry[field] == "":
            errors.append(FieldError(index, field, f"Required field '{field}' must not be empty"))

    # Validate sku is a non-empty string
    sku = entry.get("sku")
    if sku is not None and not isinstance(sku, str):
        errors.append(FieldError(index, "sku", f"sku must be a string, got {type(sku).__name__}"))

    # Validate brand is a non-empty string
    brand = entry.get("brand")
    if brand is not None and not isinstance(brand, str):
        errors.append(FieldError(index, "brand", f"brand must be a string, got {type(brand).__name__}"))

    # Validate name is a non-empty string
    name = entry.get("name")
    if name is not None and not isinstance(name, str):
        errors.append(FieldError(index, "name", f"name must be a string, got {type(name).__name__}"))

    # Validate expected_source_url is a valid URL
    url = entry.get("expected_source_url")
    if url is not None and isinstance(url, str) and not URL_PATTERN.match(url):
        errors.append(
            FieldError(
                index,
                "expected_source_url",
                f"Invalid URL format: {url!r} (must start with http:// or https://)",
            )
        )

    # Validate expected_source_domain is a non-empty string
    domain = entry.get("expected_source_domain")
    if domain is not None and isinstance(domain, str):
        if not domain or domain.strip() != domain:
            errors.append(
                FieldError(index, "expected_source_domain", "expected_source_domain must be a non-empty, trimmed string")
            )

    # Validate expected_source_tier is a valid enum value
    tier = entry.get("expected_source_tier")
    if tier is not None:
        tier_str = str(tier).strip()
        if tier_str not in VALID_SOURCE_TIERS:
            errors.append(
                FieldError(
                    index,
                    "expected_source_tier",
                    f"Invalid expected_source_tier: {tier_str!r} (must be one of: {', '.join(sorted(VALID_SOURCE_TIERS))})",
                )
            )

    # Validate expected_fields is a non-empty list of valid field names
    expected_fields = entry.get("expected_fields")
    if expected_fields is not None:
        if not isinstance(expected_fields, list):
            errors.append(FieldError(index, "expected_fields", f"expected_fields must be a list, got {type(expected_fields).__name__}"))
        elif len(expected_fields) == 0:
            errors.append(FieldError(index, "expected_fields", "expected_fields must not be empty"))
        else:
            for i, field_name in enumerate(expected_fields):
                if field_name not in VALID_EXPECTED_FIELDS:
                    errors.append(
                        FieldError(
                            index,
                            "expected_fields",
                            f"Invalid field name at position {i}: {field_name!r} (must be one of: {', '.join(sorted(VALID_EXPECTED_FIELDS))})",
                        )
                    )

    # Validate difficulty if present
    difficulty = entry.get("difficulty")
    if difficulty is not None:
        diff_str = str(difficulty).strip()
        if diff_str not in VALID_DIFFICULTIES:
            errors.append(
                FieldError(
                    index,
                    "difficulty",
                    f"Invalid difficulty: {diff_str!r} (must be one of: {', '.join(sorted(VALID_DIFFICULTIES))})",
                )
            )

    # Validate images is a list of strings if present
    images = entry.get("images")
    if images is not None:
        if not isinstance(images, list):
            errors.append(FieldError(index, "images", f"images must be a list, got {type(images).__name__}"))
        elif not all(isinstance(img, str) for img in images):
            errors.append(FieldError(index, "images", "All image entries must be strings"))

    # Validate categories is a list of strings if present
    categories = entry.get("categories")
    if categories is not None:
        if not isinstance(categories, list):
            errors.append(FieldError(index, "categories", f"categories must be a list, got {type(categories).__name__}"))
        elif not all(isinstance(cat, str) for cat in categories):
            errors.append(FieldError(index, "categories", "All category entries must be strings"))

    return errors


def validate_fixture(data: list[dict[str, Any]]) -> FixtureValidationResult:
    """Validate the entire ground truth fixture array.

    Args:
        data: Parsed JSON array of product entries.

    Returns:
        FixtureValidationResult with validity, errors, entry count, and warnings.
    """
    errors: list[FieldError] = []
    warnings: list[str] = []

    if not isinstance(data, list):
        errors.append(FieldError(0, "", f"Fixture must be a JSON array, got {type(data).__name__}"))
        return FixtureValidationResult(valid=False, errors=errors, entry_count=0, warnings=warnings)

    entry_count = len(data)

    # Check max entries
    if entry_count > MAX_ENTRIES:
        errors.append(FieldError(0, "", f"Fixture has {entry_count} entries, maximum is {MAX_ENTRIES}"))

    # Check for duplicate SKUs
    seen_skus: dict[str, int] = {}
    for idx, entry in enumerate(data):
        sku = entry.get("sku", "")
        if sku in seen_skus:
            errors.append(
                FieldError(
                    idx,
                    "sku",
                    f"Duplicate SKU: {sku!r} (first seen at index {seen_skus[sku]})",
                )
            )
        else:
            seen_skus[sku] = idx

    # Validate each entry
    for idx, entry in enumerate(data):
        entry_errors = validate_entry(entry, idx)
        errors.extend(entry_errors)

    # Warnings for missing optional but recommended fields
    for idx, entry in enumerate(data):
        if "description" not in entry or not entry.get("description"):
            warnings.append(f"Entry {idx} (SKU: {entry.get('sku', 'UNKNOWN')}): missing recommended field 'description'")
        if "difficulty" not in entry:
            warnings.append(f"Entry {idx} (SKU: {entry.get('sku', 'UNKNOWN')}): missing optional field 'difficulty' (defaults to 'easy')")

    return FixtureValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        entry_count=entry_count,
        warnings=warnings,
    )


def load_and_validate_fixture(fixture_path: Path | None = None) -> tuple[list[dict[str, Any]], FixtureValidationResult]:
    """Load and validate the ground truth fixture file.

    Args:
        fixture_path: Path to the fixture JSON file. Defaults to GROUND_TRUTH_FILE.

    Returns:
        Tuple of (parsed data, validation result).

    Raises:
        FileNotFoundError: If the fixture file doesn't exist.
        json.JSONDecodeError: If the fixture file contains invalid JSON.
    """
    path = fixture_path or GROUND_TRUTH_FILE
    if not path.exists():
        raise FileNotFoundError(f"Ground truth fixture not found: {path}")

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    result = validate_fixture(data)
    return data, result


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Validate ground truth fixture JSON file")
    parser.add_argument("--fixture", type=Path, default=GROUND_TRUTH_FILE, help="Path to fixture JSON file")
    parser.add_argument("--strict", action="store_true", help="Treat warnings as errors")
    args = parser.parse_args()

    try:
        data, result = load_and_validate_fixture(args.fixture)
    except FileNotFoundError as e:
        print(f"✗ {e}")
        raise SystemExit(1)
    except json.JSONDecodeError as e:
        print(f"✗ Invalid JSON: {e}")
        raise SystemExit(1)

    print(result.summary())

    if args.strict and result.warnings:
        print("\n⚠ Strict mode: treating warnings as errors")
        raise SystemExit(1)

    if not result.valid:
        raise SystemExit(1)