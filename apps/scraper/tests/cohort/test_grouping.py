# pyright: reportMissingImports=false, reportAttributeAccessIssue=false, reportUnknownVariableType=false, reportUnknownMemberType=false, reportUnknownArgumentType=false
from __future__ import annotations

from time import perf_counter

from scrapers.cohort.grouping import CohortGroupingConfig, get_cohort_summary, group_products_into_cohorts


def test_groups_products_by_prefix() -> None:
    products = [
        {"id": "a", "sku": "123456789012"},
        {"id": "b", "sku": "123456789098"},
        {"id": "c", "sku": "987654321012"},
        {"id": "d", "sku": "987654321098"},
        {"id": "e", "sku": "111122223335"},
    ]

    result = group_products_into_cohorts(products)

    assert sorted(result.cohorts) == ["11112222", "12345678", "98765432"]
    assert [product["id"] for product in result.cohorts["12345678"]] == ["a", "b"]
    assert [product["id"] for product in result.cohorts["98765432"]] == ["c", "d"]
    assert result.statistics["cohort_count"] == 3
    assert result.statistics["valid_products"] == 5
    assert result.statistics["invalid_products"] == 0


def test_handles_mixed_valid_upc_lengths() -> None:
    products = [
        {"id": "gtin8", "sku": "01234572"},
        {"id": "gtin12", "sku": "123456789012"},
        {"id": "gtin13", "sku": "5901234123457"},
        {"id": "gtin14", "sku": "14999999999996"},
    ]

    result = group_products_into_cohorts(products)

    assert sorted(result.cohorts) == ["01234572", "12345678", "14999999", "59012341"]
    assert result.statistics["valid_products"] == 4


def test_filters_invalid_upcs_and_collects_warnings() -> None:
    products = [
        {"id": "valid", "sku": "072705115815"},
        {"id": "bad-check", "sku": "072705115812"},
        {"id": "missing", "sku": None},
        {"id": "alpha", "sku": "ABC12345"},
    ]

    result = group_products_into_cohorts(products)

    assert result.cohorts == {"07270511": [{"id": "valid", "sku": "072705115815"}]}
    assert [product["id"] for product in result.invalid_products] == ["bad-check", "missing", "alpha"]
    assert result.statistics["invalid_products"] == 3
    assert result.statistics["warnings_count"] == 3
    assert any("Invalid UPC skipped" in warning for warning in result.warnings)
    assert any("missing UPC/SKU" in warning for warning in result.warnings)


def test_can_keep_invalid_but_numeric_upcs_when_configured() -> None:
    products = [
        {"id": "valid", "sku": "072705115815"},
        {"id": "short", "sku": "1234567"},
        {"id": "bad-check", "sku": "072705115812"},
        {"id": "alpha", "sku": "ABC12345"},
    ]

    result = group_products_into_cohorts(
        products,
        CohortGroupingConfig(skip_invalid_upcs=False),
    )

    assert sorted(result.cohorts) == ["07270511", "1234567"]
    assert [product["id"] for product in result.cohorts["07270511"]] == ["valid", "bad-check"]
    assert [product["id"] for product in result.invalid_products] == ["alpha"]
    assert result.statistics["valid_products"] == 3


def test_splits_large_cohorts_to_respect_max_size() -> None:
    products = [{"id": str(index), "sku": f"12345678{index:04d}"} for index in range(150)]

    result = group_products_into_cohorts(
        products,
        CohortGroupingConfig(max_cohort_size=50, skip_invalid_upcs=False),
    )

    assert sorted(result.cohorts) == ["12345678::1", "12345678::2", "12345678::3"]
    assert [len(group) for group in result.cohorts.values()] == [50, 50, 50]
    assert result.statistics["split_cohorts"] == 1
    assert result.statistics["max_cohort_size"] == 50


def test_skips_cohorts_below_minimum_size() -> None:
    products = [
        {"id": "a", "sku": "123456789012"},
        {"id": "b", "sku": "123456789098"},
        {"id": "c", "sku": "999999999993"},
    ]

    result = group_products_into_cohorts(products, CohortGroupingConfig(min_cohort_size=2))

    assert result.cohorts == {"12345678": [{"id": "a", "sku": "123456789012"}, {"id": "b", "sku": "123456789098"}]}
    assert result.statistics["skipped_small_cohorts"] == 1
    assert result.statistics["ungrouped_products"] == 1


def test_handles_empty_product_list() -> None:
    result = group_products_into_cohorts([])

    assert result.cohorts == {}
    assert result.invalid_products == []
    assert result.warnings == []
    assert result.statistics == {
        "total_products": 0,
        "valid_products": 0,
        "invalid_products": 0,
        "grouped_products": 0,
        "ungrouped_products": 0,
        "cohort_count": 0,
        "avg_cohort_size": 0.0,
        "min_cohort_size": 0,
        "max_cohort_size": 0,
        "largest_raw_cohort_size": 0,
        "warnings_count": 0,
        "skipped_small_cohorts": 0,
        "split_cohorts": 0,
        "cohort_sizes": {},
    }


def test_handles_single_product() -> None:
    product = {"id": "only", "sku": "072705115815"}

    result = group_products_into_cohorts([product])

    assert result.cohorts == {"07270511": [product]}
    assert result.statistics["avg_cohort_size"] == 1.0
    assert result.statistics["min_cohort_size"] == 1
    assert result.statistics["max_cohort_size"] == 1


def test_all_same_prefix_stays_in_single_cohort() -> None:
    products = [
        {"id": "a", "sku": "123456780000"},
        {"id": "b", "sku": "123456780001"},
        {"id": "c", "sku": "123456780002"},
    ]

    result = group_products_into_cohorts(products, CohortGroupingConfig(skip_invalid_upcs=False))

    assert result.cohorts == {"12345678": products}
    assert result.statistics["cohort_count"] == 1


def test_summary_reports_key_statistics() -> None:
    result = group_products_into_cohorts(
        [
            {"id": "valid", "sku": "072705115815"},
            {"id": "invalid", "sku": "bad-upc"},
        ]
    )

    summary = get_cohort_summary(result)

    assert "Cohort Grouping Summary:" in summary
    assert "Total products: 2" in summary
    assert "Valid products: 1" in summary
    assert "Invalid products: 1" in summary
    assert "Warnings: 1" in summary


def test_groups_large_dataset_under_one_second() -> None:
    products = [{"id": str(index), "sku": f"{10000000 + (index % 100):08d}{index:04d}"} for index in range(10_000)]

    started = perf_counter()
    result = group_products_into_cohorts(products, CohortGroupingConfig(skip_invalid_upcs=False))
    duration = perf_counter() - started

    assert duration < 1.0
    assert result.statistics["cohort_count"] == 100
    assert result.statistics["grouped_products"] == 10_000
