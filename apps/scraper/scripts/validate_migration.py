#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import logging
import os
import random
import sys
from collections import Counter, defaultdict
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from typing import Protocol, cast

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
for import_root in (PROJECT_ROOT, SRC_ROOT):
    if str(import_root) not in sys.path:
        _ = sys.path.insert(0, str(import_root))

from scripts.migrate_to_cohorts import ProductRow
from scrapers.cohort.grouping import CohortGroupingConfig, CohortGroupingResult, group_products_into_cohorts
from scrapers.utils.upc_utils import extract_prefix

try:
    from supabase import create_client
except ImportError:
    create_client = None

logger = logging.getLogger(__name__)

DEFAULT_PREFIX_LENGTH = 8
DEFAULT_PAGE_SIZE = 500
DEFAULT_WRITE_BATCH_SIZE = 100
DEFAULT_MAX_SAMPLES = 20
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / ".sisyphus" / "evidence" / "migration-validation"


class SupabaseResponse(Protocol):
    data: object


class SupabaseSelectQuery(Protocol):
    def select(self, columns: str) -> "SupabaseSelectQuery": ...

    def range(self, start: int, end: int) -> "SupabaseSelectQuery": ...

    def execute(self) -> SupabaseResponse: ...


class SupabaseTableQuery(Protocol):
    def select(self, columns: str) -> SupabaseSelectQuery: ...


class SupabaseClientProtocol(Protocol):
    def table(self, name: str) -> SupabaseTableQuery: ...


@dataclass(frozen=True, slots=True)
class ValidationCandidate:
    cohort_key: str
    upc_prefix: str
    product_line: str
    products: list[ProductRow]


@dataclass(frozen=True, slots=True)
class ValidationConfig:
    input_file: Path | None
    report_file: Path
    sample_size: int | None
    seed: int
    prefix_length: int
    min_cohort_size: int
    max_cohort_size: int
    page_size: int
    write_batch_size: int
    max_samples: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate cohort migration accuracy against production-like product data")
    _ = parser.add_argument("--input-file", type=Path, help="Optional JSON fixture used instead of querying products_ingestion")
    _ = parser.add_argument("--report-file", type=Path, help="Optional path for the JSON validation report")
    _ = parser.add_argument("--sample-size", type=int, help="Optional number of products to evaluate after loading")
    _ = parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducible sampling (default: 42)")
    _ = parser.add_argument(
        "--prefix-length",
        type=int,
        default=DEFAULT_PREFIX_LENGTH,
        help=f"UPC prefix length used for migration detection (default: {DEFAULT_PREFIX_LENGTH})",
    )
    _ = parser.add_argument("--min-cohort-size", type=int, default=1, help="Minimum products required to create a cohort")
    _ = parser.add_argument("--max-cohort-size", type=int, default=100, help="Maximum products per cohort before splitting")
    _ = parser.add_argument(
        "--page-size",
        type=int,
        default=DEFAULT_PAGE_SIZE,
        help=f"Read batch size when loading from products_ingestion (default: {DEFAULT_PAGE_SIZE})",
    )
    _ = parser.add_argument(
        "--write-batch-size",
        type=int,
        default=DEFAULT_WRITE_BATCH_SIZE,
        help=f"Write batch size forwarded to migration config for parity (default: {DEFAULT_WRITE_BATCH_SIZE})",
    )
    _ = parser.add_argument(
        "--max-samples",
        type=int,
        default=DEFAULT_MAX_SAMPLES,
        help=f"Maximum mismatch/edge-case samples to include in the report (default: {DEFAULT_MAX_SAMPLES})",
    )
    return parser.parse_args()


