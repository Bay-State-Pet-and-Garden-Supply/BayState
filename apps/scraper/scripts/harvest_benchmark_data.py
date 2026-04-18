#!/usr/bin/env python3
"""Harvest real Serper search results for AI Search benchmark dataset.

This script mirrors the exact production AI Search workflow:
  1. Build SKU query (QueryBuilder.build_identifier_query)
  2. Call real Serper API with SKU query
  3. Feed SKU results to NameConsolidator (LLM) to get consolidated name
  4. Build name query from consolidated name (QueryBuilder.build_name_query)
  5. Call real Serper API with name query
  6. Cache both result sets as FixtureSearchClient-compatible files

The cached results are permanent snapshots used for benchmarking the
scoring/ranking logic without any API costs on future runs.

Usage:
    # From a local manifest file:
    python scripts/harvest_benchmark_data.py --manifest data/benchmark_manifest.json

    # From Supabase pipeline (imported products):
    python scripts/harvest_benchmark_data.py --from-pipeline --sample 50

    # Dry run (show queries without calling Serper or LLM):
    python scripts/harvest_benchmark_data.py --manifest data/benchmark_manifest.json --dry-run

Requirements:
    - SERPER_API_KEY environment variable
    - OPENAI_API_KEY environment variable (for NameConsolidator LLM calls)
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import os
import random
import sys
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
for import_root in (PROJECT_ROOT, SRC_ROOT):
    if str(import_root) not in sys.path:
        _ = sys.path.insert(0, str(import_root))

from scrapers.ai_search.name_consolidator import NameConsolidator
from scrapers.ai_search.query_builder import QueryBuilder
from scrapers.providers.serper import SerperSearchClient

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_CACHE_DIR = PROJECT_ROOT / "data" / "benchmark_cache"
DEFAULT_MANIFEST_PATH = PROJECT_ROOT / "data" / "benchmark_manifest.json"
DEFAULT_DRAFT_DATASET_PATH = PROJECT_ROOT / "data" / "golden_dataset_v2_draft.json"
DEFAULT_ANNOTATION_GUIDE_PATH = PROJECT_ROOT / "data" / "annotation_guide.md"
CACHE_SCHEMA_VERSION = 1
SERPER_COST_PER_CALL_USD = 0.001


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class BenchmarkProduct:
    """A product to harvest search results for."""

    sku: str
    name: str
    brand: str | None = None
    category: str | None = None
    difficulty: str = "medium"
    source: str = "manifest"


@dataclass
class HarvestResult:
    """Result of harvesting search results for one product's full workflow."""

    product_sku: str
    product_name: str
    # SKU search phase
    sku_query: str
    sku_cache_path: Path | None
    sku_result_count: int
    sku_cached: bool
    # Consolidation phase
    consolidated_name: str
    consolidation_cost_usd: float
    # Name search phase
    name_query: str
    name_cache_path: Path | None
    name_result_count: int
    name_cached: bool
    # Merged results
    merged_result_count: int


# ---------------------------------------------------------------------------
# Cache key logic (mirrors FixtureSearchClient exactly)
# ---------------------------------------------------------------------------


def normalize_cache_key(query: str) -> str:
    """Normalize a query string to a cache key (matches FixtureSearchClient)."""
    return " ".join(str(query or "").split()).lower()


def compute_cache_hash(cache_key: str) -> str:
    """Compute the SHA256 hash for a cache key (matches FixtureSearchClient)."""
    return hashlib.sha256(cache_key.encode()).hexdigest()


def get_cache_path(cache_dir: Path, query: str) -> Path:
    """Compute the cache file path for a query."""
    cache_key = normalize_cache_key(query)
    cache_hash = compute_cache_hash(cache_key)
    return cache_dir / f"{cache_hash}.json"


# ---------------------------------------------------------------------------
# Manifest loading
# ---------------------------------------------------------------------------


