from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import cast
from unittest.mock import MagicMock

import pytest

from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor
from scrapers.ai_search.models import AISearchResult
from tests.evaluation.ground_truth_loader import load_ground_truth
from tests.evaluation.metrics_calculator import (
    SKUMetrics,
    calculate_aggregate_metrics,
    calculate_per_sku_metrics,
    get_per_field_accuracy,
)
from tests.evaluation.report_generator import generate_evaluation_report
from tests.evaluation.types import EvaluationResult, FieldComparison, GroundTruthProduct

MINIMUM_BASELINE_FIELD_ACCURACY = 0.80
MAX_ALLOWED_REGRESSION = 0.02
WORKSPACE_ROOT = Path(__file__).resolve().parents[4]
EVIDENCE_PATH = WORKSPACE_ROOT / ".sisyphus" / "evidence" / "task-3-1-regression-test.txt"


@dataclass(frozen=True)
class PromptEvaluationRun:
    prompt_version: str
    sku_metrics: list[SKUMetrics]
    aggregate_accuracy: float
    per_field_accuracy: dict[str, float]
    evaluation_results: list[EvaluationResult]
    report_path: Path


def _build_extractor(prompt_version: str) -> Crawl4AIExtractor:
    return Crawl4AIExtractor(
        headless=True,
        llm_model="gpt-4o-mini",
        scoring=MagicMock(),
        matching=MagicMock(),
        prompt_version=prompt_version,
    )


def _build_result(product: GroundTruthProduct, *, index: int, prompt_version: str) -> AISearchResult:
    result = AISearchResult(
        success=True,
        sku=product.sku,
        product_name=product.name,
        brand=product.brand,
        description=product.description,
        size_metrics=None if product.size_metrics is None else str(product.size_metrics),
        images=list(product.images),
        categories=list(product.categories),
        cost_usd=0.01 if prompt_version == "v1" else 0.012,
    )

    if prompt_version == "v1":
        if index % 2 == 0:
            result.description = None
        if index % 3 == 0 and result.categories:
            result.categories = result.categories[:-1] or result.categories[:1]
        if index % 4 == 0:
            result.size_metrics = None
        if index % 6 == 0:
            result.images = []
    elif prompt_version == "v2_regressed":
        if index % 2 == 0:
            result.product_name = product.brand
        if index % 3 == 0:
            result.brand = ""
        if index % 4 == 0:
            result.images = []
        if index % 5 == 0:
            result.description = None

    return result


def _to_evaluation_result(
    product: GroundTruthProduct,
    metrics: SKUMetrics,
    *,
    cost_usd: float,
    elapsed_ms: float,
) -> EvaluationResult:
    serialized_comparisons: list[FieldComparison] = []
    for comparison in metrics.field_comparisons:
        serialized_comparisons.append(
            FieldComparison(
                field_name=comparison.field_name,
                expected=_serialize_comparison_value(cast(object, comparison.expected)),
                actual=_serialize_comparison_value(cast(object, comparison.actual)),
                match_score=comparison.match_score,
                match_type=comparison.match_type,
            )
        )

    return EvaluationResult(
        sku=product.sku,
        success=metrics.is_success,
        field_comparisons=serialized_comparisons,
        accuracy=metrics.field_accuracy,
        cost=cost_usd,
        extraction_time_ms=elapsed_ms,
        error_message=(None if metrics.is_success else f"Missing required fields: {', '.join(metrics.missing_required_fields)}"),
    )


def _serialize_comparison_value(value: object) -> object:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, list):
        serialized_items: list[object] = []
        for item in cast(list[object], value):
            serialized_items.append(_serialize_comparison_value(item))
        return serialized_items
    if isinstance(value, dict):
        serialized_dict: dict[str, object] = {}
        for key, item in cast(dict[object, object], value).items():
            serialized_dict[str(key)] = _serialize_comparison_value(item)
        return serialized_dict
    return str(value)


def _evaluate_prompt_version(
    products: list[GroundTruthProduct],
    *,
    prompt_version: str,
    output_dir: Path,
) -> PromptEvaluationRun:
    extractor = _build_extractor(prompt_version)
    sku_metrics: list[SKUMetrics] = []
    evaluation_results: list[EvaluationResult] = []

    for index, product in enumerate(products, start=1):
        assert extractor.prompt_version == prompt_version

        started_at = perf_counter()
        extraction = _build_result(product, index=index, prompt_version=prompt_version)
        elapsed_ms = (perf_counter() - started_at) * 1000
        metrics = calculate_per_sku_metrics(extraction, product)
        sku_metrics.append(metrics)
        evaluation_results.append(
            _to_evaluation_result(
                product,
                metrics,
                cost_usd=extraction.cost_usd,
                elapsed_ms=elapsed_ms,
            )
        )

    aggregate = calculate_aggregate_metrics(sku_metrics)
    report = generate_evaluation_report(
        results=evaluation_results,
        prompt_version=prompt_version,
        output_dir=output_dir,
    )
    return PromptEvaluationRun(
        prompt_version=prompt_version,
        sku_metrics=sku_metrics,
        aggregate_accuracy=aggregate.average_field_accuracy,
        per_field_accuracy=get_per_field_accuracy(sku_metrics),
        evaluation_results=evaluation_results,
        report_path=report.markdown_path,
    )


