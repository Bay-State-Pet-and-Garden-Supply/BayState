"""Tests for the ApprovedSourceExecutor.

Validates ordering, auth handling, fallback behavior, policy enforcement,
and that the executor never returns None.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch


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
    sku: str = "001135",
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
        sku=sku,
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
            sku="001135",
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
        assert result.sku == "001135"
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
            sku="001135",
            source_slug="phillips",
            requested_extraction_mode="distributor_only",
        )
        mock_bradley_extract.return_value = build_success_result(
            sku="001135",
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

    # ------------------------------------------------------------------ #
    # Approved-source executor orchestration tests (benchmark plan Phase 3)
    # ------------------------------------------------------------------ #

    @patch(
        "scrapers.approved_sources.adapters.official_brand.OfficialBrandAdapter.extract",
        new_callable=AsyncMock,
    )
    @patch("scrapers.approved_sources.adapters.bradley.BradleyAdapter._fetch_html")
    def test_selected_distributor_succeeds_skips_official_fallback(
        self, mock_bradley_fetch, mock_official_extract
    ):
        """When Bradley succeeds, official brand fallback is NOT called."""
        mock_bradley_fetch.return_value = SAMPLE_BRADLEY_HTML
        mock_official_extract.return_value = build_success_result(
            sku="001135",
            source_slug="official_brand",
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
        "scrapers.approved_sources.adapters.official_brand.OfficialBrandAdapter.extract",
        new_callable=AsyncMock,
    )
    @patch("scrapers.approved_sources.adapters.central_pet.CentralPetAdapter._fetch_html")
    def test_no_match_fallback_calls_official_if_in_plan(
        self, mock_cp_fetch, mock_official_extract
    ):
        """When Central Pet returns no-match and official_brand is in priority list, it runs."""
        mock_cp_fetch.return_value = SAMPLE_NO_MATCH_HTML
        mock_official_result = build_success_result(
            sku="38777520",
            source_slug="official_brand",
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
        assert result.source.source_slug == "official_brand"

    @patch("scrapers.approved_sources.adapters.bradley.BradleyAdapter._fetch_html")
    @patch("scrapers.approved_sources.adapters.phillips.PhillipsAdapter.check_credentials")
    def test_auth_required_continues_to_next_source(
        self, mock_phillips_check_creds, mock_bradley_fetch
    ):
        """Auth-required source fails with AUTH_REQUIRED, then next no-auth source succeeds."""
        mock_phillips_check_creds.return_value = (False, "AUTH_REQUIRED: no credentials available")
        mock_bradley_fetch.return_value = SAMPLE_BRADLEY_HTML

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
            sku="001135",
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
        "scrapers.approved_sources.adapters.official_brand.OfficialBrandAdapter.extract",
        new_callable=AsyncMock,
    )
    @patch("scrapers.approved_sources.adapters.bradley.BradleyAdapter._fetch_html")
    def test_executor_runs_all_sources_and_aggregates_them(
        self, mock_bradley_fetch, mock_official_extract
    ):
        """When multiple sources are in the plan, executor runs all of them and aggregates results."""
        mock_bradley_fetch.return_value = SAMPLE_BRADLEY_HTML
        mock_official_extract.return_value = build_success_result(
            sku="001135",
            source_slug="official_brand",
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

        # Both sources should have been executed
        mock_official_extract.assert_called_once()
        assert result.status in ("success", "partial")
        
        # Verify both results are in source_results
        source_slugs = [s.sourceSlug for s in result.source_results]
        assert "bradley" in source_slugs
        assert "official_brand" in source_slugs

    @patch("scrapers.approved_sources.adapters.official_brand.SearchClient")
    def test_official_brand_adapter_uses_ai_credentials_for_search(self, mock_search_client_class):
        """OfficialBrandAdapter extracts serper_api_key/serpapi_api_key from ai_credentials and passes to SearchClient."""
        from scrapers.approved_sources.adapters.official_brand import OfficialBrandAdapter

        plan = _make_plan(entries=[])
        entry = ApprovedSourcePlanEntry(
            sourceType="official_brand",
            sourceSlug="official_brand",
            displayName="Official Brand",
            domains=["example.com"],
            adapterSlug="crawl4ai_direct",
            priority=100,
        )
        
        # Test case 1: serper_api_key present
        adapter = OfficialBrandAdapter(entry, plan)
        adapter.ai_credentials = {"serper_api_key": "test_serper_key_123"}
        
        mock_client = MagicMock()
        mock_client.search = AsyncMock(return_value=([], None))
        mock_search_client_class.return_value = mock_client
        
        import asyncio
        asyncio.run(adapter._search_approved_domains("SKU123", "Test Product", ["example.com"]))
        
        mock_search_client_class.assert_any_call(max_results=10, api_key="test_serper_key_123")
        mock_search_client_class.reset_mock()
        
        # Test case 2: serpapi_api_key present
        adapter.ai_credentials = {"serpapi_api_key": "test_serpapi_key_456"}
        asyncio.run(adapter._search_sku_only("SKU123", ["example.com"]))
        mock_search_client_class.assert_any_call(max_results=5, api_key="test_serpapi_key_456")
        mock_search_client_class.reset_mock()

        # Test case 3: no ai_credentials or empty dict
        adapter.ai_credentials = {}
        asyncio.run(adapter._search_approved_domains("SKU123", "Test Product", ["example.com"]))
        mock_search_client_class.assert_any_call(max_results=10, api_key=None)

    @patch("scrapers.approved_sources.adapters.official_brand.logger")
    @patch("scrapers.approved_sources.adapters.official_brand.SearchClient")
    def test_official_brand_adapter_logs_search_failures(self, mock_search_client_class, mock_logger):
        """OfficialBrandAdapter should log errors if SearchClient returns empty results but an error."""
        from scrapers.approved_sources.adapters.official_brand import OfficialBrandAdapter

        plan = _make_plan(entries=[])
        entry = ApprovedSourcePlanEntry(
            sourceType="official_brand",
            sourceSlug="official_brand",
            displayName="Official Brand",
            domains=["example.com"],
            adapterSlug="crawl4ai_direct",
            priority=100,
        )
        
        adapter = OfficialBrandAdapter(entry, plan)
        adapter.ai_credentials = {"serper_api_key": "test_serper_key"}
        
        mock_client = MagicMock()
        mock_client.search = AsyncMock(return_value=([], "API Key Expired"))
        mock_search_client_class.return_value = mock_client
        
        import asyncio
        asyncio.run(adapter._search_approved_domains("SKU123", "Test Product", ["example.com"]))
        
        assert mock_logger.error.called
        args, kwargs = mock_logger.error.call_args
        assert "Search failed for query" in args[0]
        assert args[2] == "API Key Expired"
        
        mock_logger.reset_mock()
        asyncio.run(adapter._search_sku_only("SKU123", ["example.com"]))
        assert mock_logger.error.called
        args, kwargs = mock_logger.error.call_args
        assert "SKU search failed for query" in args[0]
        assert args[2] == "API Key Expired"

    def test_executor_propagates_ai_credentials_to_adapters(self):
        """Executor should propagate the provided ai_credentials to instantiated adapters."""
        from scrapers.approved_sources.adapters.official_brand import OfficialBrandAdapter

        entries = [
            ApprovedSourcePlanEntry(
                sourceType="official_brand",
                sourceSlug="official_brand",
                displayName="Official Brand",
                domains=["example.com"],
                adapterSlug="crawl4ai_direct",
                priority=100,
            )
        ]
        plan = _make_plan(entries=entries)
        mock_extractor = MagicMock()
        mock_extractor.api_client = None
        
        captured_instances = []
        original_extract = OfficialBrandAdapter.extract
        
        async def mock_extract(self, extractor):
            captured_instances.append(self)
            return None
            
        OfficialBrandAdapter.extract = mock_extract
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
            OfficialBrandAdapter.extract = original_extract

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
            )