def load_manifest(manifest_path: Path) -> list[BenchmarkProduct]:
    """Load product manifest from JSON file."""
    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")

    raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    products_raw = raw.get("products", raw) if isinstance(raw, dict) else raw
    if not isinstance(products_raw, list):
        raise ValueError(f"Manifest must contain a list of products, got {type(products_raw).__name__}")

    products: list[BenchmarkProduct] = []
    for entry in products_raw:
        if not isinstance(entry, dict):
            continue
        sku = str(entry.get("sku") or "").strip()
        name = str(entry.get("name") or "").strip()
        if not sku or not name:
            logger.warning("Skipping manifest entry with missing sku or name: %s", entry)
            continue
        products.append(
            BenchmarkProduct(
                sku=sku,
                name=name,
                brand=str(entry.get("brand") or "").strip() or None,
                category=str(entry.get("category") or "").strip() or None,
                difficulty=str(entry.get("difficulty") or "medium").strip(),
                source="manifest",
            )
        )

    return products


def _coerce_json_mapping(value: object) -> dict[str, Any]:
    """Normalize JSON-like values from Supabase into dictionaries."""
    if isinstance(value, dict):
        return cast(dict[str, Any], value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return cast(dict[str, Any], parsed)
    return {}


def _extract_category(*payloads: Mapping[str, Any]) -> str | None:
    """Pick the first non-empty category hint from pipeline payloads."""
    for payload in payloads:
        product_on_pages = payload.get("product_on_pages")
        if isinstance(product_on_pages, list):
            for value in product_on_pages:
                category = str(value or "").strip()
                if category:
                    return category
        elif isinstance(product_on_pages, str):
            category = product_on_pages.strip()
            if category:
                return category

        for key in ("category", "category_name"):
            category = str(payload.get(key) or "").strip()
            if category:
                return category
    return None


def _extract_pipeline_product(row: Mapping[str, Any]) -> BenchmarkProduct | None:
    """Convert one products_ingestion row into a benchmark product."""
    sku = str(row.get("sku") or "").strip()
    input_data = _coerce_json_mapping(row.get("input"))
    consolidated_data = _coerce_json_mapping(row.get("consolidated"))

    name = str(consolidated_data.get("name") or input_data.get("name") or "").strip()
    brand = str(consolidated_data.get("brand") or input_data.get("brand") or "").strip() or None
    category = _extract_category(consolidated_data, input_data)

    if not sku or not name:
        return None

    return BenchmarkProduct(
        sku=sku,
        name=name,
        brand=brand,
        category=category,
        difficulty="medium",
        source="pipeline",
    )


def load_from_pipeline(sample_size: int) -> list[BenchmarkProduct]:
    """Load products from the Supabase ingestion pipeline."""
    try:
        from supabase import create_client
    except ImportError as exc:
        raise RuntimeError("supabase package is required for --from-pipeline. Install with: pip install supabase") from exc

    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for --from-pipeline")

    client = create_client(url, key)

    logger.info("Querying Supabase products_ingestion for imported products...")
    response = (
        client.table("products_ingestion")
        .select("sku, input, consolidated, pipeline_status")
        .in_("pipeline_status", ["imported", "scraped", "finalizing", "exporting"])
        .range(0, 499)
        .execute()
    )

    rows = cast(list[dict[str, Any]], response.data or [])
    if not rows:
        raise RuntimeError("No products found in pipeline. Check SUPABASE credentials and pipeline_status filter.")

    logger.info("Found %d products in pipeline, sampling %d", len(rows), min(sample_size, len(rows)))

    products: list[BenchmarkProduct] = []
    for row in rows:
        product = _extract_pipeline_product(row)
        if product is not None:
            products.append(product)

    # Deduplicate by SKU
    seen_skus: set[str] = set()
    unique_products: list[BenchmarkProduct] = []
    for product in products:
        if product.sku in seen_skus:
            continue
        seen_skus.add(product.sku)
        unique_products.append(product)

    random.shuffle(unique_products)
    sampled = unique_products[:sample_size]
    logger.info("Sampled %d unique products for benchmark", len(sampled))
    return sampled


# ---------------------------------------------------------------------------
# Cache I/O
# ---------------------------------------------------------------------------


def write_cache_entry(cache_dir: Path, query: str, results: list[dict[str, Any]]) -> Path:
    """Write a cache entry compatible with FixtureSearchClient."""
    cache_path = get_cache_path(cache_dir, query)
    cache_dir.mkdir(parents=True, exist_ok=True)

    cache_entry = {
        "schema_version": CACHE_SCHEMA_VERSION,
        "query": query,
        "results": results,
    }

    _ = cache_path.write_text(json.dumps(cache_entry, indent=2), encoding="utf-8")
    return cache_path


def read_cache_entry(cache_path: Path) -> list[dict[str, Any]]:
    """Read results from an existing cache file."""
    data = json.loads(cache_path.read_text(encoding="utf-8"))
    return data.get("results", [])


# ---------------------------------------------------------------------------
# Core harvest — mirrors production AI Search workflow exactly
# ---------------------------------------------------------------------------


async def harvest_product(
    product: BenchmarkProduct,
    serper_client: SerperSearchClient,
    name_consolidator: NameConsolidator | None,
    query_builder: QueryBuilder,
    cache_dir: Path,
    *,
    dry_run: bool = False,
) -> HarvestResult:
    """Harvest search results for one product, mirroring production flow.

    Production flow (from AISearchScraper._collect_search_candidates):
      1. Build SKU query → search Serper
      2. Feed SKU results to NameConsolidator → get consolidated name
      3. Build name query from consolidated name → search Serper
    """
    # ── Phase 1: SKU Search ──────────────────────────────────────────────
    sku_query = query_builder.build_identifier_query(product.sku)
    if not sku_query:
        sku_query = product.sku

    sku_cache_path = get_cache_path(cache_dir, sku_query)
    sku_results: list[dict[str, Any]] = []
    sku_cached = False

    if sku_cache_path.exists():
        sku_results = read_cache_entry(sku_cache_path)
        sku_cached = True
        logger.info("  [1/3 SKU SEARCH] CACHED: %r -> %d results", sku_query, len(sku_results))
    elif dry_run:
        logger.info("  [1/3 SKU SEARCH] DRY RUN: %r -> %s", sku_query, sku_cache_path.name)
    else:
        raw_results, error = await serper_client.search(sku_query)
        if error:
            logger.warning("  [1/3 SKU SEARCH] ERROR: %r -> %s", sku_query, error)
            raw_results = []
        sku_results = raw_results
        sku_cache_path = write_cache_entry(cache_dir, sku_query, sku_results)
        logger.info("  [1/3 SKU SEARCH] FETCHED: %r -> %d results", sku_query, len(sku_results))

    # ── Phase 2: Name Consolidation (LLM) ───────────────────────────────
    #
    # In production, this takes the raw product name (often abbreviated from
    # the register/POS system) and the SKU search result snippets, then uses
    # an LLM to infer the canonical full product name.
    #
    # Example: "SCTT NTSCPS MULCH BRN 1.5CF" + search snippets →
    #          "Scotts NatureScapes Color Enhanced Mulch Deep Forest Brown 1.5 cu ft"
    consolidated_name = product.name
    consolidation_cost = 0.0

    if dry_run:
        logger.info("  [2/3 CONSOLIDATION] DRY RUN: '%s' (skipping LLM)", product.name)
    elif name_consolidator and sku_results:
        snippets = [{"title": str(r.get("title") or ""), "description": str(r.get("description") or "")} for r in sku_results[:5]]
        try:
            consolidated_name, consolidation_cost = await name_consolidator.consolidate_name(
                sku=product.sku,
                abbreviated_name=product.name,
                search_snippets=snippets,
            )
            logger.info(
                "  [2/3 CONSOLIDATION] '%s' -> '%s' (cost: $%.4f)",
                product.name,
                consolidated_name,
                consolidation_cost,
            )
        except Exception as exc:
            logger.warning("  [2/3 CONSOLIDATION] FAILED: %s — using original name", exc)
            consolidated_name = product.name
    else:
        logger.info("  [2/3 CONSOLIDATION] SKIPPED: no consolidator or no SKU results")

    # ── Phase 3: Name Search ─────────────────────────────────────────────
    name_query = query_builder.build_name_query(consolidated_name)
    if not name_query:
        name_query = consolidated_name

    name_cache_path = get_cache_path(cache_dir, name_query)
    name_results: list[dict[str, Any]] = []
    name_cached = False

    # Skip name search if same query as SKU search (unlikely but possible)
    if name_query == sku_query:
        name_results = sku_results
        name_cached = sku_cached
        name_cache_path = sku_cache_path
        logger.info("  [3/3 NAME SEARCH] SAME AS SKU QUERY — reusing results")
    elif name_cache_path.exists():
        name_results = read_cache_entry(name_cache_path)
        name_cached = True
        logger.info("  [3/3 NAME SEARCH] CACHED: %r -> %d results", name_query, len(name_results))
    elif dry_run:
        logger.info("  [3/3 NAME SEARCH] DRY RUN: %r -> %s", name_query, name_cache_path.name)
    else:
        raw_results, error = await serper_client.search(name_query)
        if error:
            logger.warning("  [3/3 NAME SEARCH] ERROR: %r -> %s", name_query, error)
            raw_results = []
        name_results = raw_results
        name_cache_path = write_cache_entry(cache_dir, name_query, name_results)
        logger.info("  [3/3 NAME SEARCH] FETCHED: %r -> %d results", name_query, len(name_results))

    # ── Merge + dedupe ───────────────────────────────────────────────────
    seen_urls: set[str] = set()
    merged: list[dict[str, Any]] = []
    for result in sku_results + name_results:
        url = str(result.get("url") or "").strip()
        if url and url not in seen_urls:
            seen_urls.add(url)
            merged.append(result)

    return HarvestResult(
        product_sku=product.sku,
        product_name=product.name,
        sku_query=sku_query,
        sku_cache_path=sku_cache_path if not dry_run or sku_cached else None,
        sku_result_count=len(sku_results),
        sku_cached=sku_cached,
        consolidated_name=consolidated_name,
        consolidation_cost_usd=consolidation_cost,
        name_query=name_query,
        name_cache_path=name_cache_path if not dry_run or name_cached else None,
        name_result_count=len(name_results),
        name_cached=name_cached,
        merged_result_count=len(merged),
    )


# ---------------------------------------------------------------------------
# Draft dataset + annotation guide generation
# ---------------------------------------------------------------------------


def build_draft_dataset(
    products: list[BenchmarkProduct],
    all_results: list[HarvestResult],
    cache_dir: Path,
) -> dict[str, Any]:
    """Build a draft golden dataset with candidate URLs for annotation."""
    results_by_sku: dict[str, HarvestResult] = {r.product_sku: r for r in all_results}

    entries: list[dict[str, Any]] = []
    for product in products:
        harvest = results_by_sku.get(product.sku)
        if not harvest:
            continue

        # The name query is the primary query used for scoring in the benchmark
        # (this matches what production does after consolidation)
        primary_query = harvest.name_query

        # Gather all unique candidate URLs from both search phases
        candidate_urls: list[dict[str, str]] = []
        seen_urls: set[str] = set()

        for query_type, cache_path in [("sku", harvest.sku_cache_path), ("name", harvest.name_cache_path)]:
            if not cache_path or not cache_path.exists():
                continue
            cache_data = json.loads(cache_path.read_text(encoding="utf-8"))
            for search_result in cache_data.get("results", []):
                url = str(search_result.get("url") or "").strip()
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    candidate_urls.append(
                        {
                            "url": url,
                            "title": str(search_result.get("title") or ""),
                            "from_query_type": query_type,
                        }
                    )

        entries.append(
            {
                "sku": product.sku,
                "product_name": product.name,
                "consolidated_name": harvest.consolidated_name,
                "brand": product.brand,
                "category": product.category,
                "difficulty": product.difficulty,
                "query": primary_query,
                "sku_query": harvest.sku_query,
                "expected_source_url": "",  # TO BE ANNOTATED
                "rationale": "",  # TO BE ANNOTATED
                "candidate_count": len(candidate_urls),
                "candidates": candidate_urls[:15],
            }
        )

    total_serper_calls = sum((0 if r.sku_cached else 1) + (0 if r.name_cached else 1) for r in all_results)
    total_consolidation_cost = sum(r.consolidation_cost_usd for r in all_results)

    return {
        "version": "2.0-draft",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "provenance": {
            "annotator": "harvest_benchmark_data.py",
            "source": "serper.dev",
            "mode": "harvest",
            "workflow": "production-mirrored (SKU search -> LLM consolidation -> name search)",
            "product_count": len(products),
            "total_serper_calls": total_serper_calls,
            "estimated_serper_cost_usd": round(total_serper_calls * SERPER_COST_PER_CALL_USD, 4),
            "total_consolidation_cost_usd": round(total_consolidation_cost, 4),
        },
        "entries": entries,
    }


def build_annotation_guide(
    draft_dataset: dict[str, Any],
    cache_dir: Path,
) -> str:
    """Build a human-readable markdown annotation guide."""
    entries = draft_dataset.get("entries", [])
    provenance = draft_dataset.get("provenance", {})
    lines: list[str] = [
        "# Benchmark Annotation Guide",
        "",
        f"Generated: {draft_dataset['created_at']}",
        f"Products: {len(entries)}",
        f"Workflow: {provenance.get('workflow', 'unknown')}",
        f"Serper cost: ${provenance.get('estimated_serper_cost_usd', 0):.4f}",
        f"LLM consolidation cost: ${provenance.get('total_consolidation_cost_usd', 0):.4f}",
        "",
        "## Instructions",
        "",
        "For each product below, review the candidate URLs and select the **best** source page.",
        "",
        "**Selection criteria** (in priority order):",
        "1. Official manufacturer product detail page (PDP) for the **exact variant**",
        "2. Major retailer PDP (Chewy, Amazon, Petco, Home Depot, Lowe's) for the exact product",
        "3. Secondary retailer PDP with accurate product data",
        "4. Mark as `NONE` if no result is a suitable PDP",
        "",
        "**Disqualifying factors:**",
        "- Category/collection pages (lists many products)",
        "- Search result pages",
        "- Blog posts, reviews, buying guides",
        "- Wrong product variant (different size, flavor, etc.)",
        "",
        "---",
        "",
    ]

    for index, entry in enumerate(entries, start=1):
        sku = entry["sku"]
        name = entry["product_name"]
        consolidated = entry.get("consolidated_name") or name
        brand = entry.get("brand") or "Unknown"
        category = entry.get("category") or "Uncategorized"
        candidates = entry.get("candidates", [])

        lines.extend(
            [
                f"## {index}. {name}",
                "",
                f"- **SKU**: `{sku}`",
                f"- **Brand**: {brand}",
                f"- **Category**: {category}",
                f"- **SKU Query**: `{entry.get('sku_query', '')}`",
                f"- **Consolidated Name**: `{consolidated}`" + (" *(unchanged)*" if consolidated == name else " *(LLM inferred)*"),
                f"- **Name Query**: `{entry['query']}`",
                f"- **Candidates**: {len(candidates)}",
                "",
            ]
        )

        if candidates:
            lines.append("| # | Source | URL | Title |")
            lines.append("|---|--------|-----|-------|")
            for candidate_index, candidate in enumerate(candidates, start=1):
                url = candidate["url"]
                title = candidate.get("title", "")[:60]
                query_type = candidate.get("from_query_type", "?")
                lines.append(f"| {candidate_index} | {query_type} | {url} | {title} |")
            lines.append("")
        else:
            lines.append("*No candidate URLs found.*")
            lines.append("")

        lines.extend(
            [
                f"**Selected URL**: `` <!-- ANNOTATE: paste best URL here -->",
                f"**Rationale**: <!-- ANNOTATE: explain why this URL is best -->",
                f"**Difficulty**: {entry['difficulty']} <!-- ANNOTATE: easy/medium/hard -->",
                "",
                "---",
                "",
            ]
        )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(
        description="Harvest real Serper search results for AI Search benchmarking (mirrors production workflow)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    source_group = parser.add_mutually_exclusive_group(required=True)
    _ = source_group.add_argument(
        "--manifest",
        type=Path,
        help="Path to product manifest JSON file",
    )
    _ = source_group.add_argument(
        "--from-pipeline",
        action="store_true",
        help="Load products from Supabase ingestion pipeline",
    )
    _ = parser.add_argument(
        "--sample",
        type=int,
        default=50,
        help="Number of products to sample from pipeline (default: 50)",
    )
    _ = parser.add_argument(
        "--cache-dir",
        type=Path,
        default=DEFAULT_CACHE_DIR,
        help=f"Output directory for cache files (default: {DEFAULT_CACHE_DIR})",
    )
    _ = parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_DRAFT_DATASET_PATH,
        help=f"Output path for draft golden dataset (default: {DEFAULT_DRAFT_DATASET_PATH})",
    )
    _ = parser.add_argument(
        "--guide",
        type=Path,
        default=DEFAULT_ANNOTATION_GUIDE_PATH,
        help=f"Output path for annotation guide (default: {DEFAULT_ANNOTATION_GUIDE_PATH})",
    )
    _ = parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show planned queries without calling Serper or LLM",
    )
    _ = parser.add_argument(
        "--skip-consolidation",
        action="store_true",
        help="Skip LLM name consolidation (use raw product names for name query)",
    )
    _ = parser.add_argument(
        "--llm-model",
        default="gpt-4o-mini",
        help="LLM model for name consolidation (default: gpt-4o-mini)",
    )
    _ = parser.add_argument(
        "--llm-provider",
        default="openai",
        help="LLM provider for name consolidation (default: openai)",
    )
    _ = parser.add_argument(
        "--max-results",
        type=int,
        default=15,
        help="Max Serper results per query (default: 15)",
    )
    _ = parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose logging",
    )
    return parser.parse_args(argv)


