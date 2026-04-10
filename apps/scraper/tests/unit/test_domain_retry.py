# Copyright Bay State Pet & Garden Supply
# Distributed under MIT License
# pyright: reportPrivateUsage=false

"""Tests for dominant domain retry logic in batch search.

These tests focus on the dominant domain detection and retry mechanism
without requiring full integration with the extraction pipeline.
"""

from __future__ import annotations

from typing import override

import pytest

from scrapers.ai_search.batch_search import BatchSearchOrchestrator, ProductInput, RankedResult, SearchResult
from scrapers.ai_search.cohort_state import _BatchCohortState


class TestDominantDomainDetection:
    """Tests for dominant domain detection with minimum_count=3."""

    def test_dominant_domain_returns_none_when_no_domains(self) -> None:
        """No domains recorded means no dominant domain."""
        state = _BatchCohortState(key="test", preferred_domain_counts={}, preferred_brand_counts={})
        result = state.dominant_domain(minimum_count=3)
        assert result is None

    def test_dominant_domain_returns_none_when_count_below_minimum(self) -> None:
        """Domain with only 2 successes should not be dominant with minimum_count=3."""
        state = _BatchCohortState(
            key="test",
            preferred_domain_counts={"chewy.com": 2},
            preferred_brand_counts={},
        )
        result = state.dominant_domain(minimum_count=3)
        assert result is None

    def test_dominant_domain_returns_domain_when_count_equals_minimum(self) -> None:
        """Domain with exactly 3 successes should be dominant with minimum_count=3."""
        state = _BatchCohortState(
            key="test",
            preferred_domain_counts={"chewy.com": 3},
            preferred_brand_counts={},
        )
        result = state.dominant_domain(minimum_count=3)
        assert result == "chewy.com"

    def test_dominant_domain_returns_domain_when_count_exceeds_minimum(self) -> None:
        """Domain with 5 successes should be dominant with minimum_count=3."""
        state = _BatchCohortState(
            key="test",
            preferred_domain_counts={"petswarehouse.com": 5},
            preferred_brand_counts={},
        )
        result = state.dominant_domain(minimum_count=3)
        assert result == "petswarehouse.com"

    def test_dominant_domain_returns_most_frequent_when_multiple_domains(self) -> None:
        """When multiple domains meet minimum, return most frequent."""
        state = _BatchCohortState(
            key="test",
            preferred_domain_counts={
                "petswarehouse.com": 4,
                "chewy.com": 3,
                "countrymax.com": 3,
            },
            preferred_brand_counts={},
        )
        result = state.dominant_domain(minimum_count=3)
        # Most frequent wins
        assert result == "petswarehouse.com"

    def test_dominant_domain_uses_alphabetical_tiebreaker(self) -> None:
        """When counts equal, alphabetical order breaks tie."""
        state = _BatchCohortState(
            key="test",
            preferred_domain_counts={
                "zzz.com": 3,
                "aaa.com": 3,
            },
            preferred_brand_counts={},
        )
        result = state.dominant_domain(minimum_count=3)
        # Alphabetically first among tied wins
        assert result == "aaa.com"

    def test_remember_domain_increments_count(self) -> None:
        """remember_domain should increment the count for a domain."""
        state = _BatchCohortState(key="test", preferred_domain_counts={}, preferred_brand_counts={})
        state.remember_domain("example.com")
        state.remember_domain("example.com")
        state.remember_domain("example.com")
        assert state.preferred_domain_counts.get("example.com") == 3

    def test_remember_domain_ignores_empty_domain(self) -> None:
        """remember_domain ignores empty strings but preserves raw non-empty values."""
        state = _BatchCohortState(key="test", preferred_domain_counts={}, preferred_brand_counts={})
        state.remember_domain("")
        state.remember_domain("   ")
        state.remember_domain("example.com")
        assert state.preferred_domain_counts.get("example.com") == 1
        assert state.preferred_domain_counts.get("   ") == 1
        assert len(state.preferred_domain_counts) == 2

    def test_ranked_domains_returns_sorted_list(self) -> None:
        """ranked_domains should return domains sorted by count desc then alpha."""
        state = _BatchCohortState(
            key="test",
            preferred_domain_counts={"b.com": 2, "a.com": 3, "c.com": 1},
            preferred_brand_counts={},
        )
        result = state.ranked_domains()
        assert result == ["a.com", "b.com", "c.com"]


