# pyright: reportUnusedCallResult=false
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from statistics import fmean
from typing import Any, cast

from tests.evaluation.baseline_comparator import BaselineComparison
from tests.evaluation.types import EvaluationResult, FieldComparison
from tests.validation.review_workflow import ReviewedResult


WORKSPACE_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_EVIDENCE_BASE = WORKSPACE_ROOT / ".sisyphus" / "evidence" / "evaluation"
DEFAULT_REGRESSION_EVIDENCE_BASE = WORKSPACE_ROOT / ".sisyphus" / "evidence" / "regression"
DEFAULT_WEEKLY_EVIDENCE_BASE = WORKSPACE_ROOT / ".sisyphus" / "evidence" / "weekly"


@dataclass(frozen=True)
class EvaluationReport:
    output_dir: Path
    json_path: Path
    markdown_path: Path
    payload: dict[str, Any]


@dataclass(frozen=True)
class RegressionReport:
    output_dir: Path
    json_path: Path
    markdown_path: Path
    payload: dict[str, Any]


@dataclass(frozen=True)
class WeeklyReport:
    output_dir: Path
    json_path: Path
    markdown_path: Path
    payload: dict[str, Any]


def _safe_mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return float(fmean(values))


def _timestamp_slug(now: datetime) -> str:
    return now.strftime("%Y-%m-%d_%H-%M-%S")


def _serialize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Path):
        return str(value)
    return value


def _serialize_field_comparison(comparison: FieldComparison) -> dict[str, Any]:
    payload = asdict(comparison)
    payload["match_type"] = comparison.match_type.value
    payload["expected"] = _serialize_value(comparison.expected)
    payload["actual"] = _serialize_value(comparison.actual)
    payload["match_score"] = round(float(comparison.match_score), 4)
    return payload


def _build_per_sku_results(results: list[EvaluationResult]) -> list[dict[str, Any]]:
    per_sku: list[dict[str, Any]] = []
    for result in results:
        field_comparisons = [_serialize_field_comparison(item) for item in result.field_comparisons]
        per_sku.append(
            {
                "sku": result.sku,
                "success": result.success,
                "passed": result.passed,
                "accuracy": round(float(result.accuracy), 4),
                "cost": round(float(result.cost), 6),
                "timestamp": result.timestamp.isoformat(),
                "extraction_time_ms": round(float(result.extraction_time_ms), 2) if result.extraction_time_ms is not None else None,
                "error_message": result.error_message,
                "field_comparisons": field_comparisons,
            }
        )
    return per_sku


def _build_field_breakdown(results: list[EvaluationResult]) -> dict[str, dict[str, Any]]:
    breakdown: dict[str, dict[str, Any]] = {}

    for result in results:
        for comparison in result.field_comparisons:
            entry = breakdown.setdefault(
                comparison.field_name,
                {
                    "field_name": comparison.field_name,
                    "count": 0,
                    "average_score": 0.0,
                    "accuracy_rate": 0.0,
                    "exact_matches": 0,
                    "fuzzy_matches": 0,
                    "partial_matches": 0,
                    "no_matches": 0,
                },
            )
            entry["count"] += 1
            entry["average_score"] += float(comparison.match_score)
            if comparison.match_score >= 0.8:
                entry["accuracy_rate"] += 1

            match_key = {
                "exact": "exact_matches",
                "fuzzy": "fuzzy_matches",
                "partial": "partial_matches",
                "none": "no_matches",
            }[comparison.match_type.value]
            entry[match_key] += 1

    for entry in breakdown.values():
        count = entry["count"]
        entry["average_score"] = round(entry["average_score"] / count, 4) if count else 0.0
        entry["accuracy_rate"] = round(entry["accuracy_rate"] / count, 4) if count else 0.0

    return dict(sorted(breakdown.items()))


def _build_aggregate_metrics(results: list[EvaluationResult], field_breakdown: dict[str, dict[str, Any]]) -> dict[str, Any]:
    total_results = len(results)
    successful_results = [result for result in results if result.success]
    passed_results = [result for result in results if result.passed]
    failed_results = [result for result in results if not result.success]

    accuracies = [float(result.accuracy) for result in results]
    costs = [float(result.cost) for result in results]
    extraction_times = [float(result.extraction_time_ms) for result in results if result.extraction_time_ms is not None]

    return {
        "total_results": total_results,
        "success_count": len(successful_results),
        "success_rate": round(len(successful_results) / total_results, 4),
        "passed_count": len(passed_results),
        "pass_rate": round(len(passed_results) / total_results, 4),
        "overall_accuracy": round(_safe_mean(accuracies), 4),
        "average_cost": round(_safe_mean(costs), 6),
        "total_cost": round(sum(costs), 6),
        "average_extraction_time_ms": round(_safe_mean(extraction_times), 2),
        "field_count": len(field_breakdown),
        "failed_extractions": [
            {
                "sku": result.sku,
                "error_message": result.error_message,
                "accuracy": round(float(result.accuracy), 4),
            }
            for result in failed_results
        ],
    }


