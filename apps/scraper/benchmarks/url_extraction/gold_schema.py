"""Schema validation for human-reviewed URL extraction gold datasets.

The gold dataset is intentionally stricter than the legacy benchmark
``expected`` shape. It records human review metadata, explicit accept/reject
outcomes, and auditable field assertions. Existing AI-generated datasets should
remain candidate/audit data until a reviewer promotes rows to gold.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

SCHEMA_VERSION = "url-extraction-gold-dataset-v1"

GOLD_STATUS = "gold"
CANDIDATE_STATUSES = {"candidate", "draft", "unverified"}
VALID_STATUSES = {GOLD_STATUS, *CANDIDATE_STATUSES}
VALID_OUTCOMES = {"accept", "reject"}
VALID_MODES = {"required", "required_if_visible", "soft", "forbidden", "ignored"}
VALID_MATCHES = {
    "exact",
    "contains",
    "contains_all",
    "any_of",
    "present",
    "same_domain",
    "count_range",
    "count_exact",
}
VALID_COUNT_STRICTNESS = {"range", "exact"}
TEXTUAL_REQUIRED_FIELDS = {"brand", "product_name", "size_metrics", "description", "categories"}
IDENTITY_FIELDS = {"brand", "product_name"}


class GoldDatasetValidationError(ValueError):
    """Raised when a gold/candidate dataset violates the schema contract."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("Gold dataset validation failed:\n" + "\n".join(f"- {e}" for e in errors))


def load_dataset(path: str | Path) -> dict[str, Any]:
    """Load a gold dataset JSON file."""
    return json.loads(Path(path).read_text(encoding="utf-8"))


def validate_dataset(
    data: dict[str, Any],
    *,
    require_gold_only: bool = True,
) -> list[str]:
    """Return validation errors for a gold/candidate dataset.

    Args:
        data: Parsed JSON object.
        require_gold_only: When true, every row must be human-approved gold.
            Use false for candidate/draft files.
    """
    errors: list[str] = []

    if not isinstance(data, dict):
        return ["dataset root must be an object"]

    if data.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"schema_version must be {SCHEMA_VERSION!r}")

    entries = data.get("entries")
    if not isinstance(entries, list):
        errors.append("entries must be a list")
        return errors

    seen_ids: set[str] = set()
    for index, row in enumerate(entries):
        prefix = f"entries[{index}]"
        if not isinstance(row, dict):
            errors.append(f"{prefix}: row must be an object")
            continue

        row_id = _require_non_empty_str(row, "id", errors, prefix)
        if row_id:
            if row_id in seen_ids:
                errors.append(f"{prefix}: duplicate id {row_id!r}")
            seen_ids.add(row_id)

        _validate_common_row(row, errors, prefix, require_gold_only=require_gold_only)

        outcome = row.get("expected_outcome")
        if outcome == "accept":
            _validate_accept_row(row, errors, prefix)
        elif outcome == "reject":
            _validate_reject_row(row, errors, prefix)

    return errors


def assert_valid_dataset(
    data: dict[str, Any],
    *,
    require_gold_only: bool = True,
) -> None:
    """Raise ``GoldDatasetValidationError`` when validation fails."""
    errors = validate_dataset(data, require_gold_only=require_gold_only)
    if errors:
        raise GoldDatasetValidationError(errors)


def validate_dataset_file(
    path: str | Path,
    *,
    require_gold_only: bool = True,
) -> list[str]:
    """Load and validate a dataset file, returning validation errors."""
    return validate_dataset(load_dataset(path), require_gold_only=require_gold_only)


def _validate_common_row(
    row: dict[str, Any],
    errors: list[str],
    prefix: str,
    *,
    require_gold_only: bool,
) -> None:
    status = row.get("verification_status")
    if status not in VALID_STATUSES:
        errors.append(f"{prefix}.verification_status must be one of {sorted(VALID_STATUSES)}")
    if require_gold_only and status != GOLD_STATUS:
        errors.append(f"{prefix}: gold_dataset.json may only contain verification_status='gold'")

    outcome = row.get("expected_outcome")
    if outcome not in VALID_OUTCOMES:
        errors.append(f"{prefix}.expected_outcome must be one of {sorted(VALID_OUTCOMES)}")

    _require_non_empty_str(row, "source_url", errors, prefix)
    _require_non_empty_str(row, "evidence_url", errors, prefix)
    _require_non_empty_str(row, "evidence_notes", errors, prefix)
    _require_non_empty_str(row, "source_of_truth", errors, prefix)
    _validate_url(row.get("source_url"), errors, f"{prefix}.source_url")
    _validate_url(row.get("evidence_url"), errors, f"{prefix}.evidence_url")

    tags = row.get("tags")
    if not isinstance(tags, list) or not all(isinstance(tag, str) and tag.strip() for tag in tags):
        errors.append(f"{prefix}.tags must be a list of non-empty strings")

    if status == GOLD_STATUS:
        _require_non_empty_str(row, "reviewed_by", errors, prefix)
        _require_non_empty_str(row, "reviewed_at", errors, prefix)


