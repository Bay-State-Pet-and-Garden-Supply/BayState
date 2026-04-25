"""Contract helpers for benchmark tuning reports.

This module defines the stable JSON shape consumed by later tuning and approval
steps. It intentionally validates and renders existing report data only; it does
not execute benchmarks or tune scraper behavior.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Literal, TypeAlias, TypedDict, cast


JsonScalar: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = JsonScalar | Mapping[str, "JsonValue"] | Sequence["JsonValue"]


class BenchmarkReportValidationError(ValueError):
    """Raised when a benchmark report does not satisfy the contract."""


class MetricBreakdown(TypedDict):
    examples: int
    top1_official_accuracy: float
    retailer_false_positive_rate: float
    field_correctness: float


class PassFailCheck(TypedDict):
    metric: str
    actual: float
    threshold: float
    operator: Literal["gte", "lte"]
    passed: bool


class PassFailComparison(TypedDict):
    schema_version: str
    decision: Literal["pass", "fail"]
    checks: list[PassFailCheck]


class BenchmarkReport(TypedDict):
    run_id: str
    commit_sha: str
    generated_at: str
    dataset_id: str
    top1_official_accuracy: float
    retailer_false_positive_rate: float
    field_correctness: float
    cost_usd: float
    latency_ms: float
    brand_breakdown: dict[str, MetricBreakdown]
    category_breakdown: dict[str, MetricBreakdown]
    confusion_matrix: dict[str, dict[str, int]]
    model_provider_metadata: dict[str, JsonScalar]
    pass_fail: PassFailComparison


REQUIRED_FIELDS: tuple[str, ...] = (
    "run_id",
    "commit_sha",
    "generated_at",
    "dataset_id",
    "top1_official_accuracy",
    "retailer_false_positive_rate",
    "field_correctness",
    "cost_usd",
    "latency_ms",
    "brand_breakdown",
    "category_breakdown",
    "confusion_matrix",
    "model_provider_metadata",
    "pass_fail",
)

_NUMERIC_FIELDS = {
    "top1_official_accuracy",
    "retailer_false_positive_rate",
    "field_correctness",
    "cost_usd",
    "latency_ms",
}

_LOWER_IS_BETTER = {"retailer_false_positive_rate", "cost_usd", "latency_ms"}


def validate_benchmark_report(report: Mapping[str, object]) -> BenchmarkReport:
    """Validate a report payload and return it typed for downstream helpers."""

    for field in REQUIRED_FIELDS:
        if field not in report:
            raise BenchmarkReportValidationError(f"missing required field: {field}")

    for field in ("run_id", "commit_sha", "generated_at", "dataset_id"):
        if not isinstance(report[field], str) or report[field] == "":
            raise BenchmarkReportValidationError(f"field must be a non-empty string: {field}")

    for field in _NUMERIC_FIELDS:
        if not _is_number(report[field]):
            raise BenchmarkReportValidationError(f"field must be numeric: {field}")

    _validate_breakdown("brand_breakdown", report["brand_breakdown"])
    _validate_breakdown("category_breakdown", report["category_breakdown"])
    _validate_confusion_matrix(report["confusion_matrix"])
    _validate_model_provider_metadata(report["model_provider_metadata"])
    _validate_pass_fail(report["pass_fail"])

    return cast(BenchmarkReport, report)


def generate_markdown_report(report: Mapping[str, object]) -> str:
    """Render an offline Markdown report from validated benchmark JSON."""

    validated = validate_benchmark_report(report)
    pass_fail = validated["pass_fail"]

    lines = [
        "# Benchmark Tuning Report",
        "",
        f"- Run ID: `{validated['run_id']}`",
        f"- Commit: `{validated['commit_sha']}`",
        f"- Generated At: `{validated['generated_at']}`",
        f"- Dataset: `{validated['dataset_id']}`",
        f"- Decision: `{pass_fail['decision']}`",
        "",
        "## Summary Metrics",
        "",
        "| Metric | Value |",
        "| --- | ---: |",
        f"| Top-1 official accuracy | {validated['top1_official_accuracy']:.4f} |",
        f"| Retailer false-positive rate | {validated['retailer_false_positive_rate']:.4f} |",
        f"| Field correctness | {validated['field_correctness']:.4f} |",
        f"| Cost USD | {validated['cost_usd']:.6f} |",
        f"| Latency ms | {validated['latency_ms']:.2f} |",
        "",
        "## Pass/Fail Checks",
        "",
        "| Metric | Actual | Operator | Threshold | Passed |",
        "| --- | ---: | --- | ---: | --- |",
    ]

    for check in pass_fail["checks"]:
        lines.append(
            f"| {check['metric']} | {check['actual']:.6f} | {check['operator']} | {check['threshold']:.6f} | {str(check['passed']).lower()} |"
        )

    lines.extend([
        "",
        "## Breakdowns",
        "",
        _render_breakdown_table("Brand", validated["brand_breakdown"]),
        "",
        _render_breakdown_table("Category", validated["category_breakdown"]),
    ])

    return "\n".join(lines) + "\n"


def build_pass_fail_comparison(report: Mapping[str, object], thresholds: Mapping[str, float]) -> PassFailComparison:
    """Build deterministic machine-readable pass/fail output for metric thresholds."""

    checks: list[PassFailCheck] = []
    for metric in sorted(thresholds):
        if metric not in report:
            raise BenchmarkReportValidationError(f"missing comparison metric: {metric}")
        actual_value = report[metric]
        if not _is_number(actual_value):
            raise BenchmarkReportValidationError(f"comparison metric must be numeric: {metric}")

        threshold = thresholds[metric]
        operator: Literal["gte", "lte"] = "lte" if metric in _LOWER_IS_BETTER else "gte"
        passed = actual_value <= threshold if operator == "lte" else actual_value >= threshold
        checks.append(
            {
                "metric": metric,
                "actual": float(actual_value),
                "threshold": threshold,
                "operator": operator,
                "passed": passed,
            }
        )

    return {
        "schema_version": "benchmark-pass-fail-v1",
        "decision": "pass" if all(check["passed"] for check in checks) else "fail",
        "checks": checks,
    }


def _validate_breakdown(field: str, value: object) -> None:
    if not isinstance(value, dict) or not value:
        raise BenchmarkReportValidationError(f"field must be a non-empty object: {field}")

    for group_name, group_value in value.items():
        if not isinstance(group_name, str) or group_name == "":
            raise BenchmarkReportValidationError(f"{field} keys must be non-empty strings")
        if not isinstance(group_value, dict):
            raise BenchmarkReportValidationError(f"{field}.{group_name} must be an object")
        _validate_breakdown_entry(f"{field}.{group_name}", group_value)


def _validate_breakdown_entry(path: str, value: Mapping[object, object]) -> None:
    required = ("examples", "top1_official_accuracy", "retailer_false_positive_rate", "field_correctness")
    for field in required:
        if field not in value:
            raise BenchmarkReportValidationError(f"missing required field: {path}.{field}")
    if not _is_integer(value["examples"]):
        raise BenchmarkReportValidationError(f"field must be an integer: {path}.examples")
    for field in required[1:]:
        if not _is_number(value[field]):
            raise BenchmarkReportValidationError(f"field must be numeric: {path}.{field}")


def _validate_confusion_matrix(value: object) -> None:
    if not isinstance(value, dict) or not value:
        raise BenchmarkReportValidationError("field must be a non-empty object: confusion_matrix")
    for expected, row in value.items():
        if not isinstance(expected, str) or expected == "":
            raise BenchmarkReportValidationError("confusion_matrix keys must be non-empty strings")
        if not isinstance(row, dict):
            raise BenchmarkReportValidationError(f"confusion_matrix.{expected} must be an object")
        for actual, count in row.items():
            if not isinstance(actual, str) or actual == "":
                raise BenchmarkReportValidationError(f"confusion_matrix.{expected} keys must be non-empty strings")
            if not _is_integer(count):
                raise BenchmarkReportValidationError(f"confusion_matrix.{expected}.{actual} must be an integer")


def _validate_model_provider_metadata(value: object) -> None:
    if not isinstance(value, dict):
        raise BenchmarkReportValidationError("field must be an object: model_provider_metadata")
    for key, provider_value in value.items():
        if not isinstance(key, str) or key == "":
            raise BenchmarkReportValidationError("model_provider_metadata keys must be non-empty strings")
        if not isinstance(provider_value, str | int | float | bool | type(None)):
            raise BenchmarkReportValidationError(f"model_provider_metadata.{key} must be a JSON scalar")


def _validate_pass_fail(value: object) -> None:
    if not isinstance(value, dict):
        raise BenchmarkReportValidationError("field must be an object: pass_fail")
    for field in ("schema_version", "decision", "checks"):
        if field not in value:
            raise BenchmarkReportValidationError(f"missing required field: pass_fail.{field}")
    if value["schema_version"] != "benchmark-pass-fail-v1":
        raise BenchmarkReportValidationError("pass_fail.schema_version must be benchmark-pass-fail-v1")
    if value["decision"] not in {"pass", "fail"}:
        raise BenchmarkReportValidationError("pass_fail.decision must be pass or fail")
    if not isinstance(value["checks"], list):
        raise BenchmarkReportValidationError("pass_fail.checks must be a list")
    for index, check in enumerate(value["checks"]):
        _validate_pass_fail_check(index, check)


def _validate_pass_fail_check(index: int, value: object) -> None:
    if not isinstance(value, dict):
        raise BenchmarkReportValidationError(f"pass_fail.checks.{index} must be an object")
    for field in ("metric", "actual", "threshold", "operator", "passed"):
        if field not in value:
            raise BenchmarkReportValidationError(f"missing required field: pass_fail.checks.{index}.{field}")
    if not isinstance(value["metric"], str) or value["metric"] == "":
        raise BenchmarkReportValidationError(f"pass_fail.checks.{index}.metric must be a non-empty string")
    if not _is_number(value["actual"]):
        raise BenchmarkReportValidationError(f"pass_fail.checks.{index}.actual must be numeric")
    if not _is_number(value["threshold"]):
        raise BenchmarkReportValidationError(f"pass_fail.checks.{index}.threshold must be numeric")
    if value["operator"] not in {"gte", "lte"}:
        raise BenchmarkReportValidationError(f"pass_fail.checks.{index}.operator must be gte or lte")
    if not isinstance(value["passed"], bool):
        raise BenchmarkReportValidationError(f"pass_fail.checks.{index}.passed must be boolean")


def _render_breakdown_table(label: str, breakdown: Mapping[str, MetricBreakdown]) -> str:
    lines = [
        f"### {label} Breakdown",
        "",
        f"| {label} | Examples | Top-1 Accuracy | Retailer FPR | Field Correctness |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for name in sorted(breakdown):
        row = breakdown[name]
        lines.append(
            f"| {name} | {row['examples']} | {row['top1_official_accuracy']:.4f} | {row['retailer_false_positive_rate']:.4f} | {row['field_correctness']:.4f} |"
        )
    return "\n".join(lines)


def _is_number(value: object) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def _is_integer(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)