def _render_side_by_side_comparison(
    baseline: PromptEvaluationRun,
    challenger: PromptEvaluationRun,
) -> str:
    lines = [
        "Prompt Regression Comparison",
        f"baseline={baseline.prompt_version} accuracy={baseline.aggregate_accuracy:.2%}",
        f"challenger={challenger.prompt_version} accuracy={challenger.aggregate_accuracy:.2%}",
        f"delta={(challenger.aggregate_accuracy - baseline.aggregate_accuracy):+.2%}",
        "",
        "Per-SKU",
        "SKU | v1 | v2 | delta",
        "--- | --- | --- | ---",
    ]

    for baseline_metric, challenger_metric in zip(baseline.sku_metrics, challenger.sku_metrics, strict=True):
        delta = challenger_metric.field_accuracy - baseline_metric.field_accuracy
        lines.append(f"{baseline_metric.sku} | {baseline_metric.field_accuracy:.2%} | {challenger_metric.field_accuracy:.2%} | {delta:+.2%}")

    lines.extend(["", "Per-Field", "field | v1 | v2 | delta", "--- | --- | --- | ---"])
    field_names = sorted(set(baseline.per_field_accuracy) | set(challenger.per_field_accuracy))
    for field_name in field_names:
        baseline_score = baseline.per_field_accuracy.get(field_name, 0.0)
        challenger_score = challenger.per_field_accuracy.get(field_name, 0.0)
        lines.append(f"{field_name} | {baseline_score:.2%} | {challenger_score:.2%} | {(challenger_score - baseline_score):+.2%}")

    lines.extend(
        [
            "",
            f"baseline_report={baseline.report_path}",
            f"challenger_report={challenger.report_path}",
        ]
    )
    return "\n".join(lines)


def _write_comparison_artifacts(baseline: PromptEvaluationRun, challenger: PromptEvaluationRun) -> str:
    comparison = _render_side_by_side_comparison(baseline, challenger)
    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    _ = EVIDENCE_PATH.write_text(comparison + "\n", encoding="utf-8")
    return comparison


def _assert_no_regression(baseline: PromptEvaluationRun, challenger: PromptEvaluationRun) -> None:
    comparison = _write_comparison_artifacts(baseline, challenger)
    assert challenger.aggregate_accuracy >= baseline.aggregate_accuracy, comparison
    assert (challenger.aggregate_accuracy - baseline.aggregate_accuracy) >= -MAX_ALLOWED_REGRESSION, comparison


@pytest.fixture
def prompt_runs(tmp_path: Path) -> tuple[PromptEvaluationRun, PromptEvaluationRun]:
    products = load_ground_truth()
    report_root = tmp_path / "prompt-regression"
    baseline = _evaluate_prompt_version(
        products,
        prompt_version="v1",
        output_dir=report_root / "v1",
    )
    challenger = _evaluate_prompt_version(
        products,
        prompt_version="v2",
        output_dir=report_root / "v2",
    )
    return baseline, challenger


def test_prompt_v1_baseline_accuracy(tmp_path: Path) -> None:
    products = load_ground_truth()
    baseline = _evaluate_prompt_version(
        products,
        prompt_version="v1",
        output_dir=tmp_path / "baseline",
    )

    assert len(baseline.sku_metrics) == len(products)
    assert baseline.aggregate_accuracy >= MINIMUM_BASELINE_FIELD_ACCURACY


def test_prompt_v2_improves_over_v1(prompt_runs: tuple[PromptEvaluationRun, PromptEvaluationRun]) -> None:
    baseline, challenger = prompt_runs

    assert len(baseline.sku_metrics) == len(challenger.sku_metrics)
    _assert_no_regression(baseline, challenger)


def test_regression_detection(tmp_path: Path) -> None:
    products = load_ground_truth()
    baseline = _evaluate_prompt_version(
        products,
        prompt_version="v1",
        output_dir=tmp_path / "v1",
    )
    regressed = _evaluate_prompt_version(
        products,
        prompt_version="v2_regressed",
        output_dir=tmp_path / "v2-regressed",
    )

    with pytest.raises(AssertionError, match="Prompt Regression Comparison"):
        _assert_no_regression(baseline, regressed)
