from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Mapping
import json
import os
from pathlib import Path
from typing import Protocol, cast

import click

from scrapers.cohort.grouping import CohortGroupingConfig, group_products_into_cohorts
from scrapers.utils.upc_utils import extract_prefix, normalize_upc

try:
    from supabase import create_client
except ImportError:
    create_client = None

DEFAULT_PAGE_SIZE = 500
DEFAULT_DISPLAY_LIMIT = 20
DEFAULT_PREFIX_LENGTH = 6
MAX_WARNING_LINES = 5
MAX_SAMPLE_SKUS = 3
MAX_SAMPLE_NAMES = 2


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


@click.command(name="visualize")
@click.option("--upc-prefix", "upc_prefix", "-u", help="Filter displayed cohorts by UPC prefix.")
@click.option(
    "--format",
    "output_format",
    "-f",
    type=click.Choice(["table", "json"]),
    default="table",
    show_default=True,
    help="Output format.",
)
@click.option(
    "--input-file",
    "input_file",
    "-i",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    help="Load products from a JSON file instead of Supabase.",
)
@click.option(
    "--limit",
    type=click.IntRange(1, None),
    default=DEFAULT_DISPLAY_LIMIT,
    show_default=True,
    help="Maximum number of matching cohorts to display.",
)
@click.option(
    "--export",
    "export_path",
    "-e",
    type=click.Path(dir_okay=False, path_type=Path),
    help="Export structured visualization data as JSON.",
)
def visualize(upc_prefix: str | None, output_format: str, input_file: Path | None, limit: int, export_path: Path | None) -> None:
    """Visualize how products are grouped into cohorts."""
    products = _load_products(input_file)
    payload = _build_visualization_payload(products, upc_prefix=upc_prefix, limit=limit, input_file=input_file)

    if export_path is not None:
        _export_payload(payload, export_path)

    if output_format == "json":
        click.echo(json.dumps(payload, indent=2, sort_keys=True))
        return

    click.echo(_render_table(payload))


def register_cohort_commands(cohort_group: click.Group) -> None:
    cohort_group.add_command(visualize)


def _resolve_supabase_credentials() -> tuple[str | None, str | None]:
    env = os.environ
    url = env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_KEY") or env.get("SUPABASE_ANON_KEY") or env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    return url, key


def _create_supabase_client() -> SupabaseClientProtocol:
    if create_client is None:
        raise click.ClickException("supabase package is not installed. Use --input-file for local visualization.")

    url, key = _resolve_supabase_credentials()
    if not url or not key:
        raise click.ClickException("Supabase credentials are required. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or pass --input-file.")

    return cast(SupabaseClientProtocol, cast(object, create_client(url, key)))


def _normalize_text(value: object) -> str | None:
    if value is None:
        return None

    normalized = str(value).strip()
    return normalized or None


def _normalize_product(row: Mapping[str, object]) -> Mapping[str, object] | None:
    sku = normalize_upc(str(row.get("sku") or row.get("id") or ""))
    if not sku:
        return None

    return {
        "sku": sku,
        "product_name": _normalize_text(row.get("product_name") or row.get("name")),
        "brand": _normalize_text(row.get("brand") or row.get("brand_name") or row.get("vendor")),
        "category": _normalize_text(row.get("category") or row.get("category_name")),
    }


def _load_products(input_file: Path | None) -> list[Mapping[str, object]]:
    if input_file is not None:
        rows = _load_rows_from_file(input_file)
        products = [product for row in rows for product in [_normalize_product(row)] if product is not None]
        if not products:
            raise click.ClickException(f"Input file {input_file} did not contain any usable product rows.")
        return products

    client = _create_supabase_client()
    products: list[Mapping[str, object]] = []
    offset = 0

    while True:
        response = client.table("products_ingestion").select("*").range(offset, offset + DEFAULT_PAGE_SIZE - 1).execute()
        db_rows = cast(list[Mapping[str, object]], response.data or [])
        if not db_rows:
            break

        products.extend(product for row in db_rows for product in [_normalize_product(row)] if product is not None)
        offset += DEFAULT_PAGE_SIZE

    if not products:
        raise click.ClickException("No products were available to visualize.")

    return products


