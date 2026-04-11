"""Unit tests for context-aware URL ranking in batch search."""

from __future__ import annotations

from typing import Any

from scrapers.ai_search.batch_search import (
    BatchSearchOrchestrator,
    DomainFrequency,
    SearchResult,
)
from scrapers.ai_search.cohort_state import _BatchCohortState
from scrapers.ai_search.scoring import SearchScorer


class MockScorer:
    """Mock scorer that returns configurable scores based on context."""

    def __init__(
        self,
        base_score: float = 5.0,
        brand_boost: float = 3.0,
        name_boost: float = 4.0,
    ):
        self.base_score = base_score
        self.brand_boost = brand_boost
        self.name_boost = name_boost
        self.last_brand: str | None = None
        self.last_product_name: str | None = None

    def score_search_result(
        self,
        result: dict[str, Any],
        sku: str,
        brand: str | None = None,
        product_name: str | None = None,
        category: str | None = None,
        **kwargs,
    ) -> float:
        self.last_brand = brand
        self.last_product_name = product_name

        score = self.base_score

        # Apply brand boost if brand matches in URL/title/description
        if brand:
            combined = f"{result.get('url', '')} {result.get('title', '')} {result.get('description', '')}".lower()
            if brand.lower() in combined:
                score += self.brand_boost

        # Apply product name boost if name tokens match
        if product_name:
            combined = f"{result.get('url', '')} {result.get('title', '')} {result.get('description', '')}".lower()
            name_tokens = product_name.lower().split()
            matching_tokens = sum(1 for token in name_tokens if token in combined)
            score += min(self.name_boost, matching_tokens * 1.0)

        return score


class MockExtractor:
    """Mock extractor for testing."""

    pass


def make_search_result(url: str, title: str = "", description: str = "") -> SearchResult:
    """Helper to create SearchResult instances."""
    return SearchResult(url=url, title=title, description=description)


