"""Tests for OfficialBrandCrawlAdapter UPC gating behavior.

Uses mocked extraction — no live web calls.
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from scrapers.approved_sources.adapters.official_brand_crawl import OfficialBrandCrawlAdapter
from scrapers.approved_sources.types import (
    ApprovedSourcePlan,
    ApprovedSourcePlanEntry,
    ApprovedSourceBrand,
    ApprovedSourcePolicy,
)


@pytest.fixture
def plan():
    return ApprovedSourcePlan(
        upc="850075865932",
        input={"name": "Test Product", "price": 10.0},
        brand=ApprovedSourceBrand(id="brand-1", name="TestBrand", slug="testbrand"),
        extractionMode="mixed",
        priority=[],
        sourcePolicy=ApprovedSourcePolicy(
            allowedDomains=["testbrand.com"],
            allowedAssetDomains=[],
            disallowedDomains=["amazon.com"],
            approvedSourcesOnly=True,
        ),
    )


@pytest.fixture
def entry():
    return ApprovedSourcePlanEntry(
        sourceType="official_brand",
        sourceSlug="official_brand_crawl",
        displayName="Official Brand Crawl",
        domains=["testbrand.com"],
        assetDomains=[],
        adapterSlug="official_brand_crawl",
        requiresAuth=False,
        credentialRef=None,
        searchMode="domain_search",
        allowedFields=["title", "description", "images", "ingredients"],
        priority=100,
        runFirst=False,
        resolutionStage="official_brand",
    )


@pytest.fixture
def entry_with_custom_slug():
    return ApprovedSourcePlanEntry(
        sourceType="official_brand",
        sourceSlug="my_brand_slug",
        displayName="My Brand",
        domains=["mybrand.com"],
        assetDomains=[],
        adapterSlug="official_brand_crawl",
        requiresAuth=False,
        credentialRef=None,
        searchMode="domain_search",
        allowedFields=["title", "description"],
        priority=100,
        runFirst=False,
        resolutionStage="official_brand",
    )


@pytest.fixture
def mock_extractor():
    return MagicMock()


class TestUpcResolutionGates:
    """Tests for UPC proof gate helpers used by adapters."""

    def test_normalize_gtin(self):
        from scrapers.approved_sources.upc_resolution import normalize_gtin
        assert normalize_gtin("850075865932") == "00850075865932"
        assert normalize_gtin("0850075865932") == "00850075865932"
        assert normalize_gtin("00850075865932") == "00850075865932"
        assert normalize_gtin(None) is None
        assert normalize_gtin("") is None

    def test_validate_check_digit_valid(self):
        from scrapers.approved_sources.upc_resolution import validate_check_digit
        # Known valid UPC-A: 850075865932 (check digit 2)
        assert validate_check_digit("850075865932") is True
        # 12-digit with check digit
        assert validate_check_digit("123456789012") is True  # check digit 2

    def test_validate_check_digit_invalid(self):
        from scrapers.approved_sources.upc_resolution import validate_check_digit
        assert validate_check_digit("850075865931") is False  # wrong check digit
        assert validate_check_digit("") is False
        assert validate_check_digit("abc") is False

    def test_compare_gtin_equivalence(self):
        from scrapers.approved_sources.upc_resolution import compare_gtin
        # Different formats of same GTIN
        assert compare_gtin("850075865932", "850075865932") is True
        assert compare_gtin("850075865932", "00850075865932") is True
        assert compare_gtin("0850075865932", "00850075865932") is True
        # Different GTINs
        assert compare_gtin("850075865932", "850075865933") is False
        assert compare_gtin(None, "850075865932") is False

    def test_is_exact_upc_proof_with_upc_top_level(self):
        from scrapers.approved_sources.upc_resolution import is_exact_upc_proof
        product = {"name": "Test Product", "upc": "850075865932"}
        proven, upc = is_exact_upc_proof("850075865932", product)
        assert proven is True
        assert upc == "850075865932"

    def test_is_exact_upc_proof_no_upc(self):
        from scrapers.approved_sources.upc_resolution import is_exact_upc_proof
        product = {"name": "Test Product", "description": "No UPC"}
        proven, reason = is_exact_upc_proof("850075865932", product)
        assert proven is False
        assert "no_upc" in (reason or "").lower()

    def test_is_exact_upc_proof_mismatch(self):
        from scrapers.approved_sources.upc_resolution import is_exact_upc_proof
        product = {"name": "Test Product", "upc": "999999999999"}
        proven, reason = is_exact_upc_proof("850075865932", product)
        assert proven is False
        assert "mismatch" in (reason or "")


class TestOfficialBrandCrawlAdapter:
    """Tests for OfficialBrandCrawlAdapter with mocked extraction."""

    @patch.object(OfficialBrandCrawlAdapter, "_build_search_url")
    @patch.object(OfficialBrandCrawlAdapter, "_build_not_stocked_result")
    def test_exact_upc_proof_emits_found(
        self, mock_not_stocked, mock_build_url, plan, entry, mock_extractor
    ):
        """Adapter emits 'found' when exact UPC evidence passes gates."""
        mock_build_url.return_value = "https://testbrand.com/products?q=850075865932"
        mock_extractor.extract = AsyncMock(return_value={
            "success": True,
            "product": {
                "name": "Test Product",
                "upc": "850075865932",
                "brand": "TestBrand",
                "description": "A test product",
            },
            "confidence": {"overall": 0.95, "fields": {}},
        })

        adapter = OfficialBrandCrawlAdapter(entry, plan)
        import asyncio
        result = asyncio.run(adapter.extract(mock_extractor))

        assert result is not None
        assert result.status == "success"
        assert result.source_results is not None
        sr = result.source_results[0]
        assert sr.outcome == "found"
        assert sr.resolutionStage == "official_brand"
        # resolutionEvidence is now an array
        assert sr.resolutionEvidence is not None
        assert isinstance(sr.resolutionEvidence, list)
        assert len(sr.resolutionEvidence) == 1
        assert sr.resolutionEvidence[0]["evidence_kind"] == "official_exact_upc"
        assert sr.resolutionEvidence[0]["expected_upc"] == "850075865932"
        # Fix 2: source result should contain product data with identifiers
        assert sr.product is not None
        assert sr.product.upc == "850075865932"

    @patch.object(OfficialBrandCrawlAdapter, "_build_search_url")
    def test_no_upc_emits_not_stocked(
        self, mock_build_url, plan, entry, mock_extractor
    ):
        """Adapter emits 'not_stocked' when page has no UPC evidence."""
        mock_build_url.return_value = "https://testbrand.com/products?q=850075865932"
        mock_extractor.extract = AsyncMock(return_value={
            "success": True,
            "product": {
                "name": "Test Product No UPC",
                "brand": "TestBrand",
                "description": "No UPC on this page",
            },
            "confidence": {"overall": 0.7, "fields": {}},
        })

        adapter = OfficialBrandCrawlAdapter(entry, plan)
        import asyncio
        result = asyncio.run(adapter.extract(mock_extractor))

        assert result is not None
        assert result.source_results is not None
        sr = result.source_results[0]
        assert sr.outcome == "not_stocked"
        assert sr.resolutionStage == "official_brand"
        # resolutionEvidence is now an array
        assert sr.resolutionEvidence is not None
        assert isinstance(sr.resolutionEvidence, list)
        assert len(sr.resolutionEvidence) == 1
        assert sr.resolutionEvidence[0]["evidence_kind"] == "candidate_below_gate"

    @patch.object(OfficialBrandCrawlAdapter, "_build_search_url")
    def test_extraction_failure_emits_not_stocked_with_candidates(
        self, mock_build_url, plan, entry, mock_extractor
    ):
        """Adapter emits 'not_stocked' when extraction fails (no response)."""
        mock_build_url.return_value = "https://testbrand.com/products?q=850075865932"
        mock_extractor.extract = AsyncMock(return_value={
            "success": False,
            "product": {},
            "confidence": 0.0,
        })

        adapter = OfficialBrandCrawlAdapter(entry, plan)
        import asyncio
        result = asyncio.run(adapter.extract(mock_extractor))

        assert result is not None
        assert result.source_results is not None
        sr = result.source_results[0]
        assert sr.outcome == "not_stocked"
        assert sr.resolutionStage == "official_brand"

    @patch.object(OfficialBrandCrawlAdapter, "_build_search_url")
    def test_high_confidence_no_upc_emits_found(
        self, mock_build_url, plan, entry, mock_extractor
    ):
        """Adapter emits 'found' with high-confidence no-upc rule when conditions met.

        Uses a custom register name with descriptor overlap so it passes
        the tightened overlap check.
        """
        mock_build_url.return_value = "https://testbrand.com/products?q=850075865932"
        mock_extractor.extract = AsyncMock(return_value={
            "success": True,
            "product": {
                "name": "TestBrand Premium Food",
                "brand": "TestBrand",
                "description": "Premium food from TestBrand",
            },
            "confidence": {"overall": 0.92, "fields": {}},
        })

        # Create a custom plan with a register name that has descriptor overlap
        from scrapers.approved_sources.types import ApprovedSourcePlan
        custom_plan = ApprovedSourcePlan(
            upc=plan.upc,
            input={"name": "Premium Food", "price": 10.0},
            brand=plan.brand,
            extractionMode=plan.extractionMode,
            priority=plan.priority,
            sourcePolicy=plan.sourcePolicy,
        )

        adapter = OfficialBrandCrawlAdapter(entry, custom_plan)
        import asyncio
        result = asyncio.run(adapter.extract(mock_extractor))

        assert result is not None
        assert result.status == "success"
        assert result.source_results is not None
        sr = result.source_results[0]
        assert sr.outcome == "found"
        assert sr.resolutionStage == "official_brand"
        # resolutionEvidence is now an array
        assert sr.resolutionEvidence is not None
        assert isinstance(sr.resolutionEvidence, list)
        assert len(sr.resolutionEvidence) == 1
        kind = sr.resolutionEvidence[0].get("evidence_kind", "")
        assert "high_confidence" in kind
        # Fix 2: product data should be included (name from extraction result)
        assert sr.product is not None
        assert sr.product.name == "TestBrand Premium Food"

    @patch.object(OfficialBrandCrawlAdapter, "_build_search_url")
    def test_wrong_official_page_rejected_by_tightened_no_upc(
        self, mock_build_url, plan, entry, mock_extractor
    ):
        """Tightened no-UPC path rejects wrong official-brand page (no descriptor overlap)."""
        mock_build_url.return_value = "https://testbrand.com/products?q=850075865932"
        # Wrong product page: brand matches but product is unrelated (no descriptor overlap)
        mock_extractor.extract = AsyncMock(return_value={
            "success": True,
            "product": {
                "name": "TestBrand About Us",
                "brand": "TestBrand",
                "description": "Learn about our company",
            },
            "confidence": {"overall": 0.95, "fields": {}},
        })

        adapter = OfficialBrandCrawlAdapter(entry, plan)
        import asyncio
        result = asyncio.run(adapter.extract(mock_extractor))

        assert result is not None
        assert result.source_results is not None
        sr = result.source_results[0]
        # Must not emit found — should be not_stocked because the title
        # "About Us" has no meaningful overlap with register name "Test Product"
        assert sr.outcome == "not_stocked"
        assert sr.resolutionStage == "official_brand"

    @patch.object(OfficialBrandCrawlAdapter, "_build_search_url")
    def test_tightened_no_upc_rejects_low_confidence(
        self, mock_build_url, plan, entry, mock_extractor
    ):
        """Tightened no-UPC rejects when raw extractor confidence < 0.90."""
        mock_build_url.return_value = "https://testbrand.com/products?q=850075865932"
        mock_extractor.extract = AsyncMock(return_value={
            "success": True,
            "product": {
                "name": "TestBrand Premium Food",
                "brand": "TestBrand",
                "description": "Premium food from TestBrand",
            },
            "confidence": {"overall": 0.85, "fields": {}},
        })

        adapter = OfficialBrandCrawlAdapter(entry, plan)
        import asyncio
        result = asyncio.run(adapter.extract(mock_extractor))

        assert result is not None
        assert result.source_results is not None
        sr = result.source_results[0]
        # Low confidence (0.85 < 0.90) should reject and emit not_stocked
        assert sr.outcome == "not_stocked"

    @patch.object(OfficialBrandCrawlAdapter, "_build_search_url")
    def test_upc_present_but_wrong_rejected_by_no_upc_path(
        self, mock_build_url, plan, entry, mock_extractor
    ):
        """no-UPC path rejects when a different UPC is present (fix #8)."""
        mock_build_url.return_value = "https://testbrand.com/products?q=850075865932"
        mock_extractor.extract = AsyncMock(return_value={
            "success": True,
            "product": {
                "name": "TestBrand Premium Food",
                "brand": "TestBrand",
                "upc": "999999999999",  # Different UPC — should not match no-UPC path
                "description": "Premium food from TestBrand",
            },
            "confidence": {"overall": 0.92, "fields": {}},
        })

        adapter = OfficialBrandCrawlAdapter(entry, plan)
        import asyncio
        result = asyncio.run(adapter.extract(mock_extractor))

        assert result is not None
        assert result.source_results is not None
        sr = result.source_results[0]
        # Different UPC present → not_stocked (conflict), NOT found via no-UPC path
        assert sr.outcome == "not_stocked"

    @patch.object(OfficialBrandCrawlAdapter, "_build_search_url")
    def test_source_slug_from_entry(
        self, mock_build_url, plan, entry_with_custom_slug, mock_extractor
    ):
        """Fix 7: Adapter uses entry.sourceSlug when set, not hardcoded class slug."""
        mock_build_url.return_value = "https://testbrand.com/products?q=850075865932"
        entry = entry_with_custom_slug
        mock_extractor.extract = AsyncMock(return_value={
            "success": True,
            "product": {
                "name": "My Product",
                "upc": "850075865932",
                "brand": "TestBrand",
            },
            "confidence": {"overall": 0.9, "fields": {}},
        })

        adapter = OfficialBrandCrawlAdapter(entry, plan)
        import asyncio
        result = asyncio.run(adapter.extract(mock_extractor))

        assert result is not None
        assert result.source.source_slug == "my_brand_slug"
        assert result.source_results is not None
        sr = result.source_results[0]
        assert sr.sourceSlug == "my_brand_slug"
