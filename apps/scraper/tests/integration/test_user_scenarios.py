"""Integration coverage for official user-designated Supabase scenarios.

These scenarios were assembled from live BayState data after the user directed
Task 13 to use live Supabase MCP data and run the integration tests as the
source of truth:

* `public.products_ingestion` supplies real imported SKU inputs.
* `public.scrape_results` supplies the latest recorded successful AI Search
  outputs for deterministic SKU-first expectations.
* `public.products` supplies a real same-family catalog cohort for batch-domain
  normalization coverage where recorded scrape history was not available.

The imported names are intentionally abbreviated because that is what the
pipeline currently stores before enrichment.
"""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import pytest

from scrapers.ai_search.batch_search import BatchSearchOrchestrator, ProductInput
from scrapers.ai_search.matching import MatchingUtils
from scrapers.ai_search.models import AISearchResult
from scrapers.ai_search.scraper import AISearchScraper


pytestmark = pytest.mark.asyncio


@dataclass(frozen=True)
class RecordedScenario:
    sku: str
    input_name: str
    expected_brand: str
    expected_title: str
    expected_url: str
    expected_domain: str


@dataclass(frozen=True)
class CohortScenario:
    sku: str
    product_name: str
    brand: str
    expected_url: str
    expected_domain: str


RECORDED_SKU_FIRST_SCENARIOS: tuple[RecordedScenario, ...] = (
    RecordedScenario(
        sku="051178002327",
        input_name="LV SEED PEPPER HOT F RESNO CHILI HEIRLOOM",
        expected_brand="Lake Valley Seed",
        expected_title="Lake Valley Seed Pepper, Hot Fresno Chili Heirloom, 0.35g",
        expected_url="https://www.esbenshades.com/seeds-bulbs/lake-valley-seed-pepper-hot-fresno-chili-heirloom-0-35g",
        expected_domain="www.esbenshades.com",
    ),
    RecordedScenario(
        sku="051178003430",
        input_name="LV SEED CORN SWEET S ILVER HYBRID",
        expected_brand="David's Garden Seeds®",
        expected_title="Corn Sweet Silver Queen 100 Non-GMO, Hybrid Seeds",
        expected_url="https://davidsgardenseeds.com/products/corn-sweet-silver-queen-100-non-gmo-hybrid-seeds",
        expected_domain="davidsgardenseeds.com",
    ),
    RecordedScenario(
        sku="051178005557",
        input_name="LV SEED ORGANIC BEAN BLUE LAKE HEIRLOOM",
        expected_brand="David's Garden Seeds®",
        expected_title="Bean Bush Blue Lake 7 Non-GMO, Heirloom Seed Sizes Available",
        expected_url="https://davidsgardenseeds.com/products/bean-bush-blue-lake-274-100-non-gmo-heirloom-seeds",
        expected_domain="davidsgardenseeds.com",
    ),
    RecordedScenario(
        sku="051178008602",
        input_name="LV SEED ORGANIC LETT UCE BLACK HEIRLOOM",
        expected_brand="Lake Valley Seed",
        expected_title="Lake Valley Seed Lettuce Organic Black Seeded Simpson Heirloom Vegetable, 1.5g",
        expected_url="https://www.esbenshades.com/seeds-bulbs/lake-valley-seed-lettuce-organic-black-seeded-simpson-heirloom-vegetable-1-5g",
        expected_domain="www.esbenshades.com",
    ),
)


