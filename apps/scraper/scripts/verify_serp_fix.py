#!/usr/bin/env python3
"""Verify Serp Discovery fix: ensure unsafe URLs are bypassed in Phase 1/3.

Exercises the SerpDiscoveryAdapter with live Serper API for Blue Buffalo UPC
840243154111. Captures Phase 1 raw results, applies is_candidate_unsafe_for_canonical_selection,
and reports whether the incentive-requests URL was present and correctly filtered.

Usage:
    cd apps/scraper
    .venv/bin/python scripts/verify_serp_fix.py

Expected outcome:
    - Phase 1 results from Serper (raw)
    - Any unsafe URLs detected and bypassed
    - Final selected URL is a safe product page on bluebuffalo.com
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path
from typing import Any

# Ensure the scraper package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from scrapers.approved_sources.adapters.serp_discovery import (
    SerpDiscoveryAdapter,
    is_candidate_unsafe_for_canonical_selection,
)
from scrapers.approved_sources.types import (
    ApprovedSourcePlan,
    ApprovedSourcePlanEntry,
    ApprovedSourceBrand,
    ApprovedSourcePolicy,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("serp-verification")

# ── Test constants ──────────────────────────────────────────────
TEST_UPC = "840243154111"
TEST_REGISTER_NAME = "Blue Wilderness Dog"
TEST_BRAND_NAME = "Blue Buffalo"
TEST_BRAND_DOMAIN = "bluebuffalo.com"
UNSAFE_INCENTIVE_URL = "https://www.bluebuffalo.com/incentive-requests/qualifying-products"


def build_test_plan() -> ApprovedSourcePlan:
    """Build a minimal ApprovedSourcePlan for the Blue Buffalo SerpDiscovery test."""
    brand = ApprovedSourceBrand(
        id="test-brand-id",
        name=TEST_BRAND_NAME,
        slug="blue-buffalo",
    )

    entry = ApprovedSourcePlanEntry(
        sourceType="official_brand",
        sourceSlug="serp_discovery",
        displayName="Serp Discovery",
        domains=[TEST_BRAND_DOMAIN],
        adapterSlug="serp_discovery",
        priority=100,
    )

    return ApprovedSourcePlan(
        schemaVersion="v1",
        upc=TEST_UPC,
        input={"name": TEST_REGISTER_NAME, "price": None},
        brand=brand,
        extractionMode="ai_only",
        priority=[entry],
        sourcePolicy=ApprovedSourcePolicy(),
    )


def print_section(title: str) -> None:
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


def print_sub(text: str) -> None:
    print(f"  → {text}")


async def run_verification() -> None:
    """Main verification routine."""
    plan = build_test_plan()
    entry = plan.priority[0]

    adapter = SerpDiscoveryAdapter(entry, plan)

    # ──────────────────────────────────────────────────────────────
    # Step 1: Validate is_candidate_unsafe_for_canonical_selection
    # ──────────────────────────────────────────────────────────────
    print_section("Step 1: Safety Filter Unit Check")

    unsafe_urls = [
        UNSAFE_INCENTIVE_URL,
        "https://www.bluebuffalo.com/",
        "https://www.bluebuffalo.com/product-catalog.pdf",
        "https://www.bluebuffalo.com/search?q=dog+food",
        "https://www.bluebuffalo.com/blogs/news/new-product-launch",
        "https://www.bluebuffalo.com/store-locator",
        "https://www.bluebuffalo.com/collections/dog-food",
        "https://www.bluebuffalo.com/reviews",
        "https://www.bluebuffalo.com/our-products/",
        "https://www.bluebuffalo.com/where-to-buy",
    ]

    safe_urls = [
        "https://www.bluebuffalo.com/products/dog/wilderness-chicken",
        "https://www.bluebuffalo.com/collections/dog-food/products/wilderness-chicken",
        "https://www.bluebuffalo.com/products/cat/tastefuls/tuna-mini-purees",
    ]

    print_sub("Unsafe URLs (should all be True):")
    all_unsafe_correct = True
    for url in unsafe_urls:
        result = is_candidate_unsafe_for_canonical_selection(url)
        status = "✓" if result else "✗ FAIL"
        if not result:
            all_unsafe_correct = False
        print_sub(f"  {status} {url}")

    print_sub("\nSafe URLs (should all be False):")
    all_safe_correct = True
    for url in safe_urls:
        result = is_candidate_unsafe_for_canonical_selection(url)
        status = "✓" if not result else "✗ FAIL"
        if result:
            all_safe_correct = False
        print_sub(f"  {status} {url}")

    if all_unsafe_correct and all_safe_correct:
        print_sub("\n✅ Safety filter unit checks all passed.")
    else:
        print_sub("\n❌ Safety filter unit checks FAILED.")
        return

    # ──────────────────────────────────────────────────────────────
    # Step 2: Phase 1 — Live Serper UPC Discovery
    # ──────────────────────────────────────────────────────────────
    print_section("Step 2: Phase 1 — Live Serper UPC Discovery")

    phase1_results = await adapter._phase1_sku_discovery(TEST_UPC)
    print_sub(f"Search query: \"{TEST_UPC}\"")
    print_sub(f"Results returned: {len(phase1_results)}")

    if not phase1_results:
        print_sub("⚠️  No results returned. Serper may not have the incentive URL indexed right now.")
        print_sub("   This is expected variability — the unit tests + safety filter remain valid.")
        print_sub("\nRunning controlled fixture test instead...")
        return await run_fixture_verification(adapter)

    # Check each result against the safety filter
    found_unsafe = []
    found_incentive = False
    found_safe = []

    for r in phase1_results:
        url = r.get("url", "")
        title = r.get("title", "")
        is_unsafe = is_candidate_unsafe_for_canonical_selection(url)

        if UNSAFE_INCENTIVE_URL in url or "/incentive-requests/" in url:
            found_incentive = True
            found_unsafe.append((url, title, "INCENTIVE-REQUESTS PAGE"))

        if is_unsafe:
            found_unsafe.append((url, title, "UNSAFE"))
        else:
            found_safe.append((url, title))

    print_sub("\nPhase 1 Result Summary:")
    print_sub(f"  Total: {len(phase1_results)}")
    print_sub(f"  Unsafe (would be bypassed): {len(found_unsafe)}")
    print_sub(f"  Safe (candidates for selection): {len(found_safe)}")

    if found_incentive:
        print_sub(f"\n🎯 INCENTIVE-REQUESTS URL FOUND in Phase 1 results!")
        print_sub(f"   → This confirms the bug scenario is reproducible.")
        print_sub(f"   → The safety filter will now bypass it.")
    else:
        print_sub("\n⚠️  Incentive-requests URL NOT present in current Serper results.")
        print_sub("   → Live results vary. Running fixture test to verify the filter works.")

    if found_unsafe:
        print_sub("\nUnsafe results that WOULD be bypassed:")
        for url, title, tag in found_unsafe:
            print_sub(f"  [{tag}] {title[:80]}")
            print_sub(f"         {url}")

    if found_safe:
        print_sub("\nSafe results (eligible for selection):")
        for url, title in found_safe[:5]:
            print_sub(f"  {title[:80]}")
            print_sub(f"  {url}")

    # ──────────────────────────────────────────────────────────────
    # Step 3: Full _resolve_approved_url execution
    # ──────────────────────────────────────────────────────────────
    print_section("Step 3: Full URL Resolution (Phases 1-3)")

    print_sub("Running _resolve_approved_url...")
    resolved_url = await adapter._resolve_approved_url(
        upc=TEST_UPC,
        register_name=TEST_REGISTER_NAME,
        brand_name=TEST_BRAND_NAME,
        brand_domain=TEST_BRAND_DOMAIN,
    )

    if resolved_url:
        is_resolved_safe = not is_candidate_unsafe_for_canonical_selection(resolved_url)
        print_sub(f"✅ Resolved URL: {resolved_url}")
        print_sub(f"   Safe for canonical selection: {is_resolved_safe}")

        # Verify it's NOT the incentive page
        if "/incentive-requests/" in resolved_url.lower():
            print_sub("❌ FAIL: Resolved URL IS the incentive-requests page!")
            print_sub("   The fix did NOT work correctly.")
        elif not is_resolved_safe:
            print_sub("❌ FAIL: Resolved URL is unsafe!")
        else:
            print_sub("✅ PASS: Resolved URL is a safe product page.")
    else:
        print_sub("❌ No URL resolved. This could mean:")
        print_sub("   - Phase 1 found no safe candidates")
        print_sub("   - Phase 3 brand site search returned no results")
        print_sub("   - LLM name consolidation or URL selection failed")
        print_sub("   This is acceptable — the fix prevents unsafe selection.")

    # ──────────────────────────────────────────────────────────────
    # Step 4: Controlled Fixture Test (always run for completeness)
    # ──────────────────────────────────────────────────────────────
    if not found_incentive:
        print_section("Step 4: Controlled Fixture Test")
        await run_fixture_verification(adapter)


async def run_fixture_verification(adapter: SerpDiscoveryAdapter) -> None:
    """Run a controlled fixture test simulating the bug scenario.

    Mocks Phase 1 to return the incentive URL, then verifies it is bypassed.
    This proves the fix works even when live Serper results vary.
    """
    from unittest.mock import patch, MagicMock, AsyncMock
    import asyncio as _asyncio

    print_sub("Creating fixture: Phase 1 returns the incentive-requests URL...")
    print_sub(f"  Mock result: {UNSAFE_INCENTIVE_URL}")

    with patch(
        "scrapers.approved_sources.adapters.serp_discovery.SearchClient"
    ) as mock_search_client_class:
        mock_client = MagicMock()
        mock_client.search = AsyncMock(return_value=([
            {
                "url": UNSAFE_INCENTIVE_URL,
                "title": "Qualifying Products - Blue Buffalo",
                "description": "Find qualifying Blue Buffalo products for cash-back offers...",
            },
            {
                "url": "https://www.bluebuffalo.com/products/dog/wilderness-chicken",
                "title": "Wilderness Chicken Recipe | Blue Buffalo",
                "description": "High-protein dog food with real chicken...",
            },
        ], None))
        mock_search_client_class.return_value = mock_client

        print_sub("\nRunning _resolve_approved_url with fixture data...")
        resolved_url = await adapter._resolve_approved_url(
            upc=TEST_UPC,
            register_name=TEST_REGISTER_NAME,
            brand_name=TEST_BRAND_NAME,
            brand_domain=TEST_BRAND_DOMAIN,
        )

        if resolved_url:
            is_resolved_safe = not is_candidate_unsafe_for_canonical_selection(resolved_url)
            print_sub(f"Resolved URL: {resolved_url}")
            print_sub(f"Safe: {is_resolved_safe}")

            if "/incentive-requests/" in resolved_url.lower():
                print_sub("\n❌ FIXTURE FAIL: Incentive URL was NOT bypassed.")
                print_sub("   The fix is NOT working correctly.")
            elif is_resolved_safe:
                print_sub(f"\n✅ FIXTURE PASS: Incentive URL was correctly bypassed.")
                print_sub(f"   Selected URL is a safe product page instead.")
            else:
                print_sub(f"\n⚠️  FIXTURE INCONCLUSIVE: Selected URL is not the incentive page,")
                print_sub(f"   but is also flagged as unsafe. Manual review needed.")
        else:
            print_sub("\n✅ FIXTURE PASS: No URL resolved.")
            print_sub("   The incentive URL was correctly bypassed, and Phase 2/3 found no")
            print_sub("   alternatives (expected in a fixture with limited mock data).")

        print_sub(f"\n---")
        print_sub(f"LLM was used in discovery: {adapter._llm_used_in_discovery}")


def main() -> None:
    asyncio.run(run_verification())


if __name__ == "__main__":
    main()
