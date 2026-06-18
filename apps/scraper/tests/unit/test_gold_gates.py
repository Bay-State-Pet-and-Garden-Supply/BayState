from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
root_str = str(ROOT)
if root_str in sys.path:
    sys.path.remove(root_str)
sys.path.insert(0, root_str)
# Pytest may import tests/unit/benchmarks as a top-level "benchmarks" package.
# Drop it so imports resolve to apps/scraper/benchmarks.
sys.modules.pop("benchmarks", None)

from benchmarks.url_extraction.gold_gates import evaluate_gold_row


def _accept_row() -> dict:
    return {
        "id": "openfarm-goodgut-chicken-19lb",
        "source_url": "https://openfarmpet.com/products/goodgut-harvest-chicken-dog-kibble",
        "evidence_url": "https://openfarmpet.com/products/goodgut-harvest-chicken-dog-kibble",
        "expected_outcome": "accept",
        "field_assertions": {
            "brand": {
                "mode": "required",
                "match": "exact",
                "expected": "Open Farm",
                "evidence_snippet": "Open Farm",
            },
            "product_name": {
                "mode": "required",
                "match": "contains_all",
                "tokens": ["GoodGut", "Harvest Chicken", "Dog Kibble"],
                "evidence_snippet": "GoodGut Harvest Chicken Dog Kibble",
            },
            "size_metrics": {
                "mode": "required_if_visible",
                "match": "contains",
                "expected": "19 lb",
                "evidence_snippet": "19 lb",
            },
            "images": {
                "mode": "required",
                "min_count": 1,
                "max_count": 12,
                "reviewed_product_image_count": 2,
                "count_strictness": "range",
            },
            "price": {"mode": "forbidden"},
            "stock_status": {"mode": "forbidden"},
        },
        "tags": ["gold", "pet-food", "dog"],
    }


def _success_result() -> dict:
    return {
        "success": True,
        "final_url": "https://openfarmpet.com/products/goodgut-harvest-chicken-dog-kibble",
        "brand": "Open Farm",
        "product_name": "GoodGut Harvest Chicken Dog Kibble",
        "description": "A clean product description for dog food.",
        "size_metrics": "19 lb bag",
        "categories": ["Dog Food", "Dry Food"],
        "images": [
            "https://cdn.shopify.com/s/files/1/001/products/goodgut-front.png",
            "https://cdn.shopify.com/s/files/1/001/products/goodgut-back.png",
        ],
    }


def test_accept_row_passes_when_identity_and_pollution_gates_pass() -> None:
    gate = evaluate_gold_row(_accept_row(), _success_result())

    assert gate.passed is True
    assert gate.hard_fails == []


def test_brand_mismatch_is_hard_fail() -> None:
    result = _success_result()
    result["brand"] = "Wrong Brand"

    gate = evaluate_gold_row(_accept_row(), result)

    assert gate.passed is False
    assert any("brand_mismatch" in fail for fail in gate.hard_fails)


def test_name_identity_mismatch_is_hard_fail() -> None:
    result = _success_result()
    result["product_name"] = "Open Farm Salmon Treats"

    gate = evaluate_gold_row(_accept_row(), result)

    assert gate.passed is False
    assert any("name_identity_mismatch" in fail for fail in gate.hard_fails)


def test_missing_required_image_is_hard_fail() -> None:
    result = _success_result()
    result["images"] = []

    gate = evaluate_gold_row(_accept_row(), result)

    assert gate.passed is False
    assert any("missing_required_product_image" in fail for fail in gate.hard_fails)


def test_reviewed_image_count_difference_is_warning_for_range_mode() -> None:
    result = _success_result()
    result["images"] = ["https://cdn.shopify.com/product/front.png"]

    gate = evaluate_gold_row(_accept_row(), result)

    assert gate.passed is True
    assert any("image_count_differs_from_reviewed" in warning for warning in gate.warnings)


def test_exact_image_count_difference_is_hard_fail() -> None:
    row = _accept_row()
    row["field_assertions"]["images"]["count_strictness"] = "exact"
    result = _success_result()
    result["images"] = ["https://cdn.shopify.com/product/front.png"]

    gate = evaluate_gold_row(row, result)

    assert gate.passed is False
    assert any("image_count_exact_mismatch" in fail for fail in gate.hard_fails)


def test_forbidden_field_present_is_hard_fail() -> None:
    result = _success_result()
    result["price"] = 19.99

    gate = evaluate_gold_row(_accept_row(), result)

    assert gate.passed is False
    assert any("forbidden_field_present:price" in fail for fail in gate.hard_fails)


def test_dirty_description_html_is_hard_fail() -> None:
    result = _success_result()
    result["description"] = "Great food data-qa= product-card bottomSpacer"

    gate = evaluate_gold_row(_accept_row(), result)

    assert gate.passed is False
    assert any("dirty_description_html" in fail for fail in gate.hard_fails)


def test_protein_only_category_is_hard_fail_for_pet_food() -> None:
    result = _success_result()
    result["categories"] = ["Chicken"]

    gate = evaluate_gold_row(_accept_row(), result)

    assert gate.passed is False
    assert any("category_is_flavor_or_protein" in fail for fail in gate.hard_fails)


def test_wrong_domain_is_hard_fail() -> None:
    result = _success_result()
    result["final_url"] = "https://example-retailer.com/products/goodgut"

    gate = evaluate_gold_row(_accept_row(), result)

    assert gate.passed is False
    assert any("wrong_domain_or_non_official_url" in fail for fail in gate.hard_fails)


def test_reject_row_passes_when_extraction_fails_with_expected_reason() -> None:
    row = {
        "id": "brand-homepage",
        "expected_outcome": "reject",
        "reject_assertions": {"reason_contains": ["not a product detail page"]},
    }
    result = {"success": False, "error": "not a product detail page"}

    gate = evaluate_gold_row(row, result)

    assert gate.passed is True


def test_reject_row_fails_when_extraction_succeeds() -> None:
    row = {
        "id": "brand-homepage",
        "expected_outcome": "reject",
        "reject_assertions": {"reason_contains": ["not a product detail page"]},
    }

    gate = evaluate_gold_row(row, _success_result())

    assert gate.passed is False
    assert "expected_reject_but_extraction_succeeded" in gate.hard_fails
