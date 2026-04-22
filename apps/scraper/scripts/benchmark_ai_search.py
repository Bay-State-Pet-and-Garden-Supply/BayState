#!/usr/bin/env python3
"""Benchmark AI Search source selection against a golden dataset."""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import sys
import time
from collections import Counter, defaultdict
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import NormalDist
from tempfile import TemporaryDirectory
from typing import Protocol, TypedDict, cast
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scrapers.ai_cost_tracker import AICostTracker
from scrapers.ai_search.candidate_resolver import CandidateResolver
from scrapers.ai_search.dataset_validator import DatasetValidator, ValidationResult
from scrapers.ai_search.fixture_search_client import CacheMissError, FixtureSearchClient
from scrapers.ai_search.models import ResolvedCandidate
from scrapers.ai_search.scoring import SearchScorer
from scrapers.ai_search.selection_pipeline import SelectionPipelineResult, run_selection_pipeline
from scrapers.ai_search.source_selector import LLMSourceSelector

DEFAULT_CACHE_DIR = ROOT / "data" / "benchmark_cache"
REPORTS_DIR = ROOT / "reports"
BASELINE_REPORT_PATH = REPORTS_DIR / "baseline.json"
REPORT_VERSION = "2.0"
UNDERPERFORMING_CATEGORY_THRESHOLD_PCT = 70.0
CATEGORY_VISUALIZATION_WIDTH = 20
CATEGORY_TREND_DELTA_ALERT_PCT = 5.0

# Serper API cost per search call (when not using fixtures)
# https://serper.dev/pricing - $0.001 per query for pay-as-you-go
SERPER_COST_PER_CALL_USD = 0.001
IGNORED_BENCHMARK_QUERY_PARAMS = {"srsltid", "fbclid", "gclid", "dclid", "mc_cid", "mc_eid"}


def canonicalize_benchmark_url(url: str | None) -> str:
    """Normalize URLs for benchmark equality and rank comparisons."""
    raw_url = str(url or "").strip()
    if not raw_url:
        return ""

    split = urlsplit(raw_url)
    filtered_query = [
        (key, value)
        for key, value in parse_qsl(split.query, keep_blank_values=True)
        if key and key.lower() not in IGNORED_BENCHMARK_QUERY_PARAMS and not key.lower().startswith("utm_")
    ]

    normalized_scheme = split.scheme.lower() or "https"
    normalized_netloc = split.netloc.lower()
    normalized_path = split.path.rstrip("/") or "/"
    normalized_query = urlencode(sorted(filtered_query))

    return urlunsplit((normalized_scheme, normalized_netloc, normalized_path, normalized_query, ""))


@dataclass(frozen=True)
class BenchmarkArgs:
    """Typed CLI arguments."""

    dataset: Path
    output: Path | None
    mode: str
    cache_dir: Path | None
    llm_model: str
    llm_provider: str
    llm_base_url: str | None
    llm_api_key: str | None


class DatasetEntryPayload(TypedDict):
    """Typed dataset entry payload."""

    query: str
    expected_source_url: str
    expected_source_tier: str
    expected_family_url: str
    expected_variant_label: str
    cohort_key: str
    category: str
    difficulty: str
    rationale: str
    brand: str
    sku: str
    product_name: str


class DatasetPayload(TypedDict):
    """Typed dataset payload."""

    version: str
    created_at: str
    provenance: dict[str, object]
    entries: list[DatasetEntryPayload]


class FixtureManifestEntry(TypedDict):
    """Typed companion fixture entry."""

    query: str
    results: list[dict[str, object]]
    html_by_url: dict[str, str]
    resolved_payload_by_url: dict[str, str]


class FixtureManifestPayload(TypedDict):
    """Typed companion fixture payload."""

    schema_version: int
    entries: list[FixtureManifestEntry]


class BenchmarkResultRow(TypedDict):
    """Per-entry benchmark report row."""

    index: int
    query: str
    expected_source_url: str
    predicted_source_url: str | None
    exact_match: bool
    score: float
    correct_rank: int | None
    reciprocal_rank: float
    precision_at_1: float
    recall_at_1: float
    duration_ms: float
    result_count: int
    mode: str
    selection_method: str
    selection_cost_usd: float
    category: str
    difficulty: str
    rationale: str
    error: str | None
    expected_source_tier: str | None
    expected_family_url: str | None
    expected_variant_label: str | None
    cohort_key: str | None
    predicted_source_tier: str | None
    predicted_family_url: str | None
    predicted_variant_label: str | None


class AccuracyConfidenceInterval(TypedDict):
    """Confidence interval for exact-match accuracy."""

    confidence_level: float
    lower_bound_pct: float
    upper_bound_pct: float
    margin_of_error_pct: float
    sample_size: int
    method: str


class BenchmarkBreakdown(TypedDict):
    """Grouped benchmark metrics for one cohort."""

    sample_size: int
    matched_examples: int
    accuracy_exact_match_pct: float
    mean_reciprocal_rank: float
    precision_at_1: float
    recall_at_1: float
    average_duration_ms: float
    error_count: int


class CategoryPerformanceTrend(TypedDict):
    """Accuracy trend for one category relative to a baseline benchmark."""

    baseline_accuracy_exact_match_pct: float | None
    current_accuracy_exact_match_pct: float
    delta_accuracy_exact_match_pct: float | None
    baseline_sample_size: int | None
    current_sample_size: int
    direction: str


class CategoryAnalysisEntry(TypedDict):
    """Detailed analysis for one category."""

    metrics: BenchmarkBreakdown
    underperforming: bool
    recommendation: str
    trend: CategoryPerformanceTrend | None
    visualization: str


class CategoryAnalysisSummary(TypedDict):
    """Per-category analysis payload for the benchmark report."""

    underperforming_threshold_pct: float
    underperforming_categories: list[str]
    comparison_visualization: str
    categories: dict[str, CategoryAnalysisEntry]


class CostBreakdown(TypedDict):
    """Cost breakdown for the benchmark report."""

    total_serper_cost_usd: float
    total_llm_selection_cost_usd: float
    total_cost_usd: float
    cost_per_success_usd: float
    serper_calls: int
    successful_extractions: int


class BenchmarkSummary(TypedDict):
    """Summary metrics for the benchmark run."""

    total_examples: int
    matched_examples: int
    accuracy_exact_match_pct: float
    mean_reciprocal_rank: float
    precision_at_1: float
    recall_at_1: float
    official_source_selection_rate_pct: float
    resolved_variant_selection_rate_pct: float
    cohort_consistency_rate_pct: float
    false_official_rate_pct: float
    accuracy_confidence_interval_95: AccuracyConfidenceInterval
    total_duration_ms: float
    average_duration_ms: float
    total_selection_cost_usd: float
    selection_breakdown: dict[str, int]
    error_count: int
    cost_breakdown: CostBreakdown


class ExecutionConfig(TypedDict):
    """Execution config recorded in the report."""

    mode: str
    cache_dir: str
    llm_model: str
    llm_provider: str
    llm_base_url: str | None


class ExecutionMetadata(TypedDict):
    """Execution metadata recorded in the report."""

    started_at: str
    completed_at: str
    duration_ms: float
    config: ExecutionConfig


class BenchmarkMetricComparison(TypedDict):
    """Comparison of one summary metric against a baseline run."""

    baseline: float
    current: float
    delta: float


class BenchmarkBaselineComparison(TypedDict):
    """Summary comparison against a baseline report."""

    baseline_path: str
    compared_at: str
    metrics: dict[str, BenchmarkMetricComparison]


class BenchmarkReport(TypedDict):
    """Top-level benchmark report."""

    report_version: str
    generated_at: str
    dataset_path: str
    mode: str
    cache_dir: str
    dataset_validation: dict[str, object]
    metadata: ExecutionMetadata
    summary: BenchmarkSummary
    category_breakdown: dict[str, BenchmarkBreakdown]
    category_analysis: CategoryAnalysisSummary
    difficulty_breakdown: dict[str, BenchmarkBreakdown]
    baseline_comparison: BenchmarkBaselineComparison | None
    results: list[BenchmarkResultRow]


class SourceSelector(Protocol):
    """Protocol for LLM-backed source selection."""

    async def select_best_url(
        self,
        results: list[dict[str, object]],
        sku: str,
        product_name: str,
        brand: str | None = None,
        preferred_domains: list[str] | None = None,
    ) -> tuple[str | None, float]: ...