def _build_recommendations(aggregate_metrics: dict[str, Any], field_breakdown: dict[str, dict[str, Any]]) -> list[str]:
    recommendations: list[str] = []

    if aggregate_metrics["success_rate"] < 0.9:
        recommendations.append("Investigate extraction failures before promoting the prompt version; success rate is below 90%.")

    if aggregate_metrics["overall_accuracy"] < 0.8:
        recommendations.append("Refine prompt instructions or post-processing rules; overall accuracy is below the 80% pass threshold.")

    weakest_fields = sorted(field_breakdown.values(), key=lambda item: item["average_score"])[:3]
    weak_field_names = [field["field_name"] for field in weakest_fields if field["average_score"] < 0.8]
    if weak_field_names:
        recommendations.append(f"Prioritize field-level improvements for: {', '.join(weak_field_names)}.")

    if aggregate_metrics["total_cost"] > 0 and aggregate_metrics["average_cost"] > 0.05:
        recommendations.append("Review token usage or prompt length; average cost per evaluation exceeds $0.05.")

    if not recommendations:
        recommendations.append("Evaluation metrics meet target thresholds; continue monitoring with the current prompt version.")

    return recommendations


def _build_payload(results: list[EvaluationResult], prompt_version: str, generated_at: datetime) -> dict[str, Any]:
    per_sku_results = _build_per_sku_results(results)
    field_breakdown = _build_field_breakdown(results)
    aggregate_metrics = _build_aggregate_metrics(results, field_breakdown)
    recommendations = _build_recommendations(aggregate_metrics, field_breakdown)

    return {
        "generated_at": generated_at.isoformat(),
        "prompt_version": prompt_version,
        "aggregate_metrics": aggregate_metrics,
        "field_breakdown": field_breakdown,
        "per_sku_results": per_sku_results,
        "recommendations": recommendations,
    }


def _format_percent(value: float) -> str:
    return f"{value * 100:.1f}%"


def _format_currency(value: float) -> str:
    return f"${value:.4f}"


def _build_markdown(payload: dict[str, Any], json_path: Path) -> str:
    aggregate = payload["aggregate_metrics"]
    field_breakdown = payload["field_breakdown"]
    failed_extractions = aggregate["failed_extractions"]
    per_sku_results = payload["per_sku_results"]

    lines = [
        "# Evaluation Report",
        "",
        f"**Generated At:** {payload['generated_at']}",
        f"**Prompt Version:** {payload['prompt_version']}",
        "",
        "## Summary",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| Total Results | {aggregate['total_results']} |",
        f"| Success Rate | {_format_percent(aggregate['success_rate'])} |",
        f"| Pass Rate | {_format_percent(aggregate['pass_rate'])} |",
        f"| Overall Accuracy | {_format_percent(aggregate['overall_accuracy'])} |",
        f"| Average Cost | {_format_currency(aggregate['average_cost'])} |",
        f"| Total Cost | {_format_currency(aggregate['total_cost'])} |",
        f"| Avg Extraction Time (ms) | {aggregate['average_extraction_time_ms']:.2f} |",
        "",
        "## Per-Field Accuracy",
        "",
        "| Field | Accuracy Rate | Average Score | Exact | Fuzzy | Partial | None |",
        "|-------|---------------|---------------|-------|-------|---------|------|",
    ]

    for field_name, field_metrics in field_breakdown.items():
        lines.append(
            "| {field} | {accuracy} | {score:.4f} | {exact} | {fuzzy} | {partial} | {none} |".format(
                field=field_name,
                accuracy=_format_percent(field_metrics["accuracy_rate"]),
                score=field_metrics["average_score"],
                exact=field_metrics["exact_matches"],
                fuzzy=field_metrics["fuzzy_matches"],
                partial=field_metrics["partial_matches"],
                none=field_metrics["no_matches"],
            )
        )

    lines.extend(
        [
            "",
            "## Per-SKU Details",
            "",
            "| SKU | Success | Passed | Accuracy | Cost | Time (ms) | Error |",
            "|-----|---------|--------|----------|------|-----------|-------|",
        ]
    )

    for result in per_sku_results:
        error_message = (result["error_message"] or "-").replace("\n", " ")
        extraction_time = "-" if result["extraction_time_ms"] is None else f"{result['extraction_time_ms']:.2f}"
        lines.append(
            "| {sku} | {success} | {passed} | {accuracy} | {cost} | {time} | {error} |".format(
                sku=result["sku"],
                success="yes" if result["success"] else "no",
                passed="yes" if result["passed"] else "no",
                accuracy=_format_percent(result["accuracy"]),
                cost=_format_currency(result["cost"]),
                time=extraction_time,
                error=error_message,
            )
        )

    lines.extend(["", "## Failed Extractions", ""])
    if failed_extractions:
        lines.extend(
            [
                "| SKU | Accuracy | Error |",
                "|-----|----------|-------|",
            ]
        )
        for failure in failed_extractions:
            lines.append(
                "| {sku} | {accuracy} | {error} |".format(
                    sku=failure["sku"],
                    accuracy=_format_percent(failure["accuracy"]),
                    error=(failure["error_message"] or "-").replace("\n", " "),
                )
            )
    else:
        lines.append("No extraction failures.")

    lines.extend(["", "## Recommendations", ""])
    for recommendation in payload["recommendations"]:
        lines.append(f"- {recommendation}")

    lines.extend(["", f"Raw JSON: `{json_path.name}`"])
    return "\n".join(lines)