CATALOG_COHORT_SCENARIOS: tuple[CohortScenario, ...] = (
    CohortScenario(
        sku="027773010562",
        product_name="Quiet Time Deluxe Pet Mat 23 in. x 17 in. Black",
        brand="midwest",
        expected_url="https://petswarehouse.com/products/quiet-time-deluxe-pet-mat-23-x-17-black",
        expected_domain="petswarehouse.com",
    ),
    CohortScenario(
        sku="027773010579",
        product_name="Quiet Time Deluxe Pet Mat 30 in. x 19 in. Black",
        brand="midwest",
        expected_url="https://petswarehouse.com/products/quiet-time-deluxe-pet-mat-30-x-19-black",
        expected_domain="petswarehouse.com",
    ),
    CohortScenario(
        sku="027773010586",
        product_name="Quiet Time Deluxe Pet Mat 35 X 23 in. Black",
        brand="midwest",
        expected_url="https://petswarehouse.com/products/quiet-time-deluxe-pet-mat-35-x-23-black",
        expected_domain="petswarehouse.com",
    ),
)


class ScenarioScorer:
    def prepare_search_results(
        self,
        search_results: list[dict[str, Any]],
        sku: str,
        brand: str | None,
        product_name: str | None,
        category: str | None,
        prefer_manufacturer: bool,
        preferred_domains: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        del sku, brand, product_name, category, prefer_manufacturer
        if not preferred_domains:
            return list(search_results)

        normalized_preferences = {self.domain_from_url(domain) for domain in preferred_domains}
        return sorted(
            search_results,
            key=lambda result: 0 if self.domain_from_url(str(result.get("url") or "")) in normalized_preferences else 1,
        )

    def is_low_quality_result(self, result: dict[str, Any]) -> bool:
        domain = self.domain_from_url(str(result.get("url") or ""))
        return domain in {"aggregator.example", "marketplace.example"}

    def domain_from_url(self, value: str) -> str:
        domain = str(urlparse(value).netloc or "").lower().strip()
        if domain.startswith("www."):
            domain = domain[4:]
        return domain

    def is_marketplace(self, domain: str) -> bool:
        return domain in {"aggregator.example", "marketplace.example"}


class ScenarioNameConsolidator:
    def __init__(self, scenarios: tuple[RecordedScenario, ...]):
        self._scenarios = {scenario.sku: scenario for scenario in scenarios}
        self.consolidate_calls: list[tuple[str, str]] = []

    async def consolidate_name(
        self,
        sku: str,
        abbreviated_name: str,
        search_snippets: list[dict[str, Any]],
    ) -> tuple[str, float]:
        del abbreviated_name, search_snippets
        self.consolidate_calls.append((sku, self._scenarios[sku].expected_title))
        return self._scenarios[sku].expected_title, 0.0


class ScenarioSearchClient:
    def __init__(self, scenarios: tuple[RecordedScenario, ...]):
        self._scenarios = {scenario.sku: scenario for scenario in scenarios}
        self.search_calls: list[str] = []

    async def search(self, query: str) -> tuple[list[dict[str, str]], None]:
        self.search_calls.append(query)

        matched_sku = next((sku for sku in self._scenarios if query == sku), None)
        if matched_sku is not None:
            scenario = self._scenarios[matched_sku]
            return (
                [
                    {
                        "url": f"https://marketplace.example/items/{scenario.sku.lower()}",
                        "title": f"{scenario.sku} marketplace listing",
                        "description": "Marketplace listing",
                    },
                    {
                        "url": scenario.expected_url,
                        "title": scenario.expected_title,
                        "description": f"Recorded result for {scenario.expected_brand}",
                    },
                ],
                None,
            )

        lowered_query = query.lower()
        for scenario in self._scenarios.values():
            if scenario.expected_title.lower() in lowered_query:
                return (
                    [
                        {
                            "url": scenario.expected_url,
                            "title": scenario.expected_title,
                            "description": f"Recorded product page for {scenario.expected_brand}",
                        },
                        {
                            "url": f"https://aggregator.example/{scenario.sku.lower()}",
                            "title": f"{scenario.expected_title} review",
                            "description": "Review roundup",
                        },
                    ],
                    None,
                )

        return [], None


class ScenarioValidator:
    def __init__(self, scenarios: tuple[RecordedScenario, ...]):
        self._scenarios = {scenario.sku: scenario for scenario in scenarios}

    def validate_extraction_match(
        self,
        extraction_result: dict[str, Any],
        sku: str,
        product_name: str | None,
        brand: str | None,
        source_url: str,
    ) -> tuple[bool, str | None]:
        del product_name, brand
        scenario = self._scenarios[sku]
        if (
            source_url == scenario.expected_url
            and str(extraction_result.get("product_name") or "") == scenario.expected_title
            and str(extraction_result.get("brand") or "") == scenario.expected_brand
        ):
            return True, None
        return False, "Recorded scenario mismatch"


class UserScenarioSkuFirstScraper(AISearchScraper):
    def __init__(self, scenarios: tuple[RecordedScenario, ...]):
        self.prefer_manufacturer = True
        self._scenarios = {scenario.sku: scenario for scenario in scenarios}
        self._scenarios_by_url = {scenario.expected_url: scenario for scenario in scenarios}
        self._scoring = ScenarioScorer()
        self._validator = ScenarioValidator(scenarios)

    async def _should_skip_url(self, url: str) -> bool:
        del url
        return False

    def _is_blocked_url(self, url: str) -> bool:
        del url
        return False

    def _heuristic_source_selection(
        self,
        search_results: list[dict[str, Any]],
        sku: str,
        brand: str | None = None,
        product_name: str | None = None,
        category: str | None = None,
        preferred_domains: list[str] | None = None,
    ) -> str | None:
        del search_results, brand, product_name, category, preferred_domains
        return self._scenarios[sku].expected_url

    async def _extract_product_data(
        self,
        url: str,
        sku: str,
        product_name: str | None,
        brand: str | None,
    ) -> dict[str, Any]:
        del sku, product_name, brand
        scenario = self._scenarios_by_url[url]
        return {
            "success": True,
            "product_name": scenario.expected_title,
            "brand": scenario.expected_brand,
            "description": f"Recorded extraction for {scenario.expected_brand}",
            "size_metrics": None,
            "images": [f"{url}/image.jpg"],
            "categories": ["Seeds"],
            "confidence": 0.98,
            "url": url,
        }

    def _build_discovery_result(
        self,
        result: dict[str, Any],
        sku: str,
        product_name: str | None,
        brand: str | None,
        url: str | None,
        cost_context: Any | None = None,
    ) -> AISearchResult:
        del product_name, brand, cost_context
        return AISearchResult(
            success=True,
            sku=sku,
            product_name=str(result.get("product_name") or ""),
            brand=str(result.get("brand") or ""),
            description=str(result.get("description") or ""),
            size_metrics=result.get("size_metrics"),
            images=list(result.get("images") or []),
            categories=list(result.get("categories") or []),
            url=url,
            source_website=self._scoring.domain_from_url(str(url or "")),
            confidence=float(result.get("confidence") or 0.0),
        )


class UserScenarioCohortScraper(AISearchScraper):
    def __init__(self, scenarios: tuple[CohortScenario, ...]):
        self.prefer_manufacturer = True
        self._scenarios = {scenario.sku: scenario for scenario in scenarios}
        self._attempts: dict[str, int] = {}
        self.calls: list[dict[str, Any]] = []
        self._cohort_cache: OrderedDict[str, Any] = OrderedDict()
        self._cohort_cache_max = 128
        self._scoring = ScenarioScorer()
        self._matching = MatchingUtils()

    def _score_item_context(self, item: dict[str, Any]) -> float:
        return {
            "027773010586": 3.0,
            "027773010562": 2.0,
            "027773010579": 1.0,
        }.get(str(item.get("sku") or ""), 0.0)

    async def scrape_product(
        self,
        sku: str,
        product_name: str | None = None,
        brand: str | None = None,
        category: str | None = None,
        cohort_state: Any | None = None,
    ) -> AISearchResult:
        del category
        scenario = self._scenarios[sku]
        attempt = self._attempts.get(sku, 0) + 1
        self._attempts[sku] = attempt
        preferred_domains = cohort_state.ranked_domains() if cohort_state is not None else []
        self.calls.append(
            {
                "sku": sku,
                "attempt": attempt,
                "brand": brand,
                "preferred_domains": preferred_domains,
            }
        )

        if sku == "027773010586" and scenario.expected_domain not in preferred_domains:
            return AISearchResult(success=False, sku=sku, error="Initial dominant-domain miss")

        return AISearchResult(
            success=True,
            sku=sku,
            product_name=product_name or scenario.product_name,
            brand=brand or scenario.brand,
            url=scenario.expected_url,
            source_website=scenario.expected_domain,
            confidence=0.91,
            images=[f"{scenario.expected_url}/image.jpg"],
        )


def _recorded_products() -> list[ProductInput]:
    return [
        ProductInput(
            sku=scenario.sku,
            name=scenario.input_name,
            brand=scenario.expected_brand,
        )
        for scenario in RECORDED_SKU_FIRST_SCENARIOS
    ]


def _cohort_products() -> list[dict[str, str]]:
    return [
        {
            "sku": scenario.sku,
            "product_name": scenario.product_name,
            "brand": scenario.brand,
            "category": "Dog Beds",
        }
        for scenario in CATALOG_COHORT_SCENARIOS
    ]


async def test_user_scenarios_sku_first_match_recorded_outputs() -> None:
    search_client = ScenarioSearchClient(RECORDED_SKU_FIRST_SCENARIOS)
    consolidator = ScenarioNameConsolidator(RECORDED_SKU_FIRST_SCENARIOS)
    orchestrator = BatchSearchOrchestrator(
        search_client=search_client,
        extractor=object(),
        scorer=ScenarioScorer(),
        name_consolidator=consolidator,
    )

    search_results = await orchestrator.search_sku_first(_recorded_products())
    scraper = UserScenarioSkuFirstScraper(RECORDED_SKU_FIRST_SCENARIOS)

    results = [
        await scraper._extract_sku_first_batch_result(
            sku=scenario.sku,
            product_name=scenario.input_name,
            brand=scenario.expected_brand,
            search_results=search_results[scenario.sku],
        )
        for scenario in RECORDED_SKU_FIRST_SCENARIOS
    ]

    assert {sku: candidates[0].url for sku, candidates in search_results.items()} == {
        scenario.sku: scenario.expected_url for scenario in RECORDED_SKU_FIRST_SCENARIOS
    }
    assert {result.sku: result.url for result in results} == {
        scenario.sku: scenario.expected_url for scenario in RECORDED_SKU_FIRST_SCENARIOS
    }
    assert {result.sku: result.brand for result in results} == {
        scenario.sku: scenario.expected_brand for scenario in RECORDED_SKU_FIRST_SCENARIOS
    }
    assert all(result.success for result in results)
    assert all(result.source_website == ScenarioScorer().domain_from_url(result.url or "") for result in results)
    assert [sku for sku, _ in consolidator.consolidate_calls] == [scenario.sku for scenario in RECORDED_SKU_FIRST_SCENARIOS]


async def test_user_scenarios_batch_cohort_retries_to_real_catalog_family_domain() -> None:
    scraper = UserScenarioCohortScraper(CATALOG_COHORT_SCENARIOS)

    results = await scraper.scrape_products_batch(
        _cohort_products(),
        max_concurrency=2,
    )

    assert [result.url for result in results] == [scenario.expected_url for scenario in CATALOG_COHORT_SCENARIOS]
    assert all(result.success for result in results)
    assert all(result.source_website == "petswarehouse.com" for result in results)
    assert scraper._attempts["027773010586"] == 2
    assert scraper.calls[0]["preferred_domains"] == []
    assert scraper.calls[-1]["preferred_domains"] == ["petswarehouse.com"]
