"""Offline cross-validation report generation for benchmark tuning.

This module evaluates the current scorer against cached golden search results.
It does not crawl, call live APIs, tune weights, or mutate cache files.
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, TypedDict, cast
from urllib.parse import urlparse, urlunparse

from scrapers.ai_search.scoring import SearchScorer, reset_domain_history
from tests.benchmarks.unified.cv_split import CVFold, build_stratified_folds, load_split_entries
from tests.benchmarks.unified.report_contract import (
    BenchmarkReportValidationError,
    build_pass_fail_comparison,
    generate_markdown_report,
    validate_benchmark_report,
)


DEFAULT_THRESHOLDS = {
    "top1_official_accuracy": 0.0,
    "retailer_false_positive_rate": 1.0,
    "field_correctness": 0.0,
}


class EvaluationEntry(TypedDict):
    id: str
    query: str
    sku: str
    brand: str
    product_name: str
    category: str
    expected_source_url: str


class FoldReport(TypedDict):
    index: int
    train_ids: list[str]
    validation_ids: list[str]
    examples: int
    top1_official_accuracy: float
    retailer_false_positive_rate: float
    field_correctness: float
    confusion_matrix: dict[str, dict[str, int]]


class MetricAggregate(TypedDict):
    mean: float
    std: float
    confidence_interval_95: dict[str, float]


def build_offline_cv_report(
    *,
    dataset_path: Path,
    search_results_path: Path,
    fold_count: int = 5,
    seed: int = 17,
    run_id: str = "offline-cv",
    thresholds: Mapping[str, float] | None = None,
) -> dict[str, object]:
    """Build a deterministic CV report from cached fixture data only."""

    entries = _load_evaluation_entries(dataset_path)
    search_results = _load_search_results(search_results_path)
    split_entries = load_split_entries(dataset_path)
    split = build_stratified_folds(split_entries, fold_count=fold_count, seed=seed)
    entries_by_id = {entry["id"]: entry for entry in entries}

    reset_domain_history()
    scorer = SearchScorer()
    fold_reports = [
        _evaluate_fold(fold=fold, entries_by_id=entries_by_id, search_results=search_results, scorer=scorer)
        for fold in split.folds
    ]
    reset_domain_history()

    all_rows = [
        _score_entry(entry=entries_by_id[entry_id], search_results=search_results, scorer=scorer)
        for fold in split.folds
        for entry_id in fold.validation_ids
    ]
    summary = _summarize_rows(all_rows)
    aggregate_metrics = _aggregate_fold_metrics(fold_reports)
    report: dict[str, object] = {
        "run_id": run_id,
        "commit_sha": _get_commit_sha(),
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "dataset_id": f"{dataset_path.name}:{len(entries)}",
        "top1_official_accuracy": summary["top1_official_accuracy"],
        "retailer_false_positive_rate": summary["retailer_false_positive_rate"],
        "field_correctness": summary["field_correctness"],
        "cost_usd": 0.0,
        "latency_ms": 0.0,
        "brand_breakdown": _breakdown(rows=all_rows, field="brand"),
        "category_breakdown": _breakdown(rows=all_rows, field="category"),
        "confusion_matrix": summary["confusion_matrix"],
        "model_provider_metadata": {
            "search_provider": "cached-golden-fixture",
            "llm_provider": "offline-fixture",
            "model": "none",
            "live_api_calls": 0,
            "fold_count": fold_count,
            "seed": seed,
        },
        "pass_fail": {},
        "folds": fold_reports,
        "fold_list": [
            {
                "index": fold.index,
                "train_count": len(fold.train_ids),
                "validation_count": len(fold.validation_ids),
                "validation_ids": list(fold.validation_ids),
            }
            for fold in split.folds
        ],
        "aggregate_metrics": aggregate_metrics,
        "stratification_fallbacks": list(split.stratification_fallbacks),
    }
    report["pass_fail"] = build_pass_fail_comparison(report, thresholds or DEFAULT_THRESHOLDS)
    validate_benchmark_report(report)
    return report


def render_cv_markdown(report: Mapping[str, object]) -> str:
    """Render CV-specific Markdown while preserving the T3 report contract."""

    validated = validate_benchmark_report(report)
    lines = [generate_markdown_report(validated).rstrip(), "", "## Cross-Validation Folds", ""]
    fold_list = cast(Sequence[Mapping[str, object]], report.get("fold_list", []))
    lines.extend(["| Fold | Train | Validation | Validation IDs |", "| ---: | ---: | ---: | --- |"])
    for fold in fold_list:
        validation_ids = cast(Sequence[object], fold.get("validation_ids", []))
        lines.append(
            f"| {fold['index']} | {fold['train_count']} | {fold['validation_count']} | {', '.join(str(value) for value in validation_ids)} |"
        )

    lines.extend(["", "## Aggregate Mean/Std/CI", "", "| Metric | Mean | Std | 95% CI |", "| --- | ---: | ---: | --- |"])
    aggregate_metrics = cast(Mapping[str, Mapping[str, object]], report.get("aggregate_metrics", {}))
    for metric in sorted(aggregate_metrics):
        values = aggregate_metrics[metric]
        ci = cast(Mapping[str, float], values["confidence_interval_95"])
        lines.append(f"| {metric} | {values['mean']:.6f} | {values['std']:.6f} | [{ci['low']:.6f}, {ci['high']:.6f}] |")

    lines.extend(["", "## Per-Fold Metrics", "", "| Fold | Examples | Top-1 Accuracy | Retailer FPR | Field Correctness |", "| ---: | ---: | ---: | ---: | ---: |"])
    folds = cast(Sequence[Mapping[str, object]], report.get("folds", []))
    for fold in folds:
        lines.append(
            f"| {fold['index']} | {fold['examples']} | {fold['top1_official_accuracy']:.4f} | {fold['retailer_false_positive_rate']:.4f} | {fold['field_correctness']:.4f} |"
        )

    lines.extend(["", "## Confusion Matrix", "", "| Expected | Actual | Count |", "| --- | --- | ---: |"])
    for expected, row in sorted(validated["confusion_matrix"].items()):
        for actual, count in sorted(row.items()):
            lines.append(f"| {expected} | {actual} | {count} |")

    return "\n".join(lines) + "\n"


def write_cv_artifacts(report: Mapping[str, object], output_dir: Path, *, basename: str = "offline-cv-report") -> tuple[Path, Path]:
    """Write JSON and Markdown artifacts for a CV report."""

    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{basename}.json"
    markdown_path = output_dir / f"{basename}.md"
    json_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    markdown_path.write_text(render_cv_markdown(report), encoding="utf-8")
    return json_path, markdown_path


def compare_report_to_baseline(
    candidate: Mapping[str, object], baseline: Mapping[str, object]
) -> dict[str, object]:
    """Compare candidate against baseline using T3 pass/fail semantics."""

    validated_candidate = validate_benchmark_report(candidate)
    validated_baseline = validate_benchmark_report(baseline)
    thresholds = {
        "field_correctness": float(validated_baseline["field_correctness"]),
        "retailer_false_positive_rate": float(validated_baseline["retailer_false_positive_rate"]),
        "top1_official_accuracy": float(validated_baseline["top1_official_accuracy"]),
    }
    pass_fail = build_pass_fail_comparison(validated_candidate, thresholds)
    return {
        "schema_version": "benchmark-cv-comparison-v1",
        "baseline_run_id": validated_baseline["run_id"],
        "candidate_run_id": validated_candidate["run_id"],
        "decision": pass_fail["decision"],
        "pass_fail": pass_fail,
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Offline benchmark cross-validation reporting")
    subparsers = parser.add_subparsers(dest="command", required=True)

    generate_parser = subparsers.add_parser("generate", help="Generate offline CV JSON and Markdown reports")
    generate_parser.add_argument("--dataset", type=Path, default=Path("data/golden_dataset_v3.json"))
    generate_parser.add_argument("--search-results", type=Path, default=Path("data/golden_dataset_v3.search_results.json"))
    generate_parser.add_argument("--output-dir", type=Path, required=True)
    generate_parser.add_argument("--fold-count", type=int, default=5)
    generate_parser.add_argument("--seed", type=int, default=17)
    generate_parser.add_argument("--run-id", default="offline-cv")

    compare_parser = subparsers.add_parser("compare", help="Compare candidate report against baseline thresholds")
    compare_parser.add_argument("--baseline", type=Path, required=True)
    compare_parser.add_argument("--candidate", type=Path, required=True)
    compare_parser.add_argument("--output", type=Path)

    args = parser.parse_args(argv)
    if args.command == "generate":
        report = build_offline_cv_report(
            dataset_path=args.dataset,
            search_results_path=args.search_results,
            fold_count=args.fold_count,
            seed=args.seed,
            run_id=args.run_id,
        )
        json_path, markdown_path = write_cv_artifacts(report, args.output_dir)
        sys.stdout.write(f"JSON report: {json_path}\nMarkdown report: {markdown_path}\n")
        return 0

    if args.command == "compare":
        baseline = _load_json_object(args.baseline)
        candidate = _load_json_object(args.candidate)
        comparison = compare_report_to_baseline(candidate, baseline)
        output = json.dumps(comparison, indent=2, sort_keys=True)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(output + "\n", encoding="utf-8")
        sys.stdout.write(output + "\n")
        return 0 if comparison["decision"] == "pass" else 1

    raise BenchmarkReportValidationError(f"unsupported command: {args.command}")


def _load_evaluation_entries(path: Path) -> list[EvaluationEntry]:
    payload = _load_json_object(path)
    raw_entries = payload["entries"] if "entries" in payload else payload
    if not isinstance(raw_entries, list):
        raise ValueError("dataset must be a list or an object with an entries list")

    entries: list[EvaluationEntry] = []
    for index, raw_entry in enumerate(raw_entries):
        if not isinstance(raw_entry, dict):
            raise ValueError(f"entry {index} must be an object")
        entry_id = _string_field(raw_entry, "sku") or _string_field(raw_entry, "id") or _string_field(raw_entry, "query") or f"entry-{index}"
        entries.append(
            {
                "id": entry_id,
                "query": _string_field(raw_entry, "query") or _string_field(raw_entry, "name") or _string_field(raw_entry, "product_name"),
                "sku": _string_field(raw_entry, "sku"),
                "brand": _string_field(raw_entry, "brand") or "unknown_brand",
                "product_name": _string_field(raw_entry, "product_name") or _string_field(raw_entry, "name"),
                "category": _primary_category(raw_entry),
                "expected_source_url": _string_field(raw_entry, "expected_source_url"),
            }
        )
    return entries


def _load_search_results(path: Path) -> dict[str, list[dict[str, Any]]]:
    payload = _load_json_object(path)
    raw_entries = payload.get("entries")
    if not isinstance(raw_entries, list):
        raise ValueError("search results must be an object with an entries list")
    results_by_query: dict[str, list[dict[str, Any]]] = {}
    for raw_entry in raw_entries:
        if not isinstance(raw_entry, dict):
            continue
        query = _string_field(raw_entry, "query")
        results = raw_entry.get("results")
        if query and isinstance(results, list):
            results_by_query[query] = [result for result in results if isinstance(result, dict)]
    return results_by_query


def _evaluate_fold(
    *,
    fold: CVFold,
    entries_by_id: Mapping[str, EvaluationEntry],
    search_results: Mapping[str, list[dict[str, Any]]],
    scorer: SearchScorer,
) -> FoldReport:
    rows = [_score_entry(entry=entries_by_id[entry_id], search_results=search_results, scorer=scorer) for entry_id in fold.validation_ids]
    summary = _summarize_rows(rows)
    return {
        "index": fold.index,
        "train_ids": list(fold.train_ids),
        "validation_ids": list(fold.validation_ids),
        "examples": len(rows),
        "top1_official_accuracy": summary["top1_official_accuracy"],
        "retailer_false_positive_rate": summary["retailer_false_positive_rate"],
        "field_correctness": summary["field_correctness"],
        "confusion_matrix": summary["confusion_matrix"],
    }


def _score_entry(
    *,
    entry: EvaluationEntry,
    search_results: Mapping[str, list[dict[str, Any]]],
    scorer: SearchScorer,
) -> dict[str, object]:
    results = search_results.get(entry["query"], [])
    scored = [
        (
            result,
            scorer.score_search_result(
                result=result,
                sku=entry["sku"],
                brand=entry["brand"],
                product_name=entry["product_name"],
                category=entry["category"],
                prefer_manufacturer=True,
            ),
        )
        for result in results
    ]
    selected_result = max(scored, key=lambda item: item[1])[0] if scored else {}
    selected_url = str(selected_result.get("url") or "")
    expected_url = entry["expected_source_url"]
    expected_source = _source_bucket(scorer.classify_source_domain(scorer.domain_from_url(expected_url), entry["brand"]))
    actual_source = _source_bucket(scorer.classify_source_domain(scorer.domain_from_url(selected_url), entry["brand"]))
    exact_match = _normalize_url(selected_url) == _normalize_url(expected_url) if selected_url and expected_url else False
    return {
        "id": entry["id"],
        "brand": entry["brand"],
        "category": entry["category"],
        "expected_source": expected_source,
        "actual_source": actual_source,
        "selected_url": selected_url,
        "expected_url": expected_url,
        "top1_match": exact_match,
        "field_correct": exact_match,
    }


def _summarize_rows(rows: Sequence[Mapping[str, object]]) -> dict[str, Any]:
    examples = len(rows)
    top1_matches = sum(1 for row in rows if row["top1_match"] is True)
    field_matches = sum(1 for row in rows if row["field_correct"] is True)
    official_expected = [row for row in rows if row["expected_source"] == "official"]
    retailer_false_positives = sum(1 for row in official_expected if row["actual_source"] == "retailer")
    return {
        "examples": examples,
        "top1_official_accuracy": _rate(top1_matches, examples),
        "retailer_false_positive_rate": _rate(retailer_false_positives, len(official_expected)),
        "field_correctness": _rate(field_matches, examples),
        "confusion_matrix": _confusion_matrix(rows),
    }


def _breakdown(*, rows: Sequence[Mapping[str, object]], field: Literal["brand", "category"]) -> dict[str, dict[str, float | int]]:
    grouped: dict[str, list[Mapping[str, object]]] = defaultdict(list)
    for row in rows:
        grouped[str(row[field])].append(row)
    return {
        group: {
            "examples": summary["examples"],
            "top1_official_accuracy": summary["top1_official_accuracy"],
            "retailer_false_positive_rate": summary["retailer_false_positive_rate"],
            "field_correctness": summary["field_correctness"],
        }
        for group, group_rows in sorted(grouped.items())
        for summary in [_summarize_rows(group_rows)]
    }


def _aggregate_fold_metrics(fold_reports: Sequence[FoldReport]) -> dict[str, MetricAggregate]:
    return {
        metric: _metric_aggregate([float(fold[metric]) for fold in fold_reports])
        for metric in ("top1_official_accuracy", "retailer_false_positive_rate", "field_correctness")
    }


def _metric_aggregate(values: Sequence[float]) -> MetricAggregate:
    if not values:
        return {"mean": 0.0, "std": 0.0, "confidence_interval_95": {"low": 0.0, "high": 0.0}}
    average = sum(values) / len(values)
    variance = sum((value - average) ** 2 for value in values) / (len(values) - 1) if len(values) > 1 else 0.0
    std = math.sqrt(variance)
    margin = 1.96 * std / math.sqrt(len(values)) if values else 0.0
    return {
        "mean": round(average, 6),
        "std": round(std, 6),
        "confidence_interval_95": {"low": round(max(0.0, average - margin), 6), "high": round(min(1.0, average + margin), 6)},
    }


def _confusion_matrix(rows: Iterable[Mapping[str, object]]) -> dict[str, dict[str, int]]:
    matrix: dict[str, dict[str, int]] = {"official": {"official": 0, "retailer": 0, "other": 0}, "retailer": {"official": 0, "retailer": 0, "other": 0}, "other": {"official": 0, "retailer": 0, "other": 0}}
    for row in rows:
        expected = str(row["expected_source"])
        actual = str(row["actual_source"])
        matrix.setdefault(expected, {}).setdefault(actual, 0)
        matrix[expected][actual] += 1
    return matrix


def _source_bucket(source_tier: str) -> str:
    if source_tier == "official":
        return "official"
    if source_tier in {"major_retailer", "secondary_retailer", "marketplace"}:
        return "retailer"
    return "other"


def _normalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    query = "&".join(part for part in parsed.query.split("&") if part and not part.lower().startswith(("srsltid=", "utm_", "gclid=", "fbclid=")))
    path = parsed.path.rstrip("/") or "/"
    return urlunparse((parsed.scheme.lower(), parsed.netloc.lower().removeprefix("www."), path, "", query, ""))


def _primary_category(raw_entry: Mapping[object, object]) -> str:
    category = _string_field(raw_entry, "category")
    if category:
        return category
    categories = raw_entry.get("categories")
    if isinstance(categories, list) and categories and isinstance(categories[0], str):
        return categories[0]
    return "unknown_category"


def _string_field(raw_entry: Mapping[object, object], field: str) -> str:
    value = raw_entry.get(field)
    return value.strip() if isinstance(value, str) else ""


def _load_json_object(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"expected JSON object: {path}")
    return payload


def _rate(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 6) if denominator else 0.0


def _get_commit_sha() -> str:
    try:
        result = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=5, check=False)
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return "unknown"
    return result.stdout.strip() if result.returncode == 0 and result.stdout.strip() else "unknown"


if __name__ == "__main__":
    raise SystemExit(main())
