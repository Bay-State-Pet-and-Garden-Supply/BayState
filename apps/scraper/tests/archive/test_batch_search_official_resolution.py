"""Regression tests for resolver-backed official candidate ordering in batch search."""

from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import urlparse

from scrapers.ai_search.batch_search import BatchSearchOrchestrator, ProductInput, SearchResult
from scrapers.ai_search.cohort_state import _BatchCohortState
from scrapers.ai_search.models import ResolvedCandidate
from scrapers.ai_search.selection_pipeline import SelectionPipelineResult


class SearchClientStub:
    def __init__(self, results: list[dict[str, str]]) -> None:
        self._results = results

    async def search(self, query: str) -> tuple[list[dict[str, str]], str | None]:
        _ = query
        return list(self._results), None


class ExtractorStub:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def extract(
        self,
        url: str,
        sku: str,
        product_name: str | None,
        brand: str | None,
    ) -> dict[str, Any]:
        _ = sku, product_name, brand
        self.calls.append(url)
        return {
            "success": True,
            "url": url,
            "product_name": "Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
            "brand": "Scotts",
            "description": "Official Scotts mulch product page",
            "images": ["https://images.example.com/products/mulch/main.jpg"],
            "confidence": 0.95,
        }


class ScorerStub:
    BLOCKED_DOMAINS: set[str] = set()

    def score_search_result(
        self,
        result: dict[str, Any],
        sku: str,
        brand: str | None = None,
        product_name: str | None = None,
        category: str | None = None,
        **kwargs: Any,
    ) -> float:
        _ = sku, brand, product_name, category, kwargs
        url = str(result.get("url") or "")
        return 10.0 if "lowes.com" in url else 1.0

    def domain_from_url(self, value: str) -> str:
        domain = str(urlparse(value).netloc or "").lower()
        if domain.startswith("www."):
            domain = domain[4:]
        return domain

    def _domain_matches_candidates(self, domain: str, candidates: set[str]) -> bool:
        return domain in candidates

    def is_category_like_url(self, url: str) -> bool:
        _ = url
        return False

    def classify_source_domain(self, domain: str, brand: str | None) -> str:
        _ = brand
        return "official" if domain == "scottsmiraclegro.com" else "major_retailer"

    def infer_brand_from_result(self, result: dict[str, Any], product_name: str | None) -> str | None:
        _ = result, product_name
        return None

    def infer_brand_from_domain(self, domain: str, product_name: str | None) -> str | None:
        _ = domain, product_name
        return None


async def _resolver_input_builder(
    *,
    search_results: list[dict[str, Any]],
    sku: str,
    brand: str | None,
    product_name: str | None,
) -> tuple[dict[str, str], dict[str, str]]:
    _ = search_results, sku, brand, product_name
    return {}, {}


async def _selection_pipeline(
    *,
    search_results: list[dict[str, Any]],
    sku: str,
    product_name: str | None,
    brand: str | None,
    category: str | None,
    resolver: Any,
    scoring: Any,
    html_by_url: dict[str, str],
    resolved_payload_by_url: dict[str, str],
    selector: Any | None = None,
    prefer_manufacturer: bool = False,
    preferred_domains: list[str] | None = None,
) -> SelectionPipelineResult:
    _ = resolver, scoring, html_by_url, resolved_payload_by_url, selector, prefer_manufacturer
    assert sku == "032247884594"
    assert product_name == "Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft"
    assert brand == "Scotts"
    assert category == "Mulch"
    assert preferred_domains == ["scottsmiraclegro.com"]
    assert [str(result.get("url") or "") for result in search_results[:2]] == [
        "https://www.lowes.com/pd/scotts-deep-forest-brown-mulch/1001364002",
        "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
    ]

    return SelectionPipelineResult(
        ranked_candidates=[
            ResolvedCandidate(
                url="https://scottsmiraclegro.com/en-us/scotts-naturescapes-sierra-red.html",
                canonical_url="https://scottsmiraclegro.com/en-us/scotts-naturescapes-sierra-red.html",
                source_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
                source_domain="scottsmiraclegro.com",
                source_type="official_family",
                resolved_url="https://scottsmiraclegro.com/en-us/scotts-naturescapes-sierra-red.html",
                resolved_canonical_url="https://scottsmiraclegro.com/en-us/scotts-naturescapes-sierra-red.html",
                family_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
                resolved_variant={"variant_id": "032247884594"},
            ),
            ResolvedCandidate(
                url="https://www.lowes.com/pd/scotts-deep-forest-brown-mulch/1001364002",
                canonical_url="https://www.lowes.com/pd/scotts-deep-forest-brown-mulch/1001364002",
                source_url="https://www.lowes.com/pd/scotts-deep-forest-brown-mulch/1001364002",
                source_domain="lowes.com",
                source_type="direct",
                resolved_url="https://www.lowes.com/pd/scotts-deep-forest-brown-mulch/1001364002",
                resolved_canonical_url="https://www.lowes.com/pd/scotts-deep-forest-brown-mulch/1001364002",
            ),
        ],
        prioritized_url="https://scottsmiraclegro.com/en-us/scotts-naturescapes-sierra-red.html",
    )


