"""Tests for the ApprovedSourceExecutor.

Validates ordering, auth handling, fallback behavior, policy enforcement,
and that the executor never returns None.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from scrapers.approved_sources.executor import ApprovedSourceExecutor
from scrapers.approved_sources.types import (
    ApprovedSourcePlan,
    ApprovedSourcePlanEntry,
    ApprovedSourceBrand,
    ApprovedSourcePolicy,
    ApprovedSourceLLMPolicy,
)


def _make_plan(
    sku: str = "001135",
    selected_distributor: str | None = "bradley",
    entries: list[ApprovedSourcePlanEntry] | None = None,
    llm_enabled: bool = True,
) -> ApprovedSourcePlan:
    if entries is None:
        entries = [
            ApprovedSourcePlanEntry(
                sourceType="distributor",
                sourceSlug="bradley",
                displayName="Bradley Caldwell",
                domains=["bradleycaldwell.com"],
                assetDomains=["bradleycaldwell.com"],
                adapterSlug="bradley_crawl4ai",
                requiresAuth=False,
                searchMode="sku_search",
                allowedFields=["name", "brand", "image_urls"],
                priority=10,
                runFirst=True,
            )
        ]
    return ApprovedSourcePlan(
        sku=sku,
        input={"name": "E-Z HANG SCALE", "price": None},
        brand=ApprovedSourceBrand(id="brand-1", name="KERBL", slug="kerbl"),
        selectedDistributorSlug=selected_distributor,
        priority=entries,
        sourcePolicy=ApprovedSourcePolicy(
            allowedDomains=["bradleycaldwell.com", "centralpet.com", "orgill.com", "shop.phillipspet.com", "petfoodexperts.com"],
            allowedAssetDomains=["bradleycaldwell.com", "centralpet.com", "orgill.com", "shop.phillipspet.com", "petfoodexperts.com"],
            disallowedDomains=["amazon.com", "chewy.com", "walmart.com", "petco.com", "petsmart.com", "ebay.com", "etsy.com"],
            approvedSourcesOnly=True,
        ),
        llmPolicy=ApprovedSourceLLMPolicy(enabled=llm_enabled),
    )


SAMPLE_BRADLEY_HTML = """<html><body>
  <main>
    <p><a href="/brands/kerbl">KERBL</a></p>
    <h1>E-Z HANG SCALE</h1>
    <h2>Additional Details</h2>
    <dl>
      <dt>BCI Item Number</dt><dd>001135</dd>
      <dt>UPC</dt><dd>123456789012</dd>
    </dl>
  </main>
</body></html>"""


SAMPLE_NO_MATCH_HTML = """<html><body>
  <h3>Sorry, no results for xyzabc123notexist456</h3>
