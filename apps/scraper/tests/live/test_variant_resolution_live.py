"""Live variant resolution tests against real product pages.

Marked @pytest.mark.live — excluded from normal CI by pytest.ini.
No LLM or search API required — only Playwright/Crawl4AI page fetches.

These tests validate that:
  1. Real Shopify/WooCommerce/Demandware pages contain the DOM patterns
     the resolvers expect (JSON-LD, data-product_variations, AJAX configs).
  2. The variant dispatch coordinator correctly detects the platform.
  3. Resolver status matches expectations from the ground truth fixture.
  4. For 'exact_variant' cases, the resolver actually modifies the URL or HTML.

Run:
    pytest -m live tests/live/test_variant_resolution_live.py -v
    pytest -m live tests/live/test_variant_resolution_live.py -k "Open_Farm" -v -s

Cost: $0 — Playwright page fetches only.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest

from scrapers.ai_search.variant_resolvers import resolve_family_variant
from tests.live.conftest import save_html_snapshot, load_html_snapshot

logger = logging.getLogger("tests.live.variant_resolution")

FIXTURE_PATH = Path(__file__).parent.parent / "fixtures" / "variant_resolution_ground_truth.json"


# ---------------------------------------------------------------------------
# Parameterized case loading
# ---------------------------------------------------------------------------

def _load_entries() -> list[dict[str, Any]]:
    if not FIXTURE_PATH.exists():
        return []
    with open(FIXTURE_PATH, encoding="utf-8") as f:
        return json.load(f)


def _family_page_cases():
    """Yield entries where variant resolution is expected to trigger."""
    for entry in _load_entries():
        vr = entry.get("variant_resolution", {})
        if vr.get("is_family_page"):
            yield pytest.param(
                entry,
                id=f"{entry['brand']}-{entry['upc']}",
            )


def _non_family_cases():
    """Yield entries where variant resolution should be a no-op."""
    for entry in _load_entries():
        vr = entry.get("variant_resolution", {})
        if not vr.get("is_family_page"):
            yield pytest.param(
                entry,
                id=f"{entry['brand']}-{entry['upc']}",
            )


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _make_mock_utils() -> tuple[MagicMock, MagicMock, MagicMock]:
    """Build the mock utility objects the resolver coordinator expects."""
    scoring = MagicMock()
    scoring.is_product_line_page.return_value = False
    scoring.domain_from_url.side_effect = lambda url: url.split("//")[-1].split("/")[0]
    scoring.classify_source_domain.return_value = "official"

    from scrapers.ai_search.matching import MatchingUtils
    matching = MatchingUtils()

    extraction = MagicMock()
    extraction.clean_text.side_effect = lambda x: x.strip() if isinstance(x, str) else str(x)
    extraction.extract_demandware_variant_candidates.return_value = []
    extraction.selected_demandware_variant_id.return_value = None

    return scoring, matching, extraction


async def _fetch_html(url: str, entry: dict[str, Any], *, use_snapshot: bool = True) -> str:
    """Fetch HTML from a live page, or fall back to a saved snapshot.

    When a snapshot exists and use_snapshot=True, skip the network fetch.
    Always save a new snapshot after a successful live fetch.
    """
    if use_snapshot:
        snapshot = load_html_snapshot(entry)
        if snapshot:
            logger.info("Using saved snapshot for %s (%d bytes)", url, len(snapshot))
            return snapshot

    try:
        from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, BrowserConfig

        browser_config = BrowserConfig(
            headless=True,
            text_mode=False,
        )
        run_config = CrawlerRunConfig(
            wait_until="domcontentloaded",
            page_timeout=30000,
            cache_mode="BYPASS",
        )

        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url=url, config=run_config)
            if result.success and result.html:
                save_html_snapshot(entry, result.html)
                return result.html
            else:
                pytest.fail(
                    f"Crawl4AI failed for {url}: "
                    f"status={result.status_code}, error={getattr(result, 'error_message', 'unknown')}"
                )
    except ImportError:
        pytest.skip("crawl4ai not installed — cannot run live page fetch")


# ---------------------------------------------------------------------------
# Layer 1: Family page variant resolution tests
# ---------------------------------------------------------------------------

@pytest.mark.live
@pytest.mark.asyncio
class TestVariantResolutionFamilyPages:
    """Validate resolvers against real family/variant product pages."""

    @pytest.mark.parametrize("entry", list(_family_page_cases()))
    async def test_resolver_returns_expected_status(self, entry: dict[str, Any]):
        """Fetch a real product page and verify the resolver status matches ground truth."""
        url = entry["expected_source_url"]
        upc= entry["upc"]
        vr = entry["variant_resolution"]
        expected_status = vr["expected_resolver_status"]

        html = await _fetch_html(url, entry)
        assert len(html) > 500, (
            f"Page too short ({len(html)} bytes) — likely blocked or empty. URL: {url}"
        )

        scoring, matching, extraction = _make_mock_utils()

        resolved_url, resolved_html, resolved_md, status = await resolve_family_variant(
            url=url,
            upc=upc,
            product_name=f"{entry.get('name', '')} {entry.get('size_metrics', '')}".strip(),
            brand=entry.get("brand"),
            html=html,
            scoring_utils=scoring,
            matching_utils=matching,
            extraction_utils=extraction,
        )

        # Primary assertion: resolver status
        assert status == expected_status, (
            f"Expected resolver status '{expected_status}' but got '{status}' "
            f"for UPC {upc} ({entry['brand']} / {entry['name']}). "
            f"Platform: {vr.get('platform')}. "
            f"HTML length: {len(html)} bytes."
        )

    @pytest.mark.parametrize("entry", list(_family_page_cases()))
    async def test_exact_variant_modifies_output(self, entry: dict[str, Any]):
        """For 'exact_variant' entries, verify the resolver actually changed something."""
        vr = entry["variant_resolution"]
        if vr["expected_resolver_status"] != "exact_variant":
            pytest.skip("Not an exact_variant case")

        url = entry["expected_source_url"]
        upc= entry["upc"]

        html = await _fetch_html(url, entry)
        scoring, matching, extraction = _make_mock_utils()

        resolved_url, resolved_html, resolved_md, status = await resolve_family_variant(
            url=url,
            upc=upc,
            product_name=f"{entry.get('name', '')} {entry.get('size_metrics', '')}".strip(),
            brand=entry.get("brand"),
            html=html,
            scoring_utils=scoring,
            matching_utils=matching,
            extraction_utils=extraction,
        )

        if status == "exact_variant":
            # At least one output should differ from the input
            changed = (
                resolved_url != url
                or (resolved_html is not None and resolved_html != html)
                or resolved_md is not None
            )
            assert changed, (
                f"Resolver returned 'exact_variant' but no output was modified "
                f"for UPC {upc} ({entry['brand']})"
            )

    @pytest.mark.parametrize("entry", list(_family_page_cases()))
    async def test_html_contains_platform_signatures(self, entry: dict[str, Any]):
        """Verify the fetched HTML contains expected platform-specific markers."""
        vr = entry["variant_resolution"]
        platform = vr.get("platform", "").lower()
        url = entry["expected_source_url"]

        html = await _fetch_html(url, entry)
        html_lower = html.lower()

        if platform == "shopify":
            shopify_markers = [
                "shopify",
                "cdn.shopify.com",
                "/products/",
                "product-form",
            ]
            found = any(marker in html_lower for marker in shopify_markers)
            assert found, (
                f"Expected Shopify markers in HTML for {url} but found none. "
                f"Checked: {shopify_markers}"
            )

        elif platform == "woocommerce":
            woo_markers = [
                "woocommerce",
                "variations_form",
                "data-product_variations",
                "wp-content",
            ]
            found = any(marker in html_lower for marker in woo_markers)
            assert found, (
                f"Expected WooCommerce markers in HTML for {url} but found none. "
                f"Checked: {woo_markers}"
            )

        elif platform == "demandware":
            dw_markers = [
                "demandware",
                "dw.ac",
                "salesforce",
                "sfcc",
                "cloudfront",
            ]
            found = any(marker in html_lower for marker in dw_markers)
            # Soft assertion — log warning instead of failing
            if not found:
                logger.warning(
                    "Expected Demandware markers in HTML for %s but found none. "
                    "Checked: %s. The page may have migrated platforms.",
                    url,
                    dw_markers,
                )


# ---------------------------------------------------------------------------
# Layer 1b: Non-family page passthrough tests
# ---------------------------------------------------------------------------

@pytest.mark.live
@pytest.mark.asyncio
class TestVariantResolutionNonFamilyPages:
    """Validate that non-family pages pass through the resolver unchanged."""

    @pytest.mark.parametrize("entry", list(_non_family_cases()))
    async def test_resolver_returns_not_applicable(self, entry: dict[str, Any]):
        """Non-family pages should return ambiguous/not_applicable without modifying output."""
        url = entry["expected_source_url"]
        upc= entry["upc"]

        html = await _fetch_html(url, entry)
        if len(html) < 100:
            pytest.skip(f"Page content too short for {url} — likely blocked")

        scoring, matching, extraction = _make_mock_utils()

        resolved_url, resolved_html, resolved_md, status = await resolve_family_variant(
            url=url,
            upc=upc,
            product_name=entry.get("name"),
            brand=entry.get("brand"),
            html=html,
            scoring_utils=scoring,
            matching_utils=matching,
            extraction_utils=extraction,
        )

        # Should NOT return exact_variant for non-family pages
        assert status != "exact_variant", (
            f"Non-family page incorrectly resolved as 'exact_variant' "
            f"for UPC {upc} ({entry['brand']}). URL: {url}"
        )

        # URL should not be modified
        assert resolved_url == url, (
            f"Non-family page URL was modified: {url} -> {resolved_url}"
        )
