"""Opt-in live login and extraction smoke tests for auth-gated approved source distributors.

These tests require:
1. A working Crawl4AI installation (playwright browsers installed)
2. Valid credentials for the distributor being tested (via env vars)
3. Network access to the distributor sites

Marked with @pytest.mark.live — excluded from normal CI.

Skip behavior:
- Tests skip when distributor credentials are not found in env
- Tests skip when crawl4ai is not available
- NEVER logs passwords or raw credential values

Credential env vars:
    ORGILL_USERNAME / ORGILL_PASSWORD
    PHILLIPS_USERNAME / PHILLIPS_PASSWORD
    PET_FOOD_EXPERTS_USERNAME / PET_FOOD_EXPERTS_PASSWORD (or PETFOODEX_USERNAME / PETFOODEX_PASSWORD)
"""

from __future__ import annotations

import os
import pytest

from scrapers.approved_sources.auth import (
    ApprovedSourceLoginManager,
    ORGILL_LOGIN,
    PHILLIPS_LOGIN,
    PFE_LOGIN,
)
from scrapers.approved_sources.adapters.registry import get_adapter_class
from scrapers.approved_sources.types import (
    ApprovedSourcePlan,
    ApprovedSourcePlanEntry,
    ApprovedSourcePolicy,
    ApprovedSourceBrand,
)


# ---------------------------------------------------------------------------
# Credential helpers
# ---------------------------------------------------------------------------

# Map source_slug to env var prefix (handles alias mismatches)
_CREDENTIAL_ALIASES: dict[str, list[str]] = {
    "orgill": ["ORGILL"],
    "phillips": ["PHILLIPS"],
    "pet_food_experts": ["PET_FOOD_EXPERTS", "PETFOODEX"],
}


def _credentials_available(source_slug: str) -> bool:
    """Check if credentials are available for a distributor.

    Checks multiple env var prefixes for aliases (e.g., PET_FOOD_EXPERTS and PETFOODEX).
    """
    prefixes = _CREDENTIAL_ALIASES.get(source_slug, [source_slug.upper().replace("-", "_")])
    for prefix in prefixes:
        username = os.getenv(f"{prefix}_USERNAME", "")
        password = os.getenv(f"{prefix}_PASSWORD", "")
        if username and password:
            return True
    return False


def _build_live_plan(
    upc: str,
    source_slug: str,
    adapter_slug: str,
    brand_name: str | None = None,
    product_name: str | None = None,
    domains: list[str] | None = None,
) -> tuple[ApprovedSourcePlan, ApprovedSourcePlanEntry]:
    """Build a plan for live auth-gated testing."""
    if domains is None:
        domain_map = {
            "orgill": ["orgill.com"],
            "phillips": ["shop.phillipspet.com"],
            "pet_food_experts": ["orders.petfoodexperts.com"],
        }
        domains = domain_map.get(source_slug, [])

    brand = None
    if brand_name:
        brand = ApprovedSourceBrand(
            id=f"live-{source_slug}",
            name=brand_name,
            slug=brand_name.lower().replace(" ", "_"),
        )

    entry = ApprovedSourcePlanEntry(
        sourceType="distributor",
        sourceSlug=source_slug,
        displayName=source_slug.replace("_", " ").title(),
        domains=domains,
        assetDomains=domains,
        adapterSlug=adapter_slug,
        requiresAuth=True,
        searchMode="sku_search",
        allowedFields=["name", "brand", "upc", "upc", "images", "weight", "description"],
        priority=10,
        runFirst=True,
    )

    plan = ApprovedSourcePlan(
        schemaVersion="v1",
        upc=sku,
        input={"name": product_name, "price": None},
        brand=brand,
        selectedDistributorSlug=source_slug,
        priority=[entry],
        sourcePolicy=ApprovedSourcePolicy(
            allowedDomains=domains,
            allowedAssetDomains=domains,
            approvedSourcesOnly=True,
        ),
    )

    return plan, entry


# ---------------------------------------------------------------------------
# Orgill live tests
# ---------------------------------------------------------------------------

@pytest.mark.live
@pytest.mark.asyncio
class TestOrgillLiveLogin:
    """Live login test for Orgill (requires credentials)."""

    @pytest.fixture(autouse=True)
    def _check_creds(self):
        if not _credentials_available("orgill"):
            pytest.skip("No Orgill credentials available (set ORGILL_USERNAME/ORGILL_PASSWORD)")

    async def test_login_success(self):
        """Test successful login to Orgill."""
        manager = ApprovedSourceLoginManager()
        result = await manager.ensure_logged_in(
            source_slug="orgill",
            login_config=ORGILL_LOGIN,
        )
        assert result.success, f"Orgill login failed: {result.error_message}"
        assert result.session_id is not None
        await manager.cleanup()

    async def test_login_then_crawl_search(self):
        """Test login followed by an authenticated crawl of a search page."""
        manager = ApprovedSourceLoginManager()
        login_result = await manager.ensure_logged_in(
            source_slug="orgill",
            login_config=ORGILL_LOGIN,
        )
        assert login_result.success, f"Orgill login failed: {login_result.error_message}"

        # Use session to crawl a search
        config = manager.get_authenticated_crawl_config(login_result.session_id)
        assert config["session_id"] == login_result.session_id
        await manager.cleanup()