class TestDominantDomainMinimumCountVariants:
    """Tests for different minimum_count values."""

    def test_minimum_count_of_2(self) -> None:
        """With minimum_count=2, domain with 2 successes is dominant."""
        state = _BatchCohortState(
            key="test",
            preferred_domain_counts={"example.com": 2},
            preferred_brand_counts={},
        )
        result = state.dominant_domain(minimum_count=2)
        assert result == "example.com"

    def test_minimum_count_of_3_requires_3_or_more(self) -> None:
        """With minimum_count=3, domain needs exactly 3 or more successes."""
        state = _BatchCohortState(
            key="test",
            preferred_domain_counts={"example.com": 2},
            preferred_brand_counts={},
        )
        result = state.dominant_domain(minimum_count=3)
        assert result is None

    def test_minimum_count_of_4_with_4_successes(self) -> None:
        """With minimum_count=4, domain needs 4 or more successes."""
        state = _BatchCohortState(
            key="test",
            preferred_domain_counts={"example.com": 4},
            preferred_brand_counts={},
        )
        result = state.dominant_domain(minimum_count=4)
        assert result == "example.com"

    def test_minimum_count_of_4_with_only_3_successes(self) -> None:
        """With minimum_count=4, domain with only 3 successes is NOT dominant."""
        state = _BatchCohortState(
            key="test",
            preferred_domain_counts={"example.com": 3},
            preferred_brand_counts={},
        )
        result = state.dominant_domain(minimum_count=4)
        assert result is None


class TestDominantDomainRetryLogic:
    """Tests for dominant domain retry logic in BatchSearchOrchestrator.

    These tests verify the retry behavior by testing the cohort_state
    integration and the conditions that trigger retry.
    """

    def test_dominant_domain_established_after_3_successes(self) -> None:
        """After 3 successful extractions from same domain, it becomes dominant."""
        state = _BatchCohortState(key="test", preferred_domain_counts={}, preferred_brand_counts={})

        # Simulate successful extractions
        state.remember_domain("petswarehouse.com")
        state.remember_domain("petswarehouse.com")
        assert state.dominant_domain(minimum_count=3) is None  # Not yet

        state.remember_domain("petswarehouse.com")  # Third success
        assert state.dominant_domain(minimum_count=3) == "petswarehouse.com"

    def test_dominant_domain_persists_across_multiple_products(self) -> None:
        """Dominant domain should be consistent across different SKU extractions."""
        state = _BatchCohortState(key="test", preferred_domain_counts={}, preferred_brand_counts={})

        # Product 1
        state.remember_domain("petswarehouse.com")
        state.remember_domain("petswarehouse.com")

        # Product 2 (different domain)
        state.remember_domain("chewy.com")

        # Product 3
        state.remember_domain("petswarehouse.com")  # Now has 3

        # Dominant should be petswarehouse.com
        assert state.dominant_domain(minimum_count=3) == "petswarehouse.com"

    def test_no_dominant_domain_when_no_single_domain_prevals(self) -> None:
        """No dominant domain when success is spread across domains."""
        state = _BatchCohortState(
            key="test",
            preferred_domain_counts={
                "petswarehouse.com": 1,
                "chewy.com": 1,
                "countrymax.com": 1,
            },
            preferred_brand_counts={},
        )
        # No domain has 3+ successes
        assert state.dominant_domain(minimum_count=3) is None

    def test_dominant_domain_changes_when_different_domain_becomes_more_successful(self) -> None:
        """If a different domain gets more successes, it becomes dominant."""
        state = _BatchCohortState(
            key="test",
            preferred_domain_counts={
                "petswarehouse.com": 3,
                "chewy.com": 4,
            },
            preferred_brand_counts={},
        )
        # chewy.com now has 4 successes, should be dominant
        assert state.dominant_domain(minimum_count=3) == "chewy.com"

    def test_retry_condition_requires_minimum_3_successes(self) -> None:
        """The retry mechanism uses minimum_count=3 to determine dominant domain.

        This test verifies the condition used in batch_search.py:
            dominant_domain = self._cohort_state.dominant_domain(minimum_count=3)
        """
        state = _BatchCohortState(
            key="test",
            preferred_domain_counts={"petswarehouse.com": 2},
            preferred_brand_counts={},
        )
        # With only 2 successes, no dominant domain for retry
        result = state.dominant_domain(minimum_count=3)
        assert result is None

    def test_dominant_domain_tiebreaker_alphabetical(self) -> None:
        """When two domains have equal success count, alphabetical order breaks tie."""
        state = _BatchCohortState(
            key="test",
            preferred_domain_counts={
                "zzz.com": 3,
                "aaa.com": 3,
            },
            preferred_brand_counts={},
        )
        # Alphabetically first should win
        assert state.dominant_domain(minimum_count=3) == "aaa.com"


class _RetryTestOrchestrator(BatchSearchOrchestrator):
    def __init__(self, cohort_state: _BatchCohortState | None = None) -> None:
        class _ScorerStub:
            BLOCKED_DOMAINS: tuple[str, ...] = ()

            @staticmethod
            def domain_from_url(url: str) -> str:
                return url.split("/")[2] if "//" in url else ""

            @staticmethod
            def _domain_matches_candidates(domain: str, candidates: tuple[str, ...]) -> bool:
                _ = domain, candidates
                return False

            @staticmethod
            def is_category_like_url(url: str) -> bool:
                _ = url
                return False

        super().__init__(
            search_client=object(),
            extractor=object(),
            scorer=_ScorerStub(),
            cohort_state=cohort_state,
        )
        self.extract_plan: dict[str, tuple[dict[str, object] | None, str]] = {}
        self.site_specific_ranked_results: list[RankedResult] = []
        self.site_search_calls: list[str] = []
        self.extract_attempts: list[str] = []

    def set_product(self, sku: str, name: str = "Test Product", brand: str | None = "Acme") -> None:
        self._product_context[sku] = ProductInput(sku=sku, name=name, brand=brand)

    @override
    async def _extract_and_validate(
        self,
        sku: str,
        candidate: SearchResult,
        product_name: str | None,
        brand: str | None,
    ) -> tuple[dict[str, object] | None, str]:
        _ = sku, product_name, brand
        self.extract_attempts.append(candidate.url)
        result, error = self.extract_plan.get(candidate.url, (None, "Extraction failed"))
        if result and result.get("url"):
            self._remember_successful_domain(str(result["url"]))
        return result, error

    @override
    async def _search_site_specific(self, domain: str, product: ProductInput | None) -> list[RankedResult]:
        _ = product
        self.site_search_calls.append(domain)
        return self.site_specific_ranked_results