def _format_delta(value: float) -> str:
    sign = "+" if value > 0 else ""
    return f"{sign}{value * 100:.1f} pp"


def _format_numeric_delta(value: float, decimals: int = 4) -> str:
    sign = "+" if value > 0 else ""
    return f"{sign}{value:.{decimals}f}"


def _coerce_mapping(value: object) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if hasattr(value, "__dict__"):
        return cast(dict[str, Any], dict(vars(value)))
    return {}


def _parse_week_identifier(week_of: str) -> date:
    return date.fromisoformat(week_of)


def _previous_week_identifier(week_of: str) -> str:
    return (_parse_week_identifier(week_of) - timedelta(days=7)).isoformat()


def _review_field_items(review: ReviewedResult) -> list[tuple[str, bool | None, Any, Any]]:
    return [
        ("name", review.name_correct, review.product_name, review.extracted_name),
        ("brand", review.brand_correct, None, review.extracted_brand),
        ("price", review.price_correct, None, review.extracted_price),
        ("images", review.images_correct, None, review.extracted_images),
    ]


def _build_reviewed_field_comparisons(review: ReviewedResult) -> list[dict[str, Any]]:
    field_rows: list[dict[str, Any]] = []
    for field_name, is_correct, reviewed_value, extracted_value in _review_field_items(review):
        score = None if is_correct is None else 1.0 if is_correct else 0.0
        status = "unreviewed" if is_correct is None else "correct" if is_correct else "incorrect"
        field_rows.append(
            {
                "field_name": field_name,
                "status": status,
                "score": score,
                "reviewed_value": _serialize_value(reviewed_value),
                "extracted_value": _serialize_value(extracted_value),
            }
        )
    return field_rows


def _derive_review_accuracy(review: ReviewedResult) -> float:
    scored_fields = [1.0 if is_correct else 0.0 for _, is_correct, _, _ in _review_field_items(review) if is_correct is not None]
    return round(_safe_mean(scored_fields), 4)


def _derive_review_success(review: ReviewedResult) -> bool:
    field_values = [is_correct for _, is_correct, _, _ in _review_field_items(review)]
    reviewed_fields = [value for value in field_values if value is not None]
    if not reviewed_fields:
        return False
    return all(reviewed_fields)


