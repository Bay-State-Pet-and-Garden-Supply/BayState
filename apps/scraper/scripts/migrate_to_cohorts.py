#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol, TypeVar, cast

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
for import_root in (PROJECT_ROOT, SRC_ROOT):
    if str(import_root) not in sys.path:
        _ = sys.path.insert(0, str(import_root))

from scrapers.cohort.grouping import CohortGroupingConfig, CohortGroupingResult, group_products_into_cohorts
from scrapers.utils.upc_utils import extract_prefix, normalize_upc

try:
    from supabase import create_client
except ImportError:
    create_client = None


logger = logging.getLogger(__name__)

DEFAULT_PAGE_SIZE = 500
DEFAULT_WRITE_BATCH_SIZE = 100
DEFAULT_PREFIX_LENGTH = 8


class SupabaseResponse(Protocol):
    data: object


class SupabaseSelectQuery(Protocol):
    def select(self, columns: str) -> "SupabaseSelectQuery": ...

    def eq(self, column: str, value: object) -> "SupabaseSelectQuery": ...

    def limit(self, size: int) -> "SupabaseSelectQuery": ...

    def range(self, start: int, end: int) -> "SupabaseSelectQuery": ...

    def execute(self) -> SupabaseResponse: ...


class SupabaseFilterQuery(Protocol):
    def eq(self, column: str, value: object) -> "SupabaseFilterQuery": ...

    def in_(self, column: str, values: Sequence[object]) -> "SupabaseFilterQuery": ...

    def execute(self) -> SupabaseResponse: ...


class SupabaseMutationQuery(Protocol):
    def execute(self) -> SupabaseResponse: ...


class SupabaseTableQuery(Protocol):
    def select(self, columns: str) -> SupabaseSelectQuery: ...

    def insert(self, values: object) -> SupabaseMutationQuery: ...

    def upsert(self, values: object, *, on_conflict: str | None = None) -> SupabaseMutationQuery: ...

    def update(self, values: object) -> SupabaseFilterQuery: ...


class SupabaseClientProtocol(Protocol):
    def table(self, name: str) -> SupabaseTableQuery: ...


@dataclass(frozen=True, slots=True)
class ProductRow:
    sku: str
    product_name: str | None
    brand: str | None
    category: str | None
    current_product_line: str | None
    raw: Mapping[str, object]


@dataclass(frozen=True, slots=True)
class CohortCandidate:
    cohort_key: str
    upc_prefix: str
    product_line: str
    products: list[ProductRow]
    metadata: dict[str, object]


@dataclass(slots=True)
class MigrationStats:
    products_analyzed: int = 0
    valid_products: int = 0
    products_skipped: int = 0
    cohorts_detected: int = 0
    cohorts_created: int = 0
    cohorts_reused: int = 0
    members_added: int = 0
    product_lines_backfilled: int = 0
    product_lines_already_set: int = 0
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class MigrationConfig:
    dry_run: bool
    execute: bool
    prefix_length: int
    min_cohort_size: int
    max_cohort_size: int
    page_size: int
    write_batch_size: int
    report_file: Path | None
    input_file: Path | None


T = TypeVar("T")


def _chunked(items: Sequence[T], size: int) -> list[list[T]]:
    return [list(items[index : index + size]) for index in range(0, len(items), size)]


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
    sku = normalize_upc(str(row.get("sku") or row.get("id") or ""))
    if not sku:
        return None

    product_name = _normalize_text(row.get("product_name") or row.get("name"))
    brand = _normalize_text(row.get("brand_name") or row.get("brand") or row.get("vendor"))
    category = _normalize_text(row.get("category_name") or row.get("category"))
    current_product_line = _normalize_text(row.get("product_line"))
    return ProductRow(
        sku=sku,
        product_name=product_name,
        brand=brand,
        category=category,
        current_product_line=current_product_line,
        raw=row,
    )


