# pyright: reportMissingImports=false, reportUnknownMemberType=false, reportArgumentType=false, reportIndexIssue=false, reportUntypedFunctionDecorator=false
from __future__ import annotations

import pytest

from scrapers.cohort.job_processor import CohortJobProcessor
from scrapers.cohort.grouping import CohortGroupingConfig


class _FakeBrowser:
    def __init__(self) -> None:
        self.quit_calls: int = 0

    async def quit(self) -> None:
        self.quit_calls += 1


class _FakeExecutor:
    def __init__(self) -> None:
        self.browser: _FakeBrowser | None = None
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
        self.execute_calls.append({"context": payload, "quit_browser": quit_browser, "browser": self.browser})

        product = payload.get("product")
        if not isinstance(product, dict):
            product = {}

        if product.get("should_fail"):
            raise RuntimeError(f"boom for {payload.get('sku')}")

        return {
            "success": True,
            "results": {
                "sku": payload.get("sku"),
                "title": product.get("name", payload.get("sku")),
            },
        }


@pytest.mark.anyio
async def test_process_cohort_shares_executor_session_across_products() -> None:
    executor = _FakeExecutor()
    processor = CohortJobProcessor(executor, CohortGroupingConfig(skip_invalid_upcs=False))
    products = [{"sku": f"12345678{index:04d}", "name": f"Product {index}"} for index in range(5)]

    result = await processor.process_cohort("12345678", products, {"name": "test-scraper"})

    assert result.status == "success"
    assert result.products_processed == 5
    assert result.products_succeeded == 5
    assert result.products_failed == 0
    assert result.metadata["processing_mode"] == "cohort"
    assert result.metadata["scraper_name"] == "test-scraper"
    assert result.metadata["cohort_key"] == "12345678"
    assert sorted(result.results) == [product["sku"] for product in products]
    assert executor.initialize_calls == 1
    assert len(executor.execute_calls) == 5
    browser = executor.browser
    assert browser is not None
    assert {id(call["browser"]) for call in executor.execute_calls} == {id(browser)}
    assert all(call["quit_browser"] is False for call in executor.execute_calls)
    assert browser.quit_calls == 1


@pytest.mark.anyio
async def test_process_cohort_returns_partial_status_on_member_failures() -> None:
    executor = _FakeExecutor()
    processor = CohortJobProcessor(executor, CohortGroupingConfig(skip_invalid_upcs=False))
    products = [
        {"sku": "123456780001", "name": "Good Product"},
        {"sku": "123456780002", "name": "Broken Product", "should_fail": True},
    ]

    result = await processor.process_cohort("12345678", products)

    assert result.status == "partial"
    assert result.products_succeeded == 1
    assert result.products_failed == 1
    assert result.results["123456780001"]["success"] is True
    assert result.results["123456780002"] == {"success": False, "error": "boom for 123456780002"}
    assert result.errors == ["123456780002: boom for 123456780002"]


@pytest.mark.anyio
async def test_process_products_supports_cohorts_and_individual_fallbacks() -> None:
    executor = _FakeExecutor()
    processor = CohortJobProcessor(executor, CohortGroupingConfig(skip_invalid_upcs=False))
    products = [
        {"sku": "072705115815", "name": "Grouped A"},
        {"sku": "072705115823", "name": "Grouped B"},
        {"sku": "bad-sku", "name": "Fallback Single"},
    ]

    results = await processor.process_products(products, {"name": "fallback-test"}, mode="auto")

    assert sorted(results) == ["07270511", "bad-sku"]
    assert results["07270511"].status == "success"
    assert results["07270511"].metadata["processing_mode"] == "cohort"
    assert results["07270511"].products_processed == 2
    assert sorted(results["07270511"].results) == ["072705115815", "072705115823"]
    assert results["bad-sku"].status == "success"
    assert results["bad-sku"].metadata["processing_mode"] == "individual"
    assert results["bad-sku"].products_processed == 1
    assert results["bad-sku"].results["bad-sku"]["results"]["sku"] == "bad-sku"
    assert executor.initialize_calls == 1
    browser = executor.browser
    assert browser is not None
    assert browser.quit_calls == 1
