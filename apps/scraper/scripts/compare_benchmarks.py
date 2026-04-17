#!/usr/bin/env python3
# pyright: reportMissingTypeStubs=false, reportUnknownVariableType=false, reportUnknownArgumentType=false, reportUnknownMemberType=false
"""Compare two benchmark reports with paired statistical tests."""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import fmean, stdev
from typing import TypedDict, cast

from scipy.stats import t as student_t
from scipy.stats import ttest_rel, wilcoxon

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

REPORTS_DIR = ROOT / "reports"
REPORT_VERSION = "1.0"
PRIMARY_METRIC = "accuracy_exact_match"
SIGNIFICANCE_ALPHA = 0.05
SIGNIFICANCE_RULE = "both_tests_p_lt_0_05"


@dataclass(frozen=True)
class ComparisonArgs:
    """Typed CLI arguments."""

    report_a: Path
    report_b: Path
    output: Path | None


@dataclass(frozen=True)
class MetricDefinition:
    """Metadata for one paired benchmark metric."""

    key: str
    label: str
    row_field: str
    value_format: str
    higher_is_better: bool = True


class BenchmarkResultRow(TypedDict):
    """Minimal per-example benchmark row needed for paired comparison."""

    index: int
    query: str
    expected_source_url: str
    exact_match: bool
    reciprocal_rank: float
    precision_at_1: float
    recall_at_1: float


class BenchmarkReport(TypedDict):
    """Minimal benchmark report payload."""

    generated_at: str
    dataset_path: str
    mode: str
    results: list[BenchmarkResultRow]


class TestResult(TypedDict):
    """Serialized result for one significance test."""

    statistic: float | None
    p_value: float
    significant: bool
    valid: bool
    note: str | None


class DifferenceConfidenceInterval(TypedDict):
    """Confidence interval for paired mean differences."""

    confidence_level: float
    mean_difference: float
    lower_bound: float
    upper_bound: float
    margin_of_error: float
    sample_size: int
    method: str


class MetricComparison(TypedDict):
    """Serialized paired comparison for a single metric."""

    label: str
    value_format: str
    higher_is_better: bool
    sample_size: int
    baseline_mean: float
    current_mean: float
    mean_difference: float
    cohens_d: float | None
    effect_size_interpretation: str
    paired_t_test: TestResult
    wilcoxon_signed_rank: TestResult
    confidence_interval_95: DifferenceConfidenceInterval
    significant: bool
    claim: str
    significance_rule: str


class ReportMetadata(TypedDict):
    """Reference metadata for an input benchmark report."""

    path: str
    generated_at: str | None
    dataset_path: str | None
    mode: str | None


class ComparisonSummary(TypedDict):
    """Top-level decision summary for the comparison."""

    primary_metric: str
    decision: str
    exit_code: int
    paired_examples: int
    significance_alpha: float
    significance_rule: str
    significant_metrics: list[str]
    improved_metrics: list[str]
    regressed_metrics: list[str]


class ComparisonReport(TypedDict):
    """Top-level comparison payload."""

    report_version: str
    generated_at: str
    paired_by: str
    report_a: ReportMetadata
    report_b: ReportMetadata
    summary: ComparisonSummary
    comparisons: dict[str, MetricComparison]


METRIC_DEFINITIONS: tuple[MetricDefinition, ...] = (
    MetricDefinition(
        key="accuracy_exact_match",
        label="Accuracy (Exact Match)",
        row_field="exact_match",
        value_format="percentage",
    ),
    MetricDefinition(
        key="mean_reciprocal_rank",
        label="Mean Reciprocal Rank",
        row_field="reciprocal_rank",
        value_format="ratio",
    ),
    MetricDefinition(
        key="precision_at_1",
        label="Precision@1",
        row_field="precision_at_1",
        value_format="percentage",
    ),
    MetricDefinition(
        key="recall_at_1",
        label="Recall@1",
        row_field="recall_at_1",
        value_format="percentage",
    ),
)

ResultKey = tuple[int, str, str]


