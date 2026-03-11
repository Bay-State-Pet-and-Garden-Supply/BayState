#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
from collections.abc import Mapping
import json
import os
import random
import sys
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter
from typing import Protocol, cast

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
for import_root in (PROJECT_ROOT, SRC_ROOT):
    if str(import_root) not in sys.path:
        _ = sys.path.insert(0, str(import_root))

from scrapers.ai_search.models import AISearchResult
from scrapers.ai_search.scraper import AISearchScraper
from tests.evaluation.ground_truth_loader import load_ground_truth

try:
    from supabase import create_client
except ImportError:
    create_client = None


class SupabaseResponse(Protocol):
    data: object


class SupabaseQuery(Protocol):
    def select(self, columns: str) -> "SupabaseQuery": ...

    def range(self, start: int, end: int) -> "SupabaseQuery": ...

    def execute(self) -> SupabaseResponse: ...


class SupabaseClientProtocol(Protocol):
    def table(self, name: str) -> SupabaseQuery: ...


DEFAULT_OUTPUT_DIR = Path(".sisyphus/evidence/weekly_validation")
DEFAULT_SAMPLE_SIZE = 20
DEFAULT_PROMPT_VERSION = "v1"
CATALOG_BATCH_SIZE = 500


@dataclass(frozen=True)
class CatalogProduct:
    sku: str
    product_name: str
    brand: str | None
    category: str | None
    source: str


@dataclass(frozen=True)
class ValidationConfig:
    sample_size: int
    categories: list[str]
    prompt_version: str
    dry_run: bool
    output_dir: Path


@dataclass(frozen=True)
class ValidationArtifacts:
    output_dir: Path
    raw_results_path: Path
    report_path: Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run weekly real-world product validation")
    _ = parser.add_argument(
        "--sample-size",
        type=int,
        default=DEFAULT_SAMPLE_SIZE,
        help=f"Number of products to validate (default: {DEFAULT_SAMPLE_SIZE})",
    )
    _ = parser.add_argument(
        "--categories",
        help="Optional comma-separated category filter",
    )
    _ = parser.add_argument(
        "--prompt-version",
        default=DEFAULT_PROMPT_VERSION,
        help=f"Prompt version to test (default: {DEFAULT_PROMPT_VERSION})",
    )
    _ = parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show the sampling plan without running extraction",
    )
    _ = parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Directory where validation artifacts are written",
    )
    return parser.parse_args()


def _parse_categories(raw_categories: str | None) -> list[str]:
    if raw_categories is None:
        return []

    categories = [item.strip() for item in raw_categories.split(",") if item.strip()]
    seen: set[str] = set()
    normalized: list[str] = []
    for category in categories:
        key = category.casefold()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(category)
    return normalized


def _build_config(args: argparse.Namespace) -> ValidationConfig:
    sample_size = int(getattr(args, "sample_size", DEFAULT_SAMPLE_SIZE))
    if sample_size <= 0:
        raise ValueError("--sample-size must be greater than 0")

    prompt_version = str(getattr(args, "prompt_version", DEFAULT_PROMPT_VERSION)).strip() or DEFAULT_PROMPT_VERSION
    return ValidationConfig(
        sample_size=sample_size,
        categories=_parse_categories(getattr(args, "categories", None)),
        prompt_version=prompt_version,
        dry_run=bool(getattr(args, "dry_run", False)),
        output_dir=Path(str(getattr(args, "output_dir", DEFAULT_OUTPUT_DIR))),
    )


def _resolve_supabase_credentials() -> tuple[str | None, str | None]:
    env = os.environ
    url = env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_KEY") or env.get("SUPABASE_ANON_KEY") or env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    return url, key


def _create_supabase_client() -> SupabaseClientProtocol:
    if create_client is None:
        raise RuntimeError("supabase package is not installed")

    url, key = _resolve_supabase_credentials()
    if not url or not key:
        raise RuntimeError("Supabase credentials are required. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or another supported key env var).")
    return cast(SupabaseClientProtocol, cast(object, create_client(url, key)))


def _normalize_catalog_row(row: dict[str, object]) -> CatalogProduct | None:
    sku = str(row.get("sku") or row.get("id") or "").strip()
    product_name = str(row.get("name") or row.get("product_name") or "").strip()
    if not sku or not product_name:
        return None

    brand_value = row.get("brand_name") or row.get("brand") or row.get("vendor")
    category_value = row.get("category_name") or row.get("category")
    brand = str(brand_value).strip() if brand_value else None
    category = str(category_value).strip() if category_value else None
    return CatalogProduct(
        sku=sku,
        product_name=product_name,
        brand=brand,
        category=category,
        source="database",
    )


