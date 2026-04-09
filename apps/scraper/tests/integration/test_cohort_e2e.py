# pyright: reportMissingImports=false, reportUnknownMemberType=false, reportUntypedFunctionDecorator=false
from __future__ import annotations

import pytest

from scrapers.cohort.aggregation import CohortAggregator
from scrapers.cohort.grouping import CohortGroupingConfig
from scrapers.cohort.job_processor import BrowserProtocol, CohortJobProcessor


class _FakeBrowser:
    def __init__(self) -> None:
        self.quit_calls: int = 0

    def quit(self) -> None:
        self.quit_calls += 1


class _FakeExecutor:
    def __init__(
        self,
        responses: dict[str, dict[str, object]],
        failures: set[str] | None = None,
    ) -> None:
        self.browser: BrowserProtocol | None = None
        self.responses: dict[str, dict[str, object]] = responses
        self.failures: set[str] = failures or set()
        self.initialize_calls: int = 0
        self.execute_calls: list[dict[str, object]] = []

    async def initialize(self) -> None:
        self.initialize_calls += 1
        self.browser = _FakeBrowser()

    async def execute_workflow(
        self,
        context: dict[str, object] | None = None,
        quit_browser: bool = True,
    ) -> dict[str, object]:
        assert self.browser is not None

        payload = context or {}
        sku = str(payload.get("sku") or "")
        self.execute_calls.append(
            {
                "sku": sku,
                "quit_browser": quit_browser,
                "browser": self.browser,
                "context": payload,
            }
        )

        if sku in self.failures:
            raise RuntimeError(f"source timeout for {sku}")

        result = self.responses.get(sku)
        if result is None:
            raise AssertionError(f"Missing fake response for {sku}")

        return {
            "success": True,
            "results": result,
        }


@pytest.mark.anyio
async def test_cohort_pipeline_processes_multiple_product_lines_end_to_end() -> None:
    products = [
        {"sku": "111111110001", "product_name": "Acme Chicken Kibble 5 lb", "brand": "Acme", "category": "Dog > Food"},
        {"sku": "111111110002", "product_name": "Acme Chicken Kibble 15 lb", "brand": "Acme", "category": "Dog > Food"},
        {"sku": "222222220001", "product_name": "GardenPro Finch Seed 5 lb", "brand": "GardenPro", "category": "Bird > Seed"},
        {"sku": "222222220002", "product_name": "GardenPro Finch Seed 20 lb", "brand": "GardenPro", "category": "Bird > Seed"},
    ]
    executor = _FakeExecutor(
        {
            "111111110001": {"brand": "Acme", "category": "Dog > Food", "title": "Acme Chicken Kibble 5 lb"},
            "111111110002": {"brand": "Acme", "category": "Dog > Food", "title": "Acme Chicken Kibble 15 lb"},
            "222222220001": {"brand": "GardenPro", "category": "Bird > Seed", "title": "GardenPro Finch Seed 5 lb"},
            "222222220002": {"brand": "WildHarvest", "category": "Bird > Seed", "title": "GardenPro Finch Seed 20 lb"},
        }
    )
    processor = CohortJobProcessor(executor, CohortGroupingConfig(skip_invalid_upcs=False))

    job_results = await processor.process_products(products, {"name": "cohort-e2e"}, mode="auto")

    assert sorted(job_results) == ["11111111", "22222222"]
    assert executor.initialize_calls == 1
    assert executor.browser is not None
    browser = cast_browser(executor.browser)
    assert browser.quit_calls == 1
    assert all(call["quit_browser"] is False for call in executor.execute_calls)
    assert {id(cast_browser(call["browser"])) for call in executor.execute_calls} == {id(browser)}

    aggregator = CohortAggregator()
    acme_result = aggregator.aggregate_job_result(job_results["11111111"])
    seed_result = aggregator.aggregate_job_result(job_results["22222222"])

    assert acme_result.total_products == 2
    assert acme_result.successful_products == 2
    assert acme_result.failed_products == 0
    assert acme_result.brand_inconsistencies == []
    assert acme_result.category_inconsistencies == []
    assert acme_result.consistency_score == pytest.approx(1.0)
    assert acme_result.metadata["job_metadata"] == {
        "processing_mode": "cohort",
        "scraper_name": "cohort-e2e",
        "product_skus": ["111111110001", "111111110002"],
        "cohort_key": "11111111",
        "grouping_strategy": "upc_prefix",
        "product_count": 2,
        "common_brands": ["Acme"],
        "common_categories": ["Dog > Food"],
        "upc_prefix": "11111111",
    }

    assert seed_result.total_products == 2
    assert seed_result.successful_products == 2
    assert seed_result.failed_products == 0
    assert seed_result.brands == {"GardenPro", "WildHarvest"}
    assert seed_result.brand_inconsistencies[0].startswith("Brand inconsistency:")
    assert "GardenPro: 222222220001" in seed_result.brand_inconsistencies
    assert "WildHarvest: 222222220002" in seed_result.brand_inconsistencies
    assert seed_result.category_inconsistencies == []
    assert seed_result.consistency_score == pytest.approx(0.7)
    assert seed_result.metadata["job_status"] == "success"
    assert seed_result.metadata["job_metadata"] == {
        "processing_mode": "cohort",
        "scraper_name": "cohort-e2e",
        "product_skus": ["222222220001", "222222220002"],
        "cohort_key": "22222222",
        "grouping_strategy": "upc_prefix",
        "product_count": 2,
        "common_brands": ["GardenPro"],
        "common_categories": ["Bird > Seed"],
        "upc_prefix": "22222222",
    }
    assert "Cohort Aggregation Report: 22222222" in aggregator.generate_report(seed_result)


