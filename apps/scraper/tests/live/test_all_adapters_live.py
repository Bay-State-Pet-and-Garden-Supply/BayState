"""Comprehensive live adapter test — runs all distributors with test SKUs.

Outputs a per-adapter report of extracted fields, missing fields, and any issues.
Uses the fixture catalog's test SKUs.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from dataclasses import dataclass, field
from typing import Any

# Configure logging
logging.basicConfig(level=logging.INFO, format='[%(name)s] %(levelname)s: %(message)s')
logger = logging.getLogger("live_adapter_test")

# --- Test UPCs (from fixture catalog) ---
TEST_SKUS = {
    "bradley": {
        "upc": "001135",
        "name": "E-Z HANG SCALE",
        "brand": "KERBL",
    },
    "central_pet": {
        "upc": "38777520",
        "name": "KONG Air Dog Squeaker Tennis Ball Dog Toy",
        "brand": "KONG",
    },
    "orgill": {
        "upc": "755625321923",
        "name": "Landscapers Select 34609 PCL-P Shovel, 16 ga, Hardwood Handle, 45 in L Handle",
        "brand": "LANDSCAPERS SELECT",
    },
    "phillips": {
        "upc": "072705115310",
        "name": "Fromm Gold Large Breed Dog 30 lb",
        "brand": "FROMM FAMILY FOODS LLC",
    },
    "pet_food_experts": {
        "upc": "33011808",
        "name": "Wellness CORE Grain Free",
        "brand": "Wellness",
    },
}

# --- Required env vars for auth-gated adapters ---
AUTH_REQUIRED = {"orgill", "phillips", "pet_food_experts"}


@dataclass
class AdapterReport:
    adapter_slug: str
    upc: str
    status: str = "unknown"  # success, partial, failed, auth_required, skipped
    extracted_fields: list[str] = field(default_factory=list)
    product_data: dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.0
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    evidence_url: str = ""
    search_url: str = ""
    product_page_url: str = ""


async def run_adapter(
    adapter_slug: str,
    config: dict[str, str],
) -> AdapterReport:
    """Run a single adapter and return a report."""
    from scrapers.approved_sources.adapters.registry import get_adapter_class
    from scrapers.approved_sources.types import (
        ApprovedSourcePlan,
        ApprovedSourcePlanEntry,
        ApprovedSourcePolicy,
        ApprovedSourceBrand,
    )
    from scrapers.approved_sources.auth import ApprovedSourceLoginManager

    upc = config["upc"]
    report = AdapterReport(adapter_slug=adapter_slug, upc=upc)
    report.search_url = f"Adapter: {adapter_slug}, UPC: {upc}"

    adapter_cls = get_adapter_class(adapter_slug)
    if not adapter_cls:
        report.status = "skipped"
        report.errors.append(f"No adapter class found for {adapter_slug}")
        return report

    # Build plan
    # Map adapter slugs to their expected domains
    ADAPTER_DOMAINS = {
        "bradley": ["www.bradleycaldwell.com", "bradleycaldwell.com"],
        "central_pet": ["www.centralpet.com", "centralpet.com"],
        "orgill": ["www.orgill.com", "orgill.com"],
        "phillips": ["shop.phillipspet.com", "phillipspet.com"],
        "pet_food_experts": ["orders.petfoodexperts.com", "petfoodexperts.com"],
    }
    domains = ADAPTER_DOMAINS.get(adapter_slug, [adapter_slug])

    brand = ApprovedSourceBrand(
        id=f"brand_{adapter_slug}",
        name=config.get("brand") or "",
        slug=adapter_slug,
    )
    entry = ApprovedSourcePlanEntry(
        sourceType="distributor",
        sourceSlug=adapter_cls.source_slug if hasattr(adapter_cls, 'source_slug') else adapter_slug,
        displayName=config.get("name") or adapter_slug,
        domains=domains,
        adapterSlug=adapter_slug,
        requiresAuth=adapter_slug in AUTH_REQUIRED,
        searchMode="sku_search",
    )

    policy = ApprovedSourcePolicy(allowedDomains=domains)
    plan = ApprovedSourcePlan(
        upc=upc,
        brand=brand,
        input={"name": config.get("name")},
        priority=[entry],
        sourcePolicy=policy,
    )

    adapter = adapter_cls(entry, plan)

    # Check auth for login-gated adapters
    if adapter_slug in AUTH_REQUIRED:
        login_config = None
        if hasattr(adapter, 'get_login_config_class'):
            login_config = adapter.get_login_config_class()

        if login_config:
            manager = ApprovedSourceLoginManager()
            try:
                login_result = await manager.ensure_logged_in(
                    source_slug=adapter_slug,
                    login_config=login_config,
                )
                if not login_result.success:
                    report.status = "auth_required"
                    report.errors.append(f"Login failed: {login_result.error_message}")
                    return report
                logger.info("[%s] Login successful", adapter_slug)
            except Exception as e:
                report.status = "auth_required"
                report.errors.append(f"Login error: {e}")
                return report

    # Run extraction
    try:
        result = await adapter.extract(extractor=None)
    except Exception as e:
        report.status = "failed"
        report.errors.append(f"Extraction error: {e}")
        logger.error("[%s] Extraction failed: %s", adapter_slug, e)
        return report

    if result is None:
        report.status = "failed"
        report.errors.append("extract() returned None")
        return report

    # Map status
    status_map = {
        "success": "success",
        "partial": "partial",
        "failed": "failed",
    }
    report.status = status_map.get(result.status, result.status)
    report.confidence = result.confidence.overall if result.confidence else 0.0

    # Extract product data from the nested structure
    if result.product:
        core = result.product.core
        if core:
            if core.name:
                report.product_data["name"] = core.name
                report.extracted_fields.append("name")
            if core.brand_name:
                report.product_data["brand"] = core.brand_name
                report.extracted_fields.append("brand")
            if core.description:
                report.product_data["description"] = core.description
                report.extracted_fields.append("description")
            if core.weight_lbs is not None:
                report.product_data["weight_lbs"] = core.weight_lbs
                report.extracted_fields.append("weight_lbs")
            if core.canonical_category_breadcrumb:
                report.product_data["category"] = core.canonical_category_breadcrumb
                report.extracted_fields.append("category")
            if core.stock_status:
                report.product_data["stock_status"] = core.stock_status
                report.extracted_fields.append("stock_status")

        facets = result.product.facets or []
        for f in facets:
            slug = f.definition_slug
            value = f.value
            if slug not in report.product_data:
                report.product_data[slug] = value
            elif isinstance(report.product_data[slug], list):
                report.product_data[slug].append(value)
            else:
                report.product_data[slug] = [report.product_data[slug], value]
            if slug not in report.extracted_fields:
                report.extracted_fields.append(slug)

        media = result.product.media or []
        if media:
            report.product_data["image_count"] = len(media)
            report.extracted_fields.append("image_urls")

    # Get evidence URL
    if result.source:
        report.evidence_url = result.source.url or ""

    # Get warnings from validation
    if result.validation and result.validation.warnings:
        report.warnings = result.validation.warnings

    # Source results for deeper inspection
    if result.source_results:
        for sr in result.source_results:
            if sr.evidenceUrl:
                report.evidence_url = sr.evidenceUrl
            if sr.product:
                p = sr.product
                if hasattr(p, 'core') and p.core:
                    if p.core.description and not report.product_data.get("description"):
                        report.product_data["description"] = p.core.description
                        report.extracted_fields.append("description")
                    if p.core.weight_lbs is not None and "weight_lbs" not in report.product_data:
                        report.product_data["weight_lbs"] = p.core.weight_lbs
                        report.extracted_fields.append("weight_lbs")

    # Track product page URL from adapter
    if hasattr(adapter, '_product_page_url'):
        report.product_page_url = adapter._product_page_url or ""

    return report


def print_report(name: str, report: AdapterReport) -> None:
    """Pretty print a single adapter report."""
    print(f"\n{'='*70}")
    print(f"  {name.upper()} ({report.adapter_slug}) — UPC: {report.upc}")
    print(f"{'='*70}")
    print(f"  Status:     {report.status.upper()}")
    print(f"  Confidence: {report.confidence:.2f}")
    print(f"  Evidence:   {report.evidence_url}")
    if report.product_page_url:
        print(f"  PDP URL:    {report.product_page_url}")

    if report.errors:
        for err in report.errors:
            print(f"  ❌ ERROR:   {err}")

    if report.extracted_fields:
        print(f"\n  Extracted fields ({len(report.extracted_fields)}):")
        for field in sorted(report.extracted_fields):
            val = report.product_data.get(field)
            if isinstance(val, list):
                val = f"[{len(val)} items]"
            elif isinstance(val, str) and len(val) > 80:
                val = val[:77] + "..."
            print(f"    • {field}: {val}")

    # Show what's MISSING from the ideal set
    ideal_fields = {
        "name", "brand", "description", "weight_lbs",
        "category", "image_urls", "dimensions",
        "case_pack", "unit_of_measure", "features",
        "item_number", "manufacturer_number", "upc",
        "stock_status",
        # Facet fields
        "animal_type", "life_stage", "breed_size", "food_form",
        "flavor", "primary_protein", "diet_type", "health_focus",
        "package_weight", "package_count", "packaging_type",
        "ingredients", "claims", "size", "color", "material",
    }
    missing = ideal_fields - set(report.extracted_fields)
    if missing and report.status in ("success", "partial"):
        print(f"\n  Missing potential fields:")
        for f in sorted(missing):
            print(f"    ○ {f}")


async def main():
    """Run all adapters and print results."""
    print("=" * 70)
    print("  BAYSTATE SCRAPER — Live Adapter Diagnostic")
    print("=" * 70)

    # Check environment
    env_ok = True
    for slug in AUTH_REQUIRED:
        prefix_map = {
            "orgill": "ORGILL",
            "phillips": "PHILLIPS",
            "pet_food_experts": "PET_FOOD_EXPERTS",
        }
        prefix = prefix_map.get(slug, slug.upper())
        user = os.getenv(f"{prefix}_USERNAME", "")
        pw = os.getenv(f"{prefix}_PASSWORD", "")
        status = "✅" if user and pw else "❌"
        if not user or not pw:
            env_ok = False
            # Try alias
            if slug == "pet_food_experts":
                user = os.getenv("PETFOODEX_USERNAME", "")
                pw = os.getenv("PETFOODEX_PASSWORD", "")
                if user and pw:
                    env_ok = True
                    continue
        print(f"  {status} {slug}: {'configured' if user and pw else 'MISSING'}")

    if not env_ok:
        print("\n  ⚠️  Some auth-gated adapters have missing credentials.")
        print("  These adapters will be skipped.\n")

    # Run adapters sequentially
    reports: dict[str, AdapterReport] = {}
    for name, config in TEST_SKUS.items():
        print(f"\n  ▶ Running {name}...", end=" ", flush=True)
        try:
            report = await run_adapter(name, config)
            reports[name] = report
            print(report.status.upper())
        except Exception as e:
            print(f"CRASHED: {e}")
            reports[name] = AdapterReport(
                adapter_slug=name,
                upc=config["upc"],
                status="crashed",
                errors=[str(e)],
            )

    # Print all reports
    for name, report in reports.items():
        print_report(name, report)

    # Summary
    print(f"\n{'='*70}")
    print(f"  SUMMARY")
    print(f"{'='*70}")
    total = len(reports)
    success = sum(1 for r in reports.values() if r.status == "success")
    partial = sum(1 for r in reports.values() if r.status == "partial")
    failed = sum(1 for r in reports.values() if r.status in ("failed", "crashed"))
    auth = sum(1 for r in reports.values() if r.status == "auth_required")
    skipped = sum(1 for r in reports.values() if r.status == "skipped")

    print(f"  Total: {total} | Success: {success} | Partial: {partial}")
    print(f"  Failed: {failed} | Auth Required: {auth} | Skipped: {skipped}")

    # Per-adapter field count
    for name in sorted(reports.keys()):
        r = reports[name]
        print(f"  {name:20s}: {r.status:12s} | {len(r.extracted_fields):2d} fields | conf={r.confidence:.2f}")

    return reports


if __name__ == "__main__":
    asyncio.run(main())
