#!/usr/bin/env python3
"""Live distributor adapter smoke test.

Runs approved-source dataset entries against live distributor websites
using deterministic HTML parsing (no LLM, no Crawl4AI browser).

Usage:
    uv run --with-requirements requirements.txt python scripts/run_distributor_adapter_smoke.py \
      --dataset benchmarks/approved_sources/fixtures/approved_source_dataset.json \
      --sources bradley,central_pet \
      --skip-auth-required \
      --output .tmp/distributor-smoke
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

# Ensure project root is in path
PROJECT_ROOT = Path(__file__).parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scrapers.approved_sources.adapters.registry import get_adapter_class
from scrapers.approved_sources.types import (
    ApprovedSourcePlan,
    ApprovedSourcePlanEntry,
    ApprovedSourcePolicy,
    ApprovedSourceBrand,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

@dataclass
class SmokeTestResult:
    """Result of a single dataset entry smoke test."""
    entry_key: str
    source_slug: str
    sku: str
    expected_status: str
    actual_status: str
    passed: bool
    confidence: float = 0.0
    product_name: str = ""
    product_brand: str = ""
    image_count: int = 0
    evidence_url: str = ""
    matched_fields: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    error_message: str = ""
    elapsed_seconds: float = 0.0


@dataclass
class SmokeTestSummary:
    """Summary of all smoke test results."""
    total: int = 0
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    errors: int = 0
    results: list[SmokeTestResult] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_dataset(path: Path) -> dict[str, Any]:
    """Load the approved source dataset JSON."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def filter_entries(
    dataset: dict[str, Any],
    source_slugs: list[str] | None = None,
    skip_auth_required: bool = True,
    sku_filter: str | None = None,
) -> list[dict[str, Any]]:
    """Filter dataset entries by source slug, auth requirement, and optional SKU."""
    entries = dataset.get("entries", [])
    filtered = []

    for entry in entries:
        # Only distributor extraction entries
        if entry.get("dataset_kind") != "distributor_extraction":
            continue

        # Source slug filter
        if source_slugs and entry.get("source_slug") not in source_slugs:
            continue

        # Auth filter
        if skip_auth_required and entry.get("requires_auth", False):
            logger.debug(
                "Skipping auth-required entry: %s/%s",
                entry.get("source_slug"),
                entry.get("upc") or entry.get("sku"),
            )
            continue

        # SKU filter
        entry_sku = entry.get("upc") or entry.get("sku")
        if sku_filter and entry_sku != sku_filter:
            continue

        filtered.append(entry)

    return filtered


def build_plan_from_entry(entry: dict[str, Any]) -> tuple[ApprovedSourcePlan, ApprovedSourcePlanEntry]:
    """Build an ApprovedSourcePlan and entry from a dataset entry."""
    sku = entry.get("upc") or entry.get("sku")
    source_slug = entry["source_slug"]
    adapter_slug = entry["adapter_slug"]

    # Build brand if product_name/brand are available
    brand = None
    if entry.get("brand"):
        brand = ApprovedSourceBrand(
            id=f"smoke-{source_slug}",
            name=entry["brand"],
            slug=entry["brand"].lower().replace(" ", "_"),
        )

    # Build allowed domains from entry
    allowed_domains = entry.get("allowed_domains", [])
    allowed_asset_domains = entry.get("allowed_asset_domains", allowed_domains)

    # Add known CDN domains for asset delivery
    known_cdns = ["images.salsify.com", "cdn11.bigcommerce.com", "d56ygyjv466yj.cloudfront.net"]
    allowed_asset_domains = list(set(allowed_asset_domains + known_cdns))

    plan_entry = ApprovedSourcePlanEntry(
        sourceType=entry.get("source_type", "distributor"),
        sourceSlug=source_slug,
        displayName=source_slug.replace("_", " ").title(),
        domains=allowed_domains,
        assetDomains=allowed_asset_domains,
        adapterSlug=adapter_slug,
        requiresAuth=entry.get("requires_auth", False),
        searchMode=entry.get("search_mode", "sku_search"),
        allowedFields=entry.get("allowed_fields", []),
        priority=10,
        runFirst=True,
    )

    plan = ApprovedSourcePlan(
        schemaVersion="v1",
        upc=sku,
        input=entry.get("search_input", {"name": entry.get("product_name")}),
        brand=brand,
        selectedDistributorSlug=source_slug,
        priority=[plan_entry],
        sourcePolicy=ApprovedSourcePolicy(
            allowedDomains=allowed_domains + ["fixture.local"],
            allowedAssetDomains=allowed_asset_domains + ["fixture.local"],
            approvedSourcesOnly=True,
        ),
    )

    return plan, plan_entry


