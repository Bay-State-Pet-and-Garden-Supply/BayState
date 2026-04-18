#!/usr/bin/env python3
"""Benchmark crawl4ai extraction accuracy on expected source URLs."""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from statistics import quantiles
from time import perf_counter
from typing import Any, cast

ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = ROOT / "src"
for import_root in (ROOT, SRC_ROOT):
    if str(import_root) not in sys.path:
        sys.path.insert(0, str(import_root))

from scrapers.ai_search.extraction_benchmark import ExtractionBenchmarkDataset, ExtractionBenchmarkEntry, load_extraction_benchmark_dataset
from scrapers.ai_search.scraper import AISearchScraper
from tests.evaluation.metrics_calculator import SKUMetrics, calculate_aggregate_metrics, calculate_per_sku_metrics, get_per_field_accuracy

DEFAULT_DATASET_PATH = ROOT / "data" / "golden_dataset_v3_extraction_pilot.json"
DEFAULT_OUTPUT_DIR = ROOT / ".sisyphus" / "evidence" / "extraction-benchmark"


@dataclass(frozen=True)
class ExtractionBenchmarkRow:
    sku: str
    query: str
    expected_source_url: str
    category: str
    difficulty: str
    source_type: str
    success: bool
    accuracy: float
    required_fields_success_rate: float
    missing_required_fields: list[str]
    extraction_time_ms: float | None
    error_message: str | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark crawl4ai extraction on expected source URLs")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET_PATH)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--prompt-version", default="v1")
    parser.add_argument("--skus", help="Optional comma-separated SKU list")
    return parser.parse_args()


def _select_entries(dataset: ExtractionBenchmarkDataset, raw_skus: str | None) -> list[ExtractionBenchmarkEntry]:
    if not raw_skus:
        return dataset.entries
    requested = {sku.strip() for sku in raw_skus.split(",") if sku.strip()}
    return [entry for entry in dataset.entries if entry.sku in requested]


async def _evaluate_entry(entry: ExtractionBenchmarkEntry, *, prompt_version: str) -> tuple[ExtractionBenchmarkRow, SKUMetrics | None]:
    scraper = AISearchScraper(prompt_version=prompt_version)
    start = perf_counter()
    extraction = await scraper.extract_from_url(
        url=entry.expected_source_url,
        sku=entry.sku,
        product_name=entry.ground_truth.name,
        brand=entry.ground_truth.brand,
    )
    elapsed_ms = (perf_counter() - start) * 1000

    metrics: SKUMetrics | None = None
    accuracy = 0.0
    required_fields_success_rate = 0.0
    missing_required_fields: list[str] = []
    if extraction.success:
        metrics = calculate_per_sku_metrics(extraction, entry.ground_truth)
        accuracy = float(metrics.field_accuracy)
        required_fields_success_rate = float(metrics.required_fields_success_rate)
        missing_required_fields = list(metrics.missing_required_fields)

    row = ExtractionBenchmarkRow(
        sku=entry.sku,
        query=entry.query,
        expected_source_url=entry.expected_source_url,
        category=entry.category,
        difficulty=entry.difficulty,
        source_type=entry.source_type,
        success=bool(extraction.success),
        accuracy=accuracy,
        required_fields_success_rate=required_fields_success_rate,
        missing_required_fields=missing_required_fields,
        extraction_time_ms=round(elapsed_ms, 2),
        error_message=extraction.error,
    )
    return row, metrics


def _breakdown(rows: list[ExtractionBenchmarkRow], key: str) -> dict[str, dict[str, Any]]:
    grouped: dict[str, list[ExtractionBenchmarkRow]] = defaultdict(list)
    for row in rows:
        grouped[str(getattr(row, key))].append(row)

    payload: dict[str, dict[str, Any]] = {}
    for group_key, values in sorted(grouped.items()):
        accuracies = [row.accuracy for row in values]
        success_count = sum(1 for row in values if row.success)
        required_success = [row.required_fields_success_rate for row in values]
        payload[group_key] = {
            "sample_size": len(values),
            "success_rate": round(success_count / len(values), 4),
            "average_accuracy": round(sum(accuracies) / len(accuracies), 4) if accuracies else 0.0,
            "average_required_fields_success_rate": round(sum(required_success) / len(required_success), 4) if required_success else 0.0,
        }
    return payload


