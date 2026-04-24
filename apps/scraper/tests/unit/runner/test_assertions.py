"""RED tests for the assertion engine (exact match).

These tests reference modules and functionality that do not exist yet,
ensuring they FAIL in the RED phase of TDD.

Task 4 of Scraper QA Integration: Assertion engine interface definition
via failing tests. Task 7 will implement the engine to make these pass.
"""

from __future__ import annotations

import pytest


# ---------------------------------------------------------------------------
# Test 1: Exact match — all fields equal → SKU passes
# ---------------------------------------------------------------------------


def test_assert_sku_exact_match_all_fields_pass():
    """When all expected fields match actual values, the SKU assertion passes.

    The assertion engine should compare name, price, and image fields
    using exact string equality and report overall_passed=True.
    """
    from runner.assertions import assert_sku

    result = assert_sku(
        expected={"name": "Widget Pro", "price": "19.99", "image": "https://example.com/widget.jpg"},
        actual={"name": "Widget Pro", "price": "19.99", "image": "https://example.com/widget.jpg"},
    )

    assert result["overall_passed"] is True
    assert len(result["fields"]) == 3
    for field_result in result["fields"]:
        assert field_result["passed"] is True


# ---------------------------------------------------------------------------
# Test 2: Per-field failure — one field wrong → SKU fails
# ---------------------------------------------------------------------------


def test_assert_sku_single_field_mismatch_fails():
    """When one field mismatches, overall_passed is False and only that field is marked failed.

    The assertion engine must detect per-field mismatches so the UI can
    show which specific field caused the failure.
    """
    from runner.assertions import assert_sku

    result = assert_sku(
        expected={"name": "Widget Pro", "price": "19.99", "image": "https://example.com/widget.jpg"},
        actual={"name": "Widget Pro", "price": "29.99", "image": "https://example.com/widget.jpg"},
    )

    assert result["overall_passed"] is False

    # Find the price field result
    price_field = next(f for f in result["fields"] if f["field"] == "price")
    assert price_field["passed"] is False
    assert price_field["expected"] == "19.99"
    assert price_field["actual"] == "29.99"

    # Name and image should still pass
    name_field = next(f for f in result["fields"] if f["field"] == "name")
    assert name_field["passed"] is True


# ---------------------------------------------------------------------------
# Test 3: Fake SKU — no data returned → pass
# ---------------------------------------------------------------------------


def test_assert_fake_sku_no_data_passes():
    """A fake SKU should pass when no data is returned (empty actual dict).

    Fake SKUs are products that should NOT exist. When the scraper returns
    no data for them, that's the correct behavior.
    """
    from runner.assertions import assert_fake_sku

    result = assert_fake_sku(actual={})

    assert result["overall_passed"] is True


def test_assert_fake_sku_with_data_fails():
    """A fake SKU should fail when data IS returned (product found unexpectedly).

    If a fake SKU returns actual product data, the scraper may be matching
    too broadly or the SKU isn't truly fake.
    """
    from runner.assertions import assert_fake_sku

    result = assert_fake_sku(actual={"name": "Some Product", "price": "9.99"})

    assert result["overall_passed"] is False


# ---------------------------------------------------------------------------
# Test 4: Missing actual field — treat as empty string
# ---------------------------------------------------------------------------


def test_assert_sku_missing_actual_field_treated_as_empty():
    """When an expected field is missing from actual, treat it as empty string.

    The scraper may not extract a field that was expected. The assertion
    engine should treat a missing field as "" rather than crashing.
    """
    from runner.assertions import assert_sku

    result = assert_sku(
        expected={"name": "Widget Pro", "price": "19.99"},
        actual={"name": "Widget Pro"},
        # 'price' key is missing from actual
    )

    assert result["overall_passed"] is False

    price_field = next(f for f in result["fields"] if f["field"] == "price")
    assert price_field["passed"] is False
    assert price_field["expected"] == "19.99"
    assert price_field["actual"] == ""


# ---------------------------------------------------------------------------
# Test 5: Image URL with query params — exact match on full URL
# ---------------------------------------------------------------------------


def test_assert_sku_image_url_with_query_params_exact_match():
    """Image URLs with query parameters must match exactly (no normalization).

    v1 uses exact string match. A URL with different query params
    (e.g., ?w=200 vs ?w=400) should be treated as different images.
    """
    from runner.assertions import assert_sku

    result = assert_sku(
        expected={"image": "https://cdn.example.com/img.jpg?w=200&h=200"},
        actual={"image": "https://cdn.example.com/img.jpg?w=200&h=200"},
    )

    assert result["overall_passed"] is True


def test_assert_sku_image_url_different_query_params_fails():
    """Image URLs with different query params should fail exact match.

    Even if the base URL is the same, different query params mean
    different images in v1 exact-match mode.
    """
    from runner.assertions import assert_sku

    result = assert_sku(
        expected={"image": "https://cdn.example.com/img.jpg?w=200&h=200"},
        actual={"image": "https://cdn.example.com/img.jpg?w=400&h=400"},
    )

    assert result["overall_passed"] is False

    image_field = next(f for f in result["fields"] if f["field"] == "image")
    assert image_field["passed"] is False
    assert image_field["expected"] == "https://cdn.example.com/img.jpg?w=200&h=200"
    assert image_field["actual"] == "https://cdn.example.com/img.jpg?w=400&h=400"


# ---------------------------------------------------------------------------
# Test 6: Per-field result structure validation
# ---------------------------------------------------------------------------


def test_assert_sku_returns_per_field_result_structure():
    """Each field result must contain field, expected, actual, and passed keys.

    The assertion engine must return structured per-field results so the
    Admin UI can display expected vs actual diffs for each field.
    """
    from runner.assertions import assert_sku

    result = assert_sku(
        expected={"name": "Widget", "price": "10.00"},
        actual={"name": "Gadget", "price": "10.00"},
    )

    # Verify overall structure
    assert "overall_passed" in result
    assert "fields" in result
    assert isinstance(result["fields"], list)

    # Verify each field result has the required keys
    for field_result in result["fields"]:
        assert "field" in field_result
        assert "expected" in field_result
        assert "actual" in field_result
        assert "passed" in field_result
        assert isinstance(field_result["passed"], bool)


# ---------------------------------------------------------------------------
# Test 7: SKU identifier in result
# ---------------------------------------------------------------------------


def test_assert_sku_includes_sku_identifier():
    """The result should include the SKU identifier for traceability.

    When displaying results in the Admin UI, we need to know which SKU
    each assertion result belongs to.
    """
    from runner.assertions import assert_sku

    result = assert_sku(
        sku="SKU-12345",
        expected={"name": "Widget"},
        actual={"name": "Widget"},
    )

    assert result["sku"] == "SKU-12345"
