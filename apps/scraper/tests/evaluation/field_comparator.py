from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable
from typing import cast

from tests.evaluation.types import FieldComparison as BaseFieldComparison
from tests.evaluation.types import MatchType


class FieldComparison(BaseFieldComparison):
    @property
    def score(self) -> float:
        return self.match_score


TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
LIST_FIELDS = {"images", "categories", "tags", "bullets", "features"}
EXACT_FIELDS = {"brand", "sku"}


def _normalize_text(value: object | None) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def _tokenize(value: object | None) -> list[str]:
    text = _normalize_text(value)
    if not text:
        return []
    return TOKEN_PATTERN.findall(text)


def _counter_similarity(expected: list[str], actual: list[str]) -> float:
    if not expected and not actual:
        return 1.0
    if not expected or not actual:
        return 0.0

    expected_counter = Counter(expected)
    actual_counter = Counter(actual)
    overlap = sum((expected_counter & actual_counter).values())
    denominator = len(expected) + len(actual)
    return (2.0 * overlap) / denominator if denominator else 0.0


def compare_text(expected: object | None, actual: object | None) -> FieldComparison:
    score = _counter_similarity(_tokenize(expected), _tokenize(actual))

    if score == 1.0:
        match_type = MatchType.EXACT
    elif score == 0.0:
        match_type = MatchType.NONE
    else:
        match_type = MatchType.FUZZY

    return FieldComparison(
        field_name="text",
        expected=expected,
        actual=actual,
        match_score=score,
        match_type=match_type,
    )


def _to_normalized_set(values: object | Iterable[object] | None) -> set[str]:
    if values is None:
        return set()
    if isinstance(values, str):
        items: Iterable[object] = [values]
    elif isinstance(values, Iterable):
        items = cast(Iterable[object], values)
    else:
        items = [values]

    normalized = {_normalize_text(item) for item in items}
    return {item for item in normalized if item}


def compare_lists(
    expected: object | Iterable[object] | None,
    actual: object | Iterable[object] | None,
) -> FieldComparison:
    expected_set = _to_normalized_set(expected)
    actual_set = _to_normalized_set(actual)

    if not expected_set and not actual_set:
        score = 1.0
    elif not expected_set or not actual_set:
        score = 0.0
    else:
        intersection = expected_set & actual_set
        union = expected_set | actual_set
        score = len(intersection) / len(union)

    if score == 1.0:
        match_type = MatchType.EXACT
    elif score == 0.0:
        match_type = MatchType.NONE
    else:
        match_type = MatchType.PARTIAL

    return FieldComparison(
        field_name="list",
        expected=expected,
        actual=actual,
        match_score=score,
        match_type=match_type,
    )


def compare_exact(expected: object | None, actual: object | None) -> FieldComparison:
    expected_text = _normalize_text(expected)
    actual_text = _normalize_text(actual)

    if not expected_text and not actual_text:
        score = 1.0
    elif expected_text and actual_text and expected_text == actual_text:
        score = 1.0
    else:
        score = 0.0

    return FieldComparison(
        field_name="exact",
        expected=expected,
        actual=actual,
        match_score=score,
        match_type=MatchType.EXACT if score == 1.0 else MatchType.NONE,
    )


def compare_field(
    field_name: str,
    expected: object | Iterable[object] | None,
    actual: object | Iterable[object] | None,
) -> FieldComparison:
    normalized_field = field_name.strip().lower()

    if normalized_field in EXACT_FIELDS:
        result = compare_exact(expected, actual)
    elif normalized_field in LIST_FIELDS:
        result = compare_lists(expected, actual)
    else:
        result = compare_text(expected, actual)

    result.field_name = field_name
    return result
