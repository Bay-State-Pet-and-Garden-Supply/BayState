from __future__ import annotations

import json
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

from benchmarks.url_extraction.gold_schema import (
    SCHEMA_VERSION,
    assert_valid_dataset,
    validate_dataset,
)


GOLD_DATASET = ROOT / "benchmarks" / "url_extraction" / "gold_dataset.json"
CANDIDATE_DATASET = ROOT / "benchmarks" / "url_extraction" / "gold_dataset.candidates.json"


def _valid_accept_row() -> dict:
    return {
        "id": "openfarm-goodgut-chicken-19lb",
        "verification_status": "gold",
        "reviewed_by": "nick",
        "reviewed_at": "2026-06-15",
        "source_of_truth": "official_manufacturer_page",
        "source_url": "https://openfarmpet.com/products/goodgut-harvest-chicken-dog-kibble",
        "evidence_url": "https://openfarmpet.com/products/goodgut-harvest-chicken-dog-kibble",
        "evidence_notes": "Official PDP shows brand, product title, 19 lb size, and product images.",
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
                "reviewed_product_image_count": 5,
                "count_strictness": "range",
            },
            "price": {"mode": "forbidden"},
            "stock_status": {"mode": "forbidden"},
        },
        "tags": ["gold", "official", "pet-food", "dog", "dry-food"],
    }


def _valid_reject_row() -> dict:
    return {
        "id": "openfarm-homepage",
        "verification_status": "gold",
        "reviewed_by": "nick",
        "reviewed_at": "2026-06-15",
        "source_of_truth": "official_manufacturer_page",
        "source_url": "https://openfarmpet.com/",
        "evidence_url": "https://openfarmpet.com/",
        "evidence_notes": "Official homepage, not a product detail page.",
        "expected_outcome": "reject",
        "reject_assertions": {
            "reason_contains": ["not a product detail page"],
        },
        "tags": ["gold", "official", "negative", "homepage"],
    }


def _dataset(*entries: dict) -> dict:
    return {
        "schema_version": SCHEMA_VERSION,
        "description": "test dataset",
        "entries": list(entries),
    }


def test_checked_in_gold_dataset_is_valid() -> None:
    data = json.loads(GOLD_DATASET.read_text(encoding="utf-8"))
    assert_valid_dataset(data, require_gold_only=True)


def test_checked_in_candidate_dataset_is_valid_as_candidate_file() -> None:
    data = json.loads(CANDIDATE_DATASET.read_text(encoding="utf-8"))
    assert_valid_dataset(data, require_gold_only=False)


def test_accept_gold_row_validates() -> None:
    assert validate_dataset(_dataset(_valid_accept_row()), require_gold_only=True) == []


def test_reject_gold_row_validates() -> None:
    assert validate_dataset(_dataset(_valid_reject_row()), require_gold_only=True) == []


def test_gold_dataset_rejects_candidate_rows() -> None:
    row = _valid_accept_row()
    row["verification_status"] = "candidate"

    errors = validate_dataset(_dataset(row), require_gold_only=True)

    assert any("may only contain verification_status='gold'" in error for error in errors)


def test_required_identity_fields_need_evidence_snippets() -> None:
    row = _valid_accept_row()
    del row["field_assertions"]["product_name"]["evidence_snippet"]

    errors = validate_dataset(_dataset(row), require_gold_only=True)

    assert any("field_assertions.product_name.evidence_snippet" in error for error in errors)


def test_accept_rows_require_brand_and_product_name_assertions() -> None:
    row = _valid_accept_row()
    del row["field_assertions"]["brand"]

    errors = validate_dataset(_dataset(row), require_gold_only=True)

    assert any("field_assertions.brand" in error for error in errors)


def test_candidate_file_allows_unreviewed_candidate_rows() -> None:
    row = _valid_accept_row()
    row["verification_status"] = "candidate"
    row.pop("reviewed_by")
    row.pop("reviewed_at")

    errors = validate_dataset(_dataset(row), require_gold_only=False)

    assert errors == []


def test_reject_rows_require_reject_assertions() -> None:
    row = _valid_reject_row()
    del row["reject_assertions"]

    errors = validate_dataset(_dataset(row), require_gold_only=True)

    assert any("reject_assertions" in error for error in errors)