def _load_products_from_database(categories: list[str]) -> list[CatalogProduct]:
    client = _create_supabase_client()
    normalized_categories = {category.casefold() for category in categories}
    products: list[CatalogProduct] = []
    offset = 0

    while True:
        response = client.table("products_published").select("sku,name,brand_name,category_name").range(offset, offset + CATALOG_BATCH_SIZE - 1).execute()
        rows = cast(list[dict[str, object]], response.data or [])
        if not rows:
            break

        for row in rows:
            product = _normalize_catalog_row(row)
            if product is None:
                continue
            if normalized_categories and (product.category or "").casefold() not in normalized_categories:
                continue
            products.append(product)

        offset += CATALOG_BATCH_SIZE

    return products


def _load_fixture_products(categories: list[str]) -> list[CatalogProduct]:
    normalized_categories = {category.casefold() for category in categories}
    fixture_products = load_ground_truth()
    products: list[CatalogProduct] = []

    for product in fixture_products:
        category = product.categories[0] if product.categories else None
        if normalized_categories and (category or "").casefold() not in normalized_categories:
            continue
        products.append(
            CatalogProduct(
                sku=product.sku,
                product_name=product.name,
                brand=product.brand,
                category=category,
                source="fixture",
            )
        )

    return products


def load_product_catalog(config: ValidationConfig) -> list[CatalogProduct]:
    print("Loading product catalog from database...")
    try:
        products = _load_products_from_database(config.categories)
        if not products:
            raise RuntimeError("Database query returned no published products")
        print(f"Loaded {len(products)} product(s) from database")
        return products
    except Exception as exc:
        if not config.dry_run:
            raise

        print(f"Database catalog unavailable for dry-run: {exc}")
        print("Falling back to evaluation fixtures for sampling preview...")
        products = _load_fixture_products(config.categories)
        if not products:
            raise RuntimeError("No fixture products available for dry-run fallback") from exc
        print(f"Loaded {len(products)} fixture product(s) for dry-run")
        return products


def sample_products(products: list[CatalogProduct], sample_size: int) -> list[CatalogProduct]:
    if sample_size > len(products):
        raise ValueError(f"Requested sample size {sample_size} exceeds catalog size {len(products)}")
    return random.sample(products, sample_size)


def _timestamp_slug() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d_%H-%M-%S")


def _create_artifact_paths(output_dir: Path) -> ValidationArtifacts:
    run_dir = output_dir / _timestamp_slug()
    return ValidationArtifacts(
        output_dir=run_dir,
        raw_results_path=run_dir / "raw-results.json",
        report_path=run_dir / "preliminary-report.md",
    )


def _to_float(value: object) -> float:
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip()
        if stripped:
            return float(stripped)
    return 0.0


def _serialize_result(
    catalog_product: CatalogProduct,
    result: AISearchResult,
    elapsed_ms: float,
) -> dict[str, object]:
    return {
        "catalog_product": asdict(catalog_product),
        "extraction_result": cast(dict[str, object], asdict(result)),
        "elapsed_ms": round(elapsed_ms, 2),
    }


async def _run_extraction(catalog_product: CatalogProduct, scraper: AISearchScraper) -> tuple[AISearchResult, float]:
    started_at = perf_counter()
    result = await scraper.scrape_product(
        sku=catalog_product.sku,
        product_name=catalog_product.product_name,
        brand=catalog_product.brand,
        category=catalog_product.category,
    )
    return result, (perf_counter() - started_at) * 1000


def _build_summary(
    config: ValidationConfig,
    sampled_products: list[CatalogProduct],
    results: list[dict[str, object]],
) -> dict[str, object]:
    total = len(sampled_products)
    success_count = sum(1 for item in results if cast(dict[str, object], item["extraction_result"]).get("success") is True)
    failed_count = total - success_count
    total_cost = sum(_to_float(cast(dict[str, object], item["extraction_result"]).get("cost_usd")) for item in results)
    average_elapsed_ms = sum(_to_float(item.get("elapsed_ms")) for item in results) / total if total else 0.0
    categories = sorted({product.category for product in sampled_products if product.category})
    return {
        "sample_size": total,
        "categories": categories,
        "prompt_version": config.prompt_version,
        "dry_run": config.dry_run,
        "successful_extractions": success_count,
        "failed_extractions": failed_count,
        "success_rate": (success_count / total) if total else 0.0,
        "total_cost_usd": round(total_cost, 4),
        "average_elapsed_ms": round(average_elapsed_ms, 2),
    }


