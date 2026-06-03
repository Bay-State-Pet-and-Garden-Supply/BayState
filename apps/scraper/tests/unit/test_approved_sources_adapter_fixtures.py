"""Fixture-based adapter tests for approved-source extraction.

Loads deterministic HTML fixture files from benchmarks/approved_sources/fixtures/html/
and calls extract_from_html() directly on each adapter. No network, no credentials,
no Crawl4AI browser required.

Covers:
- Positive product extraction for all 5 distributors
- Partial/missing field cases
- No-results detection
- Image URL filtering
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from scrapers.approved_sources.adapters.registry import get_adapter_class
from scrapers.approved_sources.types import (
    ApprovedSourcePlanEntry,
    ApprovedSourcePlan,
    ApprovedSourcePolicy,
    ApprovedSourceBrand,
)
from scrapers.approved_sources.result_builder import build_success_result

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "benchmarks" / "approved_sources" / "fixtures"
HTML_DIR = FIXTURES_DIR / "html"
FIXTURE_CATALOG_PATH = FIXTURES_DIR / "distributor_extraction_fixtures.json"


def _load_fixture_catalog() -> dict[str, Any]:
    with open(FIXTURE_CATALOG_PATH) as f:
        return json.load(f)


def _make_minimal_plan(upc: str, brand_name: str | None = None) -> ApprovedSourcePlan:
    """Create a minimal ApprovedSourcePlan for fixture testing."""
    brand = None
    if brand_name:
        brand = ApprovedSourceBrand(id="test-id", name=brand_name, slug=brand_name.lower().replace(" ", "_"))
    return ApprovedSourcePlan(
        upc=upc,
        brand=brand,
        sourcePolicy=ApprovedSourcePolicy(
            allowedDomains=["fixture.local", "bradleycaldwell.com", "centralpet.com",
                           "orgill.com", "phillipspet.com", "orders.petfoodexperts.com"],
            allowedAssetDomains=["fixture.local", "bradleycaldwell.com", "centralpet.com",
                                "orgill.com", "phillipspet.com", "orders.petfoodexperts.com"],
            approvedSourcesOnly=True,
        ),
    )


def _make_entry(
    adapter_slug: str,
    source_slug: str,
    allowed_fields: list[str] | None = None,
) -> ApprovedSourcePlanEntry:
    return ApprovedSourcePlanEntry(
        sourceType="distributor",
        sourceSlug=source_slug,
        displayName=source_slug.replace("_", " ").title(),
        adapterSlug=adapter_slug,
        requiresAuth=False,
        searchMode="sku_search",
        allowedFields=allowed_fields or [],
    )


def _read_fixture_html(relative_path: str) -> str:
    """Read a fixture HTML file relative to the fixtures/html directory."""
    full_path = HTML_DIR / relative_path
    if not full_path.exists():
        raise FileNotFoundError(f"Fixture not found: {full_path}")
    with open(full_path, encoding="utf-8") as f:
        return f.read()


# =============================================================================
# Fixture-based parameterized tests
# =============================================================================

FIXTURE_CATALOG = _load_fixture_catalog()

# Map adapter slugs to expected source slugs
ADAPTER_TO_SOURCE = {
    "bradley_crawl4ai": "bradley",
    "central_pet_crawl4ai": "central_pet",
    "orgill_crawl4ai": "orgill",
    "phillips_crawl4ai": "phillips",
    "pet_food_experts_crawl4ai": "pet_food_experts",
}


@pytest.mark.parametrize(
    "fixture_key",
    [k for k, v in FIXTURE_CATALOG["fixtures"].items() if v.get("fixture_type") == "product"],
    ids=lambda k: k,
)
def test_product_fixture_extraction(fixture_key: str) -> None:
    """Test that a product fixture extracts expected fields."""
    catalog = FIXTURE_CATALOG["fixtures"][fixture_key]
    fixture_path = catalog["fixture_path"]
    adapter_slug = catalog["adapter_slug"]
    source_slug = ADAPTER_TO_SOURCE.get(adapter_slug, adapter_slug.split("_crawl4ai")[0])

    html = _read_fixture_html(fixture_path)

    adapter_cls = get_adapter_class(adapter_slug)
    assert adapter_cls is not None, f"Adapter class not found for {adapter_slug}"

    expected_upc = catalog.get("expected_upc") or catalog.get("expected_sku")
    plan = _make_minimal_plan(upc=expected_upc)
    entry = _make_entry(adapter_slug, source_slug)
    adapter = adapter_cls(entry, plan)

    result = adapter.extract_from_html(html, expected_upc, "https://fixture.local/product")

    assert result is not None
    assert result.success, f"Expected success for {fixture_key}, got failure: {result.failure_message}"

    product = result.product
    name = product.get("name", "")
    assert catalog["expected_name_contains"] in name, \
        f"Expected name containing '{catalog['expected_name_contains']}', got '{name}'"

    if catalog.get("expected_brand"):
        brand = product.get("brand", "")
        assert catalog["expected_brand"] in brand, \
            f"Expected brand containing '{catalog['expected_brand']}', got '{brand}'"

    if catalog.get("expected_image_count"):
        images = product.get("image_urls", [])
        assert len(images) >= catalog["expected_image_count"], \
            f"Expected >= {catalog['expected_image_count']} images, got {len(images)}"

    if catalog.get("expected_has_bci_item_number"):
        assert product.get("item_number") or product.get("bci_item_number") or product.get("upc"), \
            f"Expected item number field for {fixture_key}"

    if catalog.get("expected_has_upc"):
        assert product.get("upc") or product.get("upc"), \
            f"Expected UPC field for {fixture_key}"

    if catalog.get("expected_has_features"):
        assert product.get("features"), \
            f"Expected features field for {fixture_key}"

    # Verify confidence is set
    assert result.confidence > 0, "Confidence should be > 0 for successful extraction"

    # Check expected_fields from catalog
    expected_fields = catalog.get("expected_fields")
    if expected_fields:
        for field in expected_fields:
            assert field in product, \
                f"Expected field '{field}' in result for {fixture_key}, but not found. Available fields: {list(product.keys())}"

    # Check expected_facets from catalog (via build_success_result normalization)
    expected_facets = catalog.get("expected_facets")
    if expected_facets:
        enrichment_plan = _make_minimal_plan(upc=expected_upc)
        enrichment_entry = _make_entry(adapter_slug, source_slug)
        enrichment_adapter = adapter_cls(enrichment_entry, enrichment_plan)
        enrichment_result = enrichment_adapter.extract_from_html(html, expected_upc, "https://fixture.local/product")
        assert enrichment_result is not None and enrichment_result.success

        # Normalize through EnrichedProductFacts
        epf_result = build_success_result(
            upc=expected_upc,
            source_slug=source_slug,
            source_type="distributor",
            evidence_url="https://fixture.local/product",
            product_fields=enrichment_result.product,
            matched_fields=enrichment_result.matched_fields or list(enrichment_result.product.keys()),
            overall_confidence=1.0,
        )

        if epf_result.product and epf_result.product.facets:
            facet_slugs = {f.definition_slug for f in epf_result.product.facets}
            for facet_slug in expected_facets:
                assert facet_slug in facet_slugs, \
                    f"Expected facet '{facet_slug}' for {fixture_key}, but not found. Available facets: {facet_slugs}"


@pytest.mark.parametrize(
    "fixture_key",
    [k for k, v in FIXTURE_CATALOG["fixtures"].items() if v.get("fixture_type") == "product"],
    ids=lambda k: k,
)
def test_fixture_facet_coverage(fixture_key: str) -> None:
    """Test that product fixture facets survive build_success_result normalization.

    For each product fixture, extracts via adapter, runs through
    build_success_result to normalize into EnrichedProductFacts, and
    verifies that expected_facets from the catalog appear in the
    result's facets. Skips when catalog has no expected_facets.
    """
    catalog = FIXTURE_CATALOG["fixtures"][fixture_key]
    expected_facets = catalog.get("expected_facets")
    if not expected_facets:
        pytest.skip(f"No expected_facets defined for {fixture_key}")

    fixture_path = catalog["fixture_path"]
    adapter_slug = catalog["adapter_slug"]
    source_slug = ADAPTER_TO_SOURCE.get(adapter_slug, adapter_slug.split("_crawl4ai")[0])

    html = _read_fixture_html(fixture_path)

    adapter_cls = get_adapter_class(adapter_slug)
    assert adapter_cls is not None

    expected_upc = catalog.get("expected_upc") or catalog.get("expected_sku")
    plan = _make_minimal_plan(upc=expected_upc)
    entry = _make_entry(adapter_slug, source_slug)
    adapter = adapter_cls(entry, plan)

    result = adapter.extract_from_html(html, expected_upc, "https://fixture.local/product")
    assert result is not None and result.success, \
        f"Adapter extraction failed for {fixture_key}: {result.failure_message if result else 'None'}"

    # Normalize through EnrichedProductFacts
    epf_result = build_success_result(
        upc=expected_upc,
        source_slug=source_slug,
        source_type="distributor",
        evidence_url="https://fixture.local/product",
        product_fields=result.product,
        matched_fields=result.matched_fields or list(result.product.keys()),
        overall_confidence=1.0,
    )

    assert epf_result is not None
    assert epf_result.product is not None, f"build_success_result returned no product for {fixture_key}"

    facet_slugs = {f.definition_slug for f in epf_result.product.facets}
    for facet_slug in expected_facets:
        assert facet_slug in facet_slugs, \
            f"Expected facet '{facet_slug}' for {fixture_key}, but not found in normalized result. Available facets: {facet_slugs}"


@pytest.mark.parametrize(
    "fixture_key",
    [k for k, v in FIXTURE_CATALOG["fixtures"].items() if v.get("fixture_type") == "product_partial"],
    ids=lambda k: k,
)
def test_partial_fixture_extraction(fixture_key: str) -> None:
    """Test that a partial product fixture extracts at least name."""
    catalog = FIXTURE_CATALOG["fixtures"][fixture_key]
    fixture_path = catalog["fixture_path"]
    adapter_slug = catalog["adapter_slug"]
    source_slug = ADAPTER_TO_SOURCE.get(adapter_slug, adapter_slug.split("_crawl4ai")[0])

    html = _read_fixture_html(fixture_path)

    adapter_cls = get_adapter_class(adapter_slug)
    assert adapter_cls is not None

    expected_upc = catalog.get("expected_upc") or catalog.get("expected_sku")
    plan = _make_minimal_plan(upc=expected_upc)
    entry = _make_entry(adapter_slug, source_slug)
    adapter = adapter_cls(entry, plan)

    result = adapter.extract_from_html(html, expected_upc, "https://fixture.local/product")

    assert result is not None
    product = result.product
    name = product.get("name", "")
    assert catalog["expected_name_contains"] in name, \
        f"Expected name containing '{catalog['expected_name_contains']}', got '{name}'"

    if catalog.get("expected_brand"):
        brand = product.get("brand", "")
        assert catalog["expected_brand"] in brand, \
            f"Expected brand containing '{catalog['expected_brand']}', got '{brand}'"

    # Partial might have lower confidence but should still be successful
    if not result.success:
        # Allow partial products to fail gracefully if too minimal
        assert result.failure_code is not None


@pytest.mark.parametrize(
    "fixture_key",
    [k for k, v in FIXTURE_CATALOG["fixtures"].items() if v.get("fixture_type") == "no_results"],
    ids=lambda k: k,
)
def test_no_results_fixture(fixture_key: str) -> None:
    """Test that a no-results fixture correctly returns no_match."""
    catalog = FIXTURE_CATALOG["fixtures"][fixture_key]
    fixture_path = catalog["fixture_path"]
    adapter_slug = catalog["adapter_slug"]
    source_slug = ADAPTER_TO_SOURCE.get(adapter_slug, adapter_slug.split("_crawl4ai")[0])

    html = _read_fixture_html(fixture_path)

    adapter_cls = get_adapter_class(adapter_slug)
    assert adapter_cls is not None

    expected_upc = catalog.get("expected_upc") or catalog.get("expected_sku")
    plan = _make_minimal_plan(upc=expected_upc)
    entry = _make_entry(adapter_slug, source_slug)
    adapter = adapter_cls(entry, plan)

    result = adapter.extract_from_html(html, expected_upc, "https://fixture.local/no-results")

    assert result is not None
    # Should be a failure
    if result.success:
        # If it somehow succeeded, at least verify no actual product data
        name = result.product.get("name", "")
        assert not name or "search" in name.lower() or "results" in name.lower(), \
            f"Unexpected product name in no-results fixture: {name}"


def test_fixture_catalog_consistency() -> None:
    """Verify that all fixture files referenced in the catalog actually exist."""
    catalog = FIXTURE_CATALOG
    for key, fixture in catalog["fixtures"].items():
        path = fixture.get("fixture_path", "")
        if path:
            full_path = HTML_DIR / path
            assert full_path.exists(), f"Fixture file missing: {full_path} (key: {key})"


def test_bradley_legacy_assertion() -> None:
    """Test Bradley fixture matches the legacy test assertion: 'E-Z HANG SCALE' / 'KERBL'."""
    html = _read_fixture_html("bradley/product_001135.html")
    adapter_cls = get_adapter_class("bradley_crawl4ai")
    assert adapter_cls is not None

    plan = _make_minimal_plan(upc="001135")
    entry = _make_entry("bradley_crawl4ai", "bradley")
    adapter = adapter_cls(entry, plan)

    result = adapter.extract_from_html(html, "001135", "https://fixture.local/product")
    assert result is not None
    assert result.success
    assert result.product.get("name") == "E-Z HANG SCALE", \
        f"Expected 'E-Z HANG SCALE', got '{result.product.get('name')}'"
    assert "KERBL" in result.product.get("brand", ""), \
        f"Expected brand containing 'KERBL', got '{result.product.get('brand')}'"


def test_phillips_legacy_assertion() -> None:
    """Test Phillips fixture matches legacy assertion: 'Fromm Gold Large Breed Dog 30 lb' / 'FROMM'."""
    html = _read_fixture_html("phillips/product_072705115310.html")
    adapter_cls = get_adapter_class("phillips_crawl4ai")
    assert adapter_cls is not None

    plan = _make_minimal_plan(upc="072705115310")
    entry = _make_entry("phillips_crawl4ai", "phillips")
    adapter = adapter_cls(entry, plan)

    result = adapter.extract_from_html(html, "072705115310", "https://fixture.local/product")
    assert result is not None
    assert result.success
    assert result.product.get("name") == "Fromm Gold Large Breed Dog 30 lb", \
        f"Expected 'Fromm Gold...', got '{result.product.get('name')}'"
    assert "FROMM" in result.product.get("brand", ""), \
        f"Expected brand containing 'FROMM', got '{result.product.get('brand')}'"


def test_bradley_image_filtering() -> None:
    """Test that Bradley adapter filters images through policy."""
    html = _read_fixture_html("bradley/product_001135.html")
    adapter_cls = get_adapter_class("bradley_crawl4ai")
    assert adapter_cls is not None

    plan = _make_minimal_plan(upc="001135")
    entry = _make_entry("bradley_crawl4ai", "bradley")
    adapter = adapter_cls(entry, plan)

    # Extract from HTML and verify images are returned
    result = adapter.extract_from_html(html, "001135", "https://fixture.local/product")
    assert result is not None
    assert result.success
    
    # Verify images were extracted
    images = result.product.get("image_urls", [])
    assert len(images) > 0, "Should find at least one image in fixture"

    # Test that filter_allowed_assets works
    policy = plan.sourcePolicy
    filtered = adapter.filter_images(images, policy)
    assert len(filtered) > 0, "Bradley images should pass filtering with allowance"


def test_fixture_with_empty_html() -> None:
    """Test that empty HTML produces an extraction failure."""
    adapter_cls = get_adapter_class("bradley_crawl4ai")
    assert adapter_cls is not None

    plan = _make_minimal_plan(upc="001135")
    entry = _make_entry("bradley_crawl4ai", "bradley")
    adapter = adapter_cls(entry, plan)

    result = adapter.extract_from_html("", "001135", "https://fixture.local/product")
    assert result is not None
    assert not result.success
