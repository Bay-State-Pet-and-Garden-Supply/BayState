#!/usr/bin/env python3
"""Per-field benchmark scoring for extraction packets vs fixture expectations."""

from __future__ import annotations

from typing import Any

from common import tokenize
from media_scoring import score_selected_product_images


def token_overlap(expected: str, actual: str) -> float:
    left = set(tokenize(expected or ""))
    right = set(tokenize(actual or ""))
    if not left:
        return 1.0 if not right else 0.0
    return len(left & right) / len(left)


def score_field(name: str, expected: Any, actual: Any, context: dict[str, Any] | None = None) -> dict[str, Any]:
    if context is None:
        context = {}

    if name == "name":
        return _score_name(expected, actual, context)
    elif name == "brand":
        return _score_brand(expected, actual, context)
    elif name == "species":
        return _score_species(expected, actual, context)
    elif name == "size":
        return _score_size(expected, actual, context)
    elif name == "upc":
        return _score_upc(expected, actual, context)
    elif name == "description":
        return _score_description(expected, actual, context)
    elif name == "ingredients":
        return _score_ingredients(expected, actual, context)
    elif name == "images":
        return _score_images(expected, actual, context)
    elif name == "page_type":
        return _score_page_type(expected, actual, context)
    return {"score": 0.0, "passed": False, "reason": "Unknown field"}


def _score_name(expected: Any, actual: Any, context: dict[str, Any]) -> dict[str, Any]:
    if not expected and not actual:
        return {"score": 1.0, "passed": True, "reason": "No expected name; null is acceptable"}
    if not actual:
        return {"score": 0.0, "passed": False, "reason": "Expected name but actual is null"}
    if isinstance(expected, list):
        scores = [token_overlap(e, actual) for e in expected]
        overlap = max(scores) if scores else 0.0
    else:
        overlap = token_overlap(str(expected), actual)
    passed = overlap >= 0.4
    return {"score": round(overlap, 3), "passed": passed, "reason": f"token_overlap={overlap:.3f}"}


def _score_brand(expected: Any, actual: Any, context: dict[str, Any]) -> dict[str, Any]:
    if not expected and not actual:
        return {"score": 1.0, "passed": True, "reason": "No expected brand; null is acceptable"}
    if not actual:
        return {"score": 0.0, "passed": False, "reason": "Expected brand but actual is null"}
    match = str(expected).lower() in str(actual).lower() or any(a.lower() in str(expected).lower() for a in str(actual).split())
    return {"score": 1.0 if match else 0.0, "passed": match, "reason": "exact_match" if match else f"expected={expected} not in actual={actual}"}


def _score_species(expected: Any, actual: Any, context: dict[str, Any]) -> dict[str, Any]:
    if not expected and not actual:
        return {"score": 1.0, "passed": True, "reason": "No expected species; null is acceptable"}
    if not actual:
        return {"score": 0.0, "passed": False, "reason": "Expected species but actual is null"}
    match = str(expected).lower() in str(actual).lower()
    return {"score": 1.0 if match else 0.0, "passed": match, "reason": "match" if match else f"expected={expected} not in actual={actual}"}


def _score_size(expected: Any, actual: Any, context: dict[str, Any]) -> dict[str, Any]:
    if not expected and not actual:
        return {"score": 1.0, "passed": True, "reason": "No expected size; null is acceptable"}
    if not actual:
        return {"score": 0.0, "passed": False, "reason": "Expected size but actual is null"}
    overlap = token_overlap(str(expected), str(actual))
    passed = overlap >= 0.3
    return {"score": round(overlap, 3), "passed": passed, "reason": f"token_overlap={overlap:.3f}"}


def _score_upc(expected: Any, actual: Any, context: dict[str, Any]) -> dict[str, Any]:
    if not expected:
        return {"score": 1.0, "passed": True, "reason": "No expected UPC; null is acceptable"}
    if not actual:
        return {"score": 0.0, "passed": False, "reason": "Expected UPC but actual is null"}
    match = str(expected) == str(actual)
    return {"score": 1.0 if match else 0.0, "passed": match, "reason": "exact_upc_match" if match else f"expected={expected} != actual={actual}"}