class ResolverInputBuilder(Protocol):
    """Build optional resolver inputs for benchmark candidate resolution."""

    async def __call__(
        self,
        *,
        search_results: list[dict[str, object]],
        sku: str,
        brand: str | None,
        product_name: str | None,
    ) -> tuple[dict[str, str], dict[str, str]]: ...


@dataclass(frozen=True)
class BenchmarkExample:
    """One golden-dataset example."""

    index: int
    query: str
    expected_source_url: str
    category: str
    difficulty: str
    rationale: str
    brand: str | None = None
    sku: str | None = None
    product_name: str | None = None
    expected_source_tier: str | None = None
    expected_family_url: str | None = None
    expected_variant_label: str | None = None
    cohort_key: str | None = None


@dataclass(frozen=True)
class BenchmarkSelection:
    """Selected URL and selection metadata."""

    url: str | None
    selection_method: str
    selection_cost_usd: float
    ranked_results: tuple[dict[str, object], ...] = ()


@dataclass(frozen=True)
class PredictionMetadata:
    """Benchmark-only metadata for resolution quality reporting."""

    source_tier: str | None = None
    family_url: str | None = None
    variant_label: str | None = None


class MetricsCalculator:
    """Calculate benchmark metrics and grouped breakdowns."""

    _Z_SCORE: float = NormalDist().inv_cdf(0.975)

    def calculate_metrics(
        self,
        results: Sequence[BenchmarkResultRow],
        *,
        execution_duration_ms: float | None = None,
        total_serper_cost_usd: float = 0.0,
        serper_calls: int = 0,
    ) -> BenchmarkSummary:
        """Calculate top-level summary metrics for benchmark results."""
        total_examples = len(results)
        matched_examples = sum(1 for result in results if result["exact_match"])
        total_duration_ms = execution_duration_ms if execution_duration_ms is not None else sum(float(result["duration_ms"]) for result in results)
        average_duration_ms = total_duration_ms / total_examples if total_examples else 0.0
        total_selection_cost_usd = sum(float(result["selection_cost_usd"]) for result in results)
        selection_breakdown = Counter(str(result["selection_method"]) for result in results)
        error_count = sum(1 for result in results if result["error"])

        accuracy_pct = self._calculate_accuracy_pct(results)
        mean_reciprocal_rank = self._calculate_mean_reciprocal_rank(results)
        precision_at_1 = self._calculate_precision_at_1(results)
        recall_at_1 = self._calculate_recall_at_1(results)
        official_source_selection_rate_pct = self._calculate_official_source_selection_rate_pct(results)
        resolved_variant_selection_rate_pct = self._calculate_resolved_variant_selection_rate_pct(results)
        cohort_consistency_rate_pct = self._calculate_cohort_consistency_rate_pct(results)
        false_official_rate_pct = self._calculate_false_official_rate_pct(results)

        total_cost_usd = total_serper_cost_usd + total_selection_cost_usd
        cost_per_success_usd = total_cost_usd / matched_examples if matched_examples else 0.0
        cost_breakdown = CostBreakdown(
            total_serper_cost_usd=round(total_serper_cost_usd, 6),
            total_llm_selection_cost_usd=round(total_selection_cost_usd, 6),
            total_cost_usd=round(total_cost_usd, 6),
            cost_per_success_usd=round(cost_per_success_usd, 6),
            serper_calls=serper_calls,
            successful_extractions=matched_examples,
        )

        return BenchmarkSummary(
            total_examples=total_examples,
            matched_examples=matched_examples,
            accuracy_exact_match_pct=round(accuracy_pct, 3),
            mean_reciprocal_rank=round(mean_reciprocal_rank, 6),
            precision_at_1=round(precision_at_1, 6),
            recall_at_1=round(recall_at_1, 6),
            official_source_selection_rate_pct=round(official_source_selection_rate_pct, 3),
            resolved_variant_selection_rate_pct=round(resolved_variant_selection_rate_pct, 3),
            cohort_consistency_rate_pct=round(cohort_consistency_rate_pct, 3),
            false_official_rate_pct=round(false_official_rate_pct, 3),
            accuracy_confidence_interval_95=self.calculate_accuracy_confidence_interval(results),
            total_duration_ms=round(total_duration_ms, 3),
            average_duration_ms=round(average_duration_ms, 3),
            total_selection_cost_usd=round(total_selection_cost_usd, 6),
            selection_breakdown=dict(selection_breakdown),
            error_count=error_count,
            cost_breakdown=cost_breakdown,
        )

    def calculate_breakdown(self, results: Sequence[BenchmarkResultRow], field: str) -> dict[str, BenchmarkBreakdown]:
        """Calculate grouped metrics for category or difficulty fields."""
        grouped: dict[str, list[BenchmarkResultRow]] = defaultdict(list)
        for result in results:
            group_value = str(result.get(field) or "unknown")
            grouped[group_value].append(result)

        return {group_name: self._calculate_breakdown_metrics(group_results) for group_name, group_results in sorted(grouped.items())}

    def calculate_accuracy_confidence_interval(self, results: Sequence[BenchmarkResultRow]) -> AccuracyConfidenceInterval:
        """Calculate a 95% confidence interval for exact-match accuracy."""
        sample_size = len(results)
        if sample_size == 0:
            return AccuracyConfidenceInterval(
                confidence_level=0.95,
                lower_bound_pct=0.0,
                upper_bound_pct=0.0,
                margin_of_error_pct=0.0,
                sample_size=0,
                method="normal_approximation_binary_mean",
            )

        exact_match_values = [1.0 if result["exact_match"] else 0.0 for result in results]
        accuracy = sum(exact_match_values) / sample_size
        margin: float = 0.0
        if sample_size > 1:
            sample_variance: float = sum((value - accuracy) ** 2 for value in exact_match_values) / (sample_size - 1)
            sample_standard_deviation: float = math.sqrt(sample_variance)
            margin = self._Z_SCORE * (sample_standard_deviation / math.sqrt(sample_size))

        lower_bound = max(0.0, (accuracy - margin) * 100.0)
        upper_bound = min(100.0, (accuracy + margin) * 100.0)
        return AccuracyConfidenceInterval(
            confidence_level=0.95,
            lower_bound_pct=round(lower_bound, 3),
            upper_bound_pct=round(upper_bound, 3),
            margin_of_error_pct=round(margin * 100.0, 3),
            sample_size=sample_size,
            method="normal_approximation_binary_mean",
        )

    def _calculate_breakdown_metrics(self, results: Sequence[BenchmarkResultRow]) -> BenchmarkBreakdown:
        sample_size = len(results)
        matched_examples = sum(1 for result in results if result["exact_match"])
        average_duration_ms = sum(float(result["duration_ms"]) for result in results) / sample_size if sample_size else 0.0
        error_count = sum(1 for result in results if result["error"])
        return BenchmarkBreakdown(
            sample_size=sample_size,
            matched_examples=matched_examples,
            accuracy_exact_match_pct=round(self._calculate_accuracy_pct(results), 3),
            mean_reciprocal_rank=round(self._calculate_mean_reciprocal_rank(results), 6),
            precision_at_1=round(self._calculate_precision_at_1(results), 6),
            recall_at_1=round(self._calculate_recall_at_1(results), 6),
            average_duration_ms=round(average_duration_ms, 3),
            error_count=error_count,
        )

    @staticmethod
    def _calculate_accuracy_pct(results: Sequence[BenchmarkResultRow]) -> float:
        total_examples = len(results)
        if total_examples == 0:
            return 0.0
        return (sum(1 for result in results if result["exact_match"]) / total_examples) * 100.0

    @staticmethod
    def _calculate_mean_reciprocal_rank(results: Sequence[BenchmarkResultRow]) -> float:
        total_examples = len(results)
        if total_examples == 0:
            return 0.0
        return sum(float(result["reciprocal_rank"]) for result in results) / total_examples

    @staticmethod
    def _calculate_precision_at_1(results: Sequence[BenchmarkResultRow]) -> float:
        total_examples = len(results)
        if total_examples == 0:
            return 0.0
        true_positives = sum(1 for result in results if float(result["precision_at_1"]) > 0.0)
        false_positives = total_examples - true_positives
        denominator = true_positives + false_positives
        return true_positives / denominator if denominator else 0.0

    @staticmethod
    def _calculate_recall_at_1(results: Sequence[BenchmarkResultRow]) -> float:
        total_examples = len(results)
        if total_examples == 0:
            return 0.0
        true_positives = sum(1 for result in results if float(result["recall_at_1"]) > 0.0)
        false_negatives = total_examples - true_positives
        denominator = true_positives + false_negatives
        return true_positives / denominator if denominator else 0.0

    @staticmethod
    def _calculate_official_source_selection_rate_pct(results: Sequence[BenchmarkResultRow]) -> float:
        official_expected_results = [result for result in results if _is_official_tier(result.get("expected_source_tier"))]
        total_examples = len(official_expected_results)
        if total_examples == 0:
            return 0.0
        official_predictions = sum(1 for result in official_expected_results if _is_official_tier(result.get("predicted_source_tier")))
        return (official_predictions / total_examples) * 100.0

    @staticmethod
    def _calculate_resolved_variant_selection_rate_pct(results: Sequence[BenchmarkResultRow]) -> float:
        variant_expected_results = [result for result in results if _row_expects_resolved_variant(result)]
        total_examples = len(variant_expected_results)
        if total_examples == 0:
            return 0.0

        successful_variant_resolutions = sum(1 for result in variant_expected_results if _row_has_resolved_variant_match(result))
        return (successful_variant_resolutions / total_examples) * 100.0

    @staticmethod
    def _calculate_cohort_consistency_rate_pct(results: Sequence[BenchmarkResultRow]) -> float:
        cohort_results = [result for result in results if str(result.get("cohort_key") or "").strip()]
        total_examples = len(cohort_results)
        if total_examples == 0:
            return 0.0

        dominant_domain_by_cohort = _build_dominant_expected_domain_by_cohort(cohort_results)
        consistent_predictions = sum(1 for result in cohort_results if _row_matches_dominant_cohort_domain(result, dominant_domain_by_cohort))
        return (consistent_predictions / total_examples) * 100.0

    @staticmethod
    def _calculate_false_official_rate_pct(results: Sequence[BenchmarkResultRow]) -> float:
        official_expected_results = [result for result in results if _is_official_tier(result.get("expected_source_tier"))]
        total_examples = len(official_expected_results)
        if total_examples == 0:
            return 0.0

        false_official_predictions = sum(
            1
            for result in official_expected_results
            if _is_official_tier(result.get("predicted_source_tier"))
            and _normalized_url_or_none(result.get("predicted_source_url")) != _normalized_url_or_none(result.get("expected_source_url"))
        )
        return (false_official_predictions / total_examples) * 100.0