def _load_rows_from_file(input_file: Path) -> list[Mapping[str, object]]:
    try:
        payload = cast(object, json.loads(input_file.read_text()))
    except OSError as exc:
        raise click.ClickException(f"Unable to read input file {input_file}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise click.ClickException(f"Input file {input_file} does not contain valid JSON: {exc}") from exc

    candidate_rows: list[object]
    if isinstance(payload, list):
        candidate_rows = cast(list[object], payload)
    elif isinstance(payload, Mapping):
        payload_mapping = cast(Mapping[str, object], payload)
        nested_rows = payload_mapping.get("products", [])
        candidate_rows = cast(list[object], nested_rows) if isinstance(nested_rows, list) else []
    else:
        candidate_rows = []

    normalized_rows = [cast(Mapping[str, object], row) for row in candidate_rows if isinstance(row, Mapping)]
    if not normalized_rows:
        raise click.ClickException(f"Input file {input_file} did not contain any product rows.")
    return normalized_rows


def _build_visualization_payload(
    products: list[Mapping[str, object]],
    *,
    upc_prefix: str | None,
    limit: int,
    input_file: Path | None,
) -> dict[str, object]:
    result = group_products_into_cohorts(products, CohortGroupingConfig(prefix_length=DEFAULT_PREFIX_LENGTH))
    normalized_prefix = normalize_upc(upc_prefix or "")

    matching_items = [
        (cohort_key, cohort_products)
        for cohort_key, cohort_products in sorted(result.cohorts.items())
        if not normalized_prefix or cohort_key.startswith(normalized_prefix)
    ]

    visible_items = matching_items[:limit]
    visible_cohorts = [_build_cohort_payload(cohort_key, cohort_products) for cohort_key, cohort_products in visible_items]

    summary = {
        **result.statistics,
        "matching_cohorts": len(matching_items),
        "displayed_cohorts": len(visible_cohorts),
        "filter_upc_prefix": normalized_prefix or None,
    }

    return {
        "source": {
            "input_file": str(input_file) if input_file is not None else None,
            "source_type": "file" if input_file is not None else "supabase",
        },
        "filters": {
            "upc_prefix": normalized_prefix or None,
            "limit": limit,
        },
        "summary": summary,
        "cohorts": visible_cohorts,
        "warnings": result.warnings,
    }


def _build_cohort_payload(cohort_key: str, cohort_products: list[Mapping[str, object]]) -> dict[str, object]:
    upc_prefix = extract_prefix(cohort_key.split("::", 1)[0], DEFAULT_PREFIX_LENGTH)
    brand_distribution = _build_distribution(product.get("brand") for product in cohort_products)
    category_distribution = _build_distribution(product.get("category") for product in cohort_products)
    sample_skus = [normalize_upc(str(product.get("sku") or "")) for product in cohort_products]
    sample_names = [product_name for product_name in (_normalize_text(product.get("product_name")) for product in cohort_products) if product_name is not None]

    return {
        "cohort_key": cohort_key,
        "upc_prefix": upc_prefix,
        "size": len(cohort_products),
        "brand_distribution": dict(brand_distribution),
        "category_distribution": dict(category_distribution),
        "sample_skus": sample_skus[:MAX_SAMPLE_SKUS],
        "sample_product_names": sample_names[:MAX_SAMPLE_NAMES],
    }


def _build_distribution(values: Iterable[object]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for value in values:
        label = _normalize_text(value) or "Unknown"
        counts[label] += 1
    return counts


def _format_distribution(distribution: Mapping[str, int]) -> str:
    if not distribution:
        return "-"

    ordered_items = sorted(distribution.items(), key=lambda item: (-item[1], item[0]))
    return ", ".join(f"{label} ({count})" for label, count in ordered_items)


def _render_table(payload: Mapping[str, object]) -> str:
    summary = cast(Mapping[str, object], payload["summary"])
    warnings = cast(list[str], payload["warnings"])
    cohorts = cast(list[Mapping[str, object]], payload["cohorts"])

    lines = [
        "Cohort Visualization",
        f"  Total cohorts: {summary.get('cohort_count', 0)}",
        f"  Matching cohorts: {summary.get('matching_cohorts', 0)}",
        f"  Displayed cohorts: {summary.get('displayed_cohorts', 0)}",
        f"  Grouped products: {summary.get('grouped_products', 0)}",
        f"  Invalid products: {summary.get('invalid_products', 0)}",
        f"  Avg cohort size: {float(cast(float | int, summary.get('avg_cohort_size', 0.0))):.2f}",
        f"  Warnings: {summary.get('warnings_count', len(warnings))}",
    ]

    if not cohorts:
        lines.append("")
        lines.append("No cohorts matched the current filters.")
        return "\n".join(lines)

    headers = ["Cohort Key", "Size", "UPC Prefix", "Brands", "Categories", "Sample SKUs"]
    rows = [
        [
            str(cohort_info["cohort_key"]),
            str(cohort_info["size"]),
            str(cohort_info["upc_prefix"]),
            _format_distribution(cast(Mapping[str, int], cohort_info["brand_distribution"])),
            _format_distribution(cast(Mapping[str, int], cohort_info["category_distribution"])),
            ", ".join(cast(list[str], cohort_info["sample_skus"])),
        ]
        for cohort_info in cohorts
    ]

    widths = [len(header) for header in headers]
    for row in rows:
        for index, value in enumerate(row):
            widths[index] = max(widths[index], len(value))

    lines.append("")
    lines.append("  ".join(header.ljust(widths[index]) for index, header in enumerate(headers)))
    lines.append("  ".join("-" * widths[index] for index in range(len(headers))))
    lines.extend("  ".join(value.ljust(widths[index]) for index, value in enumerate(row)) for row in rows)

    if warnings:
        lines.append("")
        lines.append("Warnings:")
        for warning in warnings[:MAX_WARNING_LINES]:
            lines.append(f"  - {warning}")
        remaining_warnings = len(warnings) - MAX_WARNING_LINES
        if remaining_warnings > 0:
            lines.append(f"  ... and {remaining_warnings} more")

    return "\n".join(lines)


def _export_payload(payload: Mapping[str, object], export_path: Path) -> None:
    parent = export_path.parent
    if not parent.exists():
        raise click.ClickException(f"Export directory does not exist: {parent}")

    try:
        _ = export_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    except OSError as exc:
        raise click.ClickException(f"Unable to export visualization data to {export_path}: {exc}") from exc
