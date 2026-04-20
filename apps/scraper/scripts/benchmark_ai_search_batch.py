#!/usr/bin/env python3
"""Benchmark batch AI Search cohort behavior with cached search fixtures.

This benchmark uses the production batch entrypoint (`scrape_products_batch`) but
replaces live crawling with a deterministic extraction oracle. That lets us
measure cohort-lite ranking and official-domain rescue behavior using only the
existing cached search data.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scrapers.ai_search.fixture_search_client import FixtureSearchClient
from scrapers.ai_search.scoring import SearchScorer, reset_domain_history
from scrapers.ai_search.scraper import AISearchScraper

DEFAULT_MANIFEST_PATH = ROOT / "data" / "benchmark_manifest.json"
DEFAULT_CACHE_DIR = ROOT / "data" / "benchmark_cache"
REPORTS_DIR = ROOT / "reports"

# Exact consolidated-name queries already present in data/benchmark_cache.
CONSOLIDATED_QUERY_BY_SKU = {
    "032247886598": "Scotts Nature Scapes Color Enhanced Mulch Deep Forest Brown 1.5 cu ft",
    "095668300593": "Manna Pro Duck Starter Grower Crumbles 8 lb",
    "032247761215": "Scotts Turf Builder EdgeGuard Mini Broadcast Spreader",
    "032247885591": "Scotts Nature Scapes Color Enhanced Classic Black Mulch 1.5 cu ft",
    "095668001032": "Manna Pro Farmhouse Favorites Mini Horse & Donkey Treats",
    "095668225308": "Manna Pro All Flock Crumbles with Probiotics 8 lb",
    "032247278140": "Miracle-Gro Potting Mix 25qt",
    "032247279048": "Miracle-Gro Potting Mix 50 Quart",
    "032247884594": "Scotts Nature Scapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
    "095668302580": "Manna Pro Bite Size Alfalfa Molasses Nuggets 4 lb",
}


@dataclass(frozen=True)
class ManifestProduct:
    sku: str
    name: str
    brand: str | None
    category: str | None


class FixtureNameConsolidator:
    def __init__(self, query_by_sku: dict[str, str]) -> None:
        self._query_by_sku = dict(query_by_sku)

    async def consolidate_name(
        self,
        sku: str,
        abbreviated_name: str,
        search_snippets: list[dict[str, Any]],
    ) -> tuple[str, float]:
        _ = abbreviated_name, search_snippets
        return self._query_by_sku.get(sku, abbreviated_name), 0.0


class FixtureBatchBenchmarkScraper(AISearchScraper):
    def __init__(
        self,
        *,
        products_by_sku: dict[str, ManifestProduct],
        query_by_sku: dict[str, str],
        cache_dir: Path,
    ) -> None:
        super().__init__(
            llm_provider="openai",
            llm_model="gpt-4o-mini",
            prefer_manufacturer=True,
        )
        self._products_by_sku = dict(products_by_sku)
        self._search_client = FixtureSearchClient(cache_dir=cache_dir, allow_real_api=False)
        self._name_consolidator = FixtureNameConsolidator(query_by_sku)
        self.enable_two_step = False
        self._two_step_refiner = None
        self._attempts_by_sku: dict[str, list[str]] = {}

    async def _should_skip_url(self, url: str) -> bool:
        _ = url
        return False

    async def _extract_product_data(
        self,
        url: str,
        sku: str,
        product_name: str | None,
        brand: str | None,
    ) -> dict[str, Any]:
        self._attempts_by_sku.setdefault(sku, []).append(url)
        manifest_product = self._products_by_sku[sku]
        effective_name = product_name or manifest_product.name
        effective_brand = manifest_product.brand or brand
        domain = self._scoring.domain_from_url(url)

        if not domain:
            return {"success": False, "error": "Missing domain"}
        if self._scoring.is_category_like_url(url):
            return {"success": False, "error": "Oracle rejected category-like URL"}
        if self._scoring.classify_source_domain(domain, effective_brand) != "official":
            return {"success": False, "error": "Oracle rejected non-official source"}

        return {
            "success": True,
            "url": url,
            "product_name": effective_name,
            "brand": effective_brand,
            "description": f"Oracle accepted official domain {domain}",
            "size_metrics": "fixture",
            "images": [f"https://{domain}/products/images/{sku}/hero.jpg"],
            "categories": [manifest_product.category] if manifest_product.category else [],
            "confidence": 0.99,
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark cohort-lite batch AI Search with cached fixtures")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST_PATH)
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_DIR)
    parser.add_argument("--output", type=Path, default=REPORTS_DIR / "benchmark_ai_search_batch.json")
    parser.add_argument(
        "--scenario",
        choices=("full_context", "missing_brand_siblings", "all"),
        default="all",
        help="Run one scenario or both",
    )
    parser.add_argument("--max-concurrency", type=int, default=4)
    return parser.parse_args()


def _load_manifest_products(manifest_path: Path) -> list[ManifestProduct]:
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = payload.get("products", payload)
    products: list[ManifestProduct] = []
    for entry in entries:
        products.append(
            ManifestProduct(
                sku=str(entry["sku"]),
                name=str(entry["name"]),
                brand=str(entry.get("brand") or "").strip() or None,
                category=str(entry.get("category") or "").strip() or None,
            )
        )
    return products


def _normalize_brand(value: str | None) -> str:
    return "".join(str(value or "").lower().split())


def _build_scenario_products(products: list[ManifestProduct], scenario: str) -> list[dict[str, Any]]:
    rows = [
        {
            "sku": product.sku,
            "product_name": product.name,
            "brand": product.brand,
            "category": product.category,
        }
        for product in products
    ]
    if scenario != "missing_brand_siblings":
        return rows

    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(_normalize_brand(row["brand"]), []).append(row)

    for brand_key, brand_rows in grouped.items():
        if not brand_key or len(brand_rows) < 2:
            continue
        for row in brand_rows[1:]:
            row["brand"] = None

    return rows


async def _has_official_candidate(
    product: ManifestProduct,
    *,
    cache_dir: Path,
    scorer: SearchScorer,
) -> bool:
    search_client = FixtureSearchClient(cache_dir=cache_dir, allow_real_api=False)
    queries = [product.sku]
    consolidated_query = CONSOLIDATED_QUERY_BY_SKU.get(product.sku)
    if consolidated_query:
        queries.append(consolidated_query)

    for query in queries:
        results, _error = await search_client.search(query)
        for result in results:
            domain = scorer.domain_from_url(str(result.get("url") or ""))
            if scorer.classify_source_domain(domain, product.brand) == "official":
                return True
    return False


async def _run_mode(
    mode: str,
    *,
    manifest_products: list[ManifestProduct],
    scenario_products: list[dict[str, Any]],
    cache_dir: Path,
    max_concurrency: int,
) -> dict[str, Any]:
    products_by_sku = {product.sku: product for product in manifest_products}
    scorer = SearchScorer()
    attempts_by_sku: dict[str, list[str]] = {}

    if mode == "batch":
        reset_domain_history()
        scraper = FixtureBatchBenchmarkScraper(
            products_by_sku=products_by_sku,
            query_by_sku=CONSOLIDATED_QUERY_BY_SKU,
            cache_dir=cache_dir,
        )
        results = await scraper.scrape_products_batch(scenario_products, max_concurrency=max_concurrency)
        attempts_by_sku = dict(scraper._attempts_by_sku)
    else:
        results = []
        for product in scenario_products:
            reset_domain_history()
            scraper = FixtureBatchBenchmarkScraper(
                products_by_sku=products_by_sku,
                query_by_sku=CONSOLIDATED_QUERY_BY_SKU,
                cache_dir=cache_dir,
            )
            sku = str(product["sku"])
            results.append(
                await scraper.scrape_product(
                    sku=sku,
                    product_name=str(product.get("product_name") or "") or None,
                    brand=str(product.get("brand") or "").strip() or None,
                    category=str(product.get("category") or "").strip() or None,
                )
            )
            attempts_by_sku[sku] = list(scraper._attempts_by_sku.get(sku, []))

    rows: list[dict[str, Any]] = []
    official_candidate_present_count = 0
    success_count = 0
    first_attempt_official_count = 0
    attempts_total = 0
    for product_input, result in zip(scenario_products, results):
        sku = str(product_input["sku"])
        expected_product = products_by_sku[sku]
        attempts = attempts_by_sku.get(sku, [])
        attempts_total += len(attempts)
        official_candidate_present = await _has_official_candidate(expected_product, cache_dir=cache_dir, scorer=scorer)
        if official_candidate_present:
            official_candidate_present_count += 1

        first_attempt_domain = scorer.domain_from_url(attempts[0]) if attempts else None
        first_attempt_official = bool(first_attempt_domain) and scorer.classify_source_domain(first_attempt_domain or "", expected_product.brand) == "official"
        if first_attempt_official:
            first_attempt_official_count += 1
        success = bool(result.success)
        if success:
            success_count += 1

        rows.append(
            {
                "sku": sku,
                "product_name": expected_product.name,
                "expected_brand": expected_product.brand,
                "input_brand": product_input.get("brand"),
                "category": expected_product.category,
                "success": success,
                "selected_url": result.url,
                "selected_domain": scorer.domain_from_url(result.url or "") or None,
                "attempt_count": len(attempts),
                "attempted_domains": [scorer.domain_from_url(url) for url in attempts],
                "first_attempt_domain": first_attempt_domain,
                "first_attempt_official": first_attempt_official,
                "official_candidate_present": official_candidate_present,
                "error": result.error,
            }
        )

    total = len(rows)
    return {
        "summary": {
            "mode": mode,
            "total_products": total,
            "official_candidate_present": official_candidate_present_count,
            "successes": success_count,
            "success_rate": round(success_count / total, 4) if total else 0.0,
            "first_attempt_official_rate": round(first_attempt_official_count / total, 4) if total else 0.0,
            "average_attempts": round(attempts_total / total, 3) if total else 0.0,
        },
        "results": rows,
    }


def _build_comparison(independent: dict[str, Any], batch: dict[str, Any]) -> dict[str, Any]:
    independent_rows = {row["sku"]: row for row in independent["results"]}
    batch_rows = {row["sku"]: row for row in batch["results"]}

    improved: list[str] = []
    regressed: list[str] = []
    fewer_attempts: list[str] = []
    more_attempts: list[str] = []
    for sku, independent_row in independent_rows.items():
        batch_row = batch_rows.get(sku)
        if batch_row is None:
            continue
        if not independent_row["success"] and batch_row["success"]:
            improved.append(sku)
        elif independent_row["success"] and not batch_row["success"]:
            regressed.append(sku)

        if batch_row["attempt_count"] < independent_row["attempt_count"]:
            fewer_attempts.append(sku)
        elif batch_row["attempt_count"] > independent_row["attempt_count"]:
            more_attempts.append(sku)

    return {
        "success_delta": round(float(batch["summary"]["success_rate"]) - float(independent["summary"]["success_rate"]), 4),
        "first_attempt_official_delta": round(
            float(batch["summary"]["first_attempt_official_rate"]) - float(independent["summary"]["first_attempt_official_rate"]),
            4,
        ),
        "average_attempts_delta": round(float(batch["summary"]["average_attempts"]) - float(independent["summary"]["average_attempts"]), 3),
        "improved_skus": improved,
        "regressed_skus": regressed,
        "fewer_attempt_skus": fewer_attempts,
        "more_attempt_skus": more_attempts,
    }


def _render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# AI Search Batch Benchmark",
        "",
        f"Generated: `{report['generated_at']}`",
        f"Manifest: `{report['manifest_path']}`",
        f"Cache Dir: `{report['cache_dir']}`",
        "",
    ]

    for scenario_name, scenario_payload in report["scenarios"].items():
        comparison = scenario_payload["comparison"]
        lines.extend(
            [
                f"## Scenario: {scenario_name}",
                "",
                "| Mode | Success Rate | First Attempt Official | Avg Attempts |",
                "| --- | --- | --- | --- |",
            ]
        )
        for mode_name in ("independent", "batch"):
            summary = scenario_payload[mode_name]["summary"]
            lines.append(f"| {mode_name} | {summary['success_rate']:.1%} | {summary['first_attempt_official_rate']:.1%} | {summary['average_attempts']:.3f} |")

        lines.extend(
            [
                "",
                f"- Success delta: {comparison['success_delta']:+.1%}",
                f"- First-attempt official delta: {comparison['first_attempt_official_delta']:+.1%}",
                f"- Average attempts delta: {comparison['average_attempts_delta']:+.3f}",
                f"- Improved SKUs: {', '.join(comparison['improved_skus']) or 'None'}",
                f"- Regressed SKUs: {', '.join(comparison['regressed_skus']) or 'None'}",
                f"- Fewer-attempt SKUs: {', '.join(comparison['fewer_attempt_skus']) or 'None'}",
                f"- More-attempt SKUs: {', '.join(comparison['more_attempt_skus']) or 'None'}",
                "",
            ]
        )

    return "\n".join(lines).rstrip() + "\n"


async def main_async(args: argparse.Namespace) -> int:
    manifest_products = _load_manifest_products(args.manifest)
    scenarios = [args.scenario] if args.scenario != "all" else ["full_context", "missing_brand_siblings"]

    report: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "manifest_path": str(args.manifest),
        "cache_dir": str(args.cache_dir),
        "scenarios": {},
    }

    for scenario in scenarios:
        scenario_products = _build_scenario_products(manifest_products, scenario)
        independent = await _run_mode(
            "independent",
            manifest_products=manifest_products,
            scenario_products=scenario_products,
            cache_dir=args.cache_dir,
            max_concurrency=args.max_concurrency,
        )
        batch = await _run_mode(
            "batch",
            manifest_products=manifest_products,
            scenario_products=scenario_products,
            cache_dir=args.cache_dir,
            max_concurrency=args.max_concurrency,
        )
        report["scenarios"][scenario] = {
            "independent": independent,
            "batch": batch,
            "comparison": _build_comparison(independent, batch),
        }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    markdown_path = args.output.with_suffix(".md")
    markdown_path.write_text(_render_markdown(report), encoding="utf-8")

    print(f"JSON report: {args.output}")
    print(f"Markdown report: {markdown_path}")
    return 0


def main() -> int:
    args = parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
