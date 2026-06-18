"""Schema validation for human-reviewed packaging vision gold datasets.

Each entry represents a product UPC with known packaging images and
human-corrected expected extraction facts and normalized title.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

SCHEMA_VERSION = "packaging-vision-gold-dataset-v1"

GOLD_STATUS = "gold"
CANDIDATE_STATUSES = {"candidate", "draft", "unverified"}
VALID_STATUSES = {GOLD_STATUS, *CANDIDATE_STATUSES}

REQUIRED_FACTS = {
    "brand", "packaging_title", "size", "weight",
}
OPTIONAL_FACTS = {
    "product_line", "variant", "flavor", "color", "scent", "material",
    "product_type", "count",
}

GOLD_REQUIRED_FIELDS = {
    "upc", "image_urls", "expected_facts", "expected_title",
    "source_of_truth", "evidence_notes",
}


class GoldDatasetValidationError(ValueError):
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("Packaging vision gold dataset validation failed:\n" +
                         "\n".join(f"- {e}" for e in errors))


def load_dataset(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def validate_dataset(data: dict[str, Any], *, require_gold_only: bool = True) -> list[str]:
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

        status = row.get("verification_status")
        if status not in VALID_STATUSES:
            errors.append(f"{prefix}.verification_status must be one of {sorted(VALID_STATUSES)}")
        if require_gold_only and status != GOLD_STATUS:
            errors.append(f"{prefix}: gold_dataset.json may only contain verification_status='gold'")

        if status == GOLD_STATUS:
            _require_non_empty_str(row, "reviewed_by", errors, prefix)
            _require_non_empty_str(row, "reviewed_at", errors, prefix)

        for field in GOLD_REQUIRED_FIELDS:
            if field == 'image_urls':
                urls = row.get('image_urls')
                if not isinstance(urls, list) or len(urls) == 0:
                    errors.append(f"{prefix}.image_urls must be a non-empty array")
                else:
                    for i, url in enumerate(urls):
                        if not isinstance(url, str) or not url.strip():
                            errors.append(f"{prefix}.image_urls[{i}] must be a non-empty string")
                        else:
                            parsed = urlparse(url)
                            if parsed.scheme not in {"http", "https"} and not url.startswith("data:"):
                                errors.append(f"{prefix}.image_urls[{i}] must be an absolute URL or data URL")
            elif field == 'expected_facts':
                facts = row.get('expected_facts')
                if not isinstance(facts, dict) or not facts:
                    errors.append(f"{prefix}.expected_facts must be a non-empty object")
                else:
                    for req in REQUIRED_FACTS:
                        if not isinstance(facts.get(req), str) or not facts[req].strip():
                            errors.append(f"{prefix}.expected_facts.{req} must be a non-empty string")
                    for opt in OPTIONAL_FACTS:
                        val = facts.get(opt)
                        if val is not None and not isinstance(val, str):
                            errors.append(f"{prefix}.expected_facts.{opt} must be a string or null")
            else:
                _require_non_empty_str(row, field, errors, prefix)

        # Validate expected_title
        _require_non_empty_str(row, "expected_title", errors, prefix)

        # Validate optional fields
        auto_apply = row.get("auto_apply_expected")
        if auto_apply is not None and not isinstance(auto_apply, bool):
            errors.append(f"{prefix}.auto_apply_expected must be a boolean or absent")

        tags = row.get("tags")
        if tags is not None and (not isinstance(tags, list) or
                                 not all(isinstance(t, str) and t.strip() for t in tags)):
            errors.append(f"{prefix}.tags must be a list of non-empty strings")

    return errors


def assert_valid_dataset(data: dict[str, Any], *, require_gold_only: bool = True) -> None:
    errors = validate_dataset(data, require_gold_only=require_gold_only)
    if errors:
        raise GoldDatasetValidationError(errors)


def validate_dataset_file(path: str | Path, *, require_gold_only: bool = True) -> list[str]:
    return validate_dataset(load_dataset(path), require_gold_only=require_gold_only)


def _require_non_empty_str(
    obj: dict[str, Any], key: str, errors: list[str], prefix: str,
) -> str | None:
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{prefix}.{key} must be a non-empty string")
        return None
    return value.strip()