class TestContextAwareRanking:
    """Tests for rank_urls_for_sku context-awareness."""

    def test_brand_match_boosts_score(self) -> None:
        """Test that matching brand in URL/title boosts ranking score."""
        orchestrator = BatchSearchOrchestrator(
            search_client=None,
            extractor=MockExtractor(),
            scorer=MockScorer(base_score=5.0, brand_boost=3.0),
        )

        search_results = [
            make_search_result(
                url="https://purina.com/products/fancy-feast",
                title="Fancy Feast",
                description="Premium cat food",
            ),
            make_search_result(
                url="https://generic-pet-food.com/product",
                title="Cat Food",
                description="Store brand cat food",
            ),
        ]

        ranked = orchestrator.rank_urls_for_sku(
            sku="12345",
            search_results=search_results,
            domain_frequency={},
            brand="Purina",
            product_name=None,
            category=None,
        )

        # Purina result should be ranked higher due to brand match
        assert len(ranked) == 2
        assert ranked[0].result.url == "https://purina.com/products/fancy-feast"
        assert ranked[0].score > ranked[1].score

    def test_product_name_match_boosts_score(self) -> None:
        """Test that matching product name tokens boost ranking score."""
        orchestrator = BatchSearchOrchestrator(
            search_client=None,
            extractor=MockExtractor(),
            scorer=MockScorer(base_score=5.0, name_boost=4.0),
        )

        search_results = [
            make_search_result(
                url="https://example.com/product/12345",
                title="Random Product",
                description="Something else entirely",
            ),
            make_search_result(
                url="https://example.com/fancy-feast-salmon",
                title="Fancy Feast Salmon",
                description="Premium cat food with salmon",
            ),
        ]

        ranked = orchestrator.rank_urls_for_sku(
            sku="12345",
            search_results=search_results,
            domain_frequency={},
            brand=None,
            product_name="Fancy Feast Salmon Cat Food",
            category=None,
        )

        # Result with matching product name tokens should be ranked higher
        assert len(ranked) == 2
        # The Fancy Feast result should score higher due to name token matches
        fancy_feast_result = next(r for r in ranked if "fancy-feast" in r.result.url)
        other_result = next(r for r in ranked if "example.com/product/12345" in r.result.url)
        assert fancy_feast_result.score > other_result.score

    def test_missing_brand_handled_gracefully(self) -> None:
        """Test that None brand doesn't cause errors."""
        orchestrator = BatchSearchOrchestrator(
            search_client=None,
            extractor=MockExtractor(),
            scorer=MockScorer(base_score=5.0),
        )

        search_results = [
            make_search_result(
                url="https://example.com/item",
                title="Item",
                description="Description",
            ),
        ]

        # Should not raise, brand=None is handled
        # Note: score may include product_name boost if tokens match
        ranked = orchestrator.rank_urls_for_sku(
            sku="12345",
            search_results=search_results,
            domain_frequency={},
            brand=None,
            product_name="Some Product",
            category=None,
        )

        assert len(ranked) == 1
        # Score should be base + any name match (name tokens may match)
        assert ranked[0].score >= 5.0  # At minimum base score

    def test_missing_product_name_handled_gracefully(self) -> None:
        """Test that None product_name doesn't cause errors."""
        orchestrator = BatchSearchOrchestrator(
            search_client=None,
            extractor=MockExtractor(),
            scorer=MockScorer(base_score=5.0, brand_boost=3.0),
        )

        search_results = [
            make_search_result(
                url="https://somebrand.com/product",
                title="Product",
                description="Description",
            ),
        ]

        # Should not raise, product_name=None is handled
        ranked = orchestrator.rank_urls_for_sku(
            sku="12345",
            search_results=search_results,
            domain_frequency={},
            brand="SomeBrand",
            product_name=None,
            category=None,
        )

        assert len(ranked) == 1
        # Brand match should provide +3.0 boost: base 5.0 + brand 3.0 = 8.0
        assert ranked[0].score == 8.0  # Base + brand match

    def test_partial_context_works(self) -> None:
        """Test that partial context (brand only, name only) still ranks correctly."""
        orchestrator = BatchSearchOrchestrator(
            search_client=None,
            extractor=MockExtractor(),
            scorer=MockScorer(base_score=5.0, brand_boost=3.0, name_boost=4.0),
        )

        # Test with only brand
        search_results_brand = [
            make_search_result(
                url="https://purina.com/product",
                title="Product",
                description="Description",
            ),
            make_search_result(
                url="https://other.com/product",
                title="Product",
                description="Description",
            ),
        ]

        ranked_brand = orchestrator.rank_urls_for_sku(
            sku="12345",
            search_results=search_results_brand,
            domain_frequency={},
            brand="Purina",
            product_name=None,
            category=None,
        )

        assert ranked_brand[0].result.url == "https://purina.com/product"
        assert ranked_brand[0].score > ranked_brand[1].score

    def test_ranking_order_changes_with_context(self) -> None:
        """Test that providing different context changes the ranking order."""
        orchestrator = BatchSearchOrchestrator(
            search_client=None,
            extractor=MockExtractor(),
            scorer=MockScorer(base_score=5.0, brand_boost=3.0, name_boost=4.0),
        )

        search_results = [
            make_search_result(
                url="https://chewy.com/fancy-feast",
                title="Fancy Feast at Chewy",
                description="Buy Fancy Feast online",
            ),
            make_search_result(
                url="https://purina.com/fancy-feast",
                title="Fancy Feast Official Site",
                description="Purina's Fancy Feast",
            ),
        ]

        # With brand=Purina, Purina site should rank first
        ranked_with_purina = orchestrator.rank_urls_for_sku(
            sku="12345",
            search_results=search_results,
            domain_frequency={},
            brand="Purina",
            product_name=None,
            category=None,
        )
        assert ranked_with_purina[0].result.url == "https://purina.com/fancy-feast"

        # Without brand context, order may differ based on base scoring
        ranked_no_brand = orchestrator.rank_urls_for_sku(
            sku="12345",
            search_results=search_results,
            domain_frequency={},
            brand=None,
            product_name=None,
            category=None,
        )
        # Both should have same base score without context
        assert ranked_no_brand[0].score == ranked_no_brand[1].score

    def test_scoring_calculation_with_full_context(self) -> None:
        """Test that scorer receives correct context parameters."""
        scorer = MockScorer(base_score=5.0, brand_boost=3.0, name_boost=4.0)

        orchestrator = BatchSearchOrchestrator(
            search_client=None,
            extractor=MockExtractor(),
            scorer=scorer,
        )

        search_results = [
            make_search_result(
                url="https://example.com/product",
                title="Product",
                description="Description",
            ),
        ]

        orchestrator.rank_urls_for_sku(
            sku="12345",
            search_results=search_results,
            domain_frequency={},
            brand="TestBrand",
            product_name="Test Product Name",
            category="Test Category",
        )

        # Verify scorer received the context
        assert scorer.last_brand == "TestBrand"
        assert scorer.last_product_name == "Test Product Name"

    def test_domain_frequency_affects_ranking(self) -> None:
        """Test that domain frequency (cohort-wide signal) affects ranking."""
        orchestrator = BatchSearchOrchestrator(
            search_client=None,
            extractor=MockExtractor(),
            scorer=MockScorer(base_score=5.0),
        )

        search_results = [
            make_search_result(
                url="https://rare-site.com/product",
                title="Product",
                description="Description",
            ),
            make_search_result(
                url="https://popular-site.com/product",
                title="Product",
                description="Description",
            ),
        ]

        # popular-site.com appears for 4 SKUs (>3 threshold), gets +5.0 boost
        domain_frequency = {
            "rare-site.com": DomainFrequency(domain="rare-site.com", sku_count=1, skus={"sku1"}),
            "popular-site.com": DomainFrequency(domain="popular-site.com", sku_count=4, skus={"sku1", "sku2", "sku3", "sku4"}),
        }

        ranked = orchestrator.rank_urls_for_sku(
            sku="12345",
            search_results=search_results,
            domain_frequency=domain_frequency,
            brand=None,
            product_name=None,
            category=None,
        )

        assert len(ranked) == 2
        popular_result = next(r for r in ranked if "popular-site.com" in r.result.url)
        rare_result = next(r for r in ranked if "rare-site.com" in r.result.url)
        assert popular_result.score > rare_result.score

    def test_cohort_state_domain_ranking(self) -> None:
        """Test that cohort state preferred domains affect ranking."""
        orchestrator = BatchSearchOrchestrator(
            search_client=None,
            extractor=MockExtractor(),
            scorer=MockScorer(base_score=5.0),
            cohort_state=_BatchCohortState(
                key="test-cohort",
                preferred_domain_counts={"chewy.com": 5, "amazon.com": 2},
                preferred_brand_counts={},
            ),
        )

        search_results = [
            make_search_result(
                url="https://amazon.com/product",
                title="Product",
                description="Description",
            ),
            make_search_result(
                url="https://chewy.com/product",
                title="Product",
                description="Description",
            ),
        ]

        ranked = orchestrator.rank_urls_for_sku(
            sku="12345",
            search_results=search_results,
            domain_frequency={},
            brand=None,
            product_name=None,
            category=None,
        )

        # chewy.com has higher count (5 vs 2), should rank first
        assert len(ranked) == 2
        assert ranked[0].result.url == "https://chewy.com/product"

    def test_dominant_domain_gets_boost(self) -> None:
        """Test that the dominant domain (most frequent) gets additional boost."""
        orchestrator = BatchSearchOrchestrator(
            search_client=None,
            extractor=MockExtractor(),
            scorer=MockScorer(base_score=5.0),
            cohort_state=_BatchCohortState(
                key="test-cohort",
                preferred_domain_counts={"dominant.com": 5, "other.com": 1},
                preferred_brand_counts={},
            ),
        )

        search_results = [
            make_search_result(
                url="https://other.com/product",
                title="Product",
                description="Description",
            ),
            make_search_result(
                url="https://dominant.com/product",
                title="Product",
                description="Description",
            ),
        ]

        ranked = orchestrator.rank_urls_for_sku(
            sku="12345",
            search_results=search_results,
            domain_frequency={},
            brand=None,
            product_name=None,
            category=None,
        )

        # dominant.com should be first due to both cohort ranking and dominant boost
        assert ranked[0].result.url == "https://dominant.com/product"

    def test_empty_search_results_returns_empty_list(self) -> None:
        """Test that empty search results returns empty list."""
        orchestrator = BatchSearchOrchestrator(
            search_client=None,
            extractor=MockExtractor(),
            scorer=MockScorer(),
        )

        ranked = orchestrator.rank_urls_for_sku(
            sku="12345",
            search_results=[],
            domain_frequency={},
            brand="Brand",
            product_name="Product",
            category=None,
        )

        assert ranked == []

    def test_results_sorted_by_score_descending(self) -> None:
        """Test that results are sorted by score in descending order."""
        orchestrator = BatchSearchOrchestrator(
            search_client=None,
            extractor=MockExtractor(),
            scorer=MockScorer(base_score=5.0),
        )

        search_results = [
            make_search_result(url="https://low-score.com", title="Low", description=""),
            make_search_result(url="https://high-score.com", title="High", description=""),
            make_search_result(url="https://medium-score.com", title="Medium", description=""),
        ]

        # Manually inject different scores via domain frequency
        domain_frequency = {
            "low-score.com": DomainFrequency(domain="low-score.com", sku_count=1, skus={"sku1"}),
            "medium-score.com": DomainFrequency(domain="medium-score.com", sku_count=2, skus={"sku1", "sku2"}),
            "high-score.com": DomainFrequency(domain="high-score.com", sku_count=5, skus={"sku1", "sku2", "sku3", "sku4", "sku5"}),
        }

        ranked = orchestrator.rank_urls_for_sku(
            sku="12345",
            search_results=search_results,
            domain_frequency=domain_frequency,
            brand=None,
            product_name=None,
            category=None,
        )

        # Verify descending order
        assert ranked[0].result.url == "https://high-score.com"
        assert ranked[1].result.url == "https://medium-score.com"
        assert ranked[2].result.url == "https://low-score.com"

        # Verify scores are in descending order
        scores = [r.score for r in ranked]
        assert scores == sorted(scores, reverse=True)

    def test_rank_urls_for_sku_does_not_double_apply_domain_history(self, monkeypatch) -> None:
        monkeypatch.setattr("scrapers.ai_search.scoring.get_domain_success_rate", lambda _domain: 0.9)

        scorer = SearchScorer()
        orchestrator = BatchSearchOrchestrator(
            search_client=None,
            extractor=MockExtractor(),
            scorer=scorer,
        )

        search_results = [
            make_search_result(
                url="https://example.com/product/12345",
                title="Example Product",
                description="Exact product detail page",
            )
        ]

        ranked = orchestrator.rank_urls_for_sku(
            sku="12345",
            search_results=search_results,
            domain_frequency={},
            brand=None,
            product_name="Example Product",
            category=None,
        )

        direct_score = scorer.score_search_result(
            {
                "url": "https://example.com/product/12345",
                "title": "Example Product",
                "description": "Exact product detail page",
            },
            "12345",
            None,
            "Example Product",
            None,
            prefer_manufacturer=True,
        )

        assert ranked[0].score == direct_score

    def test_real_scorer_prefers_inferred_official_domain_over_high_frequency_retailer(self) -> None:
        orchestrator = BatchSearchOrchestrator(
            search_client=None,
            extractor=MockExtractor(),
            scorer=SearchScorer(),
        )

        official_url = "https://bentleyseeds.com/products/jubilee-tomato-seed"
        retailer_url = "https://www.edenbrothers.com/products/tomato_seeds_jubilee"
        search_results = [
            make_search_result(
                url=retailer_url,
                title="Bentley Seed Tomato Jubilee 1943",
                description="Retailer listing for Bentley Seed Tomato Jubilee 1943",
            ),
            make_search_result(
                url=official_url,
                title="Tomato, Jubilee Seed Packets - Bentley Seeds",
                description="Official Bentley Seeds product page",
            ),
        ]

        domain_frequency = {
            "edenbrothers.com": DomainFrequency(
                domain="edenbrothers.com",
                sku_count=5,
                skus={"sku1", "sku2", "sku3", "sku4", "sku5"},
            ),
            "bentleyseeds.com": DomainFrequency(
                domain="bentleyseeds.com",
                sku_count=1,
                skus={"sku1"},
            ),
        }

        ranked = orchestrator.rank_urls_for_sku(
            sku="051588178896",
            search_results=search_results,
            domain_frequency=domain_frequency,
            brand=None,
            product_name="Bentley Seed Tomato Jubilee 1943",
            category="Vegetable Seeds",
        )

        assert ranked[0].result.url == official_url
