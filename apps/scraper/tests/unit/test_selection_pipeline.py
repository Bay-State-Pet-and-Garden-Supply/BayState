"""Tests for resolved-candidate selection pipeline.

Includes assertions ported from test_batch_search_official_resolution.py (T13).
"""

from dataclasses import dataclass

import pytest

from scrapers.ai_search.models import ResolvedCandidate
from scrapers.ai_search.scoring import SearchScorer
from scrapers.ai_search.selection_pipeline import run_selection_pipeline


@dataclass
class _ResolverStub:
    candidates: list[ResolvedCandidate]

    def resolve_candidates(
        self,
        *,
        search_results: list[dict],
        sku: str,
        product_name: str | None,
        brand: str | None,
        html_by_url: dict[str, str],
        resolved_payload_by_url: dict[str, str],
    ) -> list[ResolvedCandidate]:
        return list(self.candidates)


class _SelectorSpy:
    def __init__(self, selected_url: str | None = None, cost: float = 0.0) -> None:
        self.selected_url = selected_url
        self.cost = cost
        self.calls: list[list[dict]] = []

    async def select_best_url(
        self,
        *,
        results: list[dict],
        sku: str,
        product_name: str,
        brand: str | None = None,
        preferred_domains: list[str] | None = None,
    ) -> tuple[str | None, float]:
        self.calls.append(results)
        return self.selected_url, self.cost


def _candidate(
    *,
    url: str,
    source_url: str,
    source_domain: str,
    source_type: str,
    resolved_variant: dict | None = None,
    family_url: str | None = None,
) -> ResolvedCandidate:
    return ResolvedCandidate(
        url=url,
        canonical_url=url,
        source_url=source_url,
        source_domain=source_domain,
        source_type=source_type,
        resolved_url=url,
        resolved_canonical_url=url,
        family_url=family_url,
        resolved_variant=resolved_variant,
    )


@pytest.mark.asyncio
async def test_selection_pipeline_ranks_resolved_scotts_child_ahead_of_direct_retailer() -> None:
    family_url = "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html"
    resolved_official_url = "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html"
    retailer_url = "https://www.homedepot.com/p/Scotts-Nature-Scapes-1-5-cu-ft-Sierra-Red-Mulch-88459442/100000001"

    resolver = _ResolverStub(
        candidates=[
            _candidate(
                url=retailer_url,
                source_url=retailer_url,
                source_domain="homedepot.com",
                source_type="direct",
                resolved_variant={"variant_id": "032247884594"},
            ),
            _candidate(
                url=resolved_official_url,
                source_url=family_url,
                source_domain="scottsmiraclegro.com",
                source_type="official_family",
                family_url=family_url,
                resolved_variant={"variant_id": "032247884594"},
            ),
        ]
    )

    result = await run_selection_pipeline(
        search_results=[
            {
                "url": family_url,
                "title": "Scotts Nature Scapes Color Enhanced Mulch | Scotts",
                "description": "Official Scotts family page for Nature Scapes mulch.",
            },
            {
                "url": retailer_url,
                "title": "Scotts Nature Scapes Sierra Red Mulch 1.5 cu ft - The Home Depot",
                "description": "Direct retailer PDP for Sierra Red mulch.",
            },
        ],
        sku="032247884594",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
        brand="Scotts",
        category="Mulch",
        resolver=resolver,
        scoring=SearchScorer(),
        html_by_url={},
        resolved_payload_by_url={},
        preferred_domains=["scottsmiraclegro.com"],
    )

    assert [candidate.resolved_url for candidate in result.ranked_candidates] == [resolved_official_url, retailer_url]
    assert result.prioritized_url == resolved_official_url
    assert result.selector_cost_usd == 0.0


@pytest.mark.asyncio
async def test_selection_pipeline_passes_resolved_candidates_into_selector() -> None:
    family_url = "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html"
    resolved_official_url = "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html"
    retailer_url = "https://www.homedepot.com/p/Scotts-Nature-Scapes-1-5-cu-ft-Sierra-Red-Mulch-88459442/100000001"
    selector = _SelectorSpy(selected_url=resolved_official_url, cost=0.12)

    result = await run_selection_pipeline(
        search_results=[
            {
                "url": family_url,
                "title": "Scotts Nature Scapes Color Enhanced Mulch | Scotts",
                "description": "Official Scotts family page for Nature Scapes mulch.",
            },
            {
                "url": retailer_url,
                "title": "Scotts Nature Scapes Sierra Red Mulch 1.5 cu ft - The Home Depot",
                "description": "Direct retailer PDP for Sierra Red mulch.",
            },
        ],
        sku="032247884594",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
        brand="Scotts",
        category="Mulch",
        resolver=_ResolverStub(
            candidates=[
                _candidate(
                    url=resolved_official_url,
                    source_url=family_url,
                    source_domain="scottsmiraclegro.com",
                    source_type="official_family",
                    family_url=family_url,
                    resolved_variant={"variant_id": "032247884594"},
                ),
                _candidate(
                    url=retailer_url,
                    source_url=retailer_url,
                    source_domain="homedepot.com",
                    source_type="direct",
                    resolved_variant={"variant_id": "032247884594"},
                ),
            ]
        ),
        scoring=SearchScorer(),
        selector=selector,
        html_by_url={},
        resolved_payload_by_url={},
        preferred_domains=["scottsmiraclegro.com"],
    )

    assert selector.calls == [
        [
            {
                "url": resolved_official_url,
                "title": "Scotts Nature Scapes Color Enhanced Mulch | Scotts",
                "description": "Official Scotts family page for Nature Scapes mulch.",
                "source_url": family_url,
                "source_type": "official_family",
                "source_domain": "scottsmiraclegro.com",
                "family_url": family_url,
                "resolved_variant": {"variant_id": "032247884594"},
            },
            {
                "url": retailer_url,
                "title": "Scotts Nature Scapes Sierra Red Mulch 1.5 cu ft - The Home Depot",
                "description": "Direct retailer PDP for Sierra Red mulch.",
                "source_url": retailer_url,
                "source_type": "direct",
                "source_domain": "homedepot.com",
                "family_url": None,
                "resolved_variant": {"variant_id": "032247884594"},
            },
        ]
    ]
    assert result.prioritized_url == resolved_official_url
    assert result.selector_cost_usd == 0.12