def evaluate_result(
    entry: dict[str, Any],
    actual_status: str,
    confidence: float,
    product: dict[str, Any],
    warnings: list[str],
) -> tuple[bool, str]:
    """Evaluate extraction result against dataset expectations.

    Returns (passed, reason).
    """
    expected = entry.get("expected", {})
    ground_truth = entry.get("ground_truth", {})
    expected_status = expected.get("expected_status", "success")

    # Map expected_status to actual_status comparison
    # "success" → status must be "success"
    # "partial" → status must be "success" or "partial"
    # "no_match" or "auth_required" → status must be "failed"
    if expected_status == "success":
        if actual_status != "success":
            return False, f"Expected success, got {actual_status}"
    elif expected_status == "partial":
        if actual_status not in ("success", "partial"):
            return False, f"Expected partial+, got {actual_status}"
    elif expected_status in ("no_match", "auth_required"):
        if actual_status != "failed":
            return False, f"Expected failed/no_match, got {actual_status}"
        # For negative cases, passing the status check is enough
        return True, "Correctly identified as no-match/failed"

    # Check minimum confidence
    min_conf = expected.get("minimum_confidence", 0.0)
    if confidence < min_conf:
        return False, f"Confidence {confidence:.2f} < minimum {min_conf:.2f}"

    # Check title contains (if ground truth specifies it)
    title_contains = ground_truth.get("title_contains", [])
    product_name = product.get("name", "")
    for substring in title_contains:
        if substring and substring.lower() not in product_name.lower():
            return False, f"Name '{product_name}' missing '{substring}'"

    # Check brand (if ground truth specifies it)
    expected_brand = ground_truth.get("brand", "")
    if expected_brand:
        actual_brand = product.get("brand", "")
        if expected_brand.lower() not in actual_brand.lower():
            return False, f"Brand '{actual_brand}' missing '{expected_brand}'"

    # Check image requirement
    if ground_truth.get("image_required", False):
        images = product.get("image_urls", [])
        if len(images) == 0:
            return False, "No images found (image_required=true)"

    return True, "All checks passed"