class CohortMigration:
    def __init__(self, config: MigrationConfig) -> None:
        self.config: MigrationConfig = config
        self.stats: MigrationStats = MigrationStats()
        self._client: SupabaseClientProtocol | None = _create_supabase_client() if config.execute or config.input_file is None else None

    def run(self) -> dict[str, object]:
        logger.info("Starting cohort migration", extra={"dry_run": self.config.dry_run})
        products = self._load_products()
        self.stats.products_analyzed = len(products)

        grouping_result = self._group_products(products)
        candidates = self._build_candidates(products, grouping_result)
        self.stats.cohorts_detected = len(candidates)

        for candidate in candidates:
            try:
                self._process_candidate(candidate)
            except Exception as exc:
                message = f"{candidate.cohort_key}: {exc}"
                self.stats.errors.append(message)
                logger.exception("Failed to migrate cohort", extra={"cohort_key": candidate.cohort_key})

        report = self._build_report(grouping_result, candidates)
        self._emit_report(report)
        return report

    def _load_products(self) -> list[ProductRow]:
        if self.config.input_file is not None:
            logger.info("Loading products from input file", extra={"path": str(self.config.input_file)})
            payload = cast(object, json.loads(self.config.input_file.read_text()))
            rows: list[object]
            if isinstance(payload, list):
                rows = cast(list[object], payload)
            elif isinstance(payload, Mapping):
                payload_mapping = cast(Mapping[str, object], payload)
                nested_rows = payload_mapping.get("products", [])
                rows = cast(list[object], nested_rows) if isinstance(nested_rows, list) else []
            else:
                rows = []
            normalized_rows = [cast(Mapping[str, object], row) for row in rows if isinstance(row, Mapping)]
            return [product for row in normalized_rows for product in [_normalize_product_row(row)] if product is not None]

        assert self._client is not None
        products: list[ProductRow] = []
        offset = 0

        while True:
            response = self._client.table("products_ingestion").select("*").range(offset, offset + self.config.page_size - 1).execute()
            db_rows = cast(list[Mapping[str, object]], response.data or [])
            if not db_rows:
                break

            for row in db_rows:
                product = _normalize_product_row(row)
                if product is not None:
                    products.append(product)

            offset += self.config.page_size

        logger.info("Loaded products from products_ingestion", extra={"count": len(products)})
        return products

    def _group_products(self, products: list[ProductRow]) -> CohortGroupingResult:
        config = CohortGroupingConfig(
            prefix_length=self.config.prefix_length,
            max_cohort_size=self.config.max_cohort_size,
            min_cohort_size=self.config.min_cohort_size,
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
        result = group_products_into_cohorts(product_payloads, config)
        valid_products = result.statistics.get("valid_products", 0)
        self.stats.valid_products = int(valid_products) if isinstance(valid_products, int) else 0
        self.stats.products_skipped = len(result.invalid_products)
        self.stats.warnings.extend(result.warnings)
        return result

    def _build_candidates(self, products: list[ProductRow], grouping_result: CohortGroupingResult) -> list[CohortCandidate]:
        product_index = {product.sku: product for product in products}
        candidates: list[CohortCandidate] = []

        for cohort_key, cohort_products in grouping_result.cohorts.items():
            members: list[ProductRow] = []
            for cohort_product in cohort_products:
                sku = normalize_upc(str(cohort_product.get("sku") or ""))
                product = product_index.get(sku)
                if product is not None:
                    members.append(product)

            if not members:
                continue

            upc_prefix = extract_prefix(cohort_key.split("::", 1)[0], self.config.prefix_length)
            metadata: dict[str, object] = {
                "migration_source": "historical_cohort_backfill",
                "detection_strategy": "upc_prefix",
                "prefix_length": self.config.prefix_length,
                "product_count": len(members),
                "brands": sorted({brand for brand in (member.brand for member in members) if brand}),
                "categories": sorted({category for category in (member.category for member in members) if category}),
                "historical": True,
                "generated_at": datetime.now(UTC).isoformat(),
            }
            candidates.append(
                CohortCandidate(
                    cohort_key=cohort_key,
                    upc_prefix=upc_prefix,
                    product_line=cohort_key,
                    products=sorted(members, key=lambda product: product.sku),
                    metadata=metadata,
                )
            )

        return candidates

    def _process_candidate(self, candidate: CohortCandidate) -> None:
        already_set = sum(1 for product in candidate.products if product.current_product_line == candidate.product_line)
        self.stats.product_lines_already_set += already_set

        if self.config.dry_run:
            self.stats.cohorts_created += 1
            self.stats.members_added += len(candidate.products)
            self.stats.product_lines_backfilled += len(candidate.products) - already_set
            logger.info(
                "Dry run cohort prepared",
                extra={
                    "cohort_key": candidate.cohort_key,
                    "member_count": len(candidate.products),
                    "product_line_updates": len(candidate.products) - already_set,
                },
            )
            return

        assert self._client is not None
        cohort_id, created = self._ensure_cohort_batch(candidate)
        if created:
            self.stats.cohorts_created += 1
        else:
            self.stats.cohorts_reused += 1

        inserted_members = self._upsert_members(cohort_id, candidate)
        self.stats.members_added += inserted_members
        updated_products = self._update_product_lines(candidate)
        self.stats.product_lines_backfilled += updated_products
        logger.info(
            "Migrated cohort",
            extra={
                "cohort_id": cohort_id,
                "cohort_key": candidate.cohort_key,
                "member_count": inserted_members,
                "product_line_updates": updated_products,
                "is_created": created,
            },
        )

    def _ensure_cohort_batch(self, candidate: CohortCandidate) -> tuple[str, bool]:
        assert self._client is not None
        existing_response = (
            self._client.table("cohort_batches")
            .select("id,upc_prefix,product_line")
            .eq("upc_prefix", candidate.upc_prefix)
            .eq("product_line", candidate.product_line)
            .limit(1)
            .execute()
        )
        existing_rows = cast(list[Mapping[str, object]], existing_response.data or [])
        if existing_rows:
            cohort_id = str(existing_rows[0].get("id") or "").strip()
            if cohort_id:
                return cohort_id, False

        payload: Mapping[str, object] = {
            "upc_prefix": candidate.upc_prefix,
            "product_line": candidate.product_line,
            "status": "completed",
            "metadata": candidate.metadata,
        }
        response = self._client.table("cohort_batches").insert(payload).execute()
        rows = cast(list[Mapping[str, object]], response.data or [])
        if not rows:
            raise RuntimeError(f"Failed to create cohort batch for {candidate.cohort_key}")
        cohort_id = str(rows[0].get("id") or "").strip()
        if not cohort_id:
            raise RuntimeError(f"Created cohort batch missing id for {candidate.cohort_key}")
        return cohort_id, True

    def _upsert_members(self, cohort_id: str, candidate: CohortCandidate) -> int:
        assert self._client is not None
        member_rows = [
            {
                "cohort_id": cohort_id,
                "product_sku": product.sku,
                "upc_prefix": candidate.upc_prefix,
                "sort_order": index,
            }
            for index, product in enumerate(candidate.products)
        ]

        total_rows = 0
        for chunk in _chunked(member_rows, self.config.write_batch_size):
            _ = self._client.table("cohort_members").upsert(chunk, on_conflict="cohort_id,product_sku").execute()
            total_rows += len(chunk)
        return total_rows

    def _update_product_lines(self, candidate: CohortCandidate) -> int:
        assert self._client is not None
        skus_to_update = [product.sku for product in candidate.products if product.current_product_line != candidate.product_line]
        total_updated = 0
        for chunk in _chunked(skus_to_update, self.config.write_batch_size):
            if not chunk:
                continue
            _ = self._client.table("products_ingestion").update({"product_line": candidate.product_line}).in_("sku", chunk).execute()
            total_updated += len(chunk)
        return total_updated

    def _build_report(self, grouping_result: CohortGroupingResult, candidates: list[CohortCandidate]) -> dict[str, object]:
        sample_cohorts = [
            {
                "cohort_key": candidate.cohort_key,
                "upc_prefix": candidate.upc_prefix,
                "product_line": candidate.product_line,
                "member_count": len(candidate.products),
                "sample_skus": [product.sku for product in candidate.products[:5]],
            }
            for candidate in candidates[:20]
        ]
        return {
            "mode": "dry-run" if self.config.dry_run else "execute",
            "generated_at": datetime.now(UTC).isoformat(),
            "configuration": {
                "prefix_length": self.config.prefix_length,
                "min_cohort_size": self.config.min_cohort_size,
                "max_cohort_size": self.config.max_cohort_size,
                "page_size": self.config.page_size,
                "write_batch_size": self.config.write_batch_size,
                "input_file": str(self.config.input_file) if self.config.input_file is not None else None,
            },
            "statistics": {
                "products_analyzed": self.stats.products_analyzed,
                "valid_products": self.stats.valid_products,
                "products_skipped": self.stats.products_skipped,
                "cohorts_detected": self.stats.cohorts_detected,
                "cohorts_created": self.stats.cohorts_created,
                "cohorts_reused": self.stats.cohorts_reused,
                "members_added": self.stats.members_added,
                "product_lines_backfilled": self.stats.product_lines_backfilled,
                "product_lines_already_set": self.stats.product_lines_already_set,
                "errors": list(self.stats.errors or []),
                "warnings": list(self.stats.warnings or []),
                "grouping": grouping_result.statistics,
            },
            "sample_cohorts": sample_cohorts,
        }

    def _emit_report(self, report: dict[str, object]) -> None:
        rendered = json.dumps(report, indent=2, sort_keys=True)
        logger.info("Cohort migration report\n%s", rendered)
        if self.config.report_file is not None:
            self.config.report_file.parent.mkdir(parents=True, exist_ok=True)
            _ = self.config.report_file.write_text(rendered + "\n")
            logger.info("Wrote migration report", extra={"path": str(self.config.report_file)})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate existing products into cohort tables")
    mode = parser.add_mutually_exclusive_group()
    _ = mode.add_argument("--dry-run", action="store_true", help="Preview cohort creation without writing data")
    _ = mode.add_argument("--execute", action="store_true", help="Write cohort batches, cohort members, and product_line values")
    _ = parser.add_argument(
        "--prefix-length", type=int, default=DEFAULT_PREFIX_LENGTH, help=f"UPC prefix length to use for cohort detection (default: {DEFAULT_PREFIX_LENGTH})"
    )
    _ = parser.add_argument("--min-cohort-size", type=int, default=1, help="Minimum products required to create a cohort")
    _ = parser.add_argument("--max-cohort-size", type=int, default=100, help="Maximum products per cohort before splitting")
    _ = parser.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE, help=f"Read batch size for products_ingestion (default: {DEFAULT_PAGE_SIZE})")
    _ = parser.add_argument(
        "--write-batch-size", type=int, default=DEFAULT_WRITE_BATCH_SIZE, help=f"Write batch size for inserts and updates (default: {DEFAULT_WRITE_BATCH_SIZE})"
    )
    _ = parser.add_argument("--report-file", type=Path, help="Optional path to write a JSON migration report")
    _ = parser.add_argument("--input-file", type=Path, help="Optional JSON fixture file for offline dry-run validation")
    return parser.parse_args()