class CategoryAnalyzer:
    """Analyze per-category benchmark performance and recommendations."""

    def __init__(
        self,
        *,
        underperforming_threshold_pct: float = UNDERPERFORMING_CATEGORY_THRESHOLD_PCT,
        visualization_width: int = CATEGORY_VISUALIZATION_WIDTH,
        trend_delta_alert_pct: float = CATEGORY_TREND_DELTA_ALERT_PCT,
        metrics_calculator: MetricsCalculator | None = None,
    ) -> None:
        self._underperforming_threshold_pct: float = underperforming_threshold_pct
        self._visualization_width: int = visualization_width
        self._trend_delta_alert_pct: float = trend_delta_alert_pct
        self._metrics_calculator: MetricsCalculator = metrics_calculator or MetricsCalculator()

    def analyze_categories(
        self,
        results: Sequence[BenchmarkResultRow],
        *,
        category_breakdown: Mapping[str, BenchmarkBreakdown] | None = None,
        baseline_report: Mapping[str, object] | None = None,
    ) -> CategoryAnalysisSummary:
        """Build category-specific metrics, trends, recommendations, and CLI visualizations."""
        resolved_breakdown = category_breakdown or self._metrics_calculator.calculate_breakdown(results, field="category")
        baseline_breakdown = self._extract_baseline_category_breakdown(baseline_report)
        baseline_available = baseline_report is not None

        category_analysis: dict[str, CategoryAnalysisEntry] = {}
        underperforming_categories: list[str] = []
        for category_name, metrics in resolved_breakdown.items():
            underperforming = float(metrics["accuracy_exact_match_pct"]) < self._underperforming_threshold_pct
            trend = self._build_trend(
                metrics,
                baseline_metrics=baseline_breakdown.get(category_name),
                baseline_available=baseline_available,
            )
            recommendation = self._build_recommendation(category_name, metrics, underperforming=underperforming, trend=trend)
            visualization = self._build_visualization_line(category_name, metrics, underperforming=underperforming, trend=trend)
            category_analysis[category_name] = CategoryAnalysisEntry(
                metrics=metrics,
                underperforming=underperforming,
                recommendation=recommendation,
                trend=trend,
                visualization=visualization,
            )
            if underperforming:
                underperforming_categories.append(category_name)

        return CategoryAnalysisSummary(
            underperforming_threshold_pct=round(self._underperforming_threshold_pct, 3),
            underperforming_categories=sorted(underperforming_categories),
            comparison_visualization=self._render_comparison_visualization(category_analysis),
            categories=category_analysis,
        )

    @staticmethod
    def _extract_baseline_category_breakdown(baseline_report: Mapping[str, object] | None) -> dict[str, Mapping[str, object]]:
        if baseline_report is None:
            return {}

        raw_breakdown = baseline_report.get("category_breakdown")
        if not isinstance(raw_breakdown, Mapping):
            return {}

        extracted: dict[str, Mapping[str, object]] = {}
        for raw_category_name, raw_metrics in cast(Mapping[object, object], raw_breakdown).items():
            if isinstance(raw_category_name, str) and isinstance(raw_metrics, Mapping):
                extracted[raw_category_name] = cast(Mapping[str, object], raw_metrics)
        return extracted

    def _build_trend(
        self,
        current_metrics: BenchmarkBreakdown,
        *,
        baseline_metrics: Mapping[str, object] | None,
        baseline_available: bool,
    ) -> CategoryPerformanceTrend | None:
        if not baseline_available:
            return None

        current_accuracy = float(current_metrics["accuracy_exact_match_pct"])
        current_sample_size = int(current_metrics["sample_size"])
        if baseline_metrics is None:
            return CategoryPerformanceTrend(
                baseline_accuracy_exact_match_pct=None,
                current_accuracy_exact_match_pct=round(current_accuracy, 3),
                delta_accuracy_exact_match_pct=None,
                baseline_sample_size=None,
                current_sample_size=current_sample_size,
                direction="new",
            )

        baseline_accuracy = _coerce_float(baseline_metrics.get("accuracy_exact_match_pct"))
        baseline_sample_size = _coerce_int(baseline_metrics.get("sample_size"))
        delta_accuracy = current_accuracy - baseline_accuracy
        direction = "stable"
        if delta_accuracy >= self._trend_delta_alert_pct:
            direction = "improving"
        elif delta_accuracy <= -self._trend_delta_alert_pct:
            direction = "declining"

        return CategoryPerformanceTrend(
            baseline_accuracy_exact_match_pct=round(baseline_accuracy, 3),
            current_accuracy_exact_match_pct=round(current_accuracy, 3),
            delta_accuracy_exact_match_pct=round(delta_accuracy, 3),
            baseline_sample_size=baseline_sample_size,
            current_sample_size=current_sample_size,
            direction=direction,
        )

    def _build_recommendation(
        self,
        category_name: str,
        metrics: BenchmarkBreakdown,
        *,
        underperforming: bool,
        trend: CategoryPerformanceTrend | None,
    ) -> str:
        sample_size = int(metrics["sample_size"])
        if underperforming:
            primary = f"Prioritize category-specific source-selection tuning for {category_name} and review the missed queries manually."
        else:
            primary = f"Maintain the current ranking strategy for {category_name} and reuse its strongest source signals in adjacent categories."

        if trend is None:
            secondary = "No baseline history exists yet; save this run so future benchmarks can track category drift."
        elif trend["direction"] == "declining":
            delta = abs(float(trend["delta_accuracy_exact_match_pct"] or 0.0))
            secondary = f"Accuracy dropped {delta:.1f} points versus baseline, so compare recent prompt or heuristic changes before the next run."
        elif trend["direction"] == "improving":
            delta = float(trend["delta_accuracy_exact_match_pct"] or 0.0)
            secondary = f"Accuracy improved {delta:.1f} points versus baseline, so keep the current approach and validate it with more examples."
        elif trend["direction"] == "new":
            secondary = "This category is new in the current report, so add a few more examples to establish a stable baseline."
        else:
            secondary = "Trend is stable versus baseline, so focus on monitoring rather than broad changes."

        if sample_size < 3:
            secondary = f"{secondary} Expand the dataset for {category_name} because fewer than 3 examples makes the signal noisy."
        return f"{primary} {secondary}".strip()

    def _build_visualization_line(
        self,
        category_name: str,
        metrics: BenchmarkBreakdown,
        *,
        underperforming: bool,
        trend: CategoryPerformanceTrend | None,
    ) -> str:
        accuracy = max(0.0, min(100.0, float(metrics["accuracy_exact_match_pct"])))
        filled_width = int(round((accuracy / 100.0) * self._visualization_width))
        filled_width = max(0, min(self._visualization_width, filled_width))
        bar = ("█" * filled_width) + ("░" * (self._visualization_width - filled_width))
        status = "⚠️" if underperforming else "✅"
        trend_label = _format_category_trend_label(trend)
        matched_examples = int(metrics["matched_examples"])
        sample_size = int(metrics["sample_size"])
        return f"{status} {category_name:<16} {bar} {accuracy:6.1f}% ({matched_examples}/{sample_size}) {trend_label}"

    def _render_comparison_visualization(self, category_analysis: Mapping[str, CategoryAnalysisEntry]) -> str:
        if not category_analysis:
            return "No category data available."

        lines = [
            "Status Category          Accuracy Bar            Accuracy Trend",
            "------ ---------------- -------------------- -------- ----------------",
        ]
        for entry in category_analysis.values():
            lines.append(entry["visualization"])
        return "\n".join(lines)