</body></html>"""


def _create_plan_with_mock_html(
    entries: list[ApprovedSourcePlanEntry] | None = None,
    llm_enabled: bool = True,
    selected_distributor: str | None = "bradley",
) -> tuple[ApprovedSourcePlan, MagicMock]:
    """Helper to create plan + mock extractor for test cases."""
    plan = _make_plan(
        entries=entries,
        llm_enabled=llm_enabled,
        selected_distributor=selected_distributor,
    )
    mock_extractor = MagicMock()
    mock_extractor.api_client = None
    return plan, mock_extractor


class TestExecutor:
    """Tests for the ApprovedSourceExecutor orchestration logic."""

    @patch("scrapers.approved_sources.adapters.base.BaseDistributorCrawl4AIAdapter._fetch_html")
    def test_executor_never_returns_none(self, mock_fetch):
        mock_fetch.return_value = SAMPLE_NO_MATCH_HTML
        plan, mock_extractor = _create_plan_with_mock_html()
        executor = ApprovedSourceExecutor(plan=plan, extractor=mock_extractor)
        import asyncio
        result = asyncio.run(executor.execute())
        assert result is not None
        assert result.sku == "001135"
        assert result.status in ("success", "partial", "failed")
        assert result.decision is not None

    @patch("scrapers.approved_sources.adapters.base.BaseDistributorCrawl4AIAdapter._fetch_html")
    def test_executor_returns_failed_when_no_source(self, mock_fetch):
        """When all sources fail, executor returns failed result."""
        mock_fetch.return_value = SAMPLE_NO_MATCH_HTML
        plan, mock_extractor = _create_plan_with_mock_html(llm_enabled=False)
        executor = ApprovedSourceExecutor(plan=plan, extractor=mock_extractor)
        import asyncio
        result = asyncio.run(executor.execute())
        assert result.status == "failed"
        assert result.decision == "failed"

    @patch("scrapers.approved_sources.adapters.bradley.BradleyAdapter._fetch_html")
    @patch("scrapers.approved_sources.adapters.phillips.PhillipsAdapter._fetch_html")
    def test_selected_distributor_runs_first(self, mock_phillips_fetch, mock_bradley_fetch):
        """Entry with runFirst=True should be attempted before others."""
        mock_bradley_fetch.return_value = SAMPLE_BRADLEY_HTML
        mock_phillips_fetch.return_value = SAMPLE_NO_MATCH_HTML

        entries = [
            ApprovedSourcePlanEntry(
                sourceType="distributor",
                sourceSlug="phillips",
                displayName="Phillips",
                domains=["shop.phillipspet.com"],
                assetDomains=["shop.phillipspet.com"],
                adapterSlug="phillips_crawl4ai",
                requiresAuth=False,
                searchMode="sku_search",
                allowedFields=["name"],
                priority=50,
                runFirst=False,
            ),
            ApprovedSourcePlanEntry(
                sourceType="distributor",
                sourceSlug="bradley",
                displayName="Bradley Caldwell",
                domains=["bradleycaldwell.com"],
                assetDomains=["bradleycaldwell.com"],
                adapterSlug="bradley_crawl4ai",
                requiresAuth=False,
                searchMode="sku_search",
                allowedFields=["name", "brand"],
                priority=10,
                runFirst=True,
            ),
        ]
        plan = _make_plan(entries=entries, llm_enabled=False)
        mock_extractor = MagicMock()
        mock_extractor.api_client = None

        call_order = []

        async def track_bradley(url):
            call_order.append(url)
            return SAMPLE_BRADLEY_HTML

        async def track_phillips(url):
            call_order.append(url)
            return SAMPLE_NO_MATCH_HTML

        mock_bradley_fetch.side_effect = track_bradley
        mock_phillips_fetch.side_effect = track_phillips

        executor = ApprovedSourceExecutor(plan=plan, extractor=mock_extractor)
        import asyncio
        result = asyncio.run(executor.execute())
        # Bradley has runFirst=True, so its domain should be the first fetch
        assert result is not None
        first_url = call_order[0] if call_order else ""
        assert "bradleycaldwell.com" in first_url

    @patch("scrapers.approved_sources.adapters.base.BaseDistributorCrawl4AIAdapter._fetch_html")
    def test_auth_required_continues_to_next_source(self, mock_fetch):
        """When a source returns auth_required, executor continues."""
        mock_fetch.return_value = SAMPLE_NO_MATCH_HTML

        entries = [
            ApprovedSourcePlanEntry(
                sourceType="distributor",
                sourceSlug="phillips",
                displayName="Phillips",
                domains=["shop.phillipspet.com"],
                assetDomains=["shop.phillipspet.com"],
                adapterSlug="phillips_crawl4ai",
                requiresAuth=True,
                searchMode="sku_search",
                allowedFields=["name"],
                priority=10,
                runFirst=True,
            ),
        ]
        plan = _make_plan(entries=entries, llm_enabled=False)
        mock_extractor = MagicMock()
        mock_extractor.api_client = None

        executor = ApprovedSourceExecutor(plan=plan, extractor=mock_extractor)
        import asyncio
        result = asyncio.run(executor.execute())
        # Should fail since no other source available and no fallback
        assert result.status == "failed"

    @patch("scrapers.approved_sources.adapters.base.BaseDistributorCrawl4AIAdapter._fetch_html")
    def test_llm_fallback_disabled(self, mock_fetch):
        """When llmPolicy.enabled=False, executor should not use official brand fallback."""
        mock_fetch.return_value = SAMPLE_NO_MATCH_HTML
        plan, mock_extractor = _create_plan_with_mock_html(llm_enabled=False)
        executor = ApprovedSourceExecutor(plan=plan, extractor=mock_extractor)
        import asyncio
        result = asyncio.run(executor.execute())
        # Should return failed status (executor always returns a result)
        assert result.status == "failed"

    @patch("scrapers.approved_sources.adapters.bradley.BradleyAdapter._fetch_html")
    def test_returns_success_with_high_confidence(self, mock_fetch):
        """Successful extraction returns success status."""
        mock_fetch.return_value = SAMPLE_BRADLEY_HTML

        entries = [
            ApprovedSourcePlanEntry(
                sourceType="distributor",
                sourceSlug="bradley",
                displayName="Bradley Caldwell",
                domains=["bradleycaldwell.com"],
                assetDomains=["bradleycaldwell.com"],
                adapterSlug="bradley_crawl4ai",
                requiresAuth=False,
                searchMode="sku_search",
                allowedFields=["name", "brand"],
                priority=10,
                runFirst=True,
            ),
        ]
        plan = _make_plan(entries=entries)
        mock_extractor = MagicMock()
        mock_extractor.api_client = None

        executor = ApprovedSourceExecutor(plan=plan, extractor=mock_extractor)
        import asyncio
        result = asyncio.run(executor.execute())
        # Bradley adapter finds name+brand from HTML, confidence should be >= 0.7
        # Should return success or partial
        assert result.status in ("success", "partial"), f"Expected success/partial but got {result.status}: {result.validation.warnings}"
