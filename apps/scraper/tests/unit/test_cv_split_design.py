"""Tests for benchmark cross-validation split design."""

from __future__ import annotations

from pathlib import Path

from tests.benchmarks.unified.cv_split import (
    SplitEntry,
    build_stratified_folds,
    load_split_entries,
)


SCRAPER_ROOT = Path(__file__).parent.parent.parent
GOLDEN_DATASET = SCRAPER_ROOT / "data" / "golden_dataset_v3.json"
GROUND_TRUTH_FIXTURE = SCRAPER_ROOT / "tests" / "fixtures" / "test_skus_ground_truth.json"


def test_validation_folds_cover_current_golden_dataset_exactly_once() -> None:
    entries = load_split_entries(GOLDEN_DATASET)

    split = build_stratified_folds(entries, fold_count=5, seed=17)

    expected_ids = {entry["id"] for entry in entries}
    validation_ids = [entry_id for fold in split.folds for entry_id in fold.validation_ids]
    assert set(validation_ids) == expected_ids
    assert len(validation_ids) == len(expected_ids)


def test_validation_folds_have_no_duplicate_ids_across_folds() -> None:
    entries = load_split_entries(GOLDEN_DATASET)

    split = build_stratified_folds(entries, fold_count=5, seed=17)

    validation_ids = [entry_id for fold in split.folds for entry_id in fold.validation_ids]
    assert len(validation_ids) == len(set(validation_ids))


def test_same_seed_produces_identical_splits() -> None:
    entries = load_split_entries(GOLDEN_DATASET)

    first = build_stratified_folds(entries, fold_count=5, seed=20260425)
    second = build_stratified_folds(entries, fold_count=5, seed=20260425)

    assert first == second


def test_different_seed_can_change_assignment_when_multiple_valid_assignments_exist() -> None:
    entries = _dense_entries()

    first = build_stratified_folds(entries, fold_count=5, seed=1)
    second = build_stratified_folds(entries, fold_count=5, seed=2)

    first_assignments = [fold.validation_ids for fold in first.folds]
    second_assignments = [fold.validation_ids for fold in second.folds]
    assert first_assignments != second_assignments
    assert {entry_id for fold in first.folds for entry_id in fold.validation_ids} == {
        entry["id"] for entry in entries
    }
    assert {entry_id for fold in second.folds for entry_id in fold.validation_ids} == {
        entry["id"] for entry in entries
    }


def test_sparse_categories_produce_fallback_metadata() -> None:
    entries: list[SplitEntry] = [
        {"id": "sku-1", "brand": "Sparse A", "category": "Tiny Category"},
        {"id": "sku-2", "brand": "Sparse B", "category": "Tiny Category"},
        {"id": "sku-3", "brand": "Sparse C", "category": "Tiny Category"},
        {"id": "sku-4", "brand": "Sparse D", "category": "Other Tiny Category"},
        {"id": "sku-5", "brand": "Sparse E", "category": "Other Tiny Category"},
    ]

    split = build_stratified_folds(entries, fold_count=5, seed=7)

    assert split.stratification_fallbacks
    assert {fallback["fallback_strategy"] for fallback in split.stratification_fallbacks} == {"global_balanced"}
    assert all("fewer than 5 entries" in fallback["reason"] for fallback in split.stratification_fallbacks)


def test_fixture_format_loads_with_primary_category() -> None:
    entries = load_split_entries(GROUND_TRUTH_FIXTURE)

    assert entries[0] == {"id": "032247886598", "brand": "Scotts", "category": "Mulch"}


def _dense_entries() -> list[SplitEntry]:
    return [
        {"id": f"alpha-{index}", "brand": "Alpha", "category": "Category One"} for index in range(10)
    ] + [
        {"id": f"beta-{index}", "brand": "Beta", "category": "Category Two"} for index in range(10)
    ]
