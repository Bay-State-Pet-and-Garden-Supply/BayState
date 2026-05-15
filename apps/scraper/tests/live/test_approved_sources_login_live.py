"""Opt-in live login smoke tests for auth-gated approved source distributors.

These tests require:
1. A working Crawl4AI installation (playwright browsers installed)
2. Valid credentials for the distributor being tested

Marked with @pytest.mark.live — excluded from normal CI.

Skip behavior:
- Tests skip when distributor credentials are not found in env or api
- Tests skip when crawl4ai is not available
- NEVER logs passwords or raw credential values
"""

from __future__ import annotations

import os
import pytest

from scrapers.approved_sources.auth import (
    ApprovedSourceLoginManager,
    ORGILL_LOGIN,
    PHILLIPS_LOGIN,
    PFE_LOGIN,
    resolve_credentials,
)


def _credentials_available(source_slug: str) -> bool:
    """Check if credentials are available for a distributor."""
    env_prefix = source_slug.upper().replace("-", "_")
    username = os.getenv(f"{env_prefix}_USERNAME", "")
    password = os.getenv(f"{env_prefix}_PASSWORD", "")
    return bool(username and password)


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
class TestPFELiveLogin:
    """Live login test for Pet Food Experts (requires credentials)."""

    @pytest.fixture(autouse=True)
    def _check_creds(self):
        if not _credentials_available("petfoodex"):
            pytest.skip("No Pet Food Experts credentials available (set PETFOODEX_USERNAME/PETFOODEX_PASSWORD)")

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
