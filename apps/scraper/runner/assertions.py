"""Assertion engine for scraper QA testing.

Provides exact-match assertion functionality for validating scraped product data
against expected values. Used by test mode to verify scraper accuracy.
"""

from __future__ import annotations


def assert_sku(
    expected: dict[str, str | None],
    actual: dict[str, str],
    sku: str | None = None,
) -> dict:
    """Assert that actual scraped data matches expected values.

    Performs exact string comparison for each expected field. Returns per-field
    results and overall pass/fail status.

    Args:
        expected: Dictionary of expected field values (field_name -> value).
                  Empty or None values are skipped.
        actual: Dictionary of actual scraped values (field_name -> value).
                Missing fields are treated as empty strings.
        sku: Optional SKU identifier for traceability in results.

    Returns:
        Dictionary with structure:
        {
            "sku": str | None,
            "overall_passed": bool,
            "fields": [
                {
                    "field": str,
                    "expected": str,
                    "actual": str,
                    "passed": bool
                }
            ]
        }
    """
    field_results = []
    all_passed = True

    for field_name, expected_value in expected.items():
        # Skip empty expected values (None or empty string)
        if expected_value is None or expected_value == "":
            continue

        # Get actual value, defaulting to empty string if missing
        actual_value = actual.get(field_name, "")

        # Exact string comparison
        field_passed = expected_value == actual_value

        field_results.append(
            {
                "field": field_name,
                "expected": expected_value,
                "actual": actual_value,
                "passed": field_passed,
            }
        )

        if not field_passed:
            all_passed = False

    return {
        "sku": sku,
        "overall_passed": all_passed,
        "fields": field_results,
    }


def assert_fake_sku(actual: dict[str, str] | None) -> dict:
    """Assert that a fake SKU returns no data.

    Fake SKUs are products that should NOT exist. When the scraper returns
    no data for them, that's the correct behavior.

    Args:
        actual: Dictionary of actual scraped values, or None/empty dict
                if no data was found.

    Returns:
        Dictionary with structure:
        {
            "overall_passed": bool  # True if actual is empty/None
        }
    """
    # Pass if actual is None, empty dict, or has no keys
    is_empty = actual is None or len(actual) == 0

    return {
        "overall_passed": is_empty,
    }