def _build_config(args: argparse.Namespace) -> MigrationConfig:
    dry_run = not bool(getattr(args, "execute", False))
    input_file = cast(Path | None, getattr(args, "input_file", None))
    report_file = cast(Path | None, getattr(args, "report_file", None))
    prefix_length = int(getattr(args, "prefix_length", DEFAULT_PREFIX_LENGTH))
    min_cohort_size = int(getattr(args, "min_cohort_size", 1))
    max_cohort_size = int(getattr(args, "max_cohort_size", 100))
    page_size = int(getattr(args, "page_size", DEFAULT_PAGE_SIZE))
    write_batch_size = int(getattr(args, "write_batch_size", DEFAULT_WRITE_BATCH_SIZE))

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
    if bool(getattr(args, "execute", False)) and input_file is not None:
        raise ValueError("--input-file is only supported with dry-run mode")

    return MigrationConfig(
        dry_run=dry_run,
        execute=bool(getattr(args, "execute", False)),
        prefix_length=prefix_length,
        min_cohort_size=min_cohort_size,
        max_cohort_size=max_cohort_size,
        page_size=page_size,
        write_batch_size=write_batch_size,
        report_file=report_file,
        input_file=input_file,
    )


def _confirm_execute() -> None:
    confirmation = input("⚠️  This will backfill cohort tables and update products_ingestion.product_line. Type 'MIGRATE' to continue: ").strip()
    if confirmation != "MIGRATE":
        raise SystemExit("Migration cancelled.")


def _configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


def main() -> None:
    _configure_logging()
    args = parse_args()
    config = _build_config(args)
    if config.execute:
        _confirm_execute()

    migration = CohortMigration(config)
    try:
        _ = migration.run()
    except Exception as exc:
        logger.exception("Cohort migration failed")
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