def _write_json(path: Path, payload: Mapping[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    _ = path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _build_report_text(
    summary: dict[str, object],
    sampled_products: list[CatalogProduct],
    results: list[dict[str, object]],
) -> str:
    lines = [
        "# Weekly Validation Preliminary Report",
        "",
        "## Summary",
        f"- Prompt version: `{summary['prompt_version']}`",
        f"- Sample size: {summary['sample_size']}",
        f"- Dry run: {'yes' if summary['dry_run'] else 'no'}",
        f"- Success rate: {summary['success_rate']:.1%}",
        f"- Failed extractions: {summary['failed_extractions']}",
        f"- Total cost: ${summary['total_cost_usd']:.4f}",
        f"- Average extraction time: {summary['average_elapsed_ms']:.2f} ms",
        "",
        "## Sampled Products",
    ]

    for index, product in enumerate(sampled_products, start=1):
        category = product.category or "Uncategorized"
        brand = product.brand or "Unknown"
        lines.append(f"- {index}. `{product.sku}` | {brand} | {product.product_name} | {category} | source={product.source}")

    if results:
        lines.extend(["", "## Extraction Outcomes"])
        for item in results:
            extraction = cast(dict[str, object], item["extraction_result"])
            product = cast(dict[str, object], item["catalog_product"])
            status = "success" if extraction.get("success") is True else "failed"
            error = extraction.get("error") or ""
            cost = _to_float(extraction.get("cost_usd"))
            lines.append(
                f"- `{product['sku']}` | {status} | cost=${cost:.4f} | confidence={_to_float(extraction.get('confidence')):.2f} | error={error or 'none'}"
            )

    lines.extend(
        [
            "",
            "## Review Notes",
            "- Review `raw-results.json` for complete extraction payloads, including failures.",
            "- Failed extractions remain in the artifact set for manual triage.",
        ]
    )
    return "\n".join(lines) + "\n"


def _write_report(
    path: Path,
    summary: dict[str, object],
    sampled_products: list[CatalogProduct],
    results: list[dict[str, object]],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    _ = path.write_text(_build_report_text(summary, sampled_products, results), encoding="utf-8")


async def run_validation(config: ValidationConfig) -> int:
    print(f"Prompt version: {config.prompt_version}")
    print(f"Requested sample size: {config.sample_size}")
    if config.categories:
        print(f"Category filter: {', '.join(config.categories)}")
    else:
        print("Category filter: none")

    products = load_product_catalog(config)
    sampled_products = sample_products(products, config.sample_size)
    artifacts = _create_artifact_paths(config.output_dir)

    print(f"Sampled {len(sampled_products)} product(s):")
    for index, product in enumerate(sampled_products, start=1):
        category = product.category or "Uncategorized"
        brand = product.brand or "Unknown"
        print(f"- {index}/{len(sampled_products)} {product.sku} | {brand} | {product.product_name} | {category}")

    if config.dry_run:
        summary = _build_summary(config, sampled_products, [])
        payload = {
            "run_started_at": datetime.now(UTC).isoformat(),
            "summary": summary,
            "sampled_products": [asdict(product) for product in sampled_products],
            "results": [],
        }
        _write_json(artifacts.raw_results_path, payload)
        _write_report(artifacts.report_path, summary, sampled_products, [])
        print("Dry run complete. No extraction API calls were made.")
        print(f"Artifacts written to: {artifacts.output_dir}")
        return 0

    print("Running AI extraction on sampled products...")
    scraper = AISearchScraper(prompt_version=config.prompt_version)
    serialized_results: list[dict[str, object]] = []

    for index, product in enumerate(sampled_products, start=1):
        print(f"[{index}/{len(sampled_products)}] Extracting {product.sku}...")
        result, elapsed_ms = await _run_extraction(product, scraper)
        serialized_results.append(_serialize_result(product, result, elapsed_ms))
        status = "ok" if result.success else "failed"
        error_suffix = f" | error={result.error}" if result.error else ""
        print(f"  -> {status} | confidence={result.confidence:.2f} | cost=${result.cost_usd:.4f} | elapsed={elapsed_ms:.0f}ms{error_suffix}")

    summary = _build_summary(config, sampled_products, serialized_results)
    payload = {
        "run_started_at": datetime.now(UTC).isoformat(),
        "summary": summary,
        "sampled_products": [asdict(product) for product in sampled_products],
        "results": serialized_results,
    }
    _write_json(artifacts.raw_results_path, payload)
    _write_report(artifacts.report_path, summary, sampled_products, serialized_results)

    print("Validation complete.")
    print(f"- Success rate: {summary['success_rate']:.1%}")
    print(f"- Failed extractions: {summary['failed_extractions']}")
    print(f"- Total cost: ${summary['total_cost_usd']:.4f}")
    print(f"Artifacts written to: {artifacts.output_dir}")
    return 1 if summary["failed_extractions"] else 0


def main() -> int:
    try:
        args = parse_args()
        config = _build_config(args)
        return asyncio.run(run_validation(config))
    except KeyboardInterrupt:
        print("Weekly validation interrupted", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Weekly validation failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
