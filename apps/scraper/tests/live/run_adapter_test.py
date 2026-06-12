#!/usr/bin/env python3
"""Single-adapter live test runner. Outputs JSON report.

Usage:
  uv run --with-requirements requirements.txt python tests/live/run_adapter_test.py <adapter_slug> [--upc <upc>] [--name <product_name>] [--brand <brand_name>]

Examples:
  uv run --with-requirements requirements.txt python tests/live/run_adapter_test.py bradley
  uv run --with-requirements requirements.txt python tests/live/run_adapter_test.py phillips --upc 072705115310
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Load .env from scraper root
SCRAPER_DIR = Path(__file__).parent.parent.parent
dotenv_path = SCRAPER_DIR / ".env"
if dotenv_path.exists():
    from dotenv import load_dotenv
    load_dotenv(dotenv_path)

# Ensure scraper root is on path
sys.path.insert(0, str(SCRAPER_DIR))


# --- Test UPCs (from fixture catalog) ---
TEST_SKUS: dict[str, dict[str, str]] = {
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

AUTH_REQUIRED = {"orgill", "phillips", "pet_food_experts"}

ADAPTER_DOMAINS = {
    "bradley": ["www.bradleycaldwell.com"],
    "central_pet": ["www.centralpet.com"],
    "orgill": ["www.orgill.com"],
    "phillips": ["shop.phillipspet.com"],
    "pet_food_experts": ["orders.petfoodexperts.com"],
}


@dataclass
class AdapterReport:
    adapter_slug: str
    upc: str
    status: str = "unknown"
    extracted_fields: list[str] = field(default_factory=list)
    product_data: dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.0
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    evidence_url: str = ""
    product_page_url: str = ""
    timing_ms: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "adapter": self.adapter_slug,
            "upc": self.upc,
            "status": self.status,
            "confidence": round(self.confidence, 2),
            "extracted_fields": sorted(self.extracted_fields),
            "field_count": len(self.extracted_fields),
            "product_data": self._serialize_product_data(),
            "warnings": self.warnings,
            "errors": self.errors,
            "evidence_url": self.evidence_url,
            "product_page_url": self.product_page_url,
            "timing_ms": round(self.timing_ms, 0),
        }

    def _serialize_product_data(self) -> dict[str, Any]:
        out = {}
        for k, v in self.product_data.items():
            if isinstance(v, list):
                out[k] = f"[{len(v)} items]"
            elif isinstance(v, str) and len(v) > 120:
                out[k] = v[:117] + "..."
            else:
                out[k] = v
        return out


async def run_adapter(
    adapter_slug: str,
    upc: str,
    name: str = "",
    brand_name: str = "",
) -> AdapterReport:
    """Run a single adapter and return a structured report."""
    import time
    t0 = time.monotonic()

    from scrapers.approved_sources.adapters.registry import get_adapter_class
    from scrapers.approved_sources.types import (
        ApprovedSourcePlan,
        ApprovedSourcePlanEntry,
        ApprovedSourcePolicy,
        ApprovedSourceBrand,
    )
    from scrapers.approved_sources.auth import ApprovedSourceLoginManager

    report = AdapterReport(adapter_slug=adapter_slug, upc=upc)

    # Resolve adapter class
    adapter_cls = get_adapter_class(adapter_slug)
    if not adapter_cls:
        report.status = "skipped"
        report.errors.append(f"No adapter class for '{adapter_slug}'")
        report.timing_ms = (time.monotonic() - t0) * 1000
        return report

    # Build plan
    domains = ADAPTER_DOMAINS.get(adapter_slug, [adapter_slug])
    source_slug = getattr(adapter_cls, 'source_slug', adapter_slug)
    brand = ApprovedSourceBrand(
        id=f"brand_{adapter_slug}",
        name=brand_name or "",
        slug=adapter_slug,
    )
    entry = ApprovedSourcePlanEntry(
        sourceType="distributor",
        sourceSlug=source_slug,
        displayName=name or adapter_slug,
        domains=domains,
        adapterSlug=adapter_slug,
        requiresAuth=adapter_slug in AUTH_REQUIRED,
        searchMode="sku_search",
    )
    policy = ApprovedSourcePolicy(allowedDomains=domains)
    plan = ApprovedSourcePlan(
        upc=upc,
        brand=brand,
        input={"name": name},
        priority=[entry],
        sourcePolicy=policy,
    )
    adapter = adapter_cls(entry, plan)

    # Handle auth
    if adapter_slug in AUTH_REQUIRED:
        login_config = getattr(adapter, 'get_login_config_class', lambda: None)()
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
                    report.timing_ms = (time.monotonic() - t0) * 1000
                    return report
            except Exception as e:
                report.status = "auth_required"
                report.errors.append(f"Login error: {str(e)}")
                report.timing_ms = (time.monotonic() - t0) * 1000
                return report

    # Run extraction
    try:
        result = await adapter.extract(extractor=None)
    except Exception as e:
        report.status = "failed"
        report.errors.append(f"extract() exception: {str(e)}")
        report.timing_ms = (time.monotonic() - t0) * 1000
        return report

    if result is None:
        report.status = "failed"
        report.errors.append("extract() returned None")
        report.timing_ms = (time.monotonic() - t0) * 1000
        return report

    # Map status
    status_map = {"success": "success", "partial": "partial", "failed": "failed"}
    report.status = status_map.get(result.status, result.status)
    report.confidence = result.confidence.overall if result.confidence else 0.0

    # Extract core fields
    if result.product:
        core = result.product.core
        if core:
            for attr, label in [
                ("name", "name"), ("brand_name", "brand"),
                ("description", "description"), ("weight_lbs", "weight_lbs"),
                ("canonical_category_breadcrumb", "category"),
                ("stock_status", "stock_status"),
            ]:
                val = getattr(core, attr, None)
                if val is not None:
                    report.product_data[label] = val
                    report.extracted_fields.append(label)

        # Facets
        for f in (result.product.facets or []):
            slug = f.definition_slug
            val = f.value
            if slug not in report.product_data:
                report.product_data[slug] = val
            elif isinstance(report.product_data[slug], list):
                report.product_data[slug].append(val)
            else:
                report.product_data[slug] = [report.product_data[slug], val]
            if slug not in report.extracted_fields:
                report.extracted_fields.append(slug)

        # Media
        media = result.product.media or []
        if media:
            report.product_data["image_count"] = len(media)
            report.extracted_fields.append("image_urls")

    # Source info
    if result.source:
        report.evidence_url = result.source.url or ""

    if result.validation and result.validation.warnings:
        report.warnings = result.validation.warnings

    # Source results
    if result.source_results:
        for sr in result.source_results:
            if sr.evidenceUrl:
                report.evidence_url = sr.evidenceUrl
            if sr.product and getattr(sr.product, 'core', None):
                c = sr.product.core
                for attr, label in [
                    ("description", "description"), ("weight_lbs", "weight_lbs"),
                ]:
                    val = getattr(c, attr, None)
                    if val is not None and label not in report.product_data:
                        report.product_data[label] = val
                        report.extracted_fields.append(label)

    # Product page URL
    if hasattr(adapter, '_product_page_url'):
        report.product_page_url = getattr(adapter, '_product_page_url', "") or ""

    report.timing_ms = (time.monotonic() - t0) * 1000
    return report


async def main():
    import argparse
    p = argparse.ArgumentParser(description="Run a single adapter live test")
    p.add_argument("adapter", help="Adapter slug (e.g., bradley, phillips, orgill)")
    p.add_argument("--upc", help="Override test UPC")
    p.add_argument("--name", help="Override product name")
    p.add_argument("--brand", help="Override brand name")
    args = p.parse_args()

    slug = args.adapter.lower().replace("-", "_")
    # Normalize common aliases
    alias_map = {
        "bradley": "bradley", "bradley_crawl4ai": "bradley",
        "central_pet": "central_pet", "central_pet_crawl4ai": "central_pet",
        "central-pet": "central_pet",
        "orgill": "orgill", "orgill_crawl4ai": "orgill",
        "phillips": "phillips", "phillips_crawl4ai": "phillips",
        "pet_food_experts": "pet_food_experts",
        "pet_food_experts_crawl4ai": "pet_food_experts",
        "petfoodex": "pet_food_experts",
        "pet-food-experts": "pet_food_experts",
    }
    slug = alias_map.get(slug, slug)

    # Get test config
    config = TEST_SKUS.get(slug, {})
    upc = args.upc or config.get("upc", "")
    name = args.name or config.get("name", "")
    brand = args.brand or config.get("brand", "")

    if not upc:
        print(json.dumps({
            "adapter": slug, "status": "error",
            "errors": [f"No UPC configured for '{slug}'. Pass --upc."]
        }, indent=2))
        sys.exit(1)

    print(f"[{slug}] Starting test with UPC={upc} name={name!r}…", file=sys.stderr)
    report = await run_adapter(slug, upc, name, brand)
    print(json.dumps(report.to_dict(), indent=2))


if __name__ == "__main__":
    asyncio.run(main())
