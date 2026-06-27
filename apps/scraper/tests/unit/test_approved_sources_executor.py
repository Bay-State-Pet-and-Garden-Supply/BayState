"""Tests for the ApprovedSourceExecutor.

Validates ordering, auth handling, fallback behavior, policy enforcement,
and that the executor never returns None.
"""
from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


from scrapers.approved_sources.executor import ApprovedSourceExecutor
from scrapers.approved_sources.result_builder import (
    build_auth_required_result,
    build_partial_result,
    build_success_result,
)
from scrapers.approved_sources.types import (
    ApprovedSourcePlan,
    ApprovedSourcePlanEntry,
    ApprovedSourceBrand,
    ApprovedSourcePolicy,
)


def _make_plan(
    upc: str = "001135",
    selected_distributor: str | None = "bradley",
    entries: list[ApprovedSourcePlanEntry] | None = None,
    extraction_mode: str = "mixed",
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
        upc=upc,
        input={"name": "E-Z HANG SCALE", "price": None},
        brand=ApprovedSourceBrand(id="brand-1", name="KERBL", slug="kerbl"),
        extractionMode=extraction_mode,
        selectedDistributorSlug=selected_distributor,
        priority=entries,
        sourcePolicy=ApprovedSourcePolicy(
            allowedDomains=["bradleycaldwell.com", "centralpet.com", "orgill.com", "shop.phillipspet.com", "petfoodexperts.com"],
            allowedAssetDomains=["bradleycaldwell.com", "centralpet.com", "orgill.com", "shop.phillipspet.com", "petfoodexperts.com"],
            disallowedDomains=["amazon.com", "chewy.com", "walmart.com", "petco.com", "petsmart.com", "ebay.com", "etsy.com"],
            approvedSourcesOnly=True,
        ),
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
    selected_distributor: str | None = "bradley",
) -> tuple[ApprovedSourcePlan, MagicMock]:
    """Helper to create plan + mock extractor for test cases."""
    plan = _make_plan(
        entries=entries,
        selected_distributor=selected_distributor,
    )
    mock_extractor = MagicMock()
    mock_extractor.api_client = None
    return plan, mock_extractor