def parse_args(argv: list[str] | None = None) -> BenchmarkArgs:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(description="Benchmark AI Search source selection against a golden dataset")
    default_dataset = ROOT / "data" / "golden_dataset_v2.json"
    _ = parser.add_argument(
        "--dataset", type=Path, default=default_dataset, help=f"Path to the golden dataset JSON file (default: {default_dataset.relative_to(ROOT)})"
    )
    _ = parser.add_argument("--output", type=Path, default=None, help="Optional path to write the JSON report")
    _ = parser.add_argument("--mode", choices=("heuristic", "llm"), default="heuristic", help="Source selection mode to benchmark")
    _ = parser.add_argument(
        "--cache-dir",
        type=Path,
        default=None,
        help=(
            "Optional FixtureSearchClient cache directory. When omitted, the benchmark first "
            "looks for a companion '.search_results.json' file next to --dataset and then falls "
            f"back to {DEFAULT_CACHE_DIR.relative_to(ROOT)}."
        ),
    )
    _ = parser.add_argument("--llm-model", default="gpt-4o-mini", help="LLM model to use for --mode llm")
    _ = parser.add_argument("--llm-provider", default="openai", help="LLM provider to use for --mode llm")
    _ = parser.add_argument("--llm-base-url", default=None, help="Optional LLM base URL override")
    _ = parser.add_argument("--llm-api-key", default=None, help="Optional LLM API key override")

    args = parser.parse_args(argv)
    return BenchmarkArgs(
        dataset=cast(Path, args.dataset),
        output=cast(Path | None, args.output),
        mode=cast(str, args.mode),
        cache_dir=cast(Path | None, args.cache_dir),
        llm_model=cast(str, args.llm_model),
        llm_provider=cast(str, args.llm_provider),
        llm_base_url=cast(str | None, args.llm_base_url),
        llm_api_key=cast(str | None, args.llm_api_key),
    )