def test_search_cohort_extracts_resolved_official_candidate_before_retailer() -> None:
    search_results = [
        {
            "url": "https://www.lowes.com/pd/scotts-deep-forest-brown-mulch/1001364002",
            "title": "Scotts retailer PDP",
            "description": "Retailer mulch listing",
        },
        {
            "url": "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
            "title": "Scotts Nature Scapes Color Enhanced Mulch",
            "description": "Official Scotts family page with color variants",
        },
    ]
    extractor = ExtractorStub()
    cohort_state = _BatchCohortState(
        key="scotts::mulch",
        preferred_domain_counts={},
        preferred_brand_counts={},
    )
    cohort_state.remember_brand("Scotts")
    cohort_state.remember_official_domain("scottsmiraclegro.com")
    orchestrator = BatchSearchOrchestrator(
        search_client=SearchClientStub(search_results),
        extractor=extractor,
        scorer=ScorerStub(),
        cohort_state=cohort_state,
        resolver=object(),
        selection_pipeline=_selection_pipeline,
        resolver_input_builder=_resolver_input_builder,
    )

    batch_result = asyncio.run(
        orchestrator.search_cohort(
            [
                ProductInput(
                    sku="032247884594",
                    name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
                    brand="Scotts",
                    category="Mulch",
                )
            ]
        )
    )

    assert extractor.calls[0] == "https://scottsmiraclegro.com/en-us/scotts-naturescapes-sierra-red.html"
    assert batch_result.extractions["032247884594"]["url"] == "https://scottsmiraclegro.com/en-us/scotts-naturescapes-sierra-red.html"
    assert batch_result.results["032247884594"][0].result.url == "https://scottsmiraclegro.com/en-us/scotts-naturescapes-sierra-red.html"
    assert batch_result.results["032247884594"][0].score > batch_result.results["032247884594"][1].score
    assert isinstance(batch_result.results["032247884594"][0].result, SearchResult)


def test_resolved_ranked_results_rebuild_scores_from_resolved_order() -> None:
    selection_result = SelectionPipelineResult(
        ranked_candidates=[
            ResolvedCandidate(
                url="https://official.example.com/products/red",
                canonical_url="https://official.example.com/products/red",
                source_url="https://official.example.com/family",
                source_domain="official.example.com",
                source_type="official_family",
                resolved_url="https://official.example.com/products/red",
                resolved_canonical_url="https://official.example.com/products/red",
            ),
            ResolvedCandidate(
                url="https://retailer.example.com/pdp/red",
                canonical_url="https://retailer.example.com/pdp/red",
                source_url="https://retailer.example.com/pdp/red",
                source_domain="retailer.example.com",
                source_type="direct",
                resolved_url="https://retailer.example.com/pdp/red",
                resolved_canonical_url="https://retailer.example.com/pdp/red",
            ),
        ],
        prioritized_url="https://official.example.com/products/red",
    )

    resolved_ranked = BatchSearchOrchestrator._resolved_ranked_results(
        selection_result,
        source_results=[
            {
                "url": "https://retailer.example.com/pdp/red",
                "title": "Retailer PDP",
                "description": "Retailer result",
            },
            {
                "url": "https://official.example.com/family",
                "title": "Official family page",
                "description": "Official result",
            },
        ],
    )

    assert [ranked.result.url for ranked in resolved_ranked] == [
        "https://official.example.com/products/red",
        "https://retailer.example.com/pdp/red",
    ]
    assert resolved_ranked[0].score > resolved_ranked[1].score