async def run_harvest(args: argparse.Namespace) -> int:
    """Run the harvest process."""
    # Load products
    if args.from_pipeline:
        products = load_from_pipeline(args.sample)
    else:
        products = load_manifest(args.manifest)

    if not products:
        logger.error("No products to harvest")
        return 1

    logger.info("Loaded %d products for benchmarking", len(products))

    # Save manifest for reproducibility
    manifest_path = args.cache_dir.parent / "benchmark_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_data = {
        "description": "Products used for AI search benchmark dataset",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "product_count": len(products),
        "products": [asdict(p) for p in products],
    }
    _ = manifest_path.write_text(json.dumps(manifest_data, indent=2), encoding="utf-8")
    logger.info("Saved manifest to %s", manifest_path)

    # Initialize Serper client
    serper_client = SerperSearchClient(max_results=args.max_results)
    if not args.dry_run and not serper_client.api_key:
        logger.error("SERPER_API_KEY environment variable is not set. Use --dry-run to preview queries.")
        return 1

    # Initialize NameConsolidator (mirrors AISearchScraper.__init__)
    name_consolidator: NameConsolidator | None = None
    if not args.skip_consolidation and not args.dry_run:
        name_consolidator = NameConsolidator(
            model=args.llm_model,
            provider=args.llm_provider,
        )
        if not name_consolidator.api_key:
            logger.error(
                "OPENAI_API_KEY environment variable is not set. "
                "The NameConsolidator requires an LLM API key to mirror production behavior. "
                "Use --skip-consolidation to bypass, or --dry-run to preview."
            )
            return 1
        logger.info("NameConsolidator initialized (model=%s, provider=%s)", args.llm_model, args.llm_provider)
    elif args.skip_consolidation:
        logger.info("NameConsolidator SKIPPED (--skip-consolidation flag)")
    else:
        logger.info("NameConsolidator SKIPPED (dry run)")

    query_builder = QueryBuilder()

    # Harvest
    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    all_results: list[HarvestResult] = []

    for index, product in enumerate(products, start=1):
        brand_label = product.brand or "Unknown"
        logger.info(
            "\n[%d/%d] %s | %s | %s",
            index,
            len(products),
            product.sku,
            brand_label,
            product.name[:60],
        )
        result = await harvest_product(
            product,
            serper_client,
            name_consolidator,
            query_builder,
            cache_dir,
            dry_run=args.dry_run,
        )
        all_results.append(result)

    # Summary
    total_serper_calls = sum((0 if r.sku_cached else 1) + (0 if r.name_cached else 1) for r in all_results)
    total_cached = sum((1 if r.sku_cached else 0) + (1 if r.name_cached else 0) for r in all_results)
    total_consolidation_cost = sum(r.consolidation_cost_usd for r in all_results)
    estimated_serper_cost = total_serper_calls * SERPER_COST_PER_CALL_USD

    # Count products where consolidation changed the name
    name_changes = sum(1 for r in all_results if r.consolidated_name != r.product_name)

    logger.info("")
    logger.info("=" * 70)
    logger.info("Harvest Summary (Production-Mirrored Workflow)")
    logger.info("=" * 70)
    logger.info("Products:              %d", len(products))
    logger.info("")
    logger.info("─── Serper Search ───")
    logger.info("Total queries:         %d (2 per product: SKU + name)", total_serper_calls + total_cached)
    logger.info("  Already cached:      %d", total_cached)
    logger.info("  Freshly fetched:     %d", total_serper_calls)
    logger.info("Serper cost:           $%.4f", estimated_serper_cost)
    logger.info("")
    logger.info("─── Name Consolidation (LLM) ───")
    logger.info("Products consolidated: %d", len(all_results))
    logger.info("Names changed by LLM:  %d / %d", name_changes, len(all_results))
    logger.info("Consolidation cost:    $%.4f", total_consolidation_cost)
    logger.info("")
    logger.info("─── Totals ───")
    logger.info("Total cost:            $%.4f", estimated_serper_cost + total_consolidation_cost)
    logger.info("Cache directory:       %s", cache_dir)

    # Build and write draft dataset
    draft_dataset = build_draft_dataset(products, all_results, cache_dir)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _ = output_path.write_text(json.dumps(draft_dataset, indent=2), encoding="utf-8")
    logger.info("Draft dataset:         %s", output_path)

    # Build and write annotation guide
    guide_text = build_annotation_guide(draft_dataset, cache_dir)
    guide_path = Path(args.guide)
    guide_path.parent.mkdir(parents=True, exist_ok=True)
    _ = guide_path.write_text(guide_text, encoding="utf-8")
    logger.info("Annotation guide:      %s", guide_path)

    logger.info("")
    logger.info("Next steps:")
    logger.info("  1. Open %s", guide_path)
    logger.info("  2. For each product, pick the best URL and fill in expected_source_url")
    logger.info("  3. Run: python scripts/finalize_golden_dataset.py --draft %s --output data/golden_dataset_v2.json", output_path)

    return 0


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint."""
    args = parse_args(argv)

    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(message)s",
        stream=sys.stdout,
    )

    try:
        return asyncio.run(run_harvest(args))
    except KeyboardInterrupt:
        logger.error("\nHarvest interrupted")
        return 1
    except Exception as exc:
        logger.error("Harvest failed: %s", exc)
        if args.verbose:
            import traceback

            traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
