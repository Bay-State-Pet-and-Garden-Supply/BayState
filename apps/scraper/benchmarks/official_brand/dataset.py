from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DATASET_SCHEMA_VERSION = "official-brand-benchmark-dataset-v1"


@dataclass(frozen=True)
class OfficialBrandBenchmarkEntry:
    upc: str
    product_name: str
    expected_official_domains: list[str]
    brand: str | None = None
    preferred_domains: list[str] | None = None
    expected_url: str | None = None
    category: str | None = None
    difficulty: str | None = None
    tags: list[str] | None = None


def _normalize_string(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _normalize_domains(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    domains: list[str] = []
    for item in value:
        domain = _normalize_string(item)
        if domain:
            domains.append(domain)
    return domains


def load_dataset(dataset_path: Path) -> list[OfficialBrandBenchmarkEntry]:
    payload = json.loads(dataset_path.read_text(encoding="utf-8"))
    if payload.get("schema_version") != DATASET_SCHEMA_VERSION:
        raise ValueError(
            f"Unexpected dataset schema_version: {payload.get('schema_version')!r}. "
            f"Expected {DATASET_SCHEMA_VERSION!r}."
        )

    entries = payload.get("entries")
    if not isinstance(entries, list):
        raise ValueError("Dataset must contain an 'entries' list")

    parsed: list[OfficialBrandBenchmarkEntry] = []
    for index, raw in enumerate(entries):
        if not isinstance(raw, dict):
            raise ValueError(f"Entry at index {index} is not an object")

        upc = _normalize_string(raw.get("upc"))
        product_name = _normalize_string(raw.get("product_name"))
        expected_domains = _normalize_domains(raw.get("expected_official_domains"))
        if not upc:
            raise ValueError(f"Entry at index {index} missing required field 'upc'")
        if not product_name:
            raise ValueError(f"Entry at index {index} missing required field 'product_name'")
        if not expected_domains:
            raise ValueError(f"Entry at index {index} missing required field 'expected_official_domains'")

        preferred_domains = _normalize_domains(raw.get("preferred_domains"))
        tags = raw.get("tags")
        parsed.append(
            OfficialBrandBenchmarkEntry(
                upc=upc,
                product_name=product_name,
                expected_official_domains=expected_domains,
                brand=_normalize_string(raw.get("brand")),
                preferred_domains=preferred_domains or None,
                expected_url=_normalize_string(raw.get("expected_url")),
                category=_normalize_string(raw.get("category")),
                difficulty=_normalize_string(raw.get("difficulty")),
                tags=[str(tag) for tag in tags] if isinstance(tags, list) else None,
            )
        )

    return parsed