def _build_config(args: argparse.Namespace) -> ValidationConfig:
    input_file = cast(Path | None, getattr(args, "input_file", None))
    report_file = cast(Path | None, getattr(args, "report_file", None))
    sample_size = cast(int | None, getattr(args, "sample_size", None))
    seed = int(getattr(args, "seed", 42))
    prefix_length = int(getattr(args, "prefix_length", DEFAULT_PREFIX_LENGTH))
    min_cohort_size = int(getattr(args, "min_cohort_size", 1))
    max_cohort_size = int(getattr(args, "max_cohort_size", 100))
    page_size = int(getattr(args, "page_size", DEFAULT_PAGE_SIZE))
    write_batch_size = int(getattr(args, "write_batch_size", DEFAULT_WRITE_BATCH_SIZE))
    max_samples = int(getattr(args, "max_samples", DEFAULT_MAX_SAMPLES))

    if input_file is not None and not input_file.exists():
        raise ValueError(f"Input file not found: {input_file}")
    if sample_size is not None and sample_size < 1:
        raise ValueError("--sample-size must be greater than 0 when provided")
    if prefix_length < 1:
        raise ValueError("--prefix-length must be greater than 0")
    if min_cohort_size < 1:
        raise ValueError("--min-cohort-size must be greater than 0")
    if max_cohort_size < 1:
        raise ValueError("--max-cohort-size must be greater than 0")
    if min_cohort_size > max_cohort_size:
        raise ValueError("--min-cohort-size cannot exceed --max-cohort-size")
    if page_size < 1:
        raise ValueError("--page-size must be greater than 0")
    if write_batch_size < 1:
        raise ValueError("--write-batch-size must be greater than 0")
    if max_samples < 1:
        raise ValueError("--max-samples must be greater than 0")

    resolved_report_file = report_file or _default_report_file()
    return ValidationConfig(
        input_file=input_file,
        report_file=resolved_report_file,
        sample_size=sample_size,
        seed=seed,
        prefix_length=prefix_length,
        min_cohort_size=min_cohort_size,
        max_cohort_size=max_cohort_size,
        page_size=page_size,
        write_batch_size=write_batch_size,
        max_samples=max_samples,
    )


def _default_report_file() -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return DEFAULT_OUTPUT_DIR / f"report_{timestamp}.json"


def _configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


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