def _ranked(url: str, score: float = 10.0) -> RankedResult:
    return RankedResult(result=SearchResult(url=url, title="Test title", description="Test description"), score=score)


@pytest.mark.asyncio
async def test_retry_triggered_when_product_fails_and_dominant_exists() -> None:
    cohort_state = _BatchCohortState(
        key="test",
        preferred_domain_counts={"petswarehouse.com": 3},
        preferred_brand_counts={},
    )
    orchestrator = _RetryTestOrchestrator(cohort_state=cohort_state)
    orchestrator.set_product("SKU-1")

    initial_url = "https://acme.com/products/sku-1"
    retry_url = "https://petswarehouse.com/products/sku-1"
    orchestrator.extract_plan = {
        initial_url: (None, "Initial extraction failed"),
        retry_url: ({"success": True, "url": retry_url, "product_name": "Test Product"}, ""),
    }
    orchestrator.site_specific_ranked_results = [_ranked(retry_url)]

    result = await orchestrator.extract_batch({"SKU-1": [_ranked(initial_url)]}, max_concurrent=1)

    assert orchestrator.site_search_calls == ["petswarehouse.com"]
    assert orchestrator.extract_attempts == [initial_url, retry_url]
    assert result["SKU-1"]["success"] is True
    assert cohort_state.preferred_domain_counts["petswarehouse.com"] == 4


@pytest.mark.asyncio
async def test_no_retry_when_no_dominant_domain_exists() -> None:
    cohort_state = _BatchCohortState(
        key="test",
        preferred_domain_counts={"petswarehouse.com": 2},
        preferred_brand_counts={},
    )
    orchestrator = _RetryTestOrchestrator(cohort_state=cohort_state)
    orchestrator.set_product("SKU-1")

    initial_url = "https://acme.com/products/sku-1"
    orchestrator.extract_plan = {
        initial_url: (None, "Initial extraction failed"),
    }

    result = await orchestrator.extract_batch({"SKU-1": [_ranked(initial_url)]}, max_concurrent=1)

    assert orchestrator.site_search_calls == []
    assert orchestrator.extract_attempts == [initial_url]
    assert result["SKU-1"] == {"success": False, "error": "Initial extraction failed"}


@pytest.mark.asyncio
async def test_fallback_after_retry_failure() -> None:
    cohort_state = _BatchCohortState(
        key="test",
        preferred_domain_counts={"petswarehouse.com": 3},
        preferred_brand_counts={},
    )
    orchestrator = _RetryTestOrchestrator(cohort_state=cohort_state)
    orchestrator.set_product("SKU-1")

    initial_url = "https://acme.com/products/sku-1"
    retry_url = "https://petswarehouse.com/products/sku-1"
    orchestrator.extract_plan = {
        initial_url: (None, "Initial extraction failed"),
        retry_url: (None, "Dominant retry failed"),
    }
    orchestrator.site_specific_ranked_results = [_ranked(retry_url)]

    result = await orchestrator.extract_batch({"SKU-1": [_ranked(initial_url)]}, max_concurrent=1)

    assert orchestrator.site_search_calls == ["petswarehouse.com"]
    assert orchestrator.extract_attempts == [initial_url, retry_url]
    assert result["SKU-1"] == {"success": False, "error": "Dominant retry failed"}


@pytest.mark.asyncio
async def test_cohort_state_updated_after_retry_success() -> None:
    cohort_state = _BatchCohortState(
        key="test",
        preferred_domain_counts={"petswarehouse.com": 3},
        preferred_brand_counts={},
    )
    orchestrator = _RetryTestOrchestrator(cohort_state=cohort_state)
    orchestrator.set_product("SKU-1")

    initial_url = "https://acme.com/products/sku-1"
    retry_url = "https://petswarehouse.com/products/sku-1"
    orchestrator.extract_plan = {
        initial_url: (None, "Initial extraction failed"),
        retry_url: ({"success": True, "url": retry_url, "product_name": "Test Product"}, ""),
    }
    orchestrator.site_specific_ranked_results = [_ranked(retry_url)]

    _ = await orchestrator.extract_batch({"SKU-1": [_ranked(initial_url)]}, max_concurrent=1)

    assert cohort_state.preferred_domain_counts["petswarehouse.com"] == 4
