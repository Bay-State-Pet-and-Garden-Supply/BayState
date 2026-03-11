# pyright: reportUnusedCallResult=false
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import fmean
from typing import Any

from tests.evaluation.baseline_comparator import BaselineComparison
from tests.evaluation.types import EvaluationResult, FieldComparison


WORKSPACE_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_EVIDENCE_BASE = WORKSPACE_ROOT / ".sisyphus" / "evidence" / "evaluation"
DEFAULT_REGRESSION_EVIDENCE_BASE = WORKSPACE_ROOT / ".sisyphus" / "evidence" / "regression"


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
