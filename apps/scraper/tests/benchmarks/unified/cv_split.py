"""Deterministic cross-validation split helpers for benchmark tuning.

The splitter accepts the current golden dataset format as well as the smaller
ground-truth fixture format. It never mutates or filters entries; sparse strata
are assigned through documented fallbacks so later benchmark reports can expose
where perfect stratification was not possible.
"""

from __future__ import annotations

import json
import random
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict


STRATUM_SEPARATOR = "||"


class SplitEntry(TypedDict):
    id: str
    brand: str
    category: str


class StratificationFallback(TypedDict):
    stratum_key: str
    brand: str
    category: str
    count: int
    fallback_strategy: str
    reason: str


@dataclass(frozen=True)
class CVFold:
    index: int
    train_ids: tuple[str, ...]
    validation_ids: tuple[str, ...]


@dataclass(frozen=True)
class CVSplit:
    folds: tuple[CVFold, ...]
    stratification_fallbacks: tuple[StratificationFallback, ...]


def load_split_entries(path: Path) -> list[SplitEntry]:
    """Load split-ready entries from the golden dataset or fixture JSON shape."""

    with path.open(encoding="utf-8") as handle:
        payload = json.load(handle)

    raw_entries = payload["entries"] if isinstance(payload, dict) and "entries" in payload else payload
    if not isinstance(raw_entries, list):
        raise ValueError("dataset must be a list or an object with an entries list")

    entries: list[SplitEntry] = []
    for index, raw_entry in enumerate(raw_entries):
        if not isinstance(raw_entry, dict):
            raise ValueError(f"entry {index} must be an object")
        entries.append(_normalize_entry(raw_entry, index))

    return entries


def build_stratified_folds(
    entries: list[SplitEntry], *, fold_count: int = 5, seed: int = 0
) -> CVSplit:
    """Build deterministic folds, stratifying by brand/category where feasible."""

    if fold_count < 2:
        raise ValueError("fold_count must be at least 2")
    if len(entries) < fold_count:
        raise ValueError("entry count must be at least fold_count")

    seen_ids: set[str] = set()
    for entry in entries:
        if entry["id"] in seen_ids:
            raise ValueError(f"duplicate entry id: {entry['id']}")
        seen_ids.add(entry["id"])

    rng = random.Random(seed)
    validation_ids_by_fold: list[list[str]] = [[] for _ in range(fold_count)]
    fallbacks: list[StratificationFallback] = []

    composite_buckets = _bucket_by(entries, _composite_key)
    sparse_entries: list[SplitEntry] = []

    for stratum_key in sorted(composite_buckets):
        bucket = composite_buckets[stratum_key]
        if len(bucket) >= fold_count:
            _assign_bucket(bucket, validation_ids_by_fold, rng)
            continue

        sparse_entries.extend(bucket)
        brand, category = stratum_key.split(STRATUM_SEPARATOR, 1)
        fallbacks.append(
            {
                "stratum_key": stratum_key,
                "brand": brand,
                "category": category,
                "count": len(bucket),
                "fallback_strategy": "pending",
                "reason": f"composite stratum has fewer than {fold_count} entries",
            }
        )

    assigned_sparse_ids: set[str] = set()
    category_buckets = _bucket_by(sparse_entries, lambda entry: entry["category"])
    for category in sorted(category_buckets):
        bucket = category_buckets[category]
        if len(bucket) >= fold_count:
            _assign_bucket(bucket, validation_ids_by_fold, rng)
            assigned_sparse_ids.update(entry["id"] for entry in bucket)
            _mark_fallback_strategy(fallbacks, bucket, "category")

    brand_candidates = [entry for entry in sparse_entries if entry["id"] not in assigned_sparse_ids]
    brand_buckets = _bucket_by(brand_candidates, lambda entry: entry["brand"])
    for brand in sorted(brand_buckets):
        bucket = brand_buckets[brand]
        if len(bucket) >= fold_count:
            _assign_bucket(bucket, validation_ids_by_fold, rng)
            assigned_sparse_ids.update(entry["id"] for entry in bucket)
            _mark_fallback_strategy(fallbacks, bucket, "brand")

    global_fallback = [entry for entry in sparse_entries if entry["id"] not in assigned_sparse_ids]
    if global_fallback:
        _assign_bucket(global_fallback, validation_ids_by_fold, rng)
        _mark_fallback_strategy(fallbacks, global_fallback, "global_balanced")

    all_ids = tuple(sorted(entry["id"] for entry in entries))
    folds = tuple(
        CVFold(
            index=index,
            train_ids=tuple(
                entry_id for entry_id in all_ids if entry_id not in set(validation_ids)
            ),
            validation_ids=tuple(validation_ids),
        )
        for index, validation_ids in enumerate(validation_ids_by_fold)
    )

    return CVSplit(folds=folds, stratification_fallbacks=tuple(fallbacks))


def _normalize_entry(raw_entry: dict[object, object], index: int) -> SplitEntry:
    entry_id = (
        _string_field(raw_entry, "sku")
        or _string_field(raw_entry, "id")
        or _string_field(raw_entry, "query")
    )
    if not entry_id:
        entry_id = f"entry-{index}"

    category = _string_field(raw_entry, "category")
    if not category:
        raw_categories = raw_entry.get("categories")
        if (
            isinstance(raw_categories, list)
            and raw_categories
            and isinstance(raw_categories[0], str)
        ):
            category = raw_categories[0]

    return {
        "id": entry_id,
        "brand": _string_field(raw_entry, "brand") or "unknown_brand",
        "category": category or "unknown_category",
    }


def _string_field(raw_entry: dict[object, object], field: str) -> str:
    value = raw_entry.get(field)
    return value.strip() if isinstance(value, str) else ""


def _bucket_by(
    entries: list[SplitEntry], key_fn: Callable[[SplitEntry], str]
) -> dict[str, list[SplitEntry]]:
    buckets: dict[str, list[SplitEntry]] = defaultdict(list)
    for entry in entries:
        buckets[key_fn(entry)].append(entry)
    return dict(buckets)


def _composite_key(entry: SplitEntry) -> str:
    return f"{entry['brand']}{STRATUM_SEPARATOR}{entry['category']}"


def _assign_bucket(
    entries: list[SplitEntry], validation_ids_by_fold: list[list[str]], rng: random.Random
) -> None:
    shuffled_entries = sorted(entries, key=lambda entry: entry["id"])
    rng.shuffle(shuffled_entries)

    fold_order = list(range(len(validation_ids_by_fold)))
    rng.shuffle(fold_order)
    for entry_index, entry in enumerate(shuffled_entries):
        least_loaded_size = min(len(validation_ids_by_fold[index]) for index in fold_order)
        least_loaded = [
            index for index in fold_order if len(validation_ids_by_fold[index]) == least_loaded_size
        ]
        fold_index = least_loaded[entry_index % len(least_loaded)]
        validation_ids_by_fold[fold_index].append(entry["id"])


def _mark_fallback_strategy(
    fallbacks: list[StratificationFallback], entries: list[SplitEntry], strategy: str
) -> None:
    keys = {_composite_key(entry) for entry in entries}
    for fallback in fallbacks:
        if fallback["stratum_key"] in keys and fallback["fallback_strategy"] == "pending":
            fallback["fallback_strategy"] = strategy
