"""Dataset loading for the end-to-end AI Search benchmark."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DATASET_SCHEMA_VERSION = "ai-search-e2e-benchmark-dataset-v1"


@dataclass(frozen=True)
class ExtractionGroundTruth:
    """Ground truth for extraction quality evaluation."""

    brand: str
    name: str
    description_contains: list[str]
    size_metrics: str | None
    image_required: bool
    categories: list[str]


@dataclass(frozen=True)
class SearchFixture:
    """Pre-cached search query and results for deterministic testing."""

    query: str
    results: list[dict[str, Any]]


@dataclass(frozen=True)
class EndToEndBenchmarkEntry:
    """A single benchmark entry for the full AI Search pipeline."""

    sku: str
    product_name: str
    brand: str
    expected_official_domains: list[str]
    expected_source_url: str
    source_type: str  # "official" or "retailer"
    category: str | None = None
    difficulty: str | None = None
    tags: list[str] | None = None
    ground_truth: ExtractionGroundTruth | None = None
    search_fixtures: list[SearchFixture] | None = None


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


def _load_ground_truth(raw: dict[str, Any]) -> ExtractionGroundTruth:
    return ExtractionGroundTruth(
        brand=str(raw.get("brand") or ""),
        name=str(raw.get("name") or ""),
        description_contains=[str(s) for s in raw.get("description_contains", []) if s],
        size_metrics=_normalize_string(raw.get("size_metrics")),
        image_required=bool(raw.get("image_required", False)),
        categories=[str(c) for c in raw.get("categories", []) if c],
    )


def _load_search_fixtures(raw: Any) -> list[SearchFixture]:
    if not isinstance(raw, list):
        return []
    fixtures: list[SearchFixture] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        query = _normalize_string(item.get("query"))
        results = item.get("results")
        if query and isinstance(results, list):
            fixtures.append(SearchFixture(query=query, results=results))
    return fixtures


def load_dataset(dataset_path: Path) -> list[EndToEndBenchmarkEntry]:
    """Load an end-to-end benchmark dataset from a JSON file."""
    payload = json.loads(dataset_path.read_text(encoding="utf-8"))
    if payload.get("schema_version") != DATASET_SCHEMA_VERSION:
        raise ValueError(
            f"Unexpected dataset schema_version: {payload.get('schema_version')!r}. "
            f"Expected {DATASET_SCHEMA_VERSION!r}."
        )

    entries = payload.get("entries")
    if not isinstance(entries, list):
        raise ValueError("Dataset must contain an 'entries' list")

    parsed: list[EndToEndBenchmarkEntry] = []
    for index, raw in enumerate(entries):
        if not isinstance(raw, dict):
            raise ValueError(f"Entry at index {index} is not an object")

        sku = _normalize_string(raw.get("sku"))
        product_name = _normalize_string(raw.get("product_name"))
        brand = _normalize_string(raw.get("brand"))
        expected_domains = _normalize_domains(raw.get("expected_official_domains"))
        expected_source_url = _normalize_string(raw.get("expected_source_url"))

        if not sku:
            raise ValueError(f"Entry at index {index} missing required field 'sku'")
        if not product_name:
            raise ValueError(f"Entry at index {index} missing required field 'product_name'")
        if not brand:
            raise ValueError(f"Entry at index {index} missing required field 'brand'")
        if not expected_domains:
            raise ValueError(f"Entry at index {index} missing required field 'expected_official_domains'")
        if not expected_source_url:
            raise ValueError(f"Entry at index {index} missing required field 'expected_source_url'")

        tags = raw.get("tags")
        gt_raw = raw.get("ground_truth")
        sf_raw = raw.get("search_fixtures")

        parsed.append(
            EndToEndBenchmarkEntry(
                sku=sku,
                product_name=product_name,
                brand=brand,
                expected_official_domains=expected_domains,
                expected_source_url=expected_source_url,
                source_type=str(raw.get("source_type") or "official"),
                category=_normalize_string(raw.get("category")),
                difficulty=_normalize_string(raw.get("difficulty")),
                tags=[str(tag) for tag in tags] if isinstance(tags, list) else None,
                ground_truth=_load_ground_truth(gt_raw) if isinstance(gt_raw, dict) else None,
                search_fixtures=_load_search_fixtures(sf_raw) if sf_raw is not None else None,
            )
        )

    return parsed