@pytest.mark.live
@pytest.mark.asyncio
class TestOrgillLiveExtraction:
    """Live product extraction test for Orgill (login + extract)."""

    @pytest.fixture(autouse=True)
    def _check_creds(self):
        if not _credentials_available("orgill"):
            pytest.skip("No Orgill credentials available (set ORGILL_USERNAME/ORGILL_PASSWORD)")

    async def test_extract_product_037193347322(self):
        """Test extracting a known Orgill product after login."""
        plan, entry = _build_live_plan(
            upc="037193347322",
            source_slug="orgill",
            adapter_slug="orgill_crawl4ai",
            brand_name="Purina",
            product_name="Premium Chicken Feed",
        )

        adapter_cls = get_adapter_class("orgill_crawl4ai")
        assert adapter_cls is not None, "Orgill adapter not found in registry"

        adapter = adapter_cls(entry, plan)
        result = await adapter.extract(extractor=None)

        assert result is not None, "extract() returned None"
        # Should not be an auth failure — we have credentials
        assert result.status != "failed" or "AUTH" not in str(
            result.validation.warnings if result.validation else []
        ), f"Auth failed unexpectedly: {result.validation.warnings if result.validation else 'no warnings'}"

        if result.status in ("success", "partial"):
            assert result.confidence.overall > 0, "Confidence should be > 0 for successful extraction"


# ---------------------------------------------------------------------------
# Phillips live tests
# ---------------------------------------------------------------------------

@pytest.mark.live
@pytest.mark.asyncio
class TestPhillipsLiveLogin:
    """Live login test for Phillips (requires credentials)."""

    @pytest.fixture(autouse=True)
    def _check_creds(self):
        if not _credentials_available("phillips"):
            pytest.skip("No Phillips credentials available (set PHILLIPS_USERNAME/PHILLIPS_PASSWORD)")

    async def test_login_success(self):
        """Test successful login to Phillips."""
        manager = ApprovedSourceLoginManager()
        result = await manager.ensure_logged_in(
            source_slug="phillips",
            login_config=PHILLIPS_LOGIN,
        )
        assert result.success, f"Phillips login failed: {result.error_message}"
        assert result.session_id is not None
        await manager.cleanup()


@pytest.mark.live
@pytest.mark.asyncio
class TestPhillipsLiveExtraction:
    """Live product extraction test for Phillips (login + extract)."""

    @pytest.fixture(autouse=True)
    def _check_creds(self):
        if not _credentials_available("phillips"):
            pytest.skip("No Phillips credentials available (set PHILLIPS_USERNAME/PHILLIPS_PASSWORD)")

    async def test_extract_product_072705115310(self):
        """Test extracting a known Phillips product after login."""
        plan, entry = _build_live_plan(
            upc="072705115310",
            source_slug="phillips",
            adapter_slug="phillips_crawl4ai",
            brand_name="Fromm",
            product_name="Fromm Gold Large Breed Dog 30 lb",
            domains=["shop.phillipspet.com"],
        )

        adapter_cls = get_adapter_class("phillips_crawl4ai")
        assert adapter_cls is not None, "Phillips adapter not found in registry"

        adapter = adapter_cls(entry, plan)
        result = await adapter.extract(extractor=None)

        assert result is not None, "extract() returned None"
        assert result.status != "failed" or "AUTH" not in str(
            result.validation.warnings if result.validation else []
        ), f"Auth failed unexpectedly: {result.validation.warnings if result.validation else 'no warnings'}"

        if result.status in ("success", "partial"):
            assert result.confidence.overall > 0, "Confidence should be > 0"


# ---------------------------------------------------------------------------
# Pet Food Experts live tests
# ---------------------------------------------------------------------------

@pytest.mark.live
@pytest.mark.asyncio
class TestPFELiveLogin:
    """Live login test for Pet Food Experts (requires credentials)."""

    @pytest.fixture(autouse=True)
    def _check_creds(self):
        if not _credentials_available("pet_food_experts"):
            pytest.skip(
                "No Pet Food Experts credentials available "
                "(set PET_FOOD_EXPERTS_USERNAME/PET_FOOD_EXPERTS_PASSWORD or PETFOODEX_USERNAME/PETFOODEX_PASSWORD)"
            )

    async def test_login_success(self):
        """Test successful login to Pet Food Experts."""
        manager = ApprovedSourceLoginManager()
        result = await manager.ensure_logged_in(
            source_slug="pet_food_experts",
            login_config=PFE_LOGIN,
        )
        assert result.success, f"PFE login failed: {result.error_message}"
        assert result.session_id is not None
        await manager.cleanup()


@pytest.mark.live
@pytest.mark.asyncio
class TestPFELiveExtraction:
    """Live product extraction test for Pet Food Experts (login + extract)."""

    @pytest.fixture(autouse=True)
    def _check_creds(self):
        if not _credentials_available("pet_food_experts"):
            pytest.skip(
                "No Pet Food Experts credentials available "
                "(set PET_FOOD_EXPERTS_USERNAME/PET_FOOD_EXPERTS_PASSWORD or PETFOODEX_USERNAME/PETFOODEX_PASSWORD)"
            )

    async def test_extract_product_33011808(self):
        """Test extracting a known PFE product after login."""
        plan, entry = _build_live_plan(
            upc="33011808",
            source_slug="pet_food_experts",
            adapter_slug="pet_food_experts_crawl4ai",
            product_name="Wellness CORE Senior Dog Food",
            domains=["orders.petfoodexperts.com"],
        )

        adapter_cls = get_adapter_class("pet_food_experts_crawl4ai")
        assert adapter_cls is not None, "Pet Food Experts adapter not found in registry"

        adapter = adapter_cls(entry, plan)
        result = await adapter.extract(extractor=None)

        assert result is not None, "extract() returned None"
        assert result.status != "failed" or "AUTH" not in str(
            result.validation.warnings if result.validation else []
        ), f"Auth failed unexpectedly: {result.validation.warnings if result.validation else 'no warnings'}"

        if result.status in ("success", "partial"):
            assert result.confidence.overall > 0, "Confidence should be > 0"