def _write_report(dataset_path: Path, output_dir: Path, rows: list[ExtractionBenchmarkRow], sku_metrics: list[SKUMetrics]) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    aggregate = calculate_aggregate_metrics(sku_metrics)
    field_breakdown = get_per_field_accuracy(sku_metrics)
    extraction_times = [row.extraction_time_ms for row in rows if row.extraction_time_ms is not None]
    p95_time_ms = None
    if extraction_times:
        ordered = sorted(cast(list[float], extraction_times))
        if len(ordered) == 1:
            p95_time_ms = ordered[0]
        else:
            p95_time_ms = quantiles(ordered, n=20, method="inclusive")[18]

    payload = {
        "dataset_path": str(dataset_path),
        "summary": {
            "total_examples": len(rows),
            "success_rate": round(aggregate.overall_success_rate, 4),
            "average_field_accuracy": round(aggregate.average_field_accuracy, 4),
            "average_required_fields_success_rate": round(aggregate.average_required_fields_success_rate, 4),
            "p95_extraction_time_ms": round(float(p95_time_ms), 2) if p95_time_ms is not None else None,
        },
        "field_breakdown": {field: round(score, 4) for field, score in sorted(field_breakdown.items())},
        "category_breakdown": _breakdown(rows, "category"),
        "source_type_breakdown": _breakdown(rows, "source_type"),
        "per_sku_results": [row.__dict__ for row in rows],
    }

    json_path = output_dir / "crawl4ai-extraction-benchmark.json"
    markdown_path = output_dir / "crawl4ai-extraction-benchmark.md"
    json_path.write_text(__import__("json").dumps(payload, indent=2), encoding="utf-8")

    lines = [
        "# Crawl4AI Extraction Benchmark",
        "",
        f"Dataset: `{dataset_path}`",
        "",
        "## Summary",
        "",
        f"- Total examples: {payload['summary']['total_examples']}",
        f"- Success rate: {payload['summary']['success_rate']:.1%}",
        f"- Average field accuracy: {payload['summary']['average_field_accuracy']:.1%}",
        f"- Average required fields success rate: {payload['summary']['average_required_fields_success_rate']:.1%}",
        f"- P95 extraction time (ms): {payload['summary']['p95_extraction_time_ms']}",
        "",
        "## Per-SKU Results",
        "",
        "| SKU | Source Type | Category | Success | Accuracy | Required Fields | Error |",
        "|-----|-------------|----------|---------|----------|-----------------|-------|",
    ]
    for row in rows:
        lines.append(
            f"| {row.sku} | {row.source_type} | {row.category} | {row.success} | {row.accuracy:.4f} | {row.required_fields_success_rate:.4f} | {row.error_message or ''} |"
        )
    markdown_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return json_path, markdown_path


async def run_benchmark(dataset_path: Path, output_dir: Path, *, prompt_version: str, raw_skus: str | None) -> int:
    dataset = load_extraction_benchmark_dataset(dataset_path)
    entries = _select_entries(dataset, raw_skus)
    if not entries:
        raise ValueError("No extraction benchmark entries selected")

    rows: list[ExtractionBenchmarkRow] = []
    sku_metrics: list[SKUMetrics] = []
    for entry in entries:
        row, metrics = await _evaluate_entry(entry, prompt_version=prompt_version)
        rows.append(row)
        if metrics is not None:
            sku_metrics.append(metrics)

    json_path, markdown_path = _write_report(dataset_path, output_dir, rows, sku_metrics)
    print(f"Wrote extraction benchmark report to {json_path}")
    print(f"Wrote extraction benchmark markdown to {markdown_path}")
    return 0


def main() -> int:
    args = parse_args()
    return asyncio.run(run_benchmark(args.dataset, args.output_dir, prompt_version=args.prompt_version, raw_skus=args.skus))


if __name__ == "__main__":
    raise SystemExit(main())