@pytest.mark.anyio
async def test_cohort_pipeline_preserves_partial_failures_and_reports_them() -> None:
    executor = _FakeExecutor(
        {
            "333333330001": {"brand": "Acme", "category": "Dog > Toys", "title": "Acme Tug Toy"},
            "333333330002": {"brand": "Acme", "category": "Dog > Toys", "title": "Acme Tug Toy XL"},
        },
        failures={"333333330002"},
    )
    processor = CohortJobProcessor(executor, CohortGroupingConfig(skip_invalid_upcs=False))

    job_result = await processor.process_cohort(
        "33333333",
        [
            {"sku": "333333330001", "product_name": "Acme Tug Toy", "brand": "Acme", "category": "Dog > Toys"},
            {"sku": "333333330002", "product_name": "Acme Tug Toy XL", "brand": "Acme", "category": "Dog > Toys"},
        ],
        {"name": "cohort-error-e2e"},
    )

    assert job_result.status == "partial"
    assert job_result.products_processed == 2
    assert job_result.products_succeeded == 1
    assert job_result.products_failed == 1
    assert job_result.results["333333330001"] == {
        "success": True,
        "results": {"brand": "Acme", "category": "Dog > Toys", "title": "Acme Tug Toy"},
    }
    assert job_result.results["333333330002"] == {
        "success": False,
        "error": "source timeout for 333333330002",
    }
    assert job_result.errors == ["333333330002: source timeout for 333333330002"]

    aggregated = CohortAggregator().aggregate_job_result(job_result)

    assert aggregated.total_products == 2
    assert aggregated.successful_products == 1
    assert aggregated.failed_products == 1
    assert aggregated.brands == {"Acme"}
    assert aggregated.categories == {"Dog > Toys"}
    assert aggregated.brand_inconsistencies == []
    assert aggregated.category_inconsistencies == []
    assert aggregated.metadata["job_status"] == "partial"
    assert aggregated.metadata["job_errors"] == ["333333330002: source timeout for 333333330002"]
    field_summary = aggregated.metadata["field_summary"]
    assert isinstance(field_summary, dict)
    assert field_summary["brand"]["missing_skus"] == ["333333330002"]
    assert field_summary["category"]["missing_skus"] == ["333333330002"]
    assert aggregated.consistency_score == pytest.approx(0.75)


def cast_browser(value: object) -> _FakeBrowser:
    assert isinstance(value, _FakeBrowser)
    return value