def _normalize_weekly_result(item: ReviewedResult | EvaluationResult | dict[str, Any] | object) -> dict[str, Any]:
    if isinstance(item, EvaluationResult):
        field_comparisons = [_serialize_field_comparison(comparison) for comparison in item.field_comparisons]
        return {
            "sku": item.sku,
            "success": item.success,
            "passed": item.passed,
            "accuracy": round(float(item.accuracy), 4),
            "cost": round(float(item.cost), 6),
            "timestamp": item.timestamp.isoformat(),
            "review_date": item.timestamp.date().isoformat(),
            "error_message": item.error_message,
            "notes": "",
            "reviewer_name": "",
            "field_comparisons": field_comparisons,
            "field_accuracy": {comparison.field_name: round(float(comparison.match_score), 4) for comparison in item.field_comparisons},
            "extracted_data": {comparison.field_name: _serialize_value(comparison.actual) for comparison in item.field_comparisons},
            "reviewed_data": {comparison.field_name: _serialize_value(comparison.expected) for comparison in item.field_comparisons},
        }

    if isinstance(item, ReviewedResult):
        field_comparisons = _build_reviewed_field_comparisons(item)
        return {
            "sku": item.sku,
            "success": _derive_review_success(item),
            "passed": _derive_review_success(item),
            "accuracy": _derive_review_accuracy(item),
            "cost": 0.0,
            "timestamp": item.review_date or datetime.now(timezone.utc).isoformat(),
            "review_date": item.review_date,
            "error_message": item.notes if not _derive_review_success(item) else None,
            "notes": item.notes,
            "reviewer_name": item.reviewer_name,
            "field_comparisons": field_comparisons,
            "field_accuracy": {row["field_name"]: row["score"] for row in field_comparisons if row["score"] is not None},
            "extracted_data": {
                "name": item.extracted_name,
                "brand": item.extracted_brand,
                "price": item.extracted_price,
                "images": item.extracted_images,
            },
            "reviewed_data": {
                "name": item.product_name,
                "brand": None,
                "price": None,
                "images": None,
            },
        }

    payload = _coerce_mapping(item)
    sku = str(payload.get("sku", "unknown"))
    field_accuracy_raw = _coerce_mapping(payload.get("field_accuracy", {}))
    extracted_data = _coerce_mapping(payload.get("extracted_data", {}))
    reviewed_data = _coerce_mapping(payload.get("reviewed_data", {}))
    field_comparisons_raw = payload.get("field_comparisons", [])
    field_comparisons = [dict(row) for row in cast(list[dict[str, Any]], field_comparisons_raw)] if isinstance(field_comparisons_raw, list) else []
    accuracy_value = payload.get("accuracy")

    if accuracy_value is None:
        scores = [float(value) for value in field_accuracy_raw.values() if isinstance(value, (int, float))]
        accuracy_value = _safe_mean(scores)

    return {
        "sku": sku,
        "success": bool(payload.get("success", accuracy_value >= 0.8 if isinstance(accuracy_value, (int, float)) else False)),
        "passed": bool(payload.get("passed", payload.get("success", False))),
        "accuracy": round(float(accuracy_value or 0.0), 4),
        "cost": round(float(payload.get("cost", 0.0) or 0.0), 6),
        "timestamp": str(payload.get("timestamp", payload.get("review_date", datetime.now(timezone.utc).isoformat()))),
        "review_date": str(payload.get("review_date", "")),
        "error_message": payload.get("error_message"),
        "notes": str(payload.get("notes", "")),
        "reviewer_name": str(payload.get("reviewer_name", "")),
        "field_comparisons": field_comparisons,
        "field_accuracy": {str(key): round(float(value), 4) for key, value in field_accuracy_raw.items() if isinstance(value, (int, float))},
        "extracted_data": {str(key): _serialize_value(value) for key, value in extracted_data.items()},
        "reviewed_data": {str(key): _serialize_value(value) for key, value in reviewed_data.items()},
    }