def parse_args(argv: list[str] | None = None) -> ComparisonArgs:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(description="Compare two AI Search benchmark reports with paired significance tests")
    _ = parser.add_argument("report_a_path", nargs="?", help="Path to benchmark report A")
    _ = parser.add_argument("report_b_path", nargs="?", help="Path to benchmark report B")
    _ = parser.add_argument("--report-a", dest="report_a_flag", type=Path, default=None)
    _ = parser.add_argument("--report-b", dest="report_b_flag", type=Path, default=None)
    _ = parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional path to write the JSON comparison report",
    )

    args = parser.parse_args(argv)
    report_a = _resolve_report_path(
        flag_value=cast(Path | None, args.report_a_flag),
        positional_value=cast(str | None, args.report_a_path),
        flag_name="--report-a",
    )
    report_b = _resolve_report_path(
        flag_value=cast(Path | None, args.report_b_flag),
        positional_value=cast(str | None, args.report_b_path),
        flag_name="--report-b",
    )
    return ComparisonArgs(
        report_a=report_a,
        report_b=report_b,
        output=cast(Path | None, args.output),
    )


class BenchmarkComparator:
    """Compare two benchmark runs with paired significance tests."""

    def __init__(
        self,
        report_a_path: Path,
        report_b_path: Path,
        *,
        alpha: float = SIGNIFICANCE_ALPHA,
    ) -> None:
        self.report_a_path: Path = report_a_path
        self.report_b_path: Path = report_b_path
        self.alpha: float = alpha

    def compare(self) -> ComparisonReport:
        """Load both benchmark reports and compute paired comparisons."""
        report_a = self._load_report(self.report_a_path)
        report_b = self._load_report(self.report_b_path)
        paired_rows = self._pair_results(report_a["results"], report_b["results"])

        comparisons = {metric.key: self._compare_metric(metric, paired_rows) for metric in METRIC_DEFINITIONS}
        summary = self._build_summary(comparisons, paired_examples=len(paired_rows))
        generated_at = datetime.now(timezone.utc).isoformat()

        return ComparisonReport(
            report_version=REPORT_VERSION,
            generated_at=generated_at,
            paired_by="index+query+expected_source_url",
            report_a=self._build_report_metadata(self.report_a_path, report_a),
            report_b=self._build_report_metadata(self.report_b_path, report_b),
            summary=summary,
            comparisons=comparisons,
        )

    def _load_report(self, report_path: Path) -> BenchmarkReport:
        if not report_path.exists():
            raise FileNotFoundError(f"benchmark report not found: {report_path}")

        with open(report_path, encoding="utf-8") as handle:
            payload = cast(dict[str, object], json.load(handle))

        results = payload.get("results")
        if not isinstance(results, list):
            raise ValueError(f"benchmark report missing results list: {report_path}")

        return BenchmarkReport(
            generated_at=str(payload.get("generated_at") or ""),
            dataset_path=str(payload.get("dataset_path") or ""),
            mode=str(payload.get("mode") or ""),
            results=cast(list[BenchmarkResultRow], results),
        )

    def _pair_results(
        self,
        results_a: Sequence[BenchmarkResultRow],
        results_b: Sequence[BenchmarkResultRow],
    ) -> list[tuple[BenchmarkResultRow, BenchmarkResultRow]]:
        indexed_a = self._index_results(results_a, self.report_a_path)
        indexed_b = self._index_results(results_b, self.report_b_path)

        keys_a = set(indexed_a)
        keys_b = set(indexed_b)
        if keys_a != keys_b:
            missing_in_b = sorted(keys_a - keys_b)
            missing_in_a = sorted(keys_b - keys_a)
            raise ValueError(
                f"benchmark reports do not contain the same paired examples: missing in report B={missing_in_b[:3]}, missing in report A={missing_in_a[:3]}"
            )

        ordered_keys = sorted(indexed_a, key=lambda key: (key[0], key[1], key[2]))
        return [(indexed_a[key], indexed_b[key]) for key in ordered_keys]

    def _index_results(
        self,
        results: Sequence[BenchmarkResultRow],
        source_path: Path,
    ) -> dict[ResultKey, BenchmarkResultRow]:
        indexed: dict[ResultKey, BenchmarkResultRow] = {}
        for row in results:
            key = self._result_key(row)
            if key in indexed:
                raise ValueError(f"duplicate benchmark row key in {source_path}: {key}")
            indexed[key] = row
        return indexed

    def _result_key(self, row: Mapping[str, object]) -> ResultKey:
        try:
            index = _coerce_int(row["index"], field_name="index")
            query = str(row["query"])
            expected_source_url = str(row["expected_source_url"])
        except KeyError as exc:
            raise ValueError(f"benchmark row missing required key: {exc}") from exc
        return index, query, expected_source_url

    def _compare_metric(
        self,
        metric: MetricDefinition,
        paired_rows: Sequence[tuple[BenchmarkResultRow, BenchmarkResultRow]],
    ) -> MetricComparison:
        baseline_values = [self._extract_metric_value(metric, row_a) for row_a, _ in paired_rows]
        current_values = [self._extract_metric_value(metric, row_b) for _, row_b in paired_rows]
        differences = [current - baseline for baseline, current in zip(baseline_values, current_values)]

        paired_t_result = self._calculate_paired_t_test(
            baseline_values=baseline_values,
            current_values=current_values,
            differences=differences,
        )
        wilcoxon_result = self._calculate_wilcoxon(differences)
        confidence_interval = self._calculate_confidence_interval(differences)

        mean_difference = _safe_mean(differences)
        cohens_d = self._calculate_cohens_d(differences)
        significant = paired_t_result["significant"] and wilcoxon_result["significant"]

        claim = "no_significant_difference"
        if significant and mean_difference > 0:
            claim = "significant_improvement"
        elif significant and mean_difference < 0:
            claim = "significant_regression"

        return MetricComparison(
            label=metric.label,
            value_format=metric.value_format,
            higher_is_better=metric.higher_is_better,
            sample_size=len(differences),
            baseline_mean=round(_safe_mean(baseline_values), 6),
            current_mean=round(_safe_mean(current_values), 6),
            mean_difference=round(mean_difference, 6),
            cohens_d=None if cohens_d is None else round(cohens_d, 6),
            effect_size_interpretation=_interpret_effect_size(cohens_d),
            paired_t_test=paired_t_result,
            wilcoxon_signed_rank=wilcoxon_result,
            confidence_interval_95=confidence_interval,
            significant=significant,
            claim=claim,
            significance_rule=SIGNIFICANCE_RULE,
        )

    def _extract_metric_value(self, metric: MetricDefinition, row: Mapping[str, object]) -> float:
        raw_value = row.get(metric.row_field)
        if metric.row_field == "exact_match":
            return 1.0 if bool(raw_value) else 0.0
        return _coerce_float(raw_value, field_name=metric.row_field)

    def _calculate_paired_t_test(
        self,
        *,
        baseline_values: Sequence[float],
        current_values: Sequence[float],
        differences: Sequence[float],
    ) -> TestResult:
        sample_size = len(differences)
        if sample_size < 2:
            return TestResult(
                statistic=0.0,
                p_value=1.0,
                significant=False,
                valid=False,
                note="paired t-test requires at least two paired observations",
            )

        sample_std = _sample_standard_deviation(differences)
        mean_difference = _safe_mean(differences)
        if sample_std == 0.0:
            if mean_difference == 0.0:
                return TestResult(
                    statistic=0.0,
                    p_value=1.0,
                    significant=False,
                    valid=False,
                    note="all paired differences are zero",
                )
            return TestResult(
                statistic=None,
                p_value=0.0,
                significant=True,
                valid=False,
                note="paired differences have zero variance",
            )

        t_test_result = cast(tuple[object, object], ttest_rel(current_values, baseline_values))
        statistic_value = _finite_or_none(_coerce_float(t_test_result[0], field_name="ttest_statistic"))
        p_value_float = _coerce_float(t_test_result[1], field_name="ttest_p_value")
        if not math.isfinite(p_value_float):
            return TestResult(
                statistic=statistic_value,
                p_value=1.0,
                significant=False,
                valid=False,
                note="paired t-test returned a non-finite p-value",
            )

        return TestResult(
            statistic=None if statistic_value is None else round(statistic_value, 6),
            p_value=round(p_value_float, 6),
            significant=p_value_float < self.alpha,
            valid=True,
            note=None,
        )

    def _calculate_wilcoxon(self, differences: Sequence[float]) -> TestResult:
        non_zero_differences = [difference for difference in differences if difference != 0.0]
        if not non_zero_differences:
            return TestResult(
                statistic=0.0,
                p_value=1.0,
                significant=False,
                valid=False,
                note="all paired differences are zero",
            )

        try:
            wilcoxon_result = cast(
                tuple[object, object],
                wilcoxon(differences, zero_method="wilcox", correction=False),
            )
        except ValueError as exc:
            return TestResult(
                statistic=None,
                p_value=1.0,
                significant=False,
                valid=False,
                note=str(exc),
            )

        statistic_value = _finite_or_none(_coerce_float(wilcoxon_result[0], field_name="wilcoxon_statistic"))
        p_value_float = _coerce_float(wilcoxon_result[1], field_name="wilcoxon_p_value")
        if not math.isfinite(p_value_float):
            return TestResult(
                statistic=statistic_value,
                p_value=1.0,
                significant=False,
                valid=False,
                note="wilcoxon test returned a non-finite p-value",
            )

        return TestResult(
            statistic=None if statistic_value is None else round(statistic_value, 6),
            p_value=round(p_value_float, 6),
            significant=p_value_float < self.alpha,
            valid=True,
            note=None,
        )

    def _calculate_cohens_d(self, differences: Sequence[float]) -> float | None:
        if not differences:
            return None

        sample_std = _sample_standard_deviation(differences)
        if sample_std == 0.0:
            return 0.0 if _safe_mean(differences) == 0.0 else None
        return _safe_mean(differences) / sample_std

    def _calculate_confidence_interval(
        self,
        differences: Sequence[float],
    ) -> DifferenceConfidenceInterval:
        sample_size = len(differences)
        mean_difference = _safe_mean(differences)
        margin_of_error = 0.0

        if sample_size > 1:
            sample_std = _sample_standard_deviation(differences)
            if sample_std > 0.0:
                critical_value = float(student_t.ppf(0.975, df=sample_size - 1))
                if math.isfinite(critical_value):
                    margin_of_error = critical_value * (sample_std / math.sqrt(sample_size))

        lower_bound = mean_difference - margin_of_error
        upper_bound = mean_difference + margin_of_error
        return DifferenceConfidenceInterval(
            confidence_level=0.95,
            mean_difference=round(mean_difference, 6),
            lower_bound=round(lower_bound, 6),
            upper_bound=round(upper_bound, 6),
            margin_of_error=round(margin_of_error, 6),
            sample_size=sample_size,
            method="paired_mean_difference_t_interval",
        )

    def _build_summary(
        self,
        comparisons: Mapping[str, MetricComparison],
        *,
        paired_examples: int,
    ) -> ComparisonSummary:
        improved_metrics = [key for key, value in comparisons.items() if value["claim"] == "significant_improvement"]
        regressed_metrics = [key for key, value in comparisons.items() if value["claim"] == "significant_regression"]
        significant_metrics = sorted(improved_metrics + regressed_metrics)

        primary_comparison = comparisons[PRIMARY_METRIC]
        decision = primary_comparison["claim"]
        if decision == "significant_improvement":
            exit_code = 0
        elif decision == "significant_regression":
            exit_code = 1
        else:
            exit_code = 2

        return ComparisonSummary(
            primary_metric=PRIMARY_METRIC,
            decision=decision,
            exit_code=exit_code,
            paired_examples=paired_examples,
            significance_alpha=self.alpha,
            significance_rule=SIGNIFICANCE_RULE,
            significant_metrics=significant_metrics,
            improved_metrics=sorted(improved_metrics),
            regressed_metrics=sorted(regressed_metrics),
        )

    def _build_report_metadata(
        self,
        report_path: Path,
        report: BenchmarkReport,
    ) -> ReportMetadata:
        return ReportMetadata(
            path=str(report_path),
            generated_at=report.get("generated_at") or None,
            dataset_path=report.get("dataset_path") or None,
            mode=report.get("mode") or None,
        )