def _score_description(expected: Any, actual: Any, context: dict[str, Any]) -> dict[str, Any]:
    if not expected:
        # If no expected value but would be null, the required_fields check handles it
        return {"score": 1.0, "passed": True, "reason": "No expected description; null is acceptable"}
    if not actual:
        return {"score": 0.0, "passed": False, "reason": "Expected description but actual is null"}
    overlap = token_overlap(str(expected), str(actual))
    passed = overlap >= 0.3
    return {"score": round(overlap, 3), "passed": passed, "reason": f"token_overlap={overlap:.3f}"}


def _score_ingredients(expected: Any, actual: Any, context: dict[str, Any]) -> dict[str, Any]:
    if not expected:
        return {"score": 1.0, "passed": True, "reason": "No expected ingredients; null is acceptable"}
    if not actual:
        return {"score": 0.0, "passed": False, "reason": "Expected ingredients but actual is null"}
    overlap = token_overlap(str(expected), str(actual))
    passed = overlap >= 0.3
    return {"score": round(overlap, 3), "passed": passed, "reason": f"token_overlap={overlap:.3f}"}


def _score_images(expected: Any, actual: Any, context: dict[str, Any]) -> dict[str, Any]:
    fixture_row = context.get("fixture_row")
    page_type = context.get("page_type") or "unknown"
    actual_list = actual if isinstance(actual, list) else (actual or [])
    score = score_selected_product_images(actual_list, fixture_row, page_type)
    return {"score": score["precision"], **score}


def _score_page_type(expected: Any, actual: Any, context: dict[str, Any]) -> dict[str, Any]:
    if not expected:
        return {"score": 1.0, "passed": True, "reason": "No expected page type; any is acceptable"}
    if not actual:
        return {"score": 0.0, "passed": False, "reason": "Expected page type but actual is null"}
    match = str(expected).lower() == str(actual).lower()
    return {"score": 1.0 if match else 0.0, "passed": match, "reason": "exact_page_type_match" if match else f"expected={expected} != actual={actual}"}


def _ensure_field_not_null(field_name: str, actual: Any, required_fields: list[str], expected_val: Any = None) -> dict[str, Any] | None:
    """Check if a field is required and missing. Returns a failing score or None."""
    if field_name not in required_fields:
        return None
    if actual in (None, "", [], {}):
        return {"score": 0.0, "passed": False, "reason": f"Required field '{field_name}' is null/empty but fixture requires it"}
    if expected_val is not None:
        return None  # Let the regular scoring handle it
    return {"score": 1.0, "passed": True, "reason": f"Required field '{field_name}' is present"}


def score_fixture(packet: dict[str, Any], fixture_row: dict[str, Any]) -> dict[str, Any]:
    expected = fixture_row.get("expected", {}) or {}
    fields = packet.get("extraction", {}).get("fields", {})
    classification = packet.get("classification", {}) or {}
    required_fields = list(expected.get("required_fields", []) or [])

    field_map = {
        "name": fields.get("name"),
        "brand": fields.get("brand"),
        "species": fields.get("species"),
        "size": fields.get("size"),
        "upc": fields.get("upc"),
        "description": fields.get("description"),
        "ingredients": fields.get("ingredients"),
        "images": fields.get("images"),
        "page_type": classification.get("page_type"),
    }

    expected_map = {
        "name": expected.get("product_name") or expected.get("name") or expected.get("name_contains") or fixture_row.get("name"),
        "brand": expected.get("brand") or fixture_row.get("brand"),
        "species": expected.get("species"),
        "size": expected.get("size"),
        "upc": expected.get("upc") or (fixture_row.get("upc") if expected.get("upc_present_on_page") else None),
        "description": expected.get("description"),
        "ingredients": expected.get("ingredients"),
        "images": expected.get("carousel_image_urls") or expected.get("image_min") or expected.get("rendered_image_min"),
        "page_type": expected.get("page_type"),
    }

    scores: dict[str, Any] = {}
    all_passed = True
    for field_name in field_map:
        if field_name not in field_map:
            continue
        # First check if field is required and missing
        required_check = _ensure_field_not_null(field_name, field_map.get(field_name), required_fields, expected_map.get(field_name))
        if required_check is not None:
            scores[field_name] = required_check
            if not required_check.get("passed", False):
                all_passed = False
            continue
        # Regular scoring
        score = score_field(field_name, expected_map.get(field_name), field_map.get(field_name), {"fixture_row": fixture_row, "page_type": classification.get("page_type")})
        scores[field_name] = score
        if not score.get("passed", False):
            all_passed = False

    return {"field_scores": scores, "all_passed": all_passed}