class TestExecutor:
    """Tests for the ApprovedSourceExecutor orchestration logic."""

    def test_partial_meeting_callback_threshold_is_accepted(self):
        plan, mock_extractor = _create_plan_with_mock_html()
        executor = ApprovedSourceExecutor(plan=plan, extractor=mock_extractor)
        result = build_partial_result(
            upc="001135",
            source_slug="bradley",
            source_type="distributor",
            evidence_url="https://www.bradleycaldwell.com/search?term=001135",
            product_fields={"name": "E-Z HANG SCALE", "brand": "KERBL"},
            matched_fields=["name", "brand"],
            overall_confidence=0.65,
        )

        assert executor._is_successful(result) is True

    def test_executor_attaches_api_client_for_credential_resolution(self):
        """Auth-gated adapters read api_client from the extractor object."""
        plan, mock_extractor = _create_plan_with_mock_html()
        api_client = MagicMock()

        ApprovedSourceExecutor(
            plan=plan,
            extractor=mock_extractor,
            api_client=api_client,
        )

        assert mock_extractor.api_client is api_client

    @patch("scrapers.approved_sources.adapters.base.BaseDistributorCrawl4AIAdapter._fetch_html")
    def test_executor_never_returns_none(self, mock_fetch):
        mock_fetch.return_value = SAMPLE_NO_MATCH_HTML
        plan, mock_extractor = _create_plan_with_mock_html()
        executor = ApprovedSourceExecutor(plan=plan, extractor=mock_extractor)
        import asyncio
        result = asyncio.run(executor.execute())
        assert result is not None
        assert result.upc == "001135"
        assert result.status in ("success", "partial", "failed")
        assert result.decision is not None

    @patch("scrapers.approved_sources.adapters.base.BaseDistributorCrawl4AIAdapter._fetch_html")
    def test_executor_returns_failed_when_no_source(self, mock_fetch):
        """When all sources fail, executor returns failed result."""
        mock_fetch.return_value = SAMPLE_NO_MATCH_HTML
        plan, mock_extractor = _create_plan_with_mock_html()
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
        plan = _make_plan(entries=entries)
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
        plan = _make_plan(entries=entries)
        mock_extractor = MagicMock()
        mock_extractor.api_client = None

        executor = ApprovedSourceExecutor(plan=plan, extractor=mock_extractor)
        import asyncio
        result = asyncio.run(executor.execute())
        # Should fail since no other source available and no fallback
        assert result.status == "failed"

    @patch(
        "scrapers.approved_sources.adapters.bradley.BradleyAdapter.extract",
        new_callable=AsyncMock,
    )
    @patch(
        "scrapers.approved_sources.adapters.phillips.PhillipsAdapter.extract",
        new_callable=AsyncMock,
    )
    def test_aggregates_source_results_and_requested_mode(
        self,
        mock_phillips_extract,
        mock_bradley_extract,
    ):
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
                priority=20,
                runFirst=False,
            ),
        ]
        plan = _make_plan(entries=entries, extraction_mode="distributor_only")
        mock_extractor = MagicMock()
        mock_extractor.api_client = None

        mock_phillips_extract.return_value = build_auth_required_result(
            upc="001135",
            source_slug="phillips",
            requested_extraction_mode="distributor_only",
        )
        mock_bradley_extract.return_value = build_success_result(
            upc="001135",
            source_slug="bradley",
            source_type="distributor",
            evidence_url="https://www.bradleycaldwell.com/search?term=001135",
            product_fields={"name": "E-Z HANG SCALE", "brand": "KERBL"},
            matched_fields=["name", "brand"],
            overall_confidence=0.9,
            requested_extraction_mode="distributor_only",
        )

        executor = ApprovedSourceExecutor(plan=plan, extractor=mock_extractor)
        import asyncio

        result = asyncio.run(executor.execute())

        assert result.status == "success"
        assert result.requested_extraction_mode == "distributor_only"
        assert [entry.sourceSlug for entry in result.source_results] == ["bradley", "phillips"]
        assert result.source.source_slug == "bradley"

    @patch(
        "scrapers.approved_sources.adapters.bradley.BradleyAdapter.extract",
        new_callable=AsyncMock,
    )
    def test_returns_success_with_high_confidence(self, mock_extract_method):
        """Successful extraction returns success status."""
        mock_extract_method.return_value = build_success_result(
            upc="001135",
            source_slug="bradley",
            source_type="distributor",
            evidence_url="https://www.bradleycaldwell.com/product",
            product_fields={"name": "E-Z HANG SCALE", "brand": "KERBL"},
            matched_fields=["name", "brand"],
            overall_confidence=0.9,
        )

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
        assert result.status in ("success", "partial"), f"Expected success/partial but got {result.status}: {result.validation.warnings}"

    # ------------------------------------------------------------------ #
    # Approved-source executor orchestration tests (benchmark plan Phase 3)
    # ------------------------------------------------------------------ #

    @patch(
        "scrapers.approved_sources.adapters.serp_discovery.SerpDiscoveryAdapter.extract",
        new_callable=AsyncMock,
    )
    @patch(
        "scrapers.approved_sources.adapters.bradley.BradleyAdapter.extract",
        new_callable=AsyncMock,
    )
    def test_selected_distributor_succeeds_skips_official_fallback(
        self, mock_bradley_extract, mock_official_extract
    ):
        """When Bradley succeeds, official brand fallback is NOT called."""
        mock_bradley_extract.return_value = build_success_result(
            upc="001135",
            source_slug="bradley",
            source_type="distributor",
            evidence_url="https://www.bradleycaldwell.com/search?term=001135",
            product_fields={"name": "E-Z HANG SCALE", "brand": "KERBL"},
            matched_fields=["name", "brand"],
            overall_confidence=0.9,
        )
        mock_official_extract.return_value = build_success_result(
            upc="001135",
            source_slug="serp_discovery",
            source_type="official_brand",
            evidence_url="https://example.com/product",
            product_fields={"name": "Official Product", "brand": "Brand"},
            matched_fields=["name", "brand"],
            overall_confidence=0.85,
            llm_used=True,
        )

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

        # Bradley should succeed, skip official fallback
        assert result.status in ("success", "partial")
        assert result.source.source_slug == "bradley"
        assert "E-Z HANG SCALE" in (result.product.name or "")
        mock_official_extract.assert_not_called()

    @patch("scrapers.approved_sources.adapters.central_pet.CentralPetAdapter._fetch_html")
    def test_no_match_returns_failed(self, mock_cp_fetch):
        """When Central Pet returns no-match and no fallback is in plan, result is failed."""
        mock_cp_fetch.return_value = SAMPLE_NO_MATCH_HTML

        entries = [
            ApprovedSourcePlanEntry(
                sourceType="distributor",
                sourceSlug="central_pet",
                displayName="Central Pet",
                domains=["centralpet.com"],
                assetDomains=["centralpet.com"],
                adapterSlug="central_pet_crawl4ai",
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

        assert result.status == "failed"
        assert result.decision == "failed"
        # No fallback means the official brand adapter is never instantiated

    @patch(
        "scrapers.approved_sources.adapters.serp_discovery.SerpDiscoveryAdapter.extract",
        new_callable=AsyncMock,
    )
    @patch("scrapers.approved_sources.adapters.central_pet.CentralPetAdapter._fetch_html")
    def test_no_match_fallback_calls_official_if_in_plan(
        self, mock_cp_fetch, mock_official_extract
    ):
        """When Central Pet returns no-match and official_brand is in priority list, it runs."""
        mock_cp_fetch.return_value = SAMPLE_NO_MATCH_HTML
        mock_official_result = build_success_result(
            upc="38777520",
            source_slug="serp_discovery",
            source_type="official_brand",
            evidence_url="https://www.example.com/product",
            product_fields={"name": "Official Product Name", "brand": "Official Brand"},
            matched_fields=["name", "brand"],
            overall_confidence=0.85,
            llm_used=True,
        )
        mock_official_extract.return_value = mock_official_result

        entries = [
            ApprovedSourcePlanEntry(
                sourceType="distributor",
                sourceSlug="central_pet",
                displayName="Central Pet",
                domains=["centralpet.com"],
                assetDomains=["centralpet.com"],
                adapterSlug="central_pet_crawl4ai",
                requiresAuth=False,
                searchMode="sku_search",
                allowedFields=["name", "brand"],
                priority=10,
                runFirst=True,
            ),
            ApprovedSourcePlanEntry(
                sourceType="official_brand",
                sourceSlug="official_brand",
                displayName="Official Brand",
                domains=["example.com"],
                adapterSlug="crawl4ai_direct",
                priority=100,
            ),
        ]
        plan = _make_plan(entries=entries)
        mock_extractor = MagicMock()
        mock_extractor.api_client = None

        executor = ApprovedSourceExecutor(plan=plan, extractor=mock_extractor)
        import asyncio

        result = asyncio.run(executor.execute())

        # Official fallback should have been called
        mock_official_extract.assert_called_once()
        # Result should be the official fallback result
        assert result.status == "success"
        assert result.source.source_slug == "serp_discovery"

    @patch(
        "scrapers.approved_sources.adapters.bradley.BradleyAdapter.extract",
        new_callable=AsyncMock,
    )
    @patch(
        "scrapers.approved_sources.adapters.phillips.PhillipsAdapter.extract",
        new_callable=AsyncMock,
    )
    def test_auth_required_continues_to_next_source(
        self, mock_phillips_extract, mock_bradley_extract
    ):
        """Auth-required source fails with AUTH_REQUIRED, then next no-auth source succeeds."""
        mock_phillips_extract.return_value = build_auth_required_result(
            upc="001135",
            source_slug="phillips",
            requested_extraction_mode="mixed",
        )
        mock_bradley_extract.return_value = build_success_result(
            upc="001135",
            source_slug="bradley",
            source_type="distributor",
            evidence_url="https://www.bradleycaldwell.com/search?term=001135",
            product_fields={"name": "E-Z HANG SCALE", "brand": "KERBL"},
            matched_fields=["name", "brand"],
            overall_confidence=0.9,
        )

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
                priority=20,
                runFirst=False,
            ),
        ]
        plan = _make_plan(entries=entries)
        mock_extractor = MagicMock()
        mock_extractor.api_client = None

        executor = ApprovedSourceExecutor(plan=plan, extractor=mock_extractor)
        import asyncio

        result = asyncio.run(executor.execute())

        # Should get Bradley's success, not Phillips' failure
        assert result is not None
        assert result.status in ("success", "partial")
        assert result.source.source_slug == "bradley"
        # Ensure the auth-required result is recorded in source_results
        source_slugs = [s.sourceSlug for s in result.source_results]
        assert "bradley" in source_slugs

    def test_empty_priority_plan_fallback_disabled_fails_closed(self):
        """Plan with no priority entries and fallback disabled returns failed."""
        plan = ApprovedSourcePlan(
            upc="001135",
            input={"name": "Test Product", "price": None},
            brand=ApprovedSourceBrand(id="brand-1", name="KERBL", slug="kerbl"),
            selectedDistributorSlug=None,
            priority=[],
            sourcePolicy=ApprovedSourcePolicy(
                allowedDomains=[],
                allowedAssetDomains=[],
                disallowedDomains=["amazon.com", "chewy.com"],
                approvedSourcesOnly=True,
            ),
        )
        mock_extractor = MagicMock()
        mock_extractor.api_client = None

        executor = ApprovedSourceExecutor(plan=plan, extractor=mock_extractor)
        import asyncio

        result = asyncio.run(executor.execute())

        assert result is not None
        assert result.status == "failed"
        assert result.decision == "failed"
        # Should not crash when no adapter slugs are in the plan

    @patch(
        "scrapers.approved_sources.adapters.serp_discovery.SerpDiscoveryAdapter.extract",
        new_callable=AsyncMock,
    )
    @patch(
        "scrapers.approved_sources.adapters.bradley.BradleyAdapter.extract",
        new_callable=AsyncMock,
    )
    def test_distributor_success_blocks_serp_fallback(
        self, mock_bradley_extract, mock_official_extract
    ):
        """When a distributor succeeds, SERP/official brand fallback is NOT called."""
        mock_bradley_extract.return_value = build_success_result(
            upc="001135",
            source_slug="bradley",
            source_type="distributor",
            evidence_url="https://www.bradleycaldwell.com/search?term=001135",
            product_fields={"name": "E-Z HANG SCALE", "brand": "KERBL"},
            matched_fields=["name", "brand"],
            overall_confidence=0.9,
        )
        mock_official_extract.return_value = build_success_result(
            upc="001135",
            source_slug="serp_discovery",
            source_type="official_brand",
            evidence_url="https://example.com/product",
            product_fields={"name": "Official Product", "brand": "Brand"},
            matched_fields=["name", "brand"],
            overall_confidence=0.85,
            llm_used=True,
        )

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
            ApprovedSourcePlanEntry(
                sourceType="official_brand",
                sourceSlug="official_brand",
                displayName="Official Brand",
                domains=["example.com"],
                adapterSlug="crawl4ai_direct",
                priority=100,
            ),
        ]
        plan = _make_plan(entries=entries)
        mock_extractor = MagicMock()
        mock_extractor.api_client = None

        executor = ApprovedSourceExecutor(plan=plan, extractor=mock_extractor)
        import asyncio

        result = asyncio.run(executor.execute())

        # SERP should NOT be called because distributor found the product
        mock_official_extract.assert_not_called()
        assert result.status in ("success", "partial")
        
        # Only bradley results should be in source_results (no serp_discovery)
        source_slugs = [s.sourceSlug for s in result.source_results]
        assert "bradley" in source_slugs
        assert "serp_discovery" not in source_slugs

    @patch(
        "scrapers.approved_sources.adapters.serp_discovery.SerpDiscoveryAdapter.extract",
        new_callable=AsyncMock,
    )
    @patch("scrapers.approved_sources.adapters.phillips.PhillipsAdapter.check_credentials")
    def test_distributor_error_blocks_serp(
        self, mock_phillips_check_creds, mock_official_extract
    ):
        """When a distributor source errors, SERP is NOT called even if official_brand is in plan."""
        mock_phillips_check_creds.return_value = (False, "AUTH_REQUIRED: no credentials available")
        mock_official_extract.return_value = build_success_result(
            upc="001135",
            source_slug="serp_discovery",
            source_type="official_brand",
            evidence_url="https://example.com/product",
            product_fields={"name": "Official Product", "brand": "Brand"},
            matched_fields=["name", "brand"],
            overall_confidence=0.85,
            llm_used=True,
        )

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
            ApprovedSourcePlanEntry(
                sourceType="official_brand",
                sourceSlug="official_brand",
                displayName="Official Brand",
                domains=["example.com"],
                adapterSlug="crawl4ai_direct",
                priority=100,
            ),
        ]
        plan = _make_plan(entries=entries)
        mock_extractor = MagicMock()
        mock_extractor.api_client = None

        executor = ApprovedSourceExecutor(plan=plan, extractor=mock_extractor)
        import asyncio

        result = asyncio.run(executor.execute())

        # SERP should NOT be called because distributor had source_error
        mock_official_extract.assert_not_called()
        # Should be failed since only source errored and SERP was blocked
        assert result.status == "failed"
        assert result.decision == "failed"

    @patch(
        "scrapers.approved_sources.adapters.serp_discovery.SerpDiscoveryAdapter.extract",
        new_callable=AsyncMock,
    )
    @patch("scrapers.approved_sources.adapters.central_pet.CentralPetAdapter._fetch_html")
    def test_all_not_stocked_triggers_serp(
        self, mock_cp_fetch, mock_official_extract
    ):
        """When all distributors are clean not_stocked, SERP fallback IS called."""
        mock_cp_fetch.return_value = SAMPLE_NO_MATCH_HTML
        mock_official_result = build_success_result(
            upc="38777520",
            source_slug="serp_discovery",
            source_type="official_brand",
            evidence_url="https://www.example.com/product",
            product_fields={"name": "Official Product Name", "brand": "Official Brand"},
            matched_fields=["name", "brand"],
            overall_confidence=0.85,
            llm_used=True,
        )
        mock_official_extract.return_value = mock_official_result

        entries = [
            ApprovedSourcePlanEntry(
                sourceType="distributor",
                sourceSlug="central_pet",
                displayName="Central Pet",
                domains=["centralpet.com"],
                assetDomains=["centralpet.com"],
                adapterSlug="central_pet_crawl4ai",
                requiresAuth=False,
                searchMode="sku_search",
                allowedFields=["name", "brand"],
                priority=10,
                runFirst=True,
            ),
            ApprovedSourcePlanEntry(
                sourceType="official_brand",
                sourceSlug="official_brand",
                displayName="Official Brand",
                domains=["example.com"],
                adapterSlug="crawl4ai_direct",
                priority=100,
            ),
        ]
        plan = _make_plan(entries=entries)
        mock_extractor = MagicMock()
        mock_extractor.api_client = None

        executor = ApprovedSourceExecutor(plan=plan, extractor=mock_extractor)
        import asyncio

        result = asyncio.run(executor.execute())

        # SERP should have been called
        mock_official_extract.assert_called_once()
        assert result.status == "success"
        assert result.source.source_slug == "serp_discovery"

    @patch("scrapers.approved_sources.adapters.serp_discovery.SearchClient")
    def test_serp_discovery_adapter_uses_ai_credentials_for_search(self, mock_search_client_class):
        """SerpDiscoveryAdapter extracts serper_api_key/serpapi_api_key from ai_credentials and passes to SearchClient."""
        from scrapers.approved_sources.adapters.serp_discovery import SerpDiscoveryAdapter

        plan = _make_plan(entries=[])
        entry = ApprovedSourcePlanEntry(
            sourceType="official_brand",
            sourceSlug="serp_discovery",
            displayName="Serp Discovery",
            domains=["example.com"],
            adapterSlug="serp_discovery",
            priority=100,
        )
        
        # Test case 1: serper_api_key present
        adapter = SerpDiscoveryAdapter(entry, plan)
        adapter.ai_credentials = {"serper_api_key": "test_serper_key_123"}
        
        mock_client = MagicMock()
        mock_client.search = AsyncMock(return_value=([], None))
        mock_search_client_class.return_value = mock_client
        
        import asyncio
        asyncio.run(adapter._phase1_sku_discovery("SKU123"))
        
        mock_search_client_class.assert_any_call(max_results=10, api_key="test_serper_key_123")
        mock_search_client_class.reset_mock()
        
        # Test case 2: serpapi_api_key present
        adapter.ai_credentials = {"serpapi_api_key": "test_serpapi_key_456"}
        asyncio.run(adapter._phase1_sku_discovery("SKU123"))
        mock_search_client_class.assert_any_call(max_results=10, api_key="test_serpapi_key_456")
        mock_search_client_class.reset_mock()

        # Test case 3: no ai_credentials or empty dict
        adapter.ai_credentials = {}
        asyncio.run(adapter._phase1_sku_discovery("SKU123"))
        mock_search_client_class.assert_any_call(max_results=10, api_key=None)

    @patch("scrapers.approved_sources.adapters.serp_discovery.logger")
    @patch("scrapers.approved_sources.adapters.serp_discovery.SearchClient")
    def test_serp_discovery_adapter_logs_search_failures(self, mock_search_client_class, mock_logger):
        """SerpDiscoveryAdapter should log errors if SearchClient returns empty results but an error."""
        from scrapers.approved_sources.adapters.serp_discovery import SerpDiscoveryAdapter

        plan = _make_plan(entries=[])
        entry = ApprovedSourcePlanEntry(
            sourceType="official_brand",
            sourceSlug="serp_discovery",
            displayName="Serp Discovery",
            domains=["example.com"],
            adapterSlug="serp_discovery",
            priority=100,
        )
        
        adapter = SerpDiscoveryAdapter(entry, plan)
        adapter.ai_credentials = {"serper_api_key": "test_serper_key"}
        
        mock_client = MagicMock()
        mock_client.search = AsyncMock(return_value=([], "API Key Expired"))
        mock_search_client_class.return_value = mock_client
        
        import asyncio
        asyncio.run(adapter._phase1_sku_discovery("SKU123"))
        
        assert mock_logger.error.called
        args, kwargs = mock_logger.error.call_args
        assert "UPC discovery search failed" in args[0]
        assert args[1] == "API Key Expired"

    def test_executor_propagates_ai_credentials_to_adapters(self):
        """Executor should propagate the provided ai_credentials to instantiated adapters."""
        from scrapers.approved_sources.adapters.serp_discovery import SerpDiscoveryAdapter

        entries = [
            ApprovedSourcePlanEntry(
                sourceType="official_brand",
                sourceSlug="serp_discovery",
                displayName="Official Brand",
                domains=["example.com"],
                adapterSlug="serp_discovery",
                priority=100,
            )
        ]
        plan = _make_plan(entries=entries)
        mock_extractor = MagicMock()
        mock_extractor.api_client = None
        
        captured_instances = []
        original_extract = SerpDiscoveryAdapter.extract
        
        async def mock_extract(self, extractor):
            captured_instances.append(self)
            return None
            
        SerpDiscoveryAdapter.extract = mock_extract
        try:
            ai_credentials = {"serper_api_key": "executor_key_abc"}
            executor = ApprovedSourceExecutor(
                plan=plan,
                extractor=mock_extractor,
                ai_credentials=ai_credentials,
            )
            
            import asyncio
            asyncio.run(executor.execute())
            
            assert len(captured_instances) == 1
            assert captured_instances[0].ai_credentials == ai_credentials
        finally:
            SerpDiscoveryAdapter.extract = original_extract

    def test_orchestrator_passes_ai_credentials_to_executor(self):
        """Orchestrator constructor should accept and pass ai_credentials to Executor."""
        from scrapers.approved_sources.orchestrator import ApprovedSourceOrchestrator
        
        plan = _make_plan(entries=[])
        mock_extractor = MagicMock()
        
        ai_credentials = {"serper_api_key": "orchestrator_key_xyz"}
        orchestrator = ApprovedSourceOrchestrator(
            plan=plan,
            extractor=mock_extractor,
            ai_credentials=ai_credentials,
        )
        
        assert orchestrator.ai_credentials == ai_credentials
        
        with patch("scrapers.approved_sources.orchestrator.ApprovedSourceExecutor") as mock_executor_class:
            mock_executor_instance = MagicMock()
            mock_executor_instance.execute = AsyncMock(return_value=None)
            mock_executor_class.return_value = mock_executor_instance
            
            import asyncio
            asyncio.run(orchestrator.run())
            
            mock_executor_class.assert_called_once_with(
                plan=plan,
                extractor=mock_extractor,
                ai_credentials=ai_credentials,
                job_config=None,
            )

    @patch("scrapers.approved_sources.adapters.serp_discovery.SearchClient")
    def test_serp_discovery_adapter_exact_matches_sku_and_filters_disallowed_domains(self, mock_search_client_class):
        """SerpDiscoveryAdapter exact matches UPC by wrapping in double quotes and filters disallowed domains in Phase 1."""
        from scrapers.approved_sources.adapters.serp_discovery import SerpDiscoveryAdapter

        plan = _make_plan(entries=[])
        plan.sourcePolicy.disallowedDomains = ["amazon.com", "ebay.com"]
        
        entry = ApprovedSourcePlanEntry(
            sourceType="official_brand",
            sourceSlug="serp_discovery",
            displayName="Serp Discovery",
            domains=["example.com"],
            adapterSlug="serp_discovery",
            priority=100,
        )

        adapter = SerpDiscoveryAdapter(entry, plan)
        
        mock_client = MagicMock()
        mock_client.search = AsyncMock(return_value=([
            {"url": "https://example.com/product", "title": "Good Product"},
            {"url": "https://www.amazon.com/dp/B001", "title": "Amazon Product"},
            {"url": "https://ebay.com/itm/123", "title": "eBay Product"},
            {"url": "https://another-good-site.com/upc", "title": "Another Good Product"},
        ], None))
        mock_search_client_class.return_value = mock_client
        
        import asyncio
        results = asyncio.run(adapter._phase1_sku_discovery("SKU123"))
        
        mock_client.search.assert_called_once_with('"SKU123"')
        
        assert len(results) == 2
        assert results[0]["url"] == "https://example.com/product"
        assert results[1]["url"] == "https://another-good-site.com/upc"

    def test_is_candidate_unsafe_for_canonical_selection(self):
        """Test is_candidate_unsafe_for_canonical_selection helper against various safe and unsafe URLs."""
        from scrapers.approved_sources.adapters.serp_discovery import is_candidate_unsafe_for_canonical_selection
        
        # Unsafe cases
        assert is_candidate_unsafe_for_canonical_selection("https://www.bluebuffalo.com/incentive-requests/qualifying-products") is True
        assert is_candidate_unsafe_for_canonical_selection("https://www.bluebuffalo.com/") is True
        assert is_candidate_unsafe_for_canonical_selection("https://www.bluebuffalo.com/product-catalog.pdf") is True
        assert is_candidate_unsafe_for_canonical_selection("https://www.bluebuffalo.com/search?q=dog+food") is True
        assert is_candidate_unsafe_for_canonical_selection("https://www.bluebuffalo.com/blogs/news/new-product-launch") is True
        assert is_candidate_unsafe_for_canonical_selection("https://www.bluebuffalo.com/store-locator") is True
        assert is_candidate_unsafe_for_canonical_selection("https://www.bluebuffalo.com/collections/dog-food") is True  # collection page
        
        # Safe cases
        assert is_candidate_unsafe_for_canonical_selection("https://www.bluebuffalo.com/products/dog/wilderness-chicken") is False
        assert (
            is_candidate_unsafe_for_canonical_selection(
                "https://www.bluebuffalo.com/collections/dog-food/products/wilderness-chicken"
            )
            is False
        )  # Shopify PDP nesting style

    def test_serp_discovery_candidate_scoring_prefers_matching_variant(self):
        """SERP scoring should rank the matching size/count variant above sibling variants."""
        from scrapers.approved_sources.adapters.serp_discovery import SerpDiscoveryAdapter

        plan = _make_plan(entries=[])
        entry = ApprovedSourcePlanEntry(
            sourceType="official_brand",
            sourceSlug="serp_discovery",
            displayName="Serp Discovery",
            domains=["mywoof.com"],
            adapterSlug="serp_discovery",
            priority=100,
        )
        adapter = SerpDiscoveryAdapter(entry, plan)

        candidates = [
            {
                "url": "https://mywoof.com/products/pupsicle-refill-large",
                "title": "WOOF Pupsicle BBQ Calming Pops Large 8 oz",
                "description": "Large refill pops for the Pupsicle toy",
            },
            {
                "url": "https://mywoof.com/products/pupsicle-refill-small",
                "title": "WOOF Pupsicle BBQ Calming Pops Small 6 oz",
                "description": "Small refill pops for the Pupsicle toy",
            },
        ]

        scored = adapter._score_candidates(
            candidates,
            "850075865932",
            "WOOF Pupsicle BBQ Calming Pops Small 6 oz",
            "mywoof.com",
        )

        assert scored[0]["url"].endswith("small")

    def test_serp_discovery_preserves_register_size_hint_after_name_cleanup(self):
        """LLM-cleaned names must retain POS SM/MD size hints for variant targeting."""
        from scrapers.approved_sources.adapters.serp_discovery import SerpDiscoveryAdapter

        plan = _make_plan(entries=[])
        entry = ApprovedSourcePlanEntry(
            sourceType="official_brand",
            sourceSlug="serp_discovery",
            displayName="Serp Discovery",
            domains=["earthanimal.com"],
            adapterSlug="serp_discovery",
            priority=100,
        )
        adapter = SerpDiscoveryAdapter(entry, plan)

        assert adapter._preserve_register_variant_hint(
            "EARTH ANIMAL NO HIDE STRWB CHEW MD",
            "Earth Animal No-Hide Strawberries & Cream Roll",
        ).endswith("Medium")
        assert adapter._preserve_register_variant_hint(
            "EARTH ANIMAL NO HIDE STRWB CHEW SM",
            "Earth Animal No-Hide Strawberries & Cream Roll",
        ).endswith("Small")

    def test_serp_discovery_no_llm_fallback_skips_conflicting_variant(self):
        """Without an LLM, fallback selection should not choose a known wrong size variant."""
        from scrapers.approved_sources.adapters.serp_discovery import SerpDiscoveryAdapter
        import asyncio

        plan = _make_plan(entries=[])
        entry = ApprovedSourcePlanEntry(
            sourceType="official_brand",
            sourceSlug="serp_discovery",
            displayName="Serp Discovery",
            domains=["mywoof.com"],
            adapterSlug="serp_discovery",
            priority=100,
        )
        adapter = SerpDiscoveryAdapter(entry, plan)
        adapter._get_llm_provider = lambda: None  # type: ignore[method-assign]

        selected = asyncio.run(adapter._llm_select_url(
            upc="850075865932",
            consolidated_name="WOOF Pupsicle BBQ Calming Pops Small 6 oz",
            brand_name="WOOF",
            brand_domain="mywoof.com",
            candidates=[
                {
                    "url": "https://mywoof.com/products/pupsicle-refill-large",
                    "title": "WOOF Pupsicle BBQ Calming Pops Large 8 oz",
                    "description": "Large refill pops for the Pupsicle toy",
                },
                {
                    "url": "https://mywoof.com/products/pupsicle-refill-small",
                    "title": "WOOF Pupsicle BBQ Calming Pops Small 6 oz",
                    "description": "Small refill pops for the Pupsicle toy",
                },
            ],
        ))

        assert selected == "https://mywoof.com/products/pupsicle-refill-small"

    @patch("scrapers.ai_search.variant_resolvers.resolve_family_variant", new_callable=AsyncMock)
    @patch("src.crawl4ai_engine.engine.Crawl4AIEngine")
    def test_serp_discovery_crawl_verification_switches_to_resolved_variant_url(
        self,
        mock_engine_class,
        mock_resolve_variant,
    ):
        """Candidate verification should switch sibling URLs to the exact variant URL when resolvable."""
        from scrapers.approved_sources.adapters.serp_discovery import SerpDiscoveryAdapter
        import asyncio

        plan = _make_plan(entries=[])
        entry = ApprovedSourcePlanEntry(
            sourceType="official_brand",
            sourceSlug="serp_discovery",
            displayName="Serp Discovery",
            domains=["example.com"],
            adapterSlug="serp_discovery",
            priority=100,
        )
        adapter = SerpDiscoveryAdapter(entry, plan)

        mock_engine = MagicMock()
        mock_engine.__aenter__ = AsyncMock(return_value=mock_engine)
        mock_engine.__aexit__ = AsyncMock(return_value=None)
        mock_engine.crawl_many = AsyncMock(return_value=[{
            "success": True,
            "url": "https://example.com/products/dog-food-40-lb",
            "html": "<html>Dog Food 40 lb <a href='/products/dog-food-12-lb'>12 lb</a></html>",
            "markdown": "Dog Food variants: 12 lb, 40 lb",
            "metadata": {"title": "Dog Food 40 lb"},
        }])
        mock_engine_class.return_value = mock_engine
        mock_resolve_variant.return_value = (
            "https://example.com/products/dog-food-12-lb",
            None,
            None,
            "exact_variant",
        )

        verified = asyncio.run(adapter._verify_candidates_with_crawl4ai(
            candidates=[{
                "url": "https://example.com/products/dog-food-40-lb",
                "title": "Dog Food 40 lb",
                "description": "Sibling variant page",
            }],
            upc="123456789012",
            consolidated_name="Dog Food 12 lb",
            brand_name="Example",
        ))

        assert verified[0]["url"] == "https://example.com/products/dog-food-12-lb"
        assert verified[0]["_variant_verification"] == "resolved_exact_variant"
        assert adapter._fallback_url_from_candidates(
            verified,
            upc="123456789012",
            target_name="Dog Food 12 lb",
        ) == "https://example.com/products/dog-food-12-lb"

    @patch("scrapers.ai_search.variant_resolvers.resolve_family_variant", new_callable=AsyncMock)
    @patch("src.crawl4ai_engine.engine.Crawl4AIEngine")
    def test_serp_discovery_crawl_verification_rejects_unresolved_wrong_variant(
        self,
        mock_engine_class,
        mock_resolve_variant,
    ):
        """A crawled sibling page with no target variant evidence should be removed."""
        from scrapers.approved_sources.adapters.serp_discovery import SerpDiscoveryAdapter
        import asyncio

        plan = _make_plan(entries=[])
        entry = ApprovedSourcePlanEntry(
            sourceType="official_brand",
            sourceSlug="serp_discovery",
            displayName="Serp Discovery",
            domains=["example.com"],
            adapterSlug="serp_discovery",
            priority=100,
        )
        adapter = SerpDiscoveryAdapter(entry, plan)

        mock_engine = MagicMock()
        mock_engine.__aenter__ = AsyncMock(return_value=mock_engine)
        mock_engine.__aexit__ = AsyncMock(return_value=None)
        mock_engine.crawl_many = AsyncMock(return_value=[{
            "success": True,
            "url": "https://example.com/products/dog-food-40-lb",
            "html": "<html>Dog Food 40 lb only</html>",
            "markdown": "Dog Food 40 lb",
            "metadata": {"title": "Dog Food 40 lb"},
        }])
        mock_engine_class.return_value = mock_engine
        mock_resolve_variant.return_value = (
            "https://example.com/products/dog-food-40-lb",
            None,
            None,
            "family_page_default",
        )

        verified = asyncio.run(adapter._verify_candidates_with_crawl4ai(
            candidates=[{
                "url": "https://example.com/products/dog-food-40-lb",
                "title": "Dog Food 40 lb",
                "description": "Sibling variant page",
            }],
            upc="123456789012",
            consolidated_name="Dog Food 12 lb",
            brand_name="Example",
        ))

        assert verified == []

    @patch("scrapers.approved_sources.adapters.serp_discovery.SearchClient")
    def test_serp_discovery_adapter_bypasses_unsafe_direct_matches_in_phase_1(self, mock_search_client_class):
        """SerpDiscoveryAdapter should not return unsafe URLs in Phase 1 even if they match the official domain."""
        from scrapers.approved_sources.adapters.serp_discovery import SerpDiscoveryAdapter
        import asyncio

        plan = _make_plan(entries=[])
        entry = ApprovedSourcePlanEntry(
            sourceType="official_brand",
            sourceSlug="serp_discovery",
            displayName="Serp Discovery",
            domains=["bluebuffalo.com"],
            adapterSlug="serp_discovery",
            priority=100,
        )

        adapter = SerpDiscoveryAdapter(entry, plan)

        # Mock SearchClient to return the unsafe incentive page as the only domain match
        mock_client = MagicMock()
        mock_client.search = AsyncMock(return_value=([
            {"url": "https://www.bluebuffalo.com/incentive-requests/qualifying-products", "title": "Qualifying Products"},
        ], None))
        mock_search_client_class.return_value = mock_client

        # If it returned it, _resolve_approved_url would stop and return it.
        # But since it's unsafe, it should bypass Phase 1 direct match, return None (since we mock nothing else), and continue
        resolved = asyncio.run(adapter._resolve_approved_url(
            upc="840243154111",
            register_name="Blue Wilderness Dog",
            brand_name="Blue Buffalo",
            brand_domain="bluebuffalo.com"
        ))

        assert resolved is None  # Bypassed Phase 1 direct match and returned None instead of the incentive page



    @patch(
        "scrapers.approved_sources.adapters.bradley.BradleyAdapter.extract",
        new_callable=AsyncMock,
    )
    def test_missing_outcome_inferred_from_success_status(
        self, mock_bradley_extract
    ):
        """When a SourceResultInfo has outcome=None but the result is successful,
        the executor should infer outcome='found' in the merged source_results."""
        # Build a success result but force outcome to None on its SourceResultInfo
        base_result = build_success_result(
            upc="001135",
            source_slug="bradley",
            source_type="distributor",
            evidence_url="https://www.bradleycaldwell.com/search?term=001135",
            product_fields={"name": "E-Z HANG SCALE", "brand": "KERBL"},
            matched_fields=["name", "brand"],
            overall_confidence=0.9,
        )
        # Simulate outcome being null (as from a marketplace adapter that doesn't set it)
        if base_result.source_results:
            for sr in base_result.source_results:
                sr.outcome = None

        mock_bradley_extract.return_value = base_result

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

        assert result.status == "success"
        assert result.source_results is not None
        assert len(result.source_results) == 1
        # The null outcome should now be inferred as "found"
        sr = result.source_results[0]
        assert sr.outcome == "found", (
            f"Expected outcome to be inferred as 'found', got {sr.outcome!r}"
        )
        assert sr.sourceSlug == "bradley"