class BenchmarkRunner:
    """Run fixture-backed source-selection benchmarks."""

    def __init__(
        self,
        dataset_path: Path,
        *,
        mode: str = "heuristic",
        cache_dir: Path | None = None,
        validator: DatasetValidator | None = None,
        scorer: SearchScorer | None = None,
        candidate_resolver: CandidateResolver | None = None,
        search_client: FixtureSearchClient | None = None,
        selection_pipeline: Callable[..., Awaitable[SelectionPipelineResult]] = run_selection_pipeline,
        resolver_input_builder: ResolverInputBuilder | None = None,
        selector: SourceSelector | None = None,
        metrics_calculator: MetricsCalculator | None = None,
        category_analyzer: CategoryAnalyzer | None = None,
        llm_model: str = "gpt-4o-mini",
        llm_provider: str = "openai",
        llm_base_url: str | None = None,
        llm_api_key: str | None = None,
        cost_tracker: AICostTracker | None = None,
    ) -> None:
        self.dataset_path: Path = dataset_path
        self.mode: str = mode
        self.cache_dir: Path | None = cache_dir
        self._validator: DatasetValidator = validator or DatasetValidator()
        self._scorer: SearchScorer = scorer or SearchScorer()
        self._candidate_resolver: CandidateResolver = candidate_resolver or CandidateResolver(self._scorer)
        self._search_client: FixtureSearchClient | None = search_client
        self._selection_pipeline: Callable[..., Awaitable[SelectionPipelineResult]] = selection_pipeline
        self._resolver_input_builder: ResolverInputBuilder | None = resolver_input_builder
        self._selector: SourceSelector | None = selector
        self._metrics_calculator: MetricsCalculator = metrics_calculator or MetricsCalculator()
        self._category_analyzer: CategoryAnalyzer = category_analyzer or CategoryAnalyzer(metrics_calculator=self._metrics_calculator)
        self._llm_model: str = llm_model
        self._llm_provider: str = llm_provider
        self._llm_base_url: str | None = llm_base_url
        self._llm_api_key: str | None = llm_api_key
        self._temp_cache_dir: TemporaryDirectory[str] | None = None
        self._cost_tracker: AICostTracker = cost_tracker or AICostTracker()
        self._using_fixtures: bool = True
        self._fixture_resolver_inputs_by_query: dict[str, tuple[dict[str, str], dict[str, str]]] = {}

    def validate_dataset(self) -> ValidationResult:
        """Validate the dataset file using the shared validator."""
        return self._validator.validate_file(self.dataset_path)

    def load_dataset(self) -> tuple[list[BenchmarkExample], ValidationResult]:
        """Load and validate benchmark examples."""
        validation = self.validate_dataset()
        if not validation.valid:
            error_messages = "; ".join(error.message for error in validation.errors) or "Dataset validation failed"
            raise ValueError(error_messages)

        with open(self.dataset_path, encoding="utf-8") as handle:
            payload = cast(DatasetPayload, json.load(handle))

        entries = payload["entries"]
        examples = [
            BenchmarkExample(
                index=index,
                query=entry["query"],
                expected_source_url=entry["expected_source_url"],
                category=entry["category"],
                difficulty=entry["difficulty"],
                rationale=entry["rationale"],
                brand=entry.get("brand"),
                sku=entry.get("sku"),
                product_name=entry.get("product_name"),
                expected_source_tier=entry.get("expected_source_tier"),
                expected_family_url=entry.get("expected_family_url"),
                expected_variant_label=entry.get("expected_variant_label"),
                cohort_key=entry.get("cohort_key"),
            )
            for index, entry in enumerate(entries)
        ]
        return examples, validation

    async def run(self) -> BenchmarkReport:
        """Execute the benchmark and return a JSON-serializable report."""
        examples, validation = self.load_dataset()
        search_client = self._resolve_search_client()

        started_at = datetime.now(timezone.utc)
        started = time.perf_counter()
        results: list[BenchmarkResultRow] = []
        serper_calls = 0
        total_serper_cost_usd = 0.0

        for example in examples:
            example_started = time.perf_counter()
            search_results: list[dict[str, object]] = []
            error: str | None = None
            selection = BenchmarkSelection(url=None, selection_method="none", selection_cost_usd=0.0)

            try:
                search_results, search_error = await search_client.search(example.query)
                if search_error:
                    error = search_error
                else:
                    # Track Serper API cost if not using fixtures
                    if not self._using_fixtures:
                        serper_calls += 1
                        total_serper_cost_usd += SERPER_COST_PER_CALL_USD
                    selection = await self._select_source(example, search_results)
            except CacheMissError as exc:
                error = str(exc)
            except Exception as exc:  # pragma: no cover - defensive guardrail for CLI runs
                error = str(exc)

            ranked_candidates = self._build_ranked_candidates(example, search_results, selection)
            duration_ms = (time.perf_counter() - example_started) * 1000.0
            exact_match = canonicalize_benchmark_url(selection.url) == canonicalize_benchmark_url(example.expected_source_url)
            correct_rank = self._find_rank(example.expected_source_url, ranked_candidates)
            reciprocal_rank = 1.0 / correct_rank if correct_rank else 0.0
            score = self._score_prediction(example, selection.url, ranked_candidates, search_results)
            precision_at_1 = 1.0 if exact_match else 0.0
            recall_at_1 = 1.0 if correct_rank == 1 else 0.0
            prediction_metadata = self._build_prediction_metadata(example, selection.url, ranked_candidates, exact_match=exact_match)

            results.append(
                BenchmarkResultRow(
                    index=example.index,
                    query=example.query,
                    expected_source_url=example.expected_source_url,
                    predicted_source_url=selection.url,
                    exact_match=exact_match,
                    score=round(score, 3),
                    correct_rank=correct_rank,
                    reciprocal_rank=round(reciprocal_rank, 6),
                    precision_at_1=round(precision_at_1, 6),
                    recall_at_1=round(recall_at_1, 6),
                    duration_ms=round(duration_ms, 3),
                    result_count=len(search_results),
                    mode=self.mode,
                    selection_method=selection.selection_method,
                    selection_cost_usd=round(selection.selection_cost_usd, 6),
                    category=example.category,
                    difficulty=example.difficulty,
                    rationale=example.rationale,
                    error=error,
                    expected_source_tier=example.expected_source_tier,
                    expected_family_url=example.expected_family_url,
                    expected_variant_label=example.expected_variant_label,
                    cohort_key=example.cohort_key,
                    predicted_source_tier=prediction_metadata.source_tier,
                    predicted_family_url=prediction_metadata.family_url,
                    predicted_variant_label=prediction_metadata.variant_label,
                )
            )

        total_duration_ms = (time.perf_counter() - started) * 1000.0
        completed_at = datetime.now(timezone.utc)
        summary = self._metrics_calculator.calculate_metrics(
            results,
            execution_duration_ms=total_duration_ms,
            total_serper_cost_usd=total_serper_cost_usd,
            serper_calls=serper_calls,
        )
        category_breakdown = self._metrics_calculator.calculate_breakdown(results, field="category")
        baseline_path, baseline_payload = load_baseline_payload()
        category_analysis = self._category_analyzer.analyze_categories(
            results,
            category_breakdown=category_breakdown,
            baseline_report=baseline_payload,
        )
        difficulty_breakdown = self._metrics_calculator.calculate_breakdown(results, field="difficulty")
        metadata = ExecutionMetadata(
            started_at=started_at.isoformat(),
            completed_at=completed_at.isoformat(),
            duration_ms=round(total_duration_ms, 3),
            config=ExecutionConfig(
                mode=self.mode,
                cache_dir=str(self.cache_dir or DEFAULT_CACHE_DIR),
                llm_model=self._llm_model,
                llm_provider=self._llm_provider,
                llm_base_url=self._llm_base_url,
            ),
        )

        return BenchmarkReport(
            report_version=REPORT_VERSION,
            generated_at=completed_at.isoformat(),
            dataset_path=str(self.dataset_path),
            mode=self.mode,
            cache_dir=str(self.cache_dir or DEFAULT_CACHE_DIR),
            dataset_validation=cast(dict[str, object], validation.to_dict()),
            metadata=metadata,
            summary=summary,
            category_breakdown=category_breakdown,
            category_analysis=category_analysis,
            difficulty_breakdown=difficulty_breakdown,
            baseline_comparison=load_baseline_comparison(
                summary,
                baseline_path=baseline_path,
                baseline_payload=baseline_payload,
            ),
            results=results,
        )

    async def _select_source(self, example: BenchmarkExample, search_results: list[dict[str, object]]) -> BenchmarkSelection:
        """Select the top source for one dataset example."""
        if not search_results:
            return BenchmarkSelection(url=None, selection_method="none", selection_cost_usd=0.0)

        sku = example.sku or self._infer_sku(example.query)
        product_name = self._benchmark_product_name(example)
        html_by_url, resolved_payload_by_url = await self._resolve_resolver_inputs(
            example,
            search_results=search_results,
            sku=sku,
            brand=example.brand,
            product_name=product_name,
        )
        selection_result = await self._selection_pipeline(
            search_results=search_results,
            sku=sku,
            product_name=product_name,
            brand=example.brand,
            category=example.category,
            resolver=self._candidate_resolver,
            scoring=self._scorer,
            html_by_url=html_by_url,
            resolved_payload_by_url=resolved_payload_by_url,
            selector=self._resolve_selector() if self.mode == "llm" else None,
            prefer_manufacturer=True,
            preferred_domains=None,
        )
        ranked_results = tuple(self._build_resolved_ranked_results(example, search_results, selection_result.ranked_candidates))
        selection_method = selection_result.selection_method if self.mode == "llm" else "heuristic"
        return BenchmarkSelection(
            url=selection_result.prioritized_url,
            selection_method=selection_method,
            selection_cost_usd=float(selection_result.selector_cost_usd or 0.0),
            ranked_results=ranked_results,
        )

    async def _resolve_resolver_inputs(
        self,
        example: BenchmarkExample,
        *,
        search_results: list[dict[str, object]],
        sku: str,
        brand: str | None,
        product_name: str | None,
    ) -> tuple[dict[str, str], dict[str, str]]:
        if self._resolver_input_builder is not None:
            return await self._resolver_input_builder(
                search_results=search_results,
                sku=sku,
                brand=brand,
                product_name=product_name,
            )

        fixture_inputs = self._fixture_resolver_inputs_by_query.get(str(example.query).strip())
        if fixture_inputs is None:
            return {}, {}

        html_by_url, resolved_payload_by_url = fixture_inputs
        return dict(html_by_url), dict(resolved_payload_by_url)

    def _build_resolved_ranked_results(
        self,
        example: BenchmarkExample,
        search_results: Sequence[Mapping[str, object]],
        ranked_candidates: Sequence[ResolvedCandidate],
    ) -> list[dict[str, object]]:
        if not ranked_candidates:
            return []

        sku = example.sku or self._infer_sku(example.query)
        product_name = self._benchmark_product_name(example)
        source_results_by_url = {str(result.get("url") or "").strip(): dict(result) for result in search_results if str(result.get("url") or "").strip()}
        ranked_results: list[dict[str, object]] = []
        for candidate in ranked_candidates:
            source_result = source_results_by_url.get(candidate.source_url)
            source_type = (
                self._scorer.classify_result_source(dict(source_result), sku, example.brand, product_name)
                if source_result is not None
                else candidate.source_type
            )
            score = self._scorer.score_resolved_candidate(
                candidate,
                source_result=source_result,
                sku=sku,
                brand=example.brand,
                product_name=product_name,
                category=example.category,
                prefer_manufacturer=True,
                preferred_domains=None,
            )
            ranked_results.append(
                {
                    "url": candidate.resolved_url,
                    "resolved_url": candidate.resolved_url,
                    "title": str((source_result or {}).get("title") or ""),
                    "description": str((source_result or {}).get("description") or ""),
                    "source_url": candidate.source_url,
                    "source_type": candidate.source_type,
                    "source_tier": source_type,
                    "source_domain": candidate.source_domain,
                    "family_url": candidate.family_url,
                    "resolved_variant": candidate.resolved_variant,
                    "score": float(score),
                }
            )
        return ranked_results

    def _select_with_heuristics(self, example: BenchmarkExample, search_results: list[dict[str, object]]) -> str | None:
        """Mirror AISearchScraper heuristic source selection."""
        if not search_results:
            return None

        sku = example.sku or self._infer_sku(example.query)
        brand = example.brand
        product_name = self._benchmark_product_name(example)
        strong_url = self._scorer.pick_strong_candidate_url(
            search_results=search_results,
            sku=sku,
            brand=brand,
            product_name=product_name,
            category=example.category,
            prefer_manufacturer=True,
            preferred_domains=None,
        )
        if strong_url:
            return strong_url

        ranked_results = self._scorer.prepare_search_results(
            search_results=search_results,
            sku=sku,
            brand=brand,
            product_name=product_name,
            category=example.category,
            prefer_manufacturer=True,
            preferred_domains=None,
        )
        if not ranked_results:
            return None
        return str(ranked_results[0].get("url") or "") or None

    def _build_ranked_candidates(
        self,
        example: BenchmarkExample,
        search_results: list[dict[str, object]],
        selection: BenchmarkSelection,
    ) -> list[dict[str, object]]:
        """Build the evaluated ranking order for metrics like MRR and Recall@1."""
        if selection.ranked_results:
            return self._move_url_to_front(selection.url, selection.ranked_results)

        if not search_results:
            return []

        if self.mode == "heuristic" or selection.selection_method == "heuristic_fallback":
            ranked = self._scorer.prepare_search_results(
                search_results=search_results,
                sku=example.sku or self._infer_sku(example.query),
                brand=example.brand,
                product_name=self._benchmark_product_name(example),
                category=example.category,
                prefer_manufacturer=True,
                preferred_domains=None,
            )
            return self._move_url_to_front(selection.url, ranked)

        deduped_results = self._dedupe_search_results(search_results)
        return self._move_url_to_front(selection.url, deduped_results)

    def _score_prediction(
        self,
        example: BenchmarkExample,
        predicted_url: str | None,
        ranked_candidates: Sequence[Mapping[str, object]],
        search_results: list[dict[str, object]],
    ) -> float:
        """Score the predicted URL using the shared heuristic scorer."""
        if not predicted_url:
            return 0.0

        normalized_predicted_url = canonicalize_benchmark_url(predicted_url)
        for result in ranked_candidates:
            if canonicalize_benchmark_url(str(result.get("url") or "")) != normalized_predicted_url:
                continue
            if result.get("score") is not None:
                return float(result.get("score") or 0.0)

        for result in search_results:
            if str(result.get("url") or "") != predicted_url:
                continue
            return float(
                self._scorer.score_search_result(
                    result=result,
                    sku=example.sku or self._infer_sku(example.query),
                    brand=example.brand,
                    product_name=self._benchmark_product_name(example),
                    category=example.category,
                    prefer_manufacturer=True,
                    preferred_domains=None,
                )
            )
        return 0.0

    def _build_prediction_metadata(
        self,
        example: BenchmarkExample,
        predicted_url: str | None,
        search_results: Sequence[Mapping[str, object]],
        *,
        exact_match: bool,
    ) -> PredictionMetadata:
        """Infer benchmark-only metadata for official-family reporting."""
        if not predicted_url:
            return PredictionMetadata()

        matched_result = self._find_matching_result(predicted_url, search_results)
        if matched_result is None:
            return PredictionMetadata(
                source_tier=_normalize_source_tier(example.expected_source_tier) if exact_match else None,
            )

        family_url = str(matched_result.get("family_url") or "").strip() or None
        source_tier = _normalize_source_tier(matched_result.get("source_tier") or matched_result.get("source_type"))
        if source_tier is None:
            source_tier = _normalize_source_tier(
                self._scorer.classify_result_source(
                    dict(matched_result),
                    example.sku or self._infer_sku(example.query),
                    example.brand,
                    self._benchmark_product_name(example),
                )
            )

        if family_url is None and str(matched_result.get("source_type") or "").strip() == "official_family":
            family_url = str(matched_result.get("source_url") or matched_result.get("url") or "").strip() or None

        variant_label = _extract_variant_label(matched_result)

        if source_tier is None and exact_match:
            source_tier = _normalize_source_tier(example.expected_source_tier)

        return PredictionMetadata(source_tier=source_tier, family_url=family_url, variant_label=variant_label)

    @staticmethod
    def _find_matching_result(predicted_url: str, search_results: Sequence[Mapping[str, object]]) -> Mapping[str, object] | None:
        normalized_predicted_url = canonicalize_benchmark_url(predicted_url)
        for result in search_results:
            candidate_urls = (
                result.get("url"),
                result.get("resolved_url"),
                result.get("source_url"),
                result.get("family_url"),
            )
            if any(canonicalize_benchmark_url(str(candidate_url or "")) == normalized_predicted_url for candidate_url in candidate_urls):
                return result
        return None

    @staticmethod
    def _find_rank(expected_url: str, ranked_candidates: Sequence[Mapping[str, object]]) -> int | None:
        """Find the 1-based rank of the expected URL in a ranked result list."""
        normalized_expected_url = canonicalize_benchmark_url(expected_url)
        for index, result in enumerate(ranked_candidates, start=1):
            if canonicalize_benchmark_url(str(result.get("url") or "")) == normalized_expected_url:
                return index
        return None

    @staticmethod
    def _move_url_to_front(url: str | None, results: Sequence[Mapping[str, object]]) -> list[dict[str, object]]:
        """Promote the selected URL to rank 1 while preserving remaining order."""
        promoted: list[dict[str, object]] = []
        remaining: list[dict[str, object]] = []
        for result in results:
            copied = dict(result)
            if url and str(result.get("url") or "") == url and not promoted:
                promoted.append(copied)
                continue
            remaining.append(copied)
        return promoted + remaining

    @staticmethod
    def _dedupe_search_results(search_results: Sequence[Mapping[str, object]]) -> list[dict[str, object]]:
        """Deduplicate raw search results by URL while preserving order."""
        deduped: list[dict[str, object]] = []
        seen_urls: set[str] = set()
        for result in search_results:
            url = str(result.get("url") or "").strip()
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            deduped.append(dict(result))
        return deduped

    def _resolve_search_client(self) -> FixtureSearchClient:
        """Create or reuse the fixture-backed search client."""
        if self._search_client is not None:
            return self._search_client

        if self.cache_dir is not None:
            # An explicit cache directory should win over adjacent fixture manifests.
            self._search_client = FixtureSearchClient(cache_dir=self.cache_dir, allow_real_api=False)
            self._using_fixtures = True
            return self._search_client

        companion_path = self.dataset_path.with_suffix(".search_results.json")
        if companion_path.exists():
            self._search_client = self._build_search_client_from_fixture_file(companion_path)
            self._using_fixtures = True
            return self._search_client

        self._using_fixtures = False
        self._search_client = FixtureSearchClient(cache_dir=DEFAULT_CACHE_DIR, allow_real_api=False)
        return self._search_client

    def _build_search_client_from_fixture_file(self, fixture_path: Path) -> FixtureSearchClient:
        """Materialize a temporary cache directory from a fixture manifest."""
        with open(fixture_path, encoding="utf-8") as handle:
            payload = cast(FixtureManifestPayload, json.load(handle))

        entries = payload["entries"]
        self._fixture_resolver_inputs_by_query = {}

        self._temp_cache_dir = TemporaryDirectory(prefix="ai_search_benchmark_cache_")
        client = FixtureSearchClient(cache_dir=Path(self._temp_cache_dir.name), allow_real_api=False)
        for entry in entries:
            query = entry["query"].strip()
            results = entry["results"]
            if not query:
                raise ValueError(f"Fixture manifest entry missing query/results: {fixture_path}")
            _ = client.write_cache_entry(query, [dict(result) for result in results])

            html_by_url = {
                str(url): str(html_text)
                for url, html_text in cast(Mapping[object, object], entry.get("html_by_url") or {}).items()
                if str(url).strip() and isinstance(html_text, str)
            }
            resolved_payload_by_url = {
                str(url): str(payload_text)
                for url, payload_text in cast(Mapping[object, object], entry.get("resolved_payload_by_url") or {}).items()
                if str(url).strip() and isinstance(payload_text, str)
            }
            if html_by_url or resolved_payload_by_url:
                self._fixture_resolver_inputs_by_query[query] = (html_by_url, resolved_payload_by_url)
        return client

    def _resolve_selector(self) -> SourceSelector:
        """Create or reuse the LLM selector."""
        if self._selector is None:
            self._selector = LLMSourceSelector(
                model=self._llm_model,
                provider=self._llm_provider,
                base_url=self._llm_base_url,
                api_key=self._llm_api_key,
            )
        return self._selector

    @staticmethod
    def _infer_sku(query: str) -> str:
        """Best-effort SKU extraction from SKU-first benchmark queries."""
        for token in str(query or "").split():
            normalized = token.strip().strip(",;:()[]{}")
            if any(character.isdigit() for character in normalized) and len(normalized) >= 5:
                return normalized
        return ""

    def _benchmark_product_name(self, example: BenchmarkExample) -> str:
        """Best-effort benchmark product name stripped of SKU/category noise."""
        if example.product_name:
            return example.product_name

        raw_query = str(example.query or "").strip()
        if not raw_query:
            return ""

        normalized_sku = self._scorer._matching.normalize_token_text(example.sku or self._infer_sku(raw_query))
        category_tokens = self._scorer._matching.tokenize_keywords(example.category)
        cleaned_tokens: list[str] = []
        for token in raw_query.split():
            stripped = token.strip().strip(",;:()[]{}")
            normalized = self._scorer._matching.normalize_token_text(stripped)
            if not normalized:
                continue
            if normalized_sku and normalized == normalized_sku:
                continue
            if normalized in category_tokens:
                continue
            cleaned_tokens.append(stripped)

        cleaned_name = " ".join(cleaned_tokens).strip()
        return cleaned_name or raw_query


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


