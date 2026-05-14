from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class FieldMismatch:
    field: str
    expected: Any
    actual: Any


@dataclass(frozen=True)
class AssertionResult:
    sku: str
    passed: bool
    mismatches: list[FieldMismatch]


class AssertionRunner:
    def validate(self, *, sku: str, expected: dict[str, Any], actual: dict[str, Any]) -> AssertionResult:
        mismatches = [
            FieldMismatch(field=field, expected=expected_value, actual=actual.get(field))
            for field, expected_value in expected.items()
            if actual.get(field) != expected_value
        ]
        return AssertionResult(sku=sku, passed=not mismatches, mismatches=mismatches)