def _validate_accept_row(row: dict[str, Any], errors: list[str], prefix: str) -> None:
    assertions = row.get("field_assertions")
    if not isinstance(assertions, dict) or not assertions:
        errors.append(f"{prefix}.field_assertions must be a non-empty object for accept rows")
        return

    for identity_field in sorted(IDENTITY_FIELDS):
        assertion = assertions.get(identity_field)
        if not isinstance(assertion, dict) or assertion.get("mode") != "required":
            errors.append(f"{prefix}.field_assertions.{identity_field} must exist with mode='required'")

    for field, assertion in assertions.items():
        field_prefix = f"{prefix}.field_assertions.{field}"
        if not isinstance(field, str) or not field.strip():
            errors.append(f"{field_prefix}: field name must be a non-empty string")
        if not isinstance(assertion, dict):
            errors.append(f"{field_prefix} must be an object")
            continue
        _validate_field_assertion(field, assertion, errors, field_prefix)


def _validate_reject_row(row: dict[str, Any], errors: list[str], prefix: str) -> None:
    reject_assertions = row.get("reject_assertions")
    if not isinstance(reject_assertions, dict) or not reject_assertions:
        errors.append(f"{prefix}.reject_assertions must be a non-empty object for reject rows")
        return

    reason_contains = reject_assertions.get("reason_contains")
    if reason_contains is not None:
        if not isinstance(reason_contains, list) or not all(
            isinstance(item, str) and item.strip() for item in reason_contains
        ):
            errors.append(f"{prefix}.reject_assertions.reason_contains must be a list of non-empty strings")


def _validate_field_assertion(
    field: str,
    assertion: dict[str, Any],
    errors: list[str],
    prefix: str,
) -> None:
    mode = assertion.get("mode")
    if mode not in VALID_MODES:
        errors.append(f"{prefix}.mode must be one of {sorted(VALID_MODES)}")
        return

    match = assertion.get("match")
    if match is not None and match not in VALID_MATCHES:
        errors.append(f"{prefix}.match must be one of {sorted(VALID_MATCHES)}")

    if mode in {"required", "required_if_visible"} and field in TEXTUAL_REQUIRED_FIELDS:
        _require_non_empty_str(assertion, "evidence_snippet", errors, prefix)

    if mode == "forbidden":
        return
    if mode == "ignored":
        return

    if field == "images":
        _validate_image_assertion(assertion, errors, prefix)
        return

    effective_match = match or "exact"
    if effective_match in {"exact", "contains", "same_domain"}:
        _require_non_empty_str(assertion, "expected", errors, prefix)
    elif effective_match in {"contains_all", "any_of"}:
        tokens = assertion.get("tokens")
        if not isinstance(tokens, list) or not all(isinstance(token, str) and token.strip() for token in tokens):
            errors.append(f"{prefix}.tokens must be a list of non-empty strings")
    elif effective_match == "present":
        return
    elif effective_match.startswith("count_"):
        errors.append(f"{prefix}: count matches are only valid for images")


def _validate_image_assertion(
    assertion: dict[str, Any],
    errors: list[str],
    prefix: str,
) -> None:
    min_count = assertion.get("min_count")
    max_count = assertion.get("max_count")
    reviewed_count = assertion.get("reviewed_product_image_count")
    strictness = assertion.get("count_strictness", "range")

    if min_count is not None and (not isinstance(min_count, int) or min_count < 0):
        errors.append(f"{prefix}.min_count must be a non-negative integer")
    if max_count is not None and (not isinstance(max_count, int) or max_count < 0):
        errors.append(f"{prefix}.max_count must be a non-negative integer")
    if isinstance(min_count, int) and isinstance(max_count, int) and min_count > max_count:
        errors.append(f"{prefix}.min_count must be <= max_count")
    if reviewed_count is not None and (not isinstance(reviewed_count, int) or reviewed_count < 0):
        errors.append(f"{prefix}.reviewed_product_image_count must be a non-negative integer")
    if strictness not in VALID_COUNT_STRICTNESS:
        errors.append(f"{prefix}.count_strictness must be one of {sorted(VALID_COUNT_STRICTNESS)}")


def _require_non_empty_str(
    obj: dict[str, Any],
    key: str,
    errors: list[str],
    prefix: str,
) -> str | None:
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{prefix}.{key} must be a non-empty string")
        return None
    return value.strip()


def _validate_url(value: Any, errors: list[str], prefix: str) -> None:
    if not isinstance(value, str) or not value.strip():
        return
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        errors.append(f"{prefix} must be an absolute http(s) URL")