async def run_single_entry(entry: dict[str, Any]) -> SmokeTestResult:
    """Run a single dataset entry against the live distributor."""
    sku = entry.get("upc") or entry.get("sku")
    source_slug = entry["source_slug"]
    adapter_slug = entry["adapter_slug"]
    entry_key = f"{source_slug}_{sku}"

    start_time = time.time()

    try:
        plan, plan_entry = build_plan_from_entry(entry)

        # Resolve adapter
        adapter_cls = get_adapter_class(adapter_slug)
        if not adapter_cls:
            return SmokeTestResult(
                entry_key=entry_key,
                source_slug=source_slug,
                sku=sku,
                expected_status=entry.get("expected", {}).get("expected_status", "success"),
                actual_status="error",
                passed=False,
                error_message=f"Adapter not found: {adapter_slug}",
                elapsed_seconds=time.time() - start_time,
            )

        adapter = adapter_cls(plan_entry, plan)

        # Call extract with None extractor (adapter uses its own HTTP fetch)
        result = await adapter.extract(extractor=None)

        elapsed = time.time() - start_time

        if result is None:
            return SmokeTestResult(
                entry_key=entry_key,
                source_slug=source_slug,
                sku=sku,
                expected_status=entry.get("expected", {}).get("expected_status", "success"),
                actual_status="error",
                passed=False,
                error_message="extract() returned None",
                elapsed_seconds=elapsed,
            )

        product = result.product.model_dump() if result.product else {}
        warnings = result.validation.warnings if result.validation else []

        passed, reason = evaluate_result(
            entry=entry,
            actual_status=result.status,
            confidence=result.confidence.overall,
            product=product,
            warnings=warnings,
        )

        return SmokeTestResult(
            entry_key=entry_key,
            source_slug=source_slug,
            sku=sku,
            expected_status=entry.get("expected", {}).get("expected_status", "success"),
            actual_status=result.status,
            passed=passed,
            confidence=result.confidence.overall,
            product_name=product.get("name", ""),
            product_brand=product.get("brand", ""),
            image_count=len(product.get("image_urls", [])),
            evidence_url=result.source.url if result.source else "",
            matched_fields=[
                f for f in [
                    "name" if product.get("name") else None,
                    "brand" if product.get("brand") else None,
                    "sku" if product.get("sku") else None,
                    "images" if product.get("image_urls") else None,
                ] if f
            ],
            warnings=warnings,
            error_message="" if passed else reason,
            elapsed_seconds=elapsed,
        )

    except Exception as e:
        elapsed = time.time() - start_time
        logger.exception("Error testing %s/%s", source_slug, sku)
        return SmokeTestResult(
            entry_key=entry_key,
            source_slug=source_slug,
            sku=sku,
            expected_status=entry.get("expected", {}).get("expected_status", "success"),
            actual_status="error",
            passed=False,
            error_message=str(e),
            elapsed_seconds=elapsed,
        )


async def run_smoke_tests(
    entries: list[dict[str, Any]],
    concurrency: int = 3,
) -> SmokeTestSummary:
    """Run smoke tests for all entries with bounded concurrency."""
    summary = SmokeTestSummary(total=len(entries))
    semaphore = asyncio.Semaphore(concurrency)

    async def run_with_semaphore(entry: dict[str, Any]) -> SmokeTestResult:
        async with semaphore:
            return await run_single_entry(entry)

    tasks = [run_with_semaphore(entry) for entry in entries]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for i, result in enumerate(results):
        if isinstance(result, Exception):
            summary.errors += 1
            summary.results.append(SmokeTestResult(
                entry_key=f"error_{i}",
                source_slug=entries[i].get("source_slug", "unknown"),
                sku=entries[i].get("upc") or entries[i].get("sku", "unknown"),
                expected_status="unknown",
                actual_status="error",
                passed=False,
                error_message=str(result),
            ))
        elif isinstance(result, SmokeTestResult):
            summary.results.append(result)
            if result.passed:
                summary.passed += 1
            elif result.actual_status == "error":
                summary.errors += 1
            else:
                summary.failed += 1

    return summary


# ---------------------------------------------------------------------------
# Report writers
# ---------------------------------------------------------------------------

