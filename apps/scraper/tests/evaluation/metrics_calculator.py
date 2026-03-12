from __future__ import annotations

from dataclasses import dataclass
from typing import cast
from scrapers.ai_search.models import AISearchResult
from tests.evaluation.field_comparator import FieldComparison
from tests.evaluation.field_comparator import compare_field
from tests.evaluation.types import GroundTruthProduct

REQUIRED_FIELDS = ("product_name", "brand", "images")
OPTIONAL_FIELDS = ("description", "size_metrics", "categories")
EVALUATED_FIELDS = REQUIRED_FIELDS + OPTIONAL_FIELDS


@dataclass
class SKUMetrics:
    sku: str
    field_accuracy: float
    required_fields_success_rate: float
    is_success: bool
    missing_required_fields: list[str]
    field_comparisons: list[FieldComparison]


@dataclass
class AggregateMetrics:
    total_skus: int
    average_field_accuracy: float
    average_required_fields_success_rate: float
    overall_success_rate: float


def _has_value(field_name: str, value: object) -> bool:
    if field_name == "images":
        if not isinstance(value, list):
            return False
        return any(bool(item) for item in cast(list[object], value))

    if value is None:
        return False

    if isinstance(value, str):
        return bool(value.strip())

    return True


def _ground_truth_value(ground_truth: GroundTruthProduct, field_name: str) -> object:
    if field_name == "product_name":
        return ground_truth.name
    if field_name == "brand":
        return ground_truth.brand
    if field_name == "images":
        return ground_truth.images
    if field_name == "description":
        return ground_truth.description
    if field_name == "size_metrics":
        return ground_truth.size_metrics
    if field_name == "categories":
        return ground_truth.categories
    raise ValueError(f"unsupported field for metrics calculation: {field_name}")


def calculate_per_sku_metrics(
    extraction_result: AISearchResult,
    ground_truth: GroundTruthProduct | None,
) -> SKUMetrics:
    if ground_truth is None:
        raise ValueError("ground_truth is required to calculate metrics")

    missing_required_fields: list[str] = []

    for field_name in REQUIRED_FIELDS:
        extraction_value = getattr(extraction_result, field_name, None)
        if not _has_value(field_name, extraction_value):
            missing_required_fields.append(field_name)

    required_present = len(REQUIRED_FIELDS) - len(missing_required_fields)
    required_fields_success_rate = required_present / len(REQUIRED_FIELDS)

    field_comparisons: list[FieldComparison] = []
    for field_name in EVALUATED_FIELDS:
        expected = _ground_truth_value(ground_truth, field_name)
        actual = getattr(extraction_result, field_name, None)
        field_comparisons.append(compare_field(field_name, expected, actual))

    field_accuracy = sum(comparison.match_score for comparison in field_comparisons) / len(field_comparisons) if field_comparisons else 0.0

    return SKUMetrics(
        sku=extraction_result.sku,
        field_accuracy=field_accuracy,
        required_fields_success_rate=required_fields_success_rate,
        is_success=len(missing_required_fields) == 0,
        missing_required_fields=missing_required_fields,
        field_comparisons=field_comparisons,
    )


def calculate_aggregate_metrics(sku_metrics_list: list[SKUMetrics]) -> AggregateMetrics:
    if not sku_metrics_list:
        return AggregateMetrics(
            total_skus=0,
            average_field_accuracy=0.0,
            average_required_fields_success_rate=0.0,
            overall_success_rate=0.0,
        )

    total_skus = len(sku_metrics_list)
    average_field_accuracy = sum(metric.field_accuracy for metric in sku_metrics_list) / total_skus
    average_required_fields_success_rate = sum(metric.required_fields_success_rate for metric in sku_metrics_list) / total_skus
    overall_success_rate = sum(1 for metric in sku_metrics_list if metric.is_success) / total_skus

    return AggregateMetrics(
        total_skus=total_skus,
        average_field_accuracy=average_field_accuracy,
        average_required_fields_success_rate=average_required_fields_success_rate,
        overall_success_rate=overall_success_rate,
    )


def get_per_field_accuracy(sku_metrics_list: list[SKUMetrics]) -> dict[str, float]:
    if not sku_metrics_list:
        return {}

    field_scores: dict[str, list[float]] = {}

    for sku_metrics in sku_metrics_list:
        for comparison in sku_metrics.field_comparisons:
            field_scores.setdefault(comparison.field_name, []).append(comparison.match_score)

    return {field_name: sum(scores) / len(scores) for field_name, scores in field_scores.items() if scores}
