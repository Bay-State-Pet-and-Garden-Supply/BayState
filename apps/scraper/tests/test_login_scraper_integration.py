from __future__ import annotations

import os

import pytest

from tests.support.scraper_testing_integration import ScraperIntegrationTester


LOGIN_SCRAPERS = ("orgill", "phillips", "petfoodex")


@pytest.fixture
def tester() -> ScraperIntegrationTester:
    return ScraperIntegrationTester()


def _require_api_credentials(tester: ScraperIntegrationTester) -> None:
    if not tester.api_client.api_url or not tester.api_client.api_key:
        pytest.skip("API credentials required for API-published login scraper integration tests")


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize("scraper_name", LOGIN_SCRAPERS)
async def test_login_scraper_success_path(tester: ScraperIntegrationTester, scraper_name: str) -> None:
    _require_api_credentials(tester)

    if os.getenv("CI") == "true":
        pytest.skip(f"Skipping {scraper_name} in CI (requires live login)")

    sku = tester.get_test_skus(scraper_name)[0]
    result = await tester.run_scraper_test(scraper_name, [sku])

    assert result["scraper"] == scraper_name
    assert result["run_results"]["success"] is True
    assert result["run_results"]["errors"] == []
    assert len(result["run_results"]["products"]) >= 1


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize("scraper_name", LOGIN_SCRAPERS)
async def test_login_scraper_no_results_path(tester: ScraperIntegrationTester, scraper_name: str) -> None:
    _require_api_credentials(tester)

    if os.getenv("CI") == "true":
        pytest.skip(f"Skipping {scraper_name} in CI (requires live login)")

    fake_sku = tester.get_fake_skus(scraper_name)[0]

    async with tester.testing_client:
        result = await tester.testing_client.run_scraper(scraper_name, [fake_sku])

    assert result["scraper"] == scraper_name
    assert result["success"] is True
    assert result["errors"] == []
    assert len(result["products"]) == 1
    assert result["products"][0]["SKU"] == fake_sku
    assert result["products"][0].get("no_results_found") is True


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize("scraper_name", LOGIN_SCRAPERS)
async def test_login_scraper_multiple_test_skus_meet_quality_bar(
    tester: ScraperIntegrationTester,
    scraper_name: str,
) -> None:
    _require_api_credentials(tester)

    if os.getenv("CI") == "true":
        pytest.skip(f"Skipping {scraper_name} in CI (requires live login)")

    skus = tester.get_test_skus(scraper_name)[:3]
    result = await tester.run_scraper_test(scraper_name, skus)

    assert result["run_results"]["success"] is True
    assert result["run_results"]["errors"] == []
    assert result["validation_results"]["errors"] == []
    assert result["validation_results"]["valid_products"] >= 1


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize("scraper_name", LOGIN_SCRAPERS)
async def test_login_scraper_edge_case_path(
    tester: ScraperIntegrationTester,
    scraper_name: str,
) -> None:
    _require_api_credentials(tester)

    if os.getenv("CI") == "true":
        pytest.skip(f"Skipping {scraper_name} in CI (requires live login)")

    edge_case_sku = tester.get_edge_case_skus(scraper_name)[0]

    async with tester.testing_client:
        result = await tester.testing_client.run_scraper(scraper_name, [edge_case_sku])

    assert result["scraper"] == scraper_name
    assert result["success"] is True
    assert result["errors"] == []
