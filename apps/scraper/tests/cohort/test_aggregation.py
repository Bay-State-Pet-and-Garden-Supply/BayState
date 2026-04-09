# pyright: reportMissingImports=false, reportAttributeAccessIssue=false, reportUnknownArgumentType=false, reportUnknownMemberType=false, reportUnknownVariableType=false
from __future__ import annotations

import pytest

from scrapers.cohort.aggregation import CohortAggregator
from scrapers.cohort.job_processor import CohortJobResult


def test_aggregate_job_result_combines_member_results_and_metadata() -> None:
    aggregator = CohortAggregator()
    job_result = CohortJobResult(
        cohort_id="12345678",
        status="partial",
        products_processed=3,
        products_succeeded=2,
        products_failed=1,
        results={
            "sku-1": {"success": True, "results": {"brand": "Acme", "category": "Food"}},
            "sku-2": {"success": True, "results": {"brand": "Acme", "category": "Food"}},
            "sku-3": {"success": False, "error": "timeout"},
        },
        errors=["sku-3: timeout"],
        metadata={"processing_mode": "cohort", "scraper_name": "unit-test"},
    )

    result = aggregator.aggregate_job_result(job_result)

    assert result.total_products == 3
    assert result.successful_products == 2
    assert result.failed_products == 1
    assert result.brands == {"Acme"}
    assert result.categories == {"Food"}
    assert result.brand_inconsistencies == []
    assert result.category_inconsistencies == []
    assert result.metadata["job_status"] == "partial"
    assert result.metadata["job_errors"] == ["sku-3: timeout"]
    assert result.metadata["job_metadata"] == {"processing_mode": "cohort", "scraper_name": "unit-test"}
    assert result.metadata["field_summary"]["brand"]["values"] == ["Acme"]
    assert result.metadata["field_summary"]["brand"]["missing_skus"] == ["sku-3"]
    assert result.metadata["field_summary"]["category"]["values_by_sku"] == {"Food": ["sku-1", "sku-2"]}
    assert result.consistency_score == pytest.approx(0.8333, abs=1e-4)


def test_detects_brand_and_category_inconsistencies_without_failing_aggregation() -> None:
    aggregator = CohortAggregator()

    result = aggregator.aggregate(
        "cohort-1",
        {
            "sku-1": {"success": True, "results": {"brand": "Acme", "category": "Food"}},
            "sku-2": {"success": True, "results": {"brand": "Bravo", "category": "Treats"}},
        },
    )

    assert result.total_products == 2
    assert result.successful_products == 2
    assert result.failed_products == 0
    assert result.brands == {"Acme", "Bravo"}
    assert result.categories == {"Food", "Treats"}
    assert result.brand_inconsistencies[0].startswith("Brand inconsistency:")
    assert "Acme: sku-1" in result.brand_inconsistencies
    assert "Bravo: sku-2" in result.brand_inconsistencies
    assert result.category_inconsistencies[0].startswith("Category inconsistency:")
    assert "Food: sku-1" in result.category_inconsistencies
    assert "Treats: sku-2" in result.category_inconsistencies
    assert result.warnings[0].startswith("Brand inconsistency:")
    assert result.warnings[1].startswith("Category inconsistency:")
    assert result.metadata["inconsistent_fields"] == ["brand", "category"]
    assert result.consistency_score == pytest.approx(0.5)

    report = aggregator.generate_report(result)
    assert "Cohort Aggregation Report: cohort-1" in report
    assert "Brand Issues:" in report
    assert "Category Issues:" in report


def test_supports_configurable_consistency_rules_and_custom_result_paths() -> None:
    aggregator = CohortAggregator(
        consistency_rules={
            "brand": {"paths": ["payload.maker"], "score_penalty": 0.4},
            "category": {"paths": ["payload.department"], "score_penalty": 0.1},
        }
    )

    result = aggregator.aggregate(
        "custom",
        {
            "sku-1": {"payload": {"maker": "Acme", "department": "Food"}},
            "sku-2": {"payload": {"maker": "Bravo", "department": "Food"}},
        },
    )

    assert result.successful_products == 2
    assert result.failed_products == 0
    assert result.brands == {"Acme", "Bravo"}
    assert result.categories == {"Food"}
    assert result.brand_inconsistencies[0].startswith("Brand inconsistency:")
    assert result.category_inconsistencies == []
    assert result.metadata["field_summary"]["brand"]["paths"] == ["payload.maker"]
    assert result.metadata["field_summary"]["category"]["paths"] == ["payload.department"]
    assert result.metadata["field_summary"]["category"]["values_by_sku"] == {"Food": ["sku-1", "sku-2"]}
    assert result.consistency_score == pytest.approx(0.6)