def write_report(report: Mapping[str, object], output_path: Path) -> None:
    """Persist the JSON report to disk."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(dict(report), handle, indent=2)
        _ = handle.write("\n")


def write_markdown_report(markdown: str, output_path: Path) -> None:
    """Persist the Markdown report to disk."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _ = output_path.write_text(markdown.rstrip() + "\n", encoding="utf-8")


def resolve_report_paths(output_path: Path | None = None) -> tuple[Path, Path]:
    """Resolve JSON and Markdown output paths for a comparison run."""
    if output_path is None:
        output_path = REPORTS_DIR / f"benchmark_comparison_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    return output_path, output_path.with_suffix(".md")


def generate_markdown_report(report: ComparisonReport) -> str:
    """Render a human-readable Markdown comparison report."""
    summary = report["summary"]
    lines = [
        "# Benchmark Comparison Report",
        "",
        "## Comparison Metadata",
        "",
        f"- Generated: {report['generated_at']}",
        f"- Report A: `{report['report_a']['path']}`",
        f"- Report B: `{report['report_b']['path']}`",
        f"- Paired By: `{report['paired_by']}`",
        f"- Significance Rule: `{summary['significance_rule']}`",
        "",
        "## Decision Summary",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| Primary Metric | {summary['primary_metric']} |",
        f"| Decision | {summary['decision']} |",
        f"| Exit Code | {summary['exit_code']} |",
        f"| Paired Examples | {summary['paired_examples']} |",
        f"| Alpha | {summary['significance_alpha']:.2f} |",
        f"| Significant Metrics | {', '.join(summary['significant_metrics']) or 'none'} |",
        "",
        "## Statistical Comparisons",
        "",
        "| Metric | Report A | Report B | Δ | 95% CI | Cohen's d | t-test p | Wilcoxon p | Claim |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]

    for metric in METRIC_DEFINITIONS:
        comparison = report["comparisons"][metric.key]
        ci = comparison["confidence_interval_95"]
        lines.append(
            "| {label} | {baseline} | {current} | {delta} | {ci} | {effect} | {ttest} | {wilcoxon} | {claim} |".format(
                label=comparison["label"],
                baseline=_format_metric_value(comparison["baseline_mean"], comparison["value_format"]),
                current=_format_metric_value(comparison["current_mean"], comparison["value_format"]),
                delta=_format_metric_difference(
                    comparison["mean_difference"],
                    comparison["value_format"],
                ),
                ci="[{lower}, {upper}]".format(
                    lower=_format_metric_difference(ci["lower_bound"], comparison["value_format"]),
                    upper=_format_metric_difference(ci["upper_bound"], comparison["value_format"]),
                ),
                effect=_format_effect_size(
                    comparison["cohens_d"],
                    comparison["effect_size_interpretation"],
                ),
                ttest=_format_p_value(comparison["paired_t_test"]["p_value"]),
                wilcoxon=_format_p_value(comparison["wilcoxon_signed_rank"]["p_value"]),
                claim=comparison["claim"],
            )
        )

    lines.extend(["", "## Notes", ""])
    lines.append("- Significance is claimed only when both paired tests report p < 0.05.")
    lines.append("- Cohen's d uses the paired-difference mean divided by the sample stddev of differences.")
    lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def run_cli(argv: list[str] | None = None) -> int:
    """Run the benchmark comparison CLI."""
    try:
        args = parse_args(argv)
        report = BenchmarkComparator(args.report_a, args.report_b).compare()
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as exc:
        print(str(exc), file=sys.stderr)
        return 3

    json_output_path, markdown_output_path = resolve_report_paths(args.output)
    markdown_report = generate_markdown_report(report)

    write_report(report, json_output_path)
    write_markdown_report(markdown_report, markdown_output_path)

    print(markdown_report)
    print(f"JSON report: {json_output_path}")
    print(f"Markdown report: {markdown_output_path}")
    return int(report["summary"]["exit_code"])


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint."""
    return run_cli(argv)


def _resolve_report_path(
    *,
    flag_value: Path | None,
    positional_value: str | None,
    flag_name: str,
) -> Path:
    if flag_value is not None:
        return flag_value
    if positional_value:
        return Path(positional_value)
    raise ValueError(f"missing required benchmark report path ({flag_name} or positional argument)")


def _safe_mean(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    return float(fmean(values))


def _sample_standard_deviation(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 0.0
    return float(stdev(values))


def _coerce_int(value: object, *, field_name: str) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError as exc:
            raise ValueError(f"invalid integer value for {field_name}: {value}") from exc
    raise ValueError(f"unsupported integer value for {field_name}: {value!r}")


def _coerce_float(value: object, *, field_name: str) -> float:
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return float(int(value))
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError as exc:
            raise ValueError(f"invalid float value for {field_name}: {value}") from exc
    raise ValueError(f"unsupported float value for {field_name}: {value!r}")


def _interpret_effect_size(effect_size: float | None) -> str:
    if effect_size is None:
        return "undefined_zero_variance"

    absolute_effect = abs(effect_size)
    if absolute_effect < 0.2:
        return "negligible"
    if absolute_effect < 0.5:
        return "small"
    if absolute_effect < 0.8:
        return "medium"
    return "large"


def _format_metric_value(value: float, value_format: str) -> str:
    if value_format == "percentage":
        return f"{value * 100.0:.3f}%"
    return f"{value:.6f}"


def _format_metric_difference(value: float, value_format: str) -> str:
    if value_format == "percentage":
        return f"{value * 100.0:+.3f} pp"
    return f"{value:+.6f}"


def _format_p_value(value: float) -> str:
    if value < 0.000001:
        return "<0.000001"
    return f"{value:.6f}"


def _format_effect_size(value: float | None, interpretation: str) -> str:
    if value is None:
        return interpretation
    return f"{value:+.3f} ({interpretation})"


def _finite_or_none(value: float) -> float | None:
    if math.isfinite(value):
        return value
    return None


if __name__ == "__main__":
    raise SystemExit(main())
