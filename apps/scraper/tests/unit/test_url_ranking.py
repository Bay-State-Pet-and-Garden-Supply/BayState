"""Unit tests for OfficialBrandScraper._rank_url_candidates (Phase 3).

These tests verify tiered ranking logic, deduplication, cross-confirmation
bonuses, fallback URL selection, and selection_tier values.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from scrapers.ai_search.official_brand_scraper import OfficialBrandScraper

ALLOWED_TIERS = {"official_domain", "preferred_domain", "knowledge_graph", "llm_scored", "organic"}


def _build_scorer_mock(base_score: float = 5.0) -> MagicMock:
    """Build a SearchScorer mock that returns a fixed base_score."""
    scorer = MagicMock()
    scorer.score_search_result.return_value = base_score
    return scorer


@pytest.fixture
def scraper() -> OfficialBrandScraper:
    """Create a scraper with mocked dependencies."""
    with patch("scrapers.ai_search.official_brand_scraper.SearchClient"):
        with patch("scrapers.ai_search.official_brand_scraper.BrandSourceSelector"):
            return OfficialBrandScraper(
                llm_provider="openai",
                llm_model="gpt-4o-mini",
                llm_api_key="test-key",
            )


class TestRankUrlCandidatesOfficialVsPreferred:
    """Tests for official domain vs preferred domain ranking."""

    def test_official_domain_in_phase2_outranks_preferred(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """An official domain appearing in Phase 2 should outrank a preferred domain."""
        with patch(
            "scrapers.ai_search.scoring.SearchScorer",
            return_value=_build_scorer_mock(5.0),
        ):
            with patch(
                "scrapers.ai_search.scoring.get_domain_success_rate",
                return_value=0.5,
            ):
                phase1 = [
                    {"url": "https://preferred-store.com/product/123", "title": "Product at Preferred", "result_type": "organic"},
                ]
                phase2 = [
                    {"url": "https://official-brand.com/product/123", "title": "Official Product Page", "result_type": "organic"},
                    {"url": "https://preferred-store.com/product/123", "title": "Product at Preferred", "result_type": "organic"},
                ]
                result = scraper._rank_url_candidates(
                    sku="SKU-001",
                    phase1_results=phase1,
                    phase2_results=phase2,
                    official_domains=["official-brand.com"],
                    preferred_domains=["preferred-store.com"],
                    predicted_name="Official Product",
                )

        assert result.selected_url == "https://official-brand.com/product/123"
        assert result.ranked_candidates[0].selection_tier == "official_domain"
        # Verify preferred is still present
        tiers = [c.selection_tier for c in result.ranked_candidates]
        assert "preferred_domain" in tiers

    def test_official_domain_in_phase1_still_outranks(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """An official domain appearing in Phase 1 should outrank preferred (score +80)."""
        with patch(
            "scrapers.ai_search.scoring.SearchScorer",
            return_value=_build_scorer_mock(5.0),
        ):
            with patch(
                "scrapers.ai_search.scoring.get_domain_success_rate",
                return_value=0.5,
            ):
                phase1 = [
                    {"url": "https://official-brand.com/product/123", "title": "Official Product", "result_type": "organic"},
                ]
                phase2 = [
                    {"url": "https://preferred-store.com/product/123", "title": "Product at Preferred", "result_type": "organic"},
                ]
                result = scraper._rank_url_candidates(
                    sku="SKU-001",
                    phase1_results=phase1,
                    phase2_results=phase2,
                    official_domains=["official-brand.com"],
                    preferred_domains=["preferred-store.com"],
                    predicted_name="Official Product",
                )

        assert result.selected_url == "https://official-brand.com/product/123"
        assert result.ranked_candidates[0].selection_tier == "official_domain"

    def test_preferred_domain_phase2_beats_preferred_domain_phase1(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """A preferred domain in Phase 2 (+60) beats preferred domain in Phase 1 (+50)."""
        with patch(
            "scrapers.ai_search.scoring.SearchScorer",
            return_value=_build_scorer_mock(5.0),
        ):
            with patch(
                "scrapers.ai_search.scoring.get_domain_success_rate",
                return_value=0.5,
            ):
                phase1 = [
                    {"url": "https://store-alpha.com/product/123", "title": "Alpha Store", "result_type": "organic"},
                ]
                phase2 = [
                    {"url": "https://store-beta.com/product/123", "title": "Beta Store", "result_type": "organic"},
                ]
                result = scraper._rank_url_candidates(
                    sku="SKU-001",
                    phase1_results=phase1,
                    phase2_results=phase2,
                    official_domains=[],
                    preferred_domains=["store-alpha.com", "store-beta.com"],
                    predicted_name="Product Name",
                )

        # Beta was in Phase 2 so gets +60 vs Alpha's +50
        assert result.selected_url == "https://store-beta.com/product/123"

    def test_knowledge_graph_tier(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """A knowledge_graph result_type should be assigned knowledge_graph tier."""
        with patch(
            "scrapers.ai_search.scoring.SearchScorer",
            return_value=_build_scorer_mock(5.0),
        ):
            with patch(
                "scrapers.ai_search.scoring.get_domain_success_rate",
                return_value=0.5,
            ):
                phase1 = [
                    {"url": "https://kg-brand.com", "title": "Brand Knowledge Graph", "result_type": "knowledge_graph"},
                ]
                result = scraper._rank_url_candidates(
                    sku="SKU-001",
                    phase1_results=phase1,
                    phase2_results=[],
                    official_domains=[],
                    preferred_domains=[],
                    predicted_name="Brand Name",
                )

        assert result.selected_url == "https://kg-brand.com"
        assert result.ranked_candidates[0].selection_tier == "knowledge_graph"


class TestRankUrlCandidatesCrossConfirmation:
    """Tests for cross-confirmation bonus when a URL appears in both phases."""

    def test_cross_confirmation_adds_exact_ten_bonus(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """Cross-confirmation (Phase 1 + Phase 2) should add exactly +10 to the score.

        Compare scores with and without cross-confirmation holding all other
        factors (URL, domain, title, mocked scorer) constant.
        """
        with patch(
            "scrapers.ai_search.scoring.SearchScorer",
            return_value=_build_scorer_mock(5.0),
        ):
            with patch(
                "scrapers.ai_search.scoring.get_domain_success_rate",
                return_value=0.5,
            ):
                # Scenario 1: URL appears in Phase 1 only — no cross-confirmation
                result_single = scraper._rank_url_candidates(
                    sku="SKU-001",
                    phase1_results=[
                        {"url": "https://example.com/product/123", "title": "Product 123", "result_type": "organic"},
                    ],
                    phase2_results=[],
                    official_domains=[],
                    preferred_domains=[],
                    predicted_name="Product Name",
                )

                # Scenario 2: Same URL appears in both Phase 1 and Phase 2
                result_cross = scraper._rank_url_candidates(
                    sku="SKU-001",
                    phase1_results=[
                        {"url": "https://example.com/product/123", "title": "Product 123", "result_type": "organic"},
                    ],
                    phase2_results=[
                        {"url": "https://example.com/product/123", "title": "Product 123 Official", "result_type": "organic"},
                    ],
                    official_domains=[],
                    preferred_domains=[],
                    predicted_name="Product Name",
                )

        score_without = result_single.ranked_candidates[0].score if result_single.ranked_candidates else 0.0
        score_with = result_cross.ranked_candidates[0].score if result_cross.ranked_candidates else 0.0

        # All factors are identical — the only difference is cross-confirmation bonus
        expected_without = 5.0 + (0.5 * 5)  # base + domain success
        expected_with = 5.0 + (0.5 * 5) + 10.0  # base + domain success + cross-confirmation

        assert score_without == pytest.approx(expected_without, abs=0.01)
        assert score_with == pytest.approx(expected_with, abs=0.01)
        assert score_with == pytest.approx(score_without + 10.0, abs=0.01)

    def test_cross_confirmed_url_appears_in_phases(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """A URL appearing in both phases should have appeared_in_phases [1, 2]."""
        with patch(
            "scrapers.ai_search.scoring.SearchScorer",
            return_value=_build_scorer_mock(5.0),
        ):
            with patch(
                "scrapers.ai_search.scoring.get_domain_success_rate",
                return_value=0.5,
            ):
                phase1 = [
                    {"url": "https://example.com/product/123", "title": "Title 1", "result_type": "organic"},
                ]
                phase2 = [
                    {"url": "https://example.com/product/123", "title": "Title 2", "result_type": "organic"},
                ]
                result = scraper._rank_url_candidates(
                    sku="SKU-001",
                    phase1_results=phase1,
                    phase2_results=phase2,
                    official_domains=[],
                    preferred_domains=[],
                    predicted_name="Product Name",
                )

        candidate = result.ranked_candidates[0]
        assert candidate.appeared_in_phases == [1, 2]


class TestRankUrlCandidatesDeduplication:
    """Tests for URL deduplication across phases."""

    def test_same_url_deduplicated(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When the same URL appears in Phase 1 and Phase 2, it should appear only once."""
        with patch(
            "scrapers.ai_search.scoring.SearchScorer",
            return_value=_build_scorer_mock(5.0),
        ):
            with patch(
                "scrapers.ai_search.scoring.get_domain_success_rate",
                return_value=0.5,
            ):
                phase1 = [
                    {"url": "https://example.com/product/123", "title": "From Phase 1", "result_type": "organic"},
                ]
                phase2 = [
                    {"url": "https://example.com/product/123", "title": "From Phase 2", "result_type": "organic"},
                ]
                result = scraper._rank_url_candidates(
                    sku="SKU-001",
                    phase1_results=phase1,
                    phase2_results=phase2,
                    official_domains=[],
                    preferred_domains=[],
                    predicted_name="Product Name",
                )

        # Should only be 1 candidate (not 2)
        assert len(result.ranked_candidates) == 1

    def test_different_urls_both_present(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """Different URLs should each appear as separate candidates."""
        with patch(
            "scrapers.ai_search.scoring.SearchScorer",
            return_value=_build_scorer_mock(5.0),
        ):
            with patch(
                "scrapers.ai_search.scoring.get_domain_success_rate",
                return_value=0.5,
            ):
                phase1 = [
                    {"url": "https://alpha.com/product/123", "title": "Alpha", "result_type": "organic"},
                ]
                phase2 = [
                    {"url": "https://beta.com/product/123", "title": "Beta", "result_type": "organic"},
                ]
                result = scraper._rank_url_candidates(
                    sku="SKU-001",
                    phase1_results=phase1,
                    phase2_results=phase2,
                    official_domains=[],
                    preferred_domains=[],
                    predicted_name="Product Name",
                )

        assert len(result.ranked_candidates) == 2


class TestRankUrlCandidatesFallbackUrls:
    """Tests for fallback URL selection."""

    def test_fallback_urls_are_next_three(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """fallback_urls should contain the next 3 URLs after the selected one."""
        with patch(
            "scrapers.ai_search.scoring.SearchScorer",
            return_value=_build_scorer_mock(5.0),
        ):
            with patch(
                "scrapers.ai_search.scoring.get_domain_success_rate",
                return_value=0.5,
            ):
                phase1 = [
                    {"url": "https://example.com/1", "title": "One", "result_type": "organic"},
                ]
                phase2 = [
                    {"url": "https://example.com/2", "title": "Two", "result_type": "organic"},
                    {"url": "https://example.com/3", "title": "Three", "result_type": "organic"},
                    {"url": "https://example.com/4", "title": "Four", "result_type": "organic"},
                    {"url": "https://example.com/5", "title": "Five", "result_type": "organic"},
                ]
                result = scraper._rank_url_candidates(
                    sku="SKU-001",
                    phase1_results=phase1,
                    phase2_results=phase2,
                    official_domains=[],
                    preferred_domains=[],
                    predicted_name="Product Name",
                )

        # 5 candidates total. Selected is the highest-scored.
        assert len(result.fallback_urls) == 3
        # fallback_urls should not include selected_url
        assert result.selected_url not in result.fallback_urls

    def test_fallback_urls_fewer_than_three(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When fewer than 4 total candidates, fallback_urls should contain whatever remains."""
        with patch(
            "scrapers.ai_search.scoring.SearchScorer",
            return_value=_build_scorer_mock(5.0),
        ):
            with patch(
                "scrapers.ai_search.scoring.get_domain_success_rate",
                return_value=0.5,
            ):
                phase2 = [
                    {"url": "https://example.com/only", "title": "Only One", "result_type": "organic"},
                ]
                result = scraper._rank_url_candidates(
                    sku="SKU-001",
                    phase1_results=[],
                    phase2_results=phase2,
                    official_domains=[],
                    preferred_domains=[],
                    predicted_name="Product Name",
                )

        # Only 1 candidate, so no fallbacks
        assert len(result.fallback_urls) == 0

    def test_fallback_urls_no_candidates(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When there are no candidates at all, fallback_urls should be empty."""
        result = scraper._rank_url_candidates(
            sku="SKU-001",
            phase1_results=[],
            phase2_results=[],
            official_domains=[],
            preferred_domains=[],
            predicted_name="Product Name",
        )

        assert result.selected_url is None
        assert result.fallback_urls == []
        assert result.ranked_candidates == []


class TestRankUrlCandidatesSelectionTiers:
    """Tests that selection_tier values are valid allowed strings."""

    def test_all_tiers_are_allowed_strings(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """Every candidate's selection_tier must be one of the allowed values."""
        with patch(
            "scrapers.ai_search.scoring.SearchScorer",
            return_value=_build_scorer_mock(5.0),
        ):
            with patch(
                "scrapers.ai_search.scoring.get_domain_success_rate",
                return_value=0.5,
            ):
                phase1 = [
                    {"url": "https://official.com/1", "title": "Official", "result_type": "organic"},
                    {"url": "https://preferred.com/1", "title": "Preferred", "result_type": "organic"},
                ]
                phase2 = [
                    {"url": "https://official.com/1", "title": "Official", "result_type": "organic"},
                    {"url": "https://preferred.com/1", "title": "Preferred", "result_type": "organic"},
                    {"url": "https://kg-result.com/1", "title": "KG", "result_type": "knowledge_graph"},
                    {"url": "https://organic.com/1", "title": "Organic", "result_type": "organic"},
                ]
                result = scraper._rank_url_candidates(
                    sku="SKU-001",
                    phase1_results=phase1,
                    phase2_results=phase2,
                    official_domains=["official.com"],
                    preferred_domains=["preferred.com"],
                    predicted_name="Product Name",
                )

        for candidate in result.ranked_candidates:
            assert candidate.selection_tier in ALLOWED_TIERS, (
                f"Unexpected tier '{candidate.selection_tier}' for {candidate.url}"
            )

    def test_organic_tier_when_no_domain_match(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """A result with no domain match and not a KG result should be 'organic'."""
        with patch(
            "scrapers.ai_search.scoring.SearchScorer",
            return_value=_build_scorer_mock(5.0),
        ):
            with patch(
                "scrapers.ai_search.scoring.get_domain_success_rate",
                return_value=0.5,
            ):
                phase1 = [
                    {"url": "https://random-site.com/product/123", "title": "Random", "result_type": "organic"},
                ]
                result = scraper._rank_url_candidates(
                    sku="SKU-001",
                    phase1_results=phase1,
                    phase2_results=[],
                    official_domains=[],
                    preferred_domains=[],
                    predicted_name="Product Name",
                )

        assert result.ranked_candidates[0].selection_tier == "organic"


class TestRankUrlCandidatesScoreDetails:
    """Tests for detailed scoring behavior."""

    def test_sku_in_url_adds_bonus(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When the SKU appears in the URL, title, or description, score should get +5."""
        with patch(
            "scrapers.ai_search.scoring.SearchScorer",
            return_value=_build_scorer_mock(5.0),
        ):
            with patch(
                "scrapers.ai_search.scoring.get_domain_success_rate",
                return_value=0.5,
            ):
                phase1 = [
                    {"url": "https://example.com/SKU-001", "title": "Product", "description": "Contains SKU-001", "result_type": "organic"},
                    {"url": "https://other.com/product/abc", "title": "Other", "description": "No SKU here", "result_type": "organic"},
                ]
                result = scraper._rank_url_candidates(
                    sku="SKU-001",
                    phase1_results=phase1,
                    phase2_results=[],
                    official_domains=[],
                    preferred_domains=[],
                    predicted_name="Product Name",
                )

        sku_url = next(c for c in result.ranked_candidates if "SKU-001" in c.url)
        other_url = next(c for c in result.ranked_candidates if "other.com" in c.url)
        # The SKU_url should have +5 bonus
        assert sku_url.score > other_url.score

    def test_predicted_name_token_overlap_adds_bonus(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When the predicted_name tokens overlap with title tokens by >=2, score gets +3."""
        with patch(
            "scrapers.ai_search.scoring.SearchScorer",
            return_value=_build_scorer_mock(5.0),
        ):
            with patch(
                "scrapers.ai_search.scoring.get_domain_success_rate",
                return_value=0.5,
            ):
                phase1 = [
                    # Title has "Potting Mix" overlapping with predicted name
                    {"url": "https://example.com/1", "title": "Miracle-Gro Potting Mix 25 Quart", "result_type": "organic"},
                    # Title has no meaningful overlap
                    {"url": "https://other.com/1", "title": "Some Other Product", "result_type": "organic"},
                ]
                result = scraper._rank_url_candidates(
                    sku="SKU-001",
                    phase1_results=phase1,
                    phase2_results=[],
                    official_domains=[],
                    preferred_domains=[],
                    predicted_name="Miracle-Gro Potting Mix",
                )

        overlapping = next(c for c in result.ranked_candidates if "example.com" in c.url)
        non_overlapping = next(c for c in result.ranked_candidates if "other.com" in c.url)
        assert overlapping.score > non_overlapping.score


class TestRankUrlCandidatesPhaseCounts:
    """Tests for phase1_result_count and phase2_result_count."""

    def test_phase_counts_are_accurate(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """The result should accurately report result counts for each phase."""
        with patch(
            "scrapers.ai_search.scoring.SearchScorer",
            return_value=_build_scorer_mock(5.0),
        ):
            with patch(
                "scrapers.ai_search.scoring.get_domain_success_rate",
                return_value=0.5,
            ):
                phase1 = [
                    {"url": "https://a.com/1", "title": "A1", "result_type": "organic"},
                    {"url": "https://b.com/1", "title": "B1", "result_type": "organic"},
                ]
                phase2 = [
                    {"url": "https://c.com/1", "title": "C1", "result_type": "organic"},
                    {"url": "https://d.com/1", "title": "D1", "result_type": "organic"},
                    {"url": "https://e.com/1", "title": "E1", "result_type": "organic"},
                ]
                result = scraper._rank_url_candidates(
                    sku="SKU-001",
                    phase1_results=phase1,
                    phase2_results=phase2,
                    official_domains=[],
                    preferred_domains=[],
                    predicted_name="Product Name",
                )

        assert result.phase1_result_count == 2
        assert result.phase2_result_count == 3

    def test_empty_phases_reported_as_zero(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When both phases are empty, counts should be 0."""
        result = scraper._rank_url_candidates(
            sku="SKU-001",
            phase1_results=[],
            phase2_results=[],
            official_domains=[],
            preferred_domains=[],
            predicted_name="Product Name",
        )

        assert result.phase1_result_count == 0
        assert result.phase2_result_count == 0