class TestApprovedSourceExecutorProfileSnapshots:
    """Tests for profile snapshot consumption in the executor."""

    @pytest.fixture(autouse=True)
    def _setup(self):
        self.mock_extractor = MagicMock()
        self.mock_extractor.api_client = None
        self.mock_extractor.profile_snapshot = None

    def _make_plan_with_official(self) -> ApprovedSourcePlan:
        """Create a plan with an official_brand entry that could match a profile."""
        return ApprovedSourcePlan(
            upc="UPC-PROFILE",
            input={"name": "Profiled Product", "price": None},
            brand=ApprovedSourceBrand(id="brand-p1", name="ProfileBrand", slug="profilebrand"),
            extractionMode="mixed",
            selectedDistributorSlug=None,
            priority=[
                ApprovedSourcePlanEntry(
                    sourceType="distributor",
                    sourceSlug="phillips",
                    displayName="Phillips",
                    domains=["phillips.com"],
                    assetDomains=[],
                    adapterSlug="phillips_crawl4ai",
                    requiresAuth=False,
                    searchMode="upc_search",
                    allowedFields=["name", "description", "images"],
                    priority=10,
                    runFirst=False,
                ),
                ApprovedSourcePlanEntry(
                    sourceType="official_brand",
                    sourceSlug="profilebrand",
                    displayName="ProfileBrand Official",
                    domains=["profilebrand.com"],
                    assetDomains=[],
                    adapterSlug="serp_discovery",
                    requiresAuth=False,
                    searchMode="domain_search",
                    allowedFields=["name", "description", "images"],
                    priority=100,
                    runFirst=False,
                ),
            ],
            sourcePolicy=ApprovedSourcePolicy(
                allowedDomains=["phillips.com", "profilebrand.com"],
                allowedAssetDomains=[],
                disallowedDomains=[],
                approvedSourcesOnly=True,
            ),
        )

    def test_lookup_profile_snapshot_no_snapshots(self):
        """When job_config has no profile_snapshots, _lookup_profile_snapshot returns None."""
        plan = self._make_plan_with_official()
        executor = ApprovedSourceExecutor(
            plan=plan,
            extractor=MagicMock(),
            job_config={},  # no profile_snapshots
        )
        entry = plan.priority[0]
        snapshot = executor._lookup_profile_snapshot(entry)
        assert snapshot is None

    def test_lookup_profile_snapshot_matches(self):
        """When profile_snapshots in job_config match an entry, returns the snapshot."""
        plan = self._make_plan_with_official()
        profile_snapshot = {
            "profile_id": "pf-1",
            "version_id": "pv-1",
            "version_hash": "abc123",
            "compiled_crawl4ai_schema": {"name": "test", "fields": []},
            "rules": {},
            "scope": {
                "brand_id": "brand-p1",
                "source_slug": "profilebrand",
                "canonical_domain": "profilebrand.com",
            },
        }
        executor = ApprovedSourceExecutor(
            plan=plan,
            extractor=MagicMock(),
            job_config={
                "profile_snapshots": {
                    "profilebrand:profilebrand.com": profile_snapshot,
                },
            },
        )
        # Match on official_brand entry with matching slug+domain
        entry = plan.priority[1]  # official_brand entry
        snapshot = executor._lookup_profile_snapshot(entry)
        assert snapshot is not None
        assert snapshot["profile_id"] == "pf-1"
        assert snapshot["version_hash"] == "abc123"

    def test_lookup_profile_snapshot_no_match(self):
        """Entry with no matching snapshot key returns None."""
        plan = self._make_plan_with_official()
        executor = ApprovedSourceExecutor(
            plan=plan,
            extractor=MagicMock(),
            job_config={
                "profile_snapshots": {
                    "otherbrand:other.com": {"profile_id": "other"},
                },
            },
        )
        entry = plan.priority[0]  # phillips - no match
        snapshot = executor._lookup_profile_snapshot(entry)
        assert snapshot is None

    def test_attach_profile_status_sets_on_source_results(self):
        """_attach_profile_status adds ProfileExtractionStatus to source_results."""
        from scrapers.approved_sources.result_builder import build_success_result

        plan = self._make_plan_with_official()
        executor = ApprovedSourceExecutor(
            plan=plan,
            extractor=MagicMock(),
            job_config={},
        )
        result = build_success_result(
            upc="UPC-PROFILE",
            source_slug="profilebrand",
            source_type="official_brand",
            evidence_url="https://profilebrand.com/product",
            product_fields={"name": "Profiled Product", "brand": "ProfileBrand"},
            matched_fields=["name", "brand"],
            overall_confidence=0.85,
        )
        snapshot = {
            "profile_id": "pf-1",
            "version_id": "pv-1",
            "version_hash": "abc123",
        }
        executor._attach_profile_status(result, snapshot)
        assert result.source_results is not None
        assert len(result.source_results) > 0
        for sr in result.source_results:
            ps = sr.profile_extraction_status
            assert ps is not None
            assert ps.profile_used is True
            assert ps.profile_id == "pf-1"
            assert ps.version_id == "pv-1"
            assert ps.version_hash == "abc123"

    def test_attach_profile_status_no_snapshot(self):
        """When snapshot is None, profile_extraction_status is not set."""
        from scrapers.approved_sources.result_builder import build_success_result

        plan = self._make_plan_with_official()
        executor = ApprovedSourceExecutor(
            plan=plan,
            extractor=MagicMock(),
            job_config={},
        )
        result = build_success_result(
            upc="UPC-PROFILE",
            source_slug="phillips",
            source_type="distributor",
            evidence_url="https://phillips.com/product",
            product_fields={"name": "Product"},
            matched_fields=["name"],
            overall_confidence=1.0,
        )
        executor._attach_profile_status(result, None)
        if result.source_results:
            for sr in result.source_results:
                assert sr.profile_extraction_status is None

    def test_profile_snapshot_persists_on_extractor(self):
        """The extractor's profile_snapshot property is set when a snapshot is found."""
        plan = self._make_plan_with_official()
        executor = ApprovedSourceExecutor(
            plan=plan,
            extractor=self.mock_extractor,
            job_config={
                "profile_snapshots": {
                    "profilebrand:profilebrand.com": {
                        "profile_id": "pf-1",
                        "version_id": "pv-1",
                        "version_hash": "abc123",
                        "rules": {},
                        "compiled_crawl4ai_schema": {"name": "test", "fields": []},
                    },
                },
            },
        )
        entry = plan.priority[1]  # official_brand
        snapshot = executor._lookup_profile_snapshot(entry)
        assert snapshot is not None

        # Simulate what _execute_single_entry does
        executor.extractor.profile_snapshot = snapshot
        assert executor.extractor.profile_snapshot is not None
        assert executor.extractor.profile_snapshot["profile_id"] == "pf-1"

        # Reset after entry
        executor.extractor.profile_snapshot = None
        assert executor.extractor.profile_snapshot is None

    def test_profile_snapshot_used_during_extraction(self):
        """Integration: When profile snapshot is present, executor sets it on extractor."""
        from scrapers.approved_sources.result_builder import build_no_match_result

        plan = self._make_plan_with_official()

        profile_snapshot = {
            "profile_id": "pf-1",
            "version_id": "pv-1",
            "version_hash": "abc123",
            "compiled_crawl4ai_schema": {
                "name": "profilebrand",
                "baseSelector": ".product",
                "fields": [
                    {"name": "product_name", "selector": ".title", "type": "text"},
                ],
            },
            "rules": {},
            "scope": {
                "brand_id": "brand-p1",
                "source_slug": "profilebrand",
                "canonical_domain": "profilebrand.com",
            },
        }

        extractor_mock = MagicMock()
        extractor_mock.api_client = None
        extractor_mock.profile_snapshot = None

        verified_snapshots: list[Any] = []

        executor = ApprovedSourceExecutor(
            plan=plan,
            extractor=extractor_mock,
            job_config={
                "profile_snapshots": {
                    "profilebrand:profilebrand.com": profile_snapshot,
                },
            },
        )

        with patch(
            "scrapers.approved_sources.adapters.phillips.PhillipsAdapter.extract",
            new_callable=AsyncMock,
        ) as mock_phillips, patch(
            "scrapers.approved_sources.adapters.serp_discovery.SerpDiscoveryAdapter.extract",
            new_callable=AsyncMock,
        ) as mock_serp:
            mock_phillips.return_value = build_no_match_result(
                upc="UPC-PROFILE",
                source_slug="phillips",
            )

            async def _side_effect(extractor):
                verified_snapshots.append(getattr(extractor, "profile_snapshot", None))
                return build_success_result(
                    upc="UPC-PROFILE",
                    source_slug="profilebrand",
                    source_type="official_brand",
                    evidence_url="https://profilebrand.com/product",
                    product_fields={"name": "Profiled", "brand": "ProfileBrand"},
                    matched_fields=["name", "brand"],
                    overall_confidence=0.9,
                )

            mock_serp.side_effect = _side_effect

            import asyncio
            result = asyncio.run(executor.execute())

        # The executor should have set profile_snapshot on the extractor
        assert len(verified_snapshots) == 1
        snapshot_on_extractor = verified_snapshots[0]
        assert snapshot_on_extractor is not None
        assert snapshot_on_extractor["profile_id"] == "pf-1"
        assert snapshot_on_extractor["version_hash"] == "abc123"

        # The result should have profile_extraction_status on source_results
        assert result.source_results is not None
        has_profile_status = False
        for sr in result.source_results:
            if sr.profile_extraction_status and sr.profile_extraction_status.profile_used:
                has_profile_status = True
                break
        assert has_profile_status, "Expected at least one source_result with profile_extraction_status.profile_used=True"