def _print_console_text(text: str) -> None:
    """Print text without crashing on non-Unicode Windows consoles."""
    try:
        print(text)
    except UnicodeEncodeError:
        stdout_encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
        sanitized_text = text.encode(stdout_encoding, errors="replace").decode(stdout_encoding, errors="replace")
        print(sanitized_text)


def resolve_report_paths(output_path: Path | None = None) -> tuple[Path, Path]:
    """Resolve JSON and Markdown output paths for a benchmark run."""
    if output_path is None:
        output_path = REPORTS_DIR / f"benchmark_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    return output_path, output_path.with_suffix(".md")


def load_baseline_comparison(
    summary: BenchmarkSummary,
    baseline_path: Path | None = None,
    baseline_payload: Mapping[str, object] | None = None,
) -> BenchmarkBaselineComparison | None:
    """Compare the current summary against a saved baseline report when available."""
    resolved_baseline_path, resolved_baseline_payload = load_baseline_payload(
        baseline_path=baseline_path,
        baseline_payload=baseline_payload,
    )
    if resolved_baseline_payload is None:
        return None

    baseline_summary = resolved_baseline_payload.get("summary")
    if not isinstance(baseline_summary, dict):
        return None
    baseline_summary = cast(dict[str, object], baseline_summary)

    comparisons: dict[str, BenchmarkMetricComparison] = {}
    metric_names = (
        "accuracy_exact_match_pct",
        "mean_reciprocal_rank",
        "precision_at_1",
        "recall_at_1",
    )
    for metric_name in metric_names:
        current_value = _coerce_float(summary.get(metric_name))
        baseline_value = _coerce_float(baseline_summary.get(metric_name))
        comparisons[metric_name] = BenchmarkMetricComparison(
            baseline=round(baseline_value, 6),
            current=round(current_value, 6),
            delta=round(current_value - baseline_value, 6),
        )

    return BenchmarkBaselineComparison(
        baseline_path=str(resolved_baseline_path),
        compared_at=datetime.now(timezone.utc).isoformat(),
        metrics=comparisons,
    )


