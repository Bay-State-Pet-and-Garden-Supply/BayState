import pytest

from scrapers.ai_search.models import AISearchResult
from tests.evaluation.metrics_calculator import calculate_aggregate_metrics
from tests.evaluation.metrics_calculator import calculate_per_sku_metrics
from tests.evaluation.metrics_calculator import get_per_field_accuracy
from tests.evaluation.types import GroundTruthProduct


def _build_ground_truth() -> GroundTruthProduct:
    return GroundTruthProduct(
        sku="032247886598",
        brand="Scotts",
        name="Scotts Mulch",
        description="A premium mulch product",
        size_metrics=None,
        images=["http://example.com/img.jpg"],
        categories=["Garden", "Mulch"],
        price=4.99,
    )


def test_calculate_per_sku_metrics_requires_ground_truth():
    extraction = AISearchResult(success=True, sku="032247886598")

    with pytest.raises(ValueError, match="ground_truth is required"):
        _ = calculate_per_sku_metrics(extraction, None)


def test_calculate_per_sku_metrics_marks_success_when_all_required_fields_present():
    ground_truth = _build_ground_truth()
    extraction = AISearchResult(
        success=True,
        sku=ground_truth.sku,
        product_name=ground_truth.name,
        brand=ground_truth.brand,
        description=ground_truth.description,
        images=["http://example.com/img.jpg"],
        categories=["Garden", "Mulch"],
    )

    metrics = calculate_per_sku_metrics(extraction, ground_truth)

    assert metrics.is_success is True
    assert metrics.missing_required_fields == []
    assert metrics.required_fields_success_rate == 1.0
    assert metrics.field_accuracy == 1.0


def test_calculate_per_sku_metrics_tracks_missing_required_fields_only():
    ground_truth = _build_ground_truth()
    extraction = AISearchResult(
        success=True,
        sku=ground_truth.sku,
        product_name=ground_truth.name,
        brand=None,
        description=None,
        images=[],
        categories=None,
    )

    metrics = calculate_per_sku_metrics(extraction, ground_truth)

    assert metrics.is_success is False
    assert metrics.missing_required_fields == ["brand", "images"]
    assert abs(metrics.required_fields_success_rate - (1.0 / 3.0)) < 1e-9


def test_optional_fields_do_not_affect_success_rate():
    ground_truth = _build_ground_truth()
    extraction = AISearchResult(
        success=True,
        sku=ground_truth.sku,
        product_name=ground_truth.name,
        brand=ground_truth.brand,
        description=None,
        images=["http://example.com/img.jpg"],
        categories=[],
    )

    metrics = calculate_per_sku_metrics(extraction, ground_truth)

    assert metrics.is_success is True
    assert metrics.required_fields_success_rate == 1.0
    assert metrics.field_accuracy < 1.0


def test_calculate_aggregate_metrics_returns_expected_averages():
    ground_truth = _build_ground_truth()
    good_extraction = AISearchResult(
        success=True,
        sku=ground_truth.sku,
        product_name=ground_truth.name,
        brand=ground_truth.brand,
        description=ground_truth.description,
        images=["http://example.com/img.jpg"],
        categories=["Garden", "Mulch"],
    )
    weak_extraction = AISearchResult(
        success=True,
        sku=ground_truth.sku,
        product_name=ground_truth.name,
        brand="",
        description=None,
        images=[],
        categories=[],
    )

    good_metrics = calculate_per_sku_metrics(good_extraction, ground_truth)
    weak_metrics = calculate_per_sku_metrics(weak_extraction, ground_truth)
    aggregate = calculate_aggregate_metrics([good_metrics, weak_metrics])

    assert aggregate.total_skus == 2
    assert abs(aggregate.average_field_accuracy - ((good_metrics.field_accuracy + weak_metrics.field_accuracy) / 2)) < 1e-9
    assert abs(aggregate.average_required_fields_success_rate - ((1.0 + (1.0 / 3.0)) / 2)) < 1e-9
    assert aggregate.overall_success_rate == 0.5


def test_get_per_field_accuracy_returns_breakdown_for_each_field():
    ground_truth = _build_ground_truth()
    best = AISearchResult(
        success=True,
        sku=ground_truth.sku,
        product_name=ground_truth.name,
        brand=ground_truth.brand,
        description=ground_truth.description,
        images=["http://example.com/img.jpg"],
        categories=["Garden", "Mulch"],
    )
    weaker = AISearchResult(
        success=True,
        sku=ground_truth.sku,
        product_name="Scotts",
        brand="Wrong Brand",
        description="",
        images=[],
        categories=["Garden"],
    )

    sku_metrics = [
        calculate_per_sku_metrics(best, ground_truth),
        calculate_per_sku_metrics(weaker, ground_truth),
    ]
    per_field = get_per_field_accuracy(sku_metrics)

    assert set(per_field.keys()) == {
        "product_name",
        "brand",
        "images",
        "description",
        "size_metrics",
        "categories",
    }
    assert per_field["brand"] < 1.0
    assert per_field["size_metrics"] == 1.0