def _build_weekly_field_breakdown(normalized_results: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    breakdown: dict[str, dict[str, Any]] = {}
    for result in normalized_results:
        for field_name, score in result["field_accuracy"].items():
            if score is None:
                continue
            entry = breakdown.setdefault(field_name, {"field_name": field_name, "count": 0, "average_score": 0.0, "accuracy_rate": 0.0})
            entry["count"] += 1
            entry["average_score"] += float(score)
            if float(score) >= 0.8:
                entry["accuracy_rate"] += 1

    for entry in breakdown.values():
        count = entry["count"]
        entry["average_score"] = round(entry["average_score"] / count, 4) if count else 0.0
        entry["accuracy_rate"] = round(entry["accuracy_rate"] / count, 4) if count else 0.0
    return dict(sorted(breakdown.items()))


def _summarize_weekly_metrics(normalized_results: list[dict[str, Any]], field_breakdown: dict[str, dict[str, Any]]) -> dict[str, Any]:
    total_results = len(normalized_results)
    accuracies = [float(result["accuracy"]) for result in normalized_results]
    costs = [float(result["cost"]) for result in normalized_results]
    success_count = sum(1 for result in normalized_results if result["success"])
    return {
        "skus_tested": total_results,
        "success_count": success_count,
        "success_rate": round(success_count / total_results, 4) if total_results else 0.0,
        "average_accuracy": round(_safe_mean(accuracies), 4),
        "average_cost": round(_safe_mean(costs), 6),
        "total_cost": round(sum(costs), 6),
        "field_count": len(field_breakdown),
    }


def _load_previous_week_payload(base_dir: Path, week_of: str) -> dict[str, Any] | None:
    previous_week = _previous_week_identifier(week_of)
    candidate = base_dir / previous_week / "weekly-validation-report.json"
    if not candidate.exists():
        return None
    return cast(dict[str, Any], json.loads(candidate.read_text(encoding="utf-8")))


def _build_weekly_trends(
    current_summary: dict[str, Any],
    current_field_breakdown: dict[str, dict[str, Any]],
    previous_payload: dict[str, Any] | None,
) -> dict[str, Any]:
    previous_summary = None if previous_payload is None else previous_payload.get("summary", {})
    previous_fields = None if previous_payload is None else previous_payload.get("field_accuracy_trends", {})
    previous_week = None if previous_payload is None else previous_payload.get("week_of")

    success_delta = current_summary["success_rate"] - float(previous_summary.get("success_rate", 0.0)) if previous_summary else 0.0
    accuracy_delta = current_summary["average_accuracy"] - float(previous_summary.get("average_accuracy", 0.0)) if previous_summary else 0.0
    avg_cost_delta = current_summary["average_cost"] - float(previous_summary.get("average_cost", 0.0)) if previous_summary else 0.0
    sku_delta = current_summary["skus_tested"] - int(previous_summary.get("skus_tested", 0)) if previous_summary else current_summary["skus_tested"]

    field_trends: dict[str, dict[str, Any]] = {}
    previous_fields = {} if previous_fields is None else previous_fields
    for field_name in sorted(set(current_field_breakdown) | set(previous_fields)):
        current_accuracy = float(current_field_breakdown.get(field_name, {}).get("accuracy_rate", 0.0))
        previous_accuracy = float(previous_fields.get(field_name, {}).get("current_week", 0.0))
        field_trends[field_name] = {
            "previous_week": round(previous_accuracy, 4),
            "current_week": round(current_accuracy, 4),
            "delta": round(current_accuracy - previous_accuracy, 4),
        }

    return {
        "comparison_week": previous_week,
        "week_over_week": {
            "skus_tested_delta": sku_delta,
            "success_rate_delta": round(success_delta, 4),
            "average_accuracy_delta": round(accuracy_delta, 4),
            "average_cost_delta": round(avg_cost_delta, 6),
        },
        "field_accuracy_trends": field_trends,
        "cost_trends": {
            "previous_week": round(float(previous_summary.get("average_cost", 0.0)), 6) if previous_summary else 0.0,
            "current_week": current_summary["average_cost"],
            "delta": round(avg_cost_delta, 6),
        },
    }


def _weekly_chart(label: str, current: float, previous: float | None = None, width: int = 20) -> str:
    current_blocks = "#" * int(round(max(0.0, min(1.0, current)) * width))
    current_bar = current_blocks.ljust(width, ".")
    if previous is None:
        return f"- {label}: [{current_bar}] {_format_percent(current)}"
    previous_blocks = "#" * int(round(max(0.0, min(1.0, previous)) * width))
    previous_bar = previous_blocks.ljust(width, ".")
    return f"- {label}: prev [{previous_bar}] {_format_percent(previous)} -> curr [{current_bar}] {_format_percent(current)}"


def _build_weekly_recommendations(summary: dict[str, Any], trends: dict[str, Any]) -> list[str]:
    recommendations: list[str] = []
    wow = trends["week_over_week"]
    if summary["success_rate"] < 0.9:
        recommendations.append("Reduce failed extractions before the next weekly review; success rate is below 90%.")
    if wow["success_rate_delta"] < 0:
        recommendations.append("Investigate week-over-week reliability regressions in extraction success.")
    if wow["average_accuracy_delta"] < 0:
        recommendations.append("Audit prompt or parser changes that lowered reviewed field accuracy this week.")
    if wow["average_cost_delta"] > 0.01:
        recommendations.append("Review token and retry usage; average cost increased materially week over week.")

    regressed_fields = [field_name for field_name, payload in trends["field_accuracy_trends"].items() if float(payload["delta"]) < 0]
    if regressed_fields:
        recommendations.append(f"Focus validation fixes on regressed fields: {', '.join(regressed_fields)}.")

    if not recommendations:
        recommendations.append("Weekly validation remains stable; continue collecting reviews to strengthen trend confidence.")
    return recommendations


def _build_weekly_payload(
    week_of: str, reviewed_results: list[ReviewedResult | EvaluationResult | dict[str, Any] | object], generated_at: datetime, base_dir: Path
) -> dict[str, Any]:
    normalized_results = [_normalize_weekly_result(item) for item in reviewed_results]
    field_breakdown = _build_weekly_field_breakdown(normalized_results)
    summary = _summarize_weekly_metrics(normalized_results, field_breakdown)
    previous_payload = _load_previous_week_payload(base_dir, week_of)
    trends = _build_weekly_trends(summary, field_breakdown, previous_payload)
    recommendations = _build_weekly_recommendations(summary, trends)

    return {
        "generated_at": generated_at.isoformat(),
        "week_of": week_of,
        "summary": summary,
        "trends": trends,
        "field_accuracy_trends": trends["field_accuracy_trends"],
        "cost_trends": trends["cost_trends"],
        "per_product_results": normalized_results,
        "recommendations": recommendations,
    }


def _build_weekly_markdown(payload: dict[str, Any], json_path: Path) -> str:
    summary = payload["summary"]
    trends = payload["trends"]
    comparison_week = trends["comparison_week"]
    lines = [
        "# Weekly Validation Report",
        "",
        f"**Generated At:** {payload['generated_at']}",
        f"**Week Of:** {payload['week_of']}",
        "",
        "## Executive Summary",
        "",
        f"- SKUs tested: {summary['skus_tested']}",
        f"- Success rate: {_format_percent(summary['success_rate'])}",
        f"- Average accuracy: {_format_percent(summary['average_accuracy'])}",
        f"- Average cost: {_format_currency(summary['average_cost'])}",
        "",
        "## Trend Charts",
        "",
    ]

    if comparison_week:
        lines.extend(
            [
                f"Compared with week of {comparison_week}.",
                "",
                _weekly_chart(
                    "Success Rate",
                    float(summary["success_rate"]),
                    float(summary["success_rate"]) - float(trends["week_over_week"]["success_rate_delta"]),
                ),
                _weekly_chart(
                    "Average Accuracy",
                    float(summary["average_accuracy"]),
                    float(summary["average_accuracy"]) - float(trends["week_over_week"]["average_accuracy_delta"]),
                ),
                "",
                f"- SKU volume delta: {trends['week_over_week']['skus_tested_delta']:+d}",
                f"- Success rate delta: {_format_delta(trends['week_over_week']['success_rate_delta'])}",
                f"- Accuracy delta: {_format_delta(trends['week_over_week']['average_accuracy_delta'])}",
                f"- Average cost delta: {_format_numeric_delta(trends['week_over_week']['average_cost_delta'], decimals=4)}",
            ]
        )
    else:
        lines.extend(
            [
                "No previous weekly report found; this report establishes the initial baseline.",
                "",
                _weekly_chart("Success Rate", float(summary["success_rate"])),
                _weekly_chart("Average Accuracy", float(summary["average_accuracy"])),
                "",
            ]
        )

    lines.extend(["", "## Field Trends", "", "| Field | Previous Week | Current Week | Delta |", "|-------|---------------|--------------|-------|"])
    for field_name, field_payload in payload["field_accuracy_trends"].items():
        lines.append(
            f"| {field_name} | {_format_percent(field_payload['previous_week'])} | {_format_percent(field_payload['current_week'])} | {_format_delta(field_payload['delta'])} |"
        )

    lines.extend(
        [
            "",
            "## Per-Product Results",
            "",
            "| SKU | Success | Accuracy | Cost | Extracted Data | Reviewed Data | Notes |",
            "|-----|---------|----------|------|----------------|---------------|-------|",
        ]
    )
    for result in payload["per_product_results"]:
        extracted = json.dumps(result["extracted_data"], sort_keys=True)
        reviewed = json.dumps(result["reviewed_data"], sort_keys=True)
        notes = (result.get("notes") or result.get("error_message") or "-").replace("\n", " ")
        lines.append(
            "| {sku} | {success} | {accuracy} | {cost} | {extracted} | {reviewed} | {notes} |".format(
                sku=result["sku"],
                success="yes" if result["success"] else "no",
                accuracy=_format_percent(result["accuracy"]),
                cost=_format_currency(result["cost"]),
                extracted=extracted,
                reviewed=reviewed,
                notes=notes,
            )
        )

    lines.extend(["", "## Action Items", ""])
    for recommendation in payload["recommendations"]:
        lines.append(f"- {recommendation}")

    lines.extend(["", f"Raw JSON: `{json_path.name}`"])
    return "\n".join(lines)


def _risk_level(comparison_result: BaselineComparison) -> str:
    if comparison_result.improvement < 0 or any(delta < -0.05 for delta in comparison_result.per_field_deltas.values()):
        return "high"
    if not comparison_result.is_significant or any(delta < 0 for delta in comparison_result.per_field_deltas.values()):
        return "medium"
    return "low"


def _risk_assessment(comparison_result: BaselineComparison) -> str:
    risk_level = _risk_level(comparison_result)
    if risk_level == "high":
        return "High risk: the challenger regresses overall accuracy or materially degrades at least one field."
    if risk_level == "medium":
        return "Medium risk: the challenger shows mixed field movement or lacks strong statistical support."
    return "Low risk: the challenger improves accuracy without visible field-level regression risk."


def _recommendation_rationale(comparison_result: BaselineComparison) -> str:
    if comparison_result.recommendation == "MERGE":
        return "Promote the challenger because it improves or maintains quality with acceptable regression risk."
    if comparison_result.recommendation == "REVIEW":
        return "Review manually before promotion because the quality gain is not statistically decisive."
    return "Reject the challenger because available data indicates a likely regression."


def _build_regression_field_rows(comparison_result: BaselineComparison) -> list[dict[str, Any]]:
    all_fields = sorted(set(comparison_result.per_field_deltas) | set(comparison_result.baseline_per_field) | set(comparison_result.challenger_per_field))
    rows: list[dict[str, Any]] = []
    for field_name in all_fields:
        baseline_value = float(comparison_result.baseline_per_field.get(field_name, 0.0))
        challenger_value = float(comparison_result.challenger_per_field.get(field_name, 0.0))
        delta_value = float(comparison_result.per_field_deltas.get(field_name, challenger_value - baseline_value))
        rows.append(
            {
                "field_name": field_name,
                "baseline_accuracy": round(baseline_value, 4),
                "challenger_accuracy": round(challenger_value, 4),
                "delta": round(delta_value, 4),
                "status": "improved" if delta_value > 0 else "regressed" if delta_value < 0 else "unchanged",
            }
        )
    return rows


def _build_regression_payload(comparison_result: BaselineComparison, generated_at: datetime) -> dict[str, Any]:
    field_rows = _build_regression_field_rows(comparison_result)
    risk_assessment = _risk_assessment(comparison_result)
    confidence_level = 0.95 if comparison_result.confidence_level is None else float(comparison_result.confidence_level)
    confidence_percent = round(confidence_level * 100, 1)
    p_value = None if comparison_result.p_value is None else round(float(comparison_result.p_value), 6)

    return {
        "generated_at": generated_at.isoformat(),
        "baseline_version": comparison_result.baseline_version,
        "challenger_version": comparison_result.challenger_version,
        "metrics": {
            "baseline_accuracy": round(float(comparison_result.baseline_accuracy), 4),
            "challenger_accuracy": round(float(comparison_result.challenger_accuracy), 4),
            "improvement": round(float(comparison_result.improvement), 4),
        },
        "per_field_deltas": {
            row["field_name"]: {
                "baseline_accuracy": row["baseline_accuracy"],
                "challenger_accuracy": row["challenger_accuracy"],
                "delta": row["delta"],
                "status": row["status"],
            }
            for row in field_rows
        },
        "statistical_significance": {
            "is_significant": comparison_result.is_significant,
            "confidence_level": confidence_level,
            "confidence_level_percent": confidence_percent,
            "p_value": p_value,
            "wins": int(comparison_result.wins),
            "losses": int(comparison_result.losses),
            "ties": int(comparison_result.ties),
        },
        "recommendation": {
            "decision": comparison_result.recommendation,
            "rationale": _recommendation_rationale(comparison_result),
        },
        "risk_assessment": risk_assessment,
    }


def _build_regression_markdown(payload: dict[str, Any], json_path: Path) -> str:
    metrics = payload["metrics"]
    significance = payload["statistical_significance"]

    lines = [
        "# Regression Report",
        "",
        f"**Generated At:** {payload['generated_at']}",
        f"**Baseline Version:** {payload['baseline_version']}",
        f"**Challenger Version:** {payload['challenger_version']}",
        "",
        "## Summary",
        "",
        "| Metric | Baseline | Challenger | Delta |",
        "|--------|----------|------------|-------|",
        f"| Accuracy | {_format_percent(metrics['baseline_accuracy'])} | {_format_percent(metrics['challenger_accuracy'])} | {_format_delta(metrics['improvement'])} |",
        "",
        "## Per-Field Comparison",
        "",
        "| Field | Baseline | Challenger | Delta | Status |",
        "|-------|----------|------------|-------|--------|",
    ]

    for field_name, field_metrics in payload["per_field_deltas"].items():
        lines.append(
            f"| {field_name} | {_format_percent(field_metrics['baseline_accuracy'])} | {_format_percent(field_metrics['challenger_accuracy'])} | {_format_delta(field_metrics['delta'])} | {field_metrics['status']} |"
        )

    lines.extend(
        [
            "",
            "## Statistical Test Results",
            "",
            "| Check | Value |",
            "|-------|-------|",
            f"| Significant | {'yes' if significance['is_significant'] else 'no'} |",
            f"| Confidence Level | {significance['confidence_level_percent']:.1f}% |",
            f"| P-Value | {'n/a' if significance['p_value'] is None else f'{significance["p_value"]:.6f}'} |",
            f"| Wins / Losses / Ties | {significance['wins']} / {significance['losses']} / {significance['ties']} |",
            "",
            "## Recommendation",
            "",
            f"**{payload['recommendation']['decision']}** - {payload['recommendation']['rationale']}",
            "",
            "## Risk Assessment",
            "",
            payload["risk_assessment"],
            "",
            f"Raw JSON: `{json_path.name}`",
        ]
    )
    return "\n".join(lines)


def generate_evaluation_report(
    results: list[EvaluationResult],
    prompt_version: str,
    output_dir: str | Path | None = None,
) -> EvaluationReport:
    if not results:
        raise ValueError("generate_evaluation_report requires at least one evaluation result")

    generated_at = datetime.now(timezone.utc)
    base_dir = Path(output_dir) if output_dir is not None else DEFAULT_EVIDENCE_BASE
    report_dir = base_dir / _timestamp_slug(generated_at)
    report_dir.mkdir(parents=True, exist_ok=False)

    payload = _build_payload(results, prompt_version=prompt_version, generated_at=generated_at)
    json_path = report_dir / "evaluation-report.json"
    markdown_path = report_dir / "evaluation-report.md"

    _ = json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    _ = markdown_path.write_text(_build_markdown(payload, json_path), encoding="utf-8")

    return EvaluationReport(
        output_dir=report_dir,
        json_path=json_path,
        markdown_path=markdown_path,
        payload=payload,
    )


def generate_regression_report(
    comparison_result: BaselineComparison,
    output_dir: str | Path | None = None,
) -> RegressionReport:
    generated_at = datetime.now(timezone.utc)
    base_dir = Path(output_dir) if output_dir is not None else DEFAULT_REGRESSION_EVIDENCE_BASE
    report_dir = base_dir / _timestamp_slug(generated_at)
    report_dir.mkdir(parents=True, exist_ok=False)

    payload = _build_regression_payload(comparison_result, generated_at=generated_at)
    json_path = report_dir / "regression-report.json"
    markdown_path = report_dir / "regression-report.md"

    _ = json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    _ = markdown_path.write_text(_build_regression_markdown(payload, json_path), encoding="utf-8")

    return RegressionReport(
        output_dir=report_dir,
        json_path=json_path,
        markdown_path=markdown_path,
        payload=payload,
    )


def generate_weekly_report(
    week_of: str,
    reviewed_results: list[ReviewedResult | EvaluationResult | dict[str, Any] | object],
    output_dir: str | Path | None = None,
) -> WeeklyReport:
    _ = _parse_week_identifier(week_of)

    generated_at = datetime.now(timezone.utc)
    base_dir = Path(output_dir) if output_dir is not None else DEFAULT_WEEKLY_EVIDENCE_BASE
    report_dir = base_dir / week_of
    report_dir.mkdir(parents=True, exist_ok=True)

    payload = _build_weekly_payload(week_of=week_of, reviewed_results=reviewed_results, generated_at=generated_at, base_dir=base_dir)
    json_path = report_dir / "weekly-validation-report.json"
    markdown_path = report_dir / "weekly-validation-report.md"

    _ = json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    _ = markdown_path.write_text(_build_weekly_markdown(payload, json_path), encoding="utf-8")

    return WeeklyReport(
        output_dir=report_dir,
        json_path=json_path,
        markdown_path=markdown_path,
        payload=payload,
    )
