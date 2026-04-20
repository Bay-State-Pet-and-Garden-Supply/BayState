"""Models and loaders for crawl4ai extraction benchmarking."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, TypedDict, cast

from tests.evaluation.types import GroundTruthProduct, SizeMetrics

SourceType = Literal["official", "retailer"]
BenchmarkMode = Literal["fixture", "live"]


class ExtractionGroundTruthPayload(TypedDict):
    brand: str
    name: str
    description: str
    size_metrics: str | None
    images: list[str]
    categories: list[str]


class ExtractionBenchmarkEntryPayload(TypedDict):
    sku: str
    query: str
    expected_source_url: str
    category: str
    difficulty: str
    source_type: SourceType
    ground_truth: ExtractionGroundTruthPayload


class ExtractionBenchmarkDatasetPayload(TypedDict):
    version: str
    generated_at: str
    source_dataset: str
    entries: list[ExtractionBenchmarkEntryPayload]


class ExtractionFixtureManifestEntryPayload(TypedDict):
    expected_source_url: str
    fixture_key: str
    fixture_path: str
    captured_at: str
    capture_mode: BenchmarkMode
    final_url: str
    status_code: int | None


class ExtractionFixtureManifestPayload(TypedDict):
    schema_version: int
    entries: list[ExtractionFixtureManifestEntryPayload]


class ExtractionFixturePagePayload(TypedDict, total=False):
    schema_version: int
    url: str
    final_url: str
    html: str
    markdown: str
    status_code: int | None


@dataclass(frozen=True)
class ExtractionBenchmarkEntry:
    sku: str
    query: str
    expected_source_url: str
    category: str
    difficulty: str
    source_type: SourceType
    ground_truth: GroundTruthProduct


@dataclass(frozen=True)
class ExtractionBenchmarkDataset:
    version: str
    generated_at: datetime
    source_dataset: str
    entries: list[ExtractionBenchmarkEntry]


@dataclass(frozen=True)
class ExtractionFixtureManifestEntry:
    expected_source_url: str
    fixture_key: str
    fixture_path: Path
    captured_at: datetime
    capture_mode: BenchmarkMode
    final_url: str
    status_code: int | None


@dataclass(frozen=True)
class ExtractionFixtureManifest:
    schema_version: int
    entries: list[ExtractionFixtureManifestEntry]


@dataclass(frozen=True)
class ExtractionFixturePage:
    url: str
    final_url: str
    html: str
    markdown: str
    status_code: int | None


def _parse_size_metrics(size_str: str | None) -> SizeMetrics | None:
    if not size_str:
        return None
    return SizeMetrics()


def _load_ground_truth(payload: ExtractionGroundTruthPayload, sku: str) -> GroundTruthProduct:
    return GroundTruthProduct(
        sku=sku,
        brand=str(payload["brand"]),
        name=str(payload["name"]),
        description=str(payload.get("description") or ""),
        size_metrics=_parse_size_metrics(payload.get("size_metrics")),
        images=[str(item) for item in payload.get("images", [])],
        categories=[str(item) for item in payload.get("categories", [])],
    )


def load_extraction_benchmark_dataset(dataset_path: Path) -> ExtractionBenchmarkDataset:
    payload = cast(ExtractionBenchmarkDatasetPayload, json.loads(dataset_path.read_text(encoding="utf-8")))
    entries = [
        ExtractionBenchmarkEntry(
            sku=str(entry["sku"]),
            query=str(entry["query"]),
            expected_source_url=str(entry["expected_source_url"]),
            category=str(entry["category"]),
            difficulty=str(entry["difficulty"]),
            source_type=cast(SourceType, entry["source_type"]),
            ground_truth=_load_ground_truth(entry["ground_truth"], str(entry["sku"])),
        )
        for entry in payload["entries"]
    ]
    return ExtractionBenchmarkDataset(
        version=str(payload["version"]),
        generated_at=datetime.fromisoformat(str(payload["generated_at"])),
        source_dataset=str(payload["source_dataset"]),
        entries=entries,
    )


def load_extraction_fixture_manifest(manifest_path: Path) -> ExtractionFixtureManifest:
    payload = cast(ExtractionFixtureManifestPayload, json.loads(manifest_path.read_text(encoding="utf-8")))
    entries = [
        ExtractionFixtureManifestEntry(
            expected_source_url=str(entry["expected_source_url"]),
            fixture_key=str(entry["fixture_key"]),
            fixture_path=(
                Path(str(entry["fixture_path"]))
                if Path(str(entry["fixture_path"])).is_absolute()
                else (manifest_path.parent / str(entry["fixture_path"])).resolve()
            ),
            captured_at=datetime.fromisoformat(str(entry["captured_at"])),
            capture_mode=cast(BenchmarkMode, entry["capture_mode"]),
            final_url=str(entry["final_url"]),
            status_code=cast(int | None, entry.get("status_code")),
        )
        for entry in payload["entries"]
    ]
    return ExtractionFixtureManifest(schema_version=int(payload["schema_version"]), entries=entries)


def load_extraction_fixture_page(fixture_path: Path) -> ExtractionFixturePage:
    payload = cast(ExtractionFixturePagePayload, json.loads(fixture_path.read_text(encoding="utf-8")))
    return ExtractionFixturePage(
        url=str(payload.get("url") or ""),
        final_url=str(payload.get("final_url") or payload.get("url") or ""),
        html=str(payload.get("html") or ""),
        markdown=str(payload.get("markdown") or ""),
        status_code=cast(int | None, payload.get("status_code")),
    )


def build_pilot_extraction_dataset_payload(source_dataset_path: Path, entries: list[dict[str, Any]]) -> ExtractionBenchmarkDatasetPayload:
    return {
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_dataset": str(source_dataset_path),
        "entries": cast(list[ExtractionBenchmarkEntryPayload], entries),
    }