def write_json_report(summary: SmokeTestSummary, output_dir: Path) -> None:
    """Write results as JSON."""
    output_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "total": summary.total,
        "passed": summary.passed,
        "failed": summary.failed,
        "errors": summary.errors,
        "pass_rate": f"{summary.passed / summary.total * 100:.1f}%" if summary.total > 0 else "N/A",
        "results": [asdict(r) for r in summary.results],
    }
    with open(output_dir / "results.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=str)


def write_markdown_report(summary: SmokeTestSummary, output_dir: Path) -> None:
    """Write a human-readable markdown report."""
    output_dir.mkdir(parents=True, exist_ok=True)
    pass_rate = f"{summary.passed / summary.total * 100:.1f}%" if summary.total > 0 else "N/A"

    lines = [
        "# Distributor Adapter Smoke Test Report",
        "",
        f"**Total:** {summary.total} | **Passed:** {summary.passed} | "
        f"**Failed:** {summary.failed} | **Errors:** {summary.errors} | "
        f"**Pass Rate:** {pass_rate}",
        "",
        "## Results",
        "",
        "| Source | SKU | Expected | Actual | Passed | Confidence | Name | Brand | Time |",
        "|--------|-----|----------|--------|--------|------------|------|-------|------|",
    ]

    for r in summary.results:
        status_icon = "✅" if r.passed else "❌"
        name = r.product_name or ""
        name_short = (name[:30] + "...") if len(name) > 30 else name
        brand = r.product_brand or ""
        lines.append(
            f"| {r.source_slug} | {r.sku} | {r.expected_status} | {r.actual_status} | "
            f"{status_icon} | {r.confidence:.2f} | {name_short} | {brand} | "
            f"{r.elapsed_seconds:.1f}s |"
        )

    # Failure details
    failures = [r for r in summary.results if not r.passed]
    if failures:
        lines.extend([
            "",
            "## Failure Details",
            "",
        ])
        for r in failures:
            lines.extend([
                f"### {r.source_slug}/{r.sku}",
                f"- **Expected:** {r.expected_status}",
                f"- **Actual:** {r.actual_status}",
                f"- **Error:** {r.error_message}",
                f"- **URL:** {r.evidence_url}",
                f"- **Warnings:** {', '.join(r.warnings) if r.warnings else 'none'}",
                "",
            ])

    with open(output_dir / "report.md", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Live distributor adapter smoke test"
    )
    parser.add_argument(
        "--dataset",
        type=Path,
        default=PROJECT_ROOT / "benchmarks" / "approved_sources" / "fixtures" / "approved_source_dataset.json",
        help="Path to approved_source_dataset.json",
    )
    parser.add_argument(
        "--sources",
        type=str,
        default=None,
        help="Comma-separated source slugs to test (e.g., bradley,central_pet)",
    )
    parser.add_argument(
        "--skip-auth-required",
        action="store_true",
        default=True,
        help="Skip entries that require authentication (default: True)",
    )
    parser.add_argument(
        "--include-auth",
        action="store_true",
        default=False,
        help="Include auth-required entries (overrides --skip-auth-required)",
    )
    parser.add_argument(
        "--sku",
        type=str,
        default=None,
        help="Test only a specific SKU",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / ".tmp" / "distributor-smoke",
        help="Output directory for reports",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=3,
        help="Max concurrent requests (default: 3)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=60,
        help="Timeout per request in seconds (default: 60)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    # Setup logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    # Parse source slugs
    source_slugs = None
    if args.sources:
        source_slugs = [s.strip() for s in args.sources.split(",") if s.strip()]

    skip_auth = args.skip_auth_required and not args.include_auth

    # Load and filter dataset
    logger.info("Loading dataset: %s", args.dataset)
    dataset = load_dataset(args.dataset)

    entries = filter_entries(
        dataset,
        source_slugs=source_slugs,
        skip_auth_required=skip_auth,
        sku_filter=args.sku,
    )

    if not entries:
        logger.warning("No entries matched filters (sources=%s, skip_auth=%s, sku=%s)",
                       source_slugs, skip_auth, args.sku)
        sys.exit(0)

    logger.info("Running smoke tests for %d entries (concurrency=%d)", len(entries), args.concurrency)

    # Run tests
    summary = asyncio.run(run_smoke_tests(entries, concurrency=args.concurrency))

    # Write reports
    write_json_report(summary, args.output)
    write_markdown_report(summary, args.output)

    # Print summary
    pass_rate = f"{summary.passed / summary.total * 100:.1f}%" if summary.total > 0 else "N/A"
    print(f"\n{'='*60}")
    print(f"Distributor Adapter Smoke Test Complete")
    print(f"{'='*60}")
    print(f"Total:  {summary.total}")
    print(f"Passed: {summary.passed}")
    print(f"Failed: {summary.failed}")
    print(f"Errors: {summary.errors}")
    print(f"Rate:   {pass_rate}")
    print(f"{'='*60}")
    print(f"Reports: {args.output}/")
    print()

    # Exit with non-zero if any failures
    if summary.failed > 0 or summary.errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