# ============================================================================
# T13: Ported Assertions from Legacy batch_search_official_resolution Tests
# ============================================================================


@pytest.mark.asyncio
async def test_selection_pipeline_prefers_official_domain_over_retailer() -> None:
    """Official domains should be prioritized over retailer domains.

    Ported from: test_batch_search_official_resolution.py
    Rationale: Official brand sites should rank higher than retailers.
    """
    family_url = "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html"
    official_url = "https://scottsmiraclegro.com/en-us/scotts-naturescapes-sierra-red.html"
    retailer_url = "https://www.lowes.com/pd/scotts-deep-forest-brown-mulch/1001364002"

    result = await run_selection_pipeline(
        search_results=[
            {
                "url": family_url,
                "title": "Scotts Nature Scapes Color Enhanced Mulch | Scotts",
                "description": "Official Scotts family page with color variants.",
            },
            {
                "url": retailer_url,
                "title": "Scotts Mulch at Lowes",
                "description": "Retailer product page.",
            },
        ],
        sku="032247884594",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
        brand="Scotts",
        category="Mulch",
        resolver=_ResolverStub(
            candidates=[
                _candidate(
                    url=official_url,
                    source_url=family_url,
                    source_domain="scottsmiraclegro.com",
                    source_type="official_family",
                    family_url=family_url,
                    resolved_variant={"variant_id": "032247884594"},
                ),
                _candidate(
                    url=retailer_url,
                    source_url=retailer_url,
                    source_domain="lowes.com",
                    source_type="direct",
                    resolved_variant={"variant_id": "032247884594"},
                ),
            ]
        ),
        scoring=SearchScorer(),
        html_by_url={},
        resolved_payload_by_url={},
        preferred_domains=["scottsmiraclegro.com"],
    )

    # Official should be prioritized over retailer
    assert result.ranked_candidates[0].source_type == "official_family"
    assert result.ranked_candidates[0].source_domain == "scottsmiraclegro.com"


@pytest.mark.asyncio
async def test_selection_pipeline_official_candidate_ranks_above_retailer() -> None:
    """Official candidates should rank above retailer candidates.

    Ported from: test_batch_search_official_resolution.py
    Rationale: Official brand sites should be ranked higher than retailers.
    """
    family_url = "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html"
    official_url = "https://scottsmiraclegro.com/en-us/scotts-naturescapes-sierra-red.html"
    retailer_url = "https://www.homedepot.com/p/Scotts-Nature-Scapes-1-5-cu-ft-Sierra-Red-Mulch-88459442/100000001"

    result = await run_selection_pipeline(
        search_results=[
            {
                "url": family_url,
                "title": "Scotts Nature Scapes Color Enhanced Mulch | Scotts",
                "description": "Official Scotts family page for Nature Scapes mulch.",
            },
            {
                "url": retailer_url,
                "title": "Scotts Nature Scapes Sierra Red Mulch 1.5 cu ft - The Home Depot",
                "description": "Direct retailer PDP for Sierra Red mulch.",
            },
        ],
        sku="032247884594",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
        brand="Scotts",
        category="Mulch",
        resolver=_ResolverStub(
            candidates=[
                _candidate(
                    url=official_url,
                    source_url=family_url,
                    source_domain="scottsmiraclegro.com",
                    source_type="official_family",
                    family_url=family_url,
                    resolved_variant={"variant_id": "032247884594"},
                ),
                _candidate(
                    url=retailer_url,
                    source_url=retailer_url,
                    source_domain="homedepot.com",
                    source_type="direct",
                    resolved_variant={"variant_id": "032247884594"},
                ),
            ]
        ),
        scoring=SearchScorer(),
        html_by_url={},
        resolved_payload_by_url={},
        preferred_domains=["scottsmiraclegro.com"],
    )

    # First ranked should be official_family, second should be direct
    assert result.ranked_candidates[0].source_type == "official_family"
    assert result.ranked_candidates[0].source_domain == "scottsmiraclegro.com"
    assert result.ranked_candidates[1].source_type == "direct"
    assert result.ranked_candidates[1].source_domain == "homedepot.com"