def _normalize_text(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _normalize_product_row(row: Mapping[str, object]) -> ProductRow | None:
    sku = _normalize_text(row.get("sku") or row.get("id"))
    if sku is None:
        return None

    return ProductRow(
        sku=sku,
        product_name=_normalize_text(row.get("product_name") or row.get("name")),
        brand=_normalize_text(row.get("brand_name") or row.get("brand") or row.get("vendor")),
        category=_normalize_text(row.get("category_name") or row.get("category")),
        current_product_line=_normalize_text(row.get("product_line")),
        raw=row,
    )


def _load_products_from_input_file(input_file: Path) -> list[ProductRow]:
    payload = cast(object, json.loads(input_file.read_text(encoding="utf-8")))
    rows: list[object] = []
    if isinstance(payload, list):
        rows = cast(list[object], payload)
    elif isinstance(payload, Mapping):
        payload_mapping = cast(Mapping[str, object], payload)
        nested_rows = payload_mapping.get("products", [])
        rows = cast(list[object], nested_rows) if isinstance(nested_rows, list) else []

    normalized_rows = [cast(Mapping[str, object], row) for row in rows if isinstance(row, Mapping)]
    return [product for row in normalized_rows for product in [_normalize_product_row(row)] if product is not None]


def _load_products_from_database(page_size: int) -> list[ProductRow]:
    client = _create_supabase_client()
    products: list[ProductRow] = []
    offset = 0

    while True:
        response = client.table("products_ingestion").select("*").range(offset, offset + page_size - 1).execute()
        rows = cast(list[Mapping[str, object]], response.data or [])
        if not rows:
            break

        for row in rows:
            product = _normalize_product_row(row)
            if product is not None:
                products.append(product)

        offset += page_size

    return products


def _load_products(config: ValidationConfig) -> list[ProductRow]:
    if config.input_file is not None:
        logger.info("Loading validation products from input file", extra={"path": str(config.input_file)})
        return _load_products_from_input_file(config.input_file)

    logger.info("Loading validation products from products_ingestion")
    return _load_products_from_database(config.page_size)


def _group_products(products: list[ProductRow], config: ValidationConfig) -> CohortGroupingResult:
    grouping_config = CohortGroupingConfig(
        prefix_length=config.prefix_length,
        max_cohort_size=config.max_cohort_size,
        min_cohort_size=config.min_cohort_size,
        skip_invalid_upcs=True,
        strategy="upc_prefix",
        upc_field="sku",
    )
    product_payloads: list[Mapping[str, object]] = [
        {
            "sku": product.sku,
            "product_name": product.product_name,
            "brand": product.brand,
            "category": product.category,
            "product_line": product.current_product_line,
        }
        for product in products
    ]
    return group_products_into_cohorts(product_payloads, grouping_config)


def _build_candidates(products: list[ProductRow], grouping_result: CohortGroupingResult, config: ValidationConfig) -> list[ValidationCandidate]:
    product_index = {product.sku: product for product in products}
    candidates: list[ValidationCandidate] = []

    for cohort_key, cohort_products in grouping_result.cohorts.items():
        members: list[ProductRow] = []
        for cohort_product in cohort_products:
            sku = str(cohort_product.get("sku") or "").strip()
            product = product_index.get(sku)
            if product is not None:
                members.append(product)

        if not members:
            continue

        upc_prefix = extract_prefix(cohort_key.split("::", 1)[0], config.prefix_length)
        candidates.append(
            ValidationCandidate(
                cohort_key=cohort_key,
                upc_prefix=upc_prefix,
                product_line=cohort_key,
                products=sorted(members, key=lambda product: product.sku),
            )
        )

    return candidates


def _sample_invalid_product(product: Mapping[str, object]) -> dict[str, object]:
    return {
        "sku": _normalize_text(product.get("sku") or product.get("id")),
        "product_name": _normalize_text(product.get("product_name") or product.get("name")),
        "brand": _normalize_text(product.get("brand") or product.get("brand_name") or product.get("vendor")),
        "category": _normalize_text(product.get("category") or product.get("category_name")),
        "expected_product_line": _normalize_text(product.get("product_line")),
    }


def _sample_products(products: list[ProductRow], sample_size: int | None, seed: int) -> list[ProductRow]:
    if sample_size is None or sample_size >= len(products):
        return products

    rng = random.Random(seed)
    sampled_indexes = sorted(rng.sample(range(len(products)), sample_size))
    return [products[index] for index in sampled_indexes]


def _normalize_line(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _sample_product(product: ProductRow) -> dict[str, object]:
    return {
        "sku": product.sku,
        "product_name": product.product_name,
        "brand": product.brand,
        "category": product.category,
        "expected_product_line": product.current_product_line,
    }


def _build_validation_report(config: ValidationConfig) -> dict[str, object]:
    started_at = datetime.now(timezone.utc)
    total_started = perf_counter()

    load_started = perf_counter()
    loaded_products = _load_products(config)
    load_duration = perf_counter() - load_started

    sampled_products = _sample_products(loaded_products, config.sample_size, config.seed)

    group_started = perf_counter()
    grouping_result = _group_products(sampled_products, config)
    candidates = _build_candidates(sampled_products, grouping_result, config)
    group_duration = perf_counter() - group_started

    evaluation_started = perf_counter()
    candidate_sizes = {candidate.cohort_key: len(candidate.products) for candidate in candidates}
    predicted_by_sku = {
        product.sku: {
            "predicted_product_line": candidate.product_line,
            "cohort_key": candidate.cohort_key,
            "cohort_size": candidate_sizes[candidate.cohort_key],
        }
        for candidate in candidates
        for product in candidate.products
    }

    labeled_products = [product for product in sampled_products if _normalize_line(product.current_product_line) is not None]
    unlabeled_products = len(sampled_products) - len(labeled_products)

    exact_matches = 0
    prefix_matches = 0
    missing_predictions = 0
    mismatch_samples: list[dict[str, object]] = []
    mismatch_counter: Counter[tuple[str, str]] = Counter()

    for product in labeled_products:
        expected_line = _normalize_line(product.current_product_line)
        prediction = predicted_by_sku.get(product.sku)
        predicted_line = _normalize_line(str(prediction["predicted_product_line"])) if prediction is not None else None
        cohort_size = int(prediction["cohort_size"]) if prediction is not None else 0
        if predicted_line is None:
            missing_predictions += 1
            if len(mismatch_samples) < config.max_samples:
                mismatch_samples.append(
                    {
                        **_sample_product(product),
                        "predicted_product_line": None,
                        "cohort_size": 0,
                        "reason": "missing_prediction",
                    }
                )
            continue

        if expected_line == predicted_line:
            exact_matches += 1
        else:
            mismatch_counter[(expected_line or "", predicted_line)] += 1
            if len(mismatch_samples) < config.max_samples:
                mismatch_samples.append(
                    {
                        **_sample_product(product),
                        "predicted_product_line": predicted_line,
                        "cohort_size": cohort_size,
                        "reason": "product_line_mismatch",
                    }
                )

        expected_prefix = extract_prefix(expected_line or "", config.prefix_length)
        predicted_prefix = extract_prefix(predicted_line, config.prefix_length)
        if expected_prefix and expected_prefix == predicted_prefix:
            prefix_matches += 1

    invalid_samples = [_sample_invalid_product(product) for product in grouping_result.invalid_products[: config.max_samples]]
    singleton_samples = [
        {
            "cohort_key": candidate.cohort_key,
            "sku": candidate.products[0].sku,
            "product_name": candidate.products[0].product_name,
        }
        for candidate in candidates
        if len(candidate.products) == 1
    ][: config.max_samples]

    mixed_expected_line_cohorts: list[dict[str, object]] = []
    split_expected_line_map: defaultdict[str, set[str]] = defaultdict(set)
    for candidate in candidates:
        expected_line_set = {
            normalized_line
            for product in candidate.products
            for normalized_line in [_normalize_line(product.current_product_line)]
            if normalized_line is not None
        }
        expected_lines = sorted(expected_line_set)
        for expected_line in expected_lines:
            split_expected_line_map[expected_line].add(candidate.product_line)
        if len(expected_lines) > 1 and len(mixed_expected_line_cohorts) < config.max_samples:
            mixed_expected_line_cohorts.append(
                {
                    "cohort_key": candidate.cohort_key,
                    "predicted_product_line": candidate.product_line,
                    "member_count": len(candidate.products),
                    "expected_product_lines": expected_lines,
                    "sample_skus": [product.sku for product in candidate.products[:5]],
                }
            )

    fragmented_expected_lines = [
        {
            "expected_product_line": expected_line,
            "predicted_product_lines": sorted(predicted_lines),
            "predicted_group_count": len(predicted_lines),
        }
        for expected_line, predicted_lines in split_expected_line_map.items()
        if len(predicted_lines) > 1
    ]
    fragmented_expected_lines = fragmented_expected_lines[: config.max_samples]

    evaluation_duration = perf_counter() - evaluation_started
    total_duration = perf_counter() - total_started

    evaluated_products = len(labeled_products)
    exact_accuracy = exact_matches / evaluated_products if evaluated_products else 0.0
    prefix_accuracy = prefix_matches / evaluated_products if evaluated_products else 0.0
    coverage = evaluated_products / len(sampled_products) if sampled_products else 0.0
    fragmented_count = sum(1 for predicted_lines in split_expected_line_map.values() if len(predicted_lines) > 1)
    mixed_expected_line_count = sum(
        1
        for candidate in candidates
        if len(
            {
                normalized_line
                for product in candidate.products
                for normalized_line in [_normalize_line(product.current_product_line)]
                if normalized_line is not None
            }
        )
        > 1
    )
    split_cohorts = int(cast(int, grouping_result.statistics.get("split_cohorts", 0) or 0))
    products_analyzed = int(cast(int, grouping_result.statistics.get("total_products", 0) or 0))
    valid_products = int(cast(int, grouping_result.statistics.get("valid_products", 0) or 0))
    products_skipped = int(cast(int, grouping_result.statistics.get("invalid_products", 0) or 0))
    cohorts_detected = len(candidates)

    report: dict[str, object] = {
        "generated_at": started_at.isoformat(),
        "source": {
            "mode": "input-file" if config.input_file is not None else "products_ingestion",
            "input_file": str(config.input_file) if config.input_file is not None else None,
        },
        "configuration": {
            "sample_size": config.sample_size,
            "seed": config.seed,
            "prefix_length": config.prefix_length,
            "min_cohort_size": config.min_cohort_size,
            "max_cohort_size": config.max_cohort_size,
            "page_size": config.page_size,
            "write_batch_size": config.write_batch_size,
            "max_samples": config.max_samples,
        },
        "dataset": {
            "loaded_products": len(loaded_products),
            "analyzed_products": len(sampled_products),
            "labeled_products": evaluated_products,
            "unlabeled_products": unlabeled_products,
            "evaluation_coverage": round(coverage, 6),
        },
        "timing_seconds": {
            "load": round(load_duration, 6),
            "group_and_candidate_build": round(group_duration, 6),
            "evaluation": round(evaluation_duration, 6),
            "total": round(total_duration, 6),
            "products_per_second": round(len(sampled_products) / total_duration, 3) if total_duration else None,
        },
        "accuracy": {
            "evaluated_products": evaluated_products,
            "exact_matches": exact_matches,
            "exact_accuracy": round(exact_accuracy, 6),
            "prefix_matches": prefix_matches,
            "prefix_accuracy": round(prefix_accuracy, 6),
            "missing_predictions": missing_predictions,
        },
        "migration_statistics": {
            "products_analyzed": products_analyzed,
            "valid_products": valid_products,
            "products_skipped": products_skipped,
            "cohorts_detected": cohorts_detected,
            "warnings": list(grouping_result.warnings),
        },
        "edge_cases": {
            "invalid_upc_products": {
                "count": len(grouping_result.invalid_products),
                "samples": invalid_samples,
            },
            "singleton_cohorts": {
                "count": sum(1 for candidate in candidates if len(candidate.products) == 1),
                "samples": singleton_samples,
            },
            "mixed_expected_line_cohorts": {
                "count": mixed_expected_line_count,
                "samples": mixed_expected_line_cohorts,
            },
            "fragmented_expected_lines": {
                "count": fragmented_count,
                "samples": fragmented_expected_lines,
            },
            "split_cohorts": split_cohorts,
            "warnings_count": len(grouping_result.warnings),
            "warning_samples": grouping_result.warnings[: config.max_samples],
        },
        "mismatch_summary": {
            "count": sum(mismatch_counter.values()) + missing_predictions,
            "top_pairs": [
                {
                    "expected_product_line": expected_line,
                    "predicted_product_line": predicted_line,
                    "count": count,
                }
                for (expected_line, predicted_line), count in mismatch_counter.most_common(config.max_samples)
            ],
            "samples": mismatch_samples,
        },
    }
    return report


def _write_report(report_file: Path, report: dict[str, object]) -> None:
    report_file.parent.mkdir(parents=True, exist_ok=True)
    _ = report_file.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _log_summary(report: dict[str, object], report_file: Path) -> None:
    dataset = cast(dict[str, object], report["dataset"])
    accuracy = cast(dict[str, object], report["accuracy"])
    timing = cast(dict[str, object], report["timing_seconds"])
    edge_cases = cast(dict[str, object], report["edge_cases"])
    exact_accuracy = cast(float, accuracy.get("exact_accuracy", 0.0))
    prefix_accuracy = cast(float, accuracy.get("prefix_accuracy", 0.0))
    total_time = cast(float, timing.get("total", 0.0))
    logger.info(
        "Validation complete: analyzed=%s labeled=%s exact_accuracy=%.2f%% prefix_accuracy=%.2f%% total_time=%.2fs report=%s",
        dataset.get("analyzed_products"),
        dataset.get("labeled_products"),
        exact_accuracy * 100,
        prefix_accuracy * 100,
        total_time,
        report_file,
    )
    logger.info(
        "Edge cases: invalid_upc=%s singleton_cohorts=%s mixed_expected_line_cohorts=%s fragmented_expected_lines=%s",
        cast(dict[str, object], edge_cases["invalid_upc_products"]).get("count"),
        cast(dict[str, object], edge_cases["singleton_cohorts"]).get("count"),
        cast(dict[str, object], edge_cases["mixed_expected_line_cohorts"]).get("count"),
        cast(dict[str, object], edge_cases["fragmented_expected_lines"]).get("count"),
    )


def main() -> None:
    _configure_logging()
    try:
        config = _build_config(parse_args())
        report = _build_validation_report(config)
        _write_report(config.report_file, report)
        _log_summary(report, config.report_file)
    except Exception as exc:
        logger.exception("Migration validation failed")
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
