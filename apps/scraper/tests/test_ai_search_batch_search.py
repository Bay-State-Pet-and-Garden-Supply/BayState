from __future__ import annotations

import pytest

from scrapers.ai_search.batch_search import BatchSearchOrchestrator, ProductInput, RankedResult, SearchResult
from scrapers.ai_search.cohort_state import _BatchCohortState
from scrapers.ai_search.scoring import SearchScorer
from scrapers.ai_search.validation import ExtractionValidator

pytestmark = pytest.mark.asyncio


class SearchClientStub:
    async def search(self, query: str) -> tuple[list[dict[str, str]], str | None]:
        if query.startswith("site:bentleyseeds.com"):
            return (
                [
                    {
                        "url": "https://bentleyseeds.com/products/jubilee-tomato-seed",
                        "title": "Bentley Seed Tomato Jubilee 1943",
                        "description": "Official product page",
                    }
                ],
                None,
            )
        return ([], None)


class ExtractorStub:
    async def extract(
        self,
        url: str,
        sku: str,
        product_name: str | None,
        brand: str | None,
    ) -> dict[str, object]:
        if "bentleyseeds.com" not in url:
            return {"success": False, "error": "retailer mismatch"}

        return {
            "success": True,
            "url": url,
            "product_name": product_name or "Bentley Seed Tomato Jubilee 1943",
            "brand": brand or "Bentley Seed",
            "description": "Official product page",
            "size_metrics": "Seed packet",
            "images": ["https://bentleyseeds.com/images/jubilee.jpg"],
            "categories": ["Vegetable Seeds"],
            "confidence": 0.92,
        }


async def test_extract_batch_uses_official_site_search_before_retailer() -> None:
    cohort_state = _BatchCohortState(
        key="bentleyseed::vegetableseeds",
        preferred_domain_counts={"arett.com": 2},
        preferred_brand_counts={"Bentley Seed": 1},
        official_domain_counts={"bentleyseeds.com": 1},
    )
    orchestrator = BatchSearchOrchestrator(
        search_client=SearchClientStub(),
        extractor=ExtractorStub(),
        scorer=SearchScorer(),
        cohort_state=cohort_state,
        validator=ExtractionValidator(confidence_threshold=0.7),
    )

    product = ProductInput(
        sku="051588178896",
        name="Bentley Seed Tomato Jubilee 1943",
        brand="Bentley Seed",
        category="Vegetable Seeds",
    )
    orchestrator._product_context = {product.sku: product}
    orchestrator._consolidated_names = {product.sku: product.name}

    results = await orchestrator.extract_batch(
        {
            product.sku: [
                RankedResult(
                    result=SearchResult(
                        url="https://arett.com/item/B104+HTG001/Bentley-Seed-Tomato-Jubilee-1943",
                        title="Bentley Seed Tomato Jubilee 1943 - Arett Sales",
                        description="Retailer listing",
                    ),
                    score=9.0,
                )
            ]
        },
        max_concurrent=1,
    )

    assert results[product.sku]["success"] is True
    assert results[product.sku]["url"] == "https://bentleyseeds.com/products/jubilee-tomato-seed"