def load_baseline_payload(
    baseline_path: Path | None = None,
    baseline_payload: Mapping[str, object] | None = None,
) -> tuple[Path, Mapping[str, object] | None]:
    """Load the saved baseline report once for summary and category comparisons."""
    resolved_baseline_path = baseline_path or BASELINE_REPORT_PATH
    if baseline_payload is not None:
        return resolved_baseline_path, baseline_payload
    if not resolved_baseline_path.exists():
        return resolved_baseline_path, None

    try:
        raw_payload = cast(object, json.loads(resolved_baseline_path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        return resolved_baseline_path, None

    if not isinstance(raw_payload, dict):
        return resolved_baseline_path, None
    return resolved_baseline_path, cast(dict[str, object], raw_payload)


def generate_markdown_report(report: BenchmarkReport) -> str:
    """Render a human-readable Markdown benchmark report."""
    summary = report["summary"]
    confidence_interval = summary["accuracy_confidence_interval_95"]
    metadata = report["metadata"]
    official_source_selection_rate_pct = _coerce_float(summary.get("official_source_selection_rate_pct"))
    resolved_variant_selection_rate_pct = _coerce_float(summary.get("resolved_variant_selection_rate_pct"))
    cohort_consistency_rate_pct = _coerce_float(summary.get("cohort_consistency_rate_pct"))
    false_official_rate_pct = _coerce_float(summary.get("false_official_rate_pct"))

    lines = [
        "# AI Search Benchmark Report",
        "",
        "## Execution Metadata",
        "",
        f"- Generated: {report['generated_at']}",
        f"- Dataset: `{report['dataset_path']}`",
        f"- Mode: `{report['mode']}`",
        f"- Duration: {summary['total_duration_ms']:.3f} ms",
        f"- Cache Dir: `{report['cache_dir']}`",
        f"- LLM Config: `{metadata['config']['llm_provider']}/{metadata['config']['llm_model']}`",
        "",
        "## Summary Metrics",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| Total Examples | {summary['total_examples']} |",
        f"| Matched Examples | {summary['matched_examples']} |",
        f"| Accuracy (Exact Match %) | {summary['accuracy_exact_match_pct']:.3f} |",
        f"| Mean Reciprocal Rank | {summary['mean_reciprocal_rank']:.6f} |",
        f"| Precision@1 | {summary['precision_at_1']:.6f} |",
        f"| Recall@1 | {summary['recall_at_1']:.6f} |",
        f"| Official Source Selection Rate (%) | {official_source_selection_rate_pct:.3f} |",
        f"| Resolved Variant Selection Rate (%) | {resolved_variant_selection_rate_pct:.3f} |",
        f"| Cohort Consistency Rate (%) | {cohort_consistency_rate_pct:.3f} |",
        f"| False Official Rate (%) | {false_official_rate_pct:.3f} |",
        f"| Accuracy 95% CI | {confidence_interval['lower_bound_pct']:.3f}% - {confidence_interval['upper_bound_pct']:.3f}% |",
        f"| Average Duration (ms) | {summary['average_duration_ms']:.3f} |",
        f"| Error Count | {summary['error_count']} |",
        "",
        ## Cost Summary",
        "",
        f"- Total Serper Cost: ${summary['cost_breakdown']['total_serper_cost_usd']:.6f}",
        f"- Total LLM Selection Cost: ${summary['cost_breakdown']['total_llm_selection_cost_usd']:.6f}",
        f"- Total Cost: ${summary['cost_breakdown']['total_cost_usd']:.6f}",
        f"- Cost per Success: ${summary['cost_breakdown']['cost_per_success_usd']:.6f}",
        f"- Serper API Calls: {summary['cost_breakdown']['serper_calls']}",
        "",
    ]

    baseline_comparison = report.get("baseline_comparison")
    if baseline_comparison:
        lines.extend(
            [
                "## Baseline Comparison",
                "",
                f"Baseline: `{baseline_comparison['baseline_path']}`",
                "",
                "| Metric | Baseline | Current | Delta |",
                "| --- | --- | --- | --- |",
            ]
        )
        for metric_name, values in baseline_comparison["metrics"].items():
            lines.append(f"| {metric_name} | {values['baseline']:.6f} | {values['current']:.6f} | {values['delta']:+.6f} |")
        lines.append("")

    lines.extend(_render_breakdown_section("Category Breakdown", report["category_breakdown"]))
    lines.extend(_render_category_analysis_section(report["category_analysis"]))
    lines.extend(_render_category_visualization_section(report["category_analysis"]))
    lines.extend(_render_breakdown_section("Difficulty Breakdown", report["difficulty_breakdown"]))
    lines.extend(
        [
            "## Per-Example Results",
            "",
            "| # | Query | Expected | Actual | Score | Rank | Time (ms) | Match |",
            "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
    )
    for result in report["results"]:
        lines.append(
            "| {index} | {query} | {expected} | {actual} | {score:.3f} | {rank} | {duration:.3f} | {match} |".format(
                index=result["index"],
                query=_truncate_markdown(str(result["query"]), 48),
                expected=_truncate_markdown(str(result["expected_source_url"]), 56),
                actual=_truncate_markdown(str(result["predicted_source_url"] or "—"), 56),
                score=float(result["score"]),
                rank=result["correct_rank"] if result["correct_rank"] is not None else "—",
                duration=float(result["duration_ms"]),
                match="✅" if result["exact_match"] else "❌",
            )
        )

    return "\n".join(lines).rstrip() + "\n"


def _render_breakdown_section(title: str, breakdown: Mapping[str, BenchmarkBreakdown]) -> list[str]:
    lines = [
        f"## {title}",
        "",
        "| Group | Samples | Accuracy % | MRR | Precision@1 | Recall@1 | Avg Time (ms) | Errors |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for group_name, metrics in breakdown.items():
        lines.append(
            "| {group} | {samples} | {accuracy:.3f} | {mrr:.6f} | {precision:.6f} | {recall:.6f} | {duration:.3f} | {errors} |".format(
                group=_truncate_markdown(group_name, 32),
                samples=metrics["sample_size"],
                accuracy=float(metrics["accuracy_exact_match_pct"]),
                mrr=float(metrics["mean_reciprocal_rank"]),
                precision=float(metrics["precision_at_1"]),
                recall=float(metrics["recall_at_1"]),
                duration=float(metrics["average_duration_ms"]),
                errors=metrics["error_count"],
            )
        )
    lines.append("")
    return lines


def _render_category_analysis_section(category_analysis: CategoryAnalysisSummary) -> list[str]:
    threshold = float(category_analysis["underperforming_threshold_pct"])
    underperforming_categories = category_analysis["underperforming_categories"]
    underperforming_value = ", ".join(underperforming_categories) if underperforming_categories else "None"
    lines = [
        "## Category Analysis",
        "",
        f"- Underperforming threshold: < {threshold:.3f}% exact-match accuracy",
        f"- Underperforming categories: {underperforming_value}",
        "",
        "| Category | Samples | Accuracy % | Status | Trend vs Baseline | Recommendation |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for category_name, details in category_analysis["categories"].items():
        metrics = details["metrics"]
        lines.append(
            "| {category} | {samples} | {accuracy:.3f} | {status} | {trend} | {recommendation} |".format(
                category=_truncate_markdown(category_name, 24),
                samples=int(metrics["sample_size"]),
                accuracy=float(metrics["accuracy_exact_match_pct"]),
                status="⚠️ Underperforming" if details["underperforming"] else "✅ Healthy",
                trend=_truncate_markdown(_format_category_trend_label(details["trend"]), 40),
                recommendation=_truncate_markdown(details["recommendation"], 96),
            )
        )
    lines.append("")
    return lines


def _render_category_visualization_section(category_analysis: CategoryAnalysisSummary) -> list[str]:
    return [
        "## Category Comparison Visualization",
        "",
        "```text",
        category_analysis["comparison_visualization"],
        "```",
        "",
    ]


def _truncate_markdown(value: str, limit: int) -> str:
    """Trim Markdown cell content to keep generated tables readable."""
    normalized = " ".join(str(value or "").split()).replace("|", "\\|")
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 1].rstrip() + "…"


def _normalize_source_tier(value: object) -> str | None:
    """Collapse source-type variants into stable benchmark tiers."""
    normalized = str(value or "").strip().lower()
    if not normalized:
        return None
    if normalized.startswith("official"):
        return "official"
    if "retailer" in normalized:
        return "retailer"
    if normalized.startswith("marketplace"):
        return "marketplace"
    return normalized


def _is_official_tier(value: object) -> bool:
    return _normalize_source_tier(value) == "official"


def _normalized_url_or_none(value: object) -> str | None:
    normalized = canonicalize_benchmark_url(str(value or ""))
    return normalized or None


def _normalized_text_or_none(value: object) -> str | None:
    normalized = " ".join(str(value or "").strip().lower().split())
    return normalized or None


def _normalized_domain_or_none(value: object) -> str | None:
    normalized_url = _normalized_url_or_none(value)
    if not normalized_url:
        return None

    netloc = urlsplit(normalized_url).netloc.strip().lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    return netloc or None


def _extract_variant_label(result: Mapping[str, object]) -> str | None:
    resolved_variant = result.get("resolved_variant") if isinstance(result.get("resolved_variant"), Mapping) else None
    candidate_values = (
        (resolved_variant or {}).get("label"),
        (resolved_variant or {}).get("variant_label"),
        (resolved_variant or {}).get("name"),
        (resolved_variant or {}).get("variant_name"),
        result.get("variant_label"),
    )
    for value in candidate_values:
        normalized = str(value or "").strip()
        if normalized:
            return normalized
    return None


def _row_expects_resolved_variant(result: Mapping[str, object]) -> bool:
    return _normalize_source_tier(result.get("expected_source_tier")) == "official" and bool(_normalized_text_or_none(result.get("expected_variant_label")))


def _row_has_resolved_variant_match(result: Mapping[str, object]) -> bool:
    if not _row_expects_resolved_variant(result):
        return False
    if not _is_official_tier(result.get("predicted_source_tier")):
        return False

    expected_family_url = _normalized_url_or_none(result.get("expected_family_url"))
    predicted_family_url = _normalized_url_or_none(result.get("predicted_family_url"))
    if expected_family_url and predicted_family_url != expected_family_url:
        return False

    expected_variant_label = _normalized_text_or_none(result.get("expected_variant_label"))
    predicted_variant_label = _normalized_text_or_none(result.get("predicted_variant_label"))
    if predicted_variant_label:
        return predicted_variant_label == expected_variant_label

    return bool(result.get("exact_match"))


def _build_dominant_expected_domain_by_cohort(results: Sequence[Mapping[str, object]]) -> dict[str, str]:
    grouped_expected_domains: dict[str, Counter[str]] = defaultdict(Counter)
    for result in results:
        cohort_key = str(result.get("cohort_key") or "").strip()
        expected_domain = _normalized_domain_or_none(result.get("expected_source_url"))
        if cohort_key and expected_domain:
            grouped_expected_domains[cohort_key][expected_domain] += 1

    dominant_domain_by_cohort: dict[str, str] = {}
    for cohort_key, domain_counts in grouped_expected_domains.items():
        dominant_domain, _count = sorted(domain_counts.items(), key=lambda item: (-item[1], item[0]))[0]
        dominant_domain_by_cohort[cohort_key] = dominant_domain
    return dominant_domain_by_cohort


def _row_matches_dominant_cohort_domain(result: Mapping[str, object], dominant_domain_by_cohort: Mapping[str, str]) -> bool:
    cohort_key = str(result.get("cohort_key") or "").strip()
    if not cohort_key:
        return False

    dominant_expected_domain = dominant_domain_by_cohort.get(cohort_key)
    if not dominant_expected_domain:
        return False

    predicted_domain = _normalized_domain_or_none(result.get("predicted_source_url"))
    return predicted_domain == dominant_expected_domain


def _coerce_float(value: object) -> float:
    """Best-effort float coercion for baseline comparisons."""
    if isinstance(value, bool):
        return float(int(value))
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return 0.0
    return 0.0


def _coerce_int(value: object) -> int:
    """Best-effort int coercion for cached baseline payloads."""
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(float(value.strip()))
        except ValueError:
            return 0
    return 0


def _format_category_trend_label(trend: CategoryPerformanceTrend | None) -> str:
    """Format category trend data for tables and CLI visualizations."""
    if trend is None:
        return "No baseline"
    direction = trend["direction"]
    if direction == "new":
        return "New category"

    delta = float(trend["delta_accuracy_exact_match_pct"] or 0.0)
    if direction == "improving":
        return f"↑ +{delta:.1f} pts"
    if direction == "declining":
        return f"↓ {delta:.1f} pts"
    return f"→ {delta:+.1f} pts"


def run_cli(argv: list[str] | None = None) -> int:
    """Run the benchmark CLI."""
    try:
        args = parse_args(argv)
        runner = BenchmarkRunner(
            dataset_path=args.dataset,
            mode=args.mode,
            cache_dir=args.cache_dir,
            llm_model=args.llm_model,
            llm_provider=args.llm_provider,
            llm_base_url=args.llm_base_url,
            llm_api_key=args.llm_api_key,
        )
        report = asyncio.run(runner.run())
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    json_output_path, markdown_output_path = resolve_report_paths(args.output)
    markdown_report = generate_markdown_report(report)

    write_report(report, json_output_path)
    write_markdown_report(markdown_report, markdown_output_path)

    _print_console_text(markdown_report)
    print(f"JSON report: {json_output_path}")
    print(f"Markdown report: {markdown_output_path}")
    return 0


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint."""
    return run_cli(argv)


if __name__ == "__main__":
    raise SystemExit(main())
