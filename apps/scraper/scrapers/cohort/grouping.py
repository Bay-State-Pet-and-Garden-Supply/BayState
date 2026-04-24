from __future__ import annotations

from dataclasses import dataclass, field
import logging

from scrapers.utils.upc_utils import extract_prefix, normalize_upc, validate_upc

from .processor import CohortProcessor, ProductRecord

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class CohortGroupingConfig:
    """Configuration for cohort grouping."""

    prefix_length: int = 6
    max_cohort_size: int = 100
    min_cohort_size: int = 1
    skip_invalid_upcs: bool = True
    strategy: str = "upc_prefix"
    upc_field: str = "sku"

    def __post_init__(self) -> None:
        if self.prefix_length < 1:
            raise ValueError("prefix_length must be greater than 0")
        if self.max_cohort_size < 1:
            raise ValueError("max_cohort_size must be greater than 0")
        if self.min_cohort_size < 1:
            raise ValueError("min_cohort_size must be greater than 0")
        if self.min_cohort_size > self.max_cohort_size:
            raise ValueError("min_cohort_size cannot be greater than max_cohort_size")


@dataclass(slots=True)
class CohortGroupingResult:
    """Result of cohort grouping operation."""

    cohorts: dict[str, list[ProductRecord]] = field(default_factory=dict)
    statistics: dict[str, object] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    invalid_products: list[ProductRecord] = field(default_factory=list)


def group_products_into_cohorts(
    products: list[ProductRecord],
    config: CohortGroupingConfig | None = None,
) -> CohortGroupingResult:
    """Group products into cohorts using UPC prefix matching."""
    config = config or CohortGroupingConfig()
    result = CohortGroupingResult()

    if not products:
        result.statistics = _build_statistics(
            total_products=0,
            valid_products=0,
            invalid_products=0,
            cohorts={},
            warnings_count=0,
            skipped_small_cohorts=0,
            split_cohorts=0,
            largest_raw_cohort_size=0,
        )
        return result

    processor = CohortProcessor(
        grouping_strategy=config.strategy,
        prefix_length=config.prefix_length,
        upc_field=config.upc_field,
    )

    valid_products: list[ProductRecord] = []
    skipped_small_cohorts = 0
    split_cohorts = 0

    for product in products:
        normalized = normalize_upc(str(product.get(config.upc_field) or ""))

        if not normalized:
            _record_invalid_product(result, product, "Product missing UPC/SKU")
            continue

        if not normalized.isdigit():
            _record_invalid_product(result, product, f"UPC contains non-numeric characters: {normalized}")
            continue

        is_valid, error = validate_upc(normalized)
        if config.skip_invalid_upcs and not is_valid:
            _record_invalid_product(result, product, f"Invalid UPC skipped ({normalized}): {error}")
            continue

        valid_products.append(product)

    grouped = processor.group_products(valid_products)
    final_cohorts: dict[str, list[ProductRecord]] = {}
    largest_raw_cohort_size = max((len(group) for group in grouped.values()), default=0)

    for cohort_key, cohort_products in grouped.items():
        if len(cohort_products) < config.min_cohort_size:
            skipped_small_cohorts += 1
            result.warnings.append(f"Cohort {cohort_key} skipped because size {len(cohort_products)} is below minimum {config.min_cohort_size}")
            continue

        if len(cohort_products) <= config.max_cohort_size:
            final_cohorts[cohort_key] = cohort_products
            continue

        split_cohorts += 1
        prefix = extract_prefix(cohort_key, config.prefix_length)
        for index, start in enumerate(range(0, len(cohort_products), config.max_cohort_size), start=1):
            chunk = cohort_products[start : start + config.max_cohort_size]
            chunk_key = f"{prefix}::{index}"
            final_cohorts[chunk_key] = chunk

        result.warnings.append(
            f"Cohort {cohort_key} exceeded max size {config.max_cohort_size} and was split into "
            + f"{len(range(0, len(cohort_products), config.max_cohort_size))} cohorts"
        )

    result.cohorts = final_cohorts
    result.statistics = _build_statistics(
        total_products=len(products),
        valid_products=len(valid_products),
        invalid_products=len(result.invalid_products),
        cohorts=final_cohorts,
        warnings_count=len(result.warnings),
        skipped_small_cohorts=skipped_small_cohorts,
        split_cohorts=split_cohorts,
        largest_raw_cohort_size=largest_raw_cohort_size,
    )

    logger.info(
        "Grouped %s products into %s cohorts (%s invalid)",
        len(valid_products),
        len(final_cohorts),
        len(result.invalid_products),
    )
    return result


def get_cohort_summary(result: CohortGroupingResult) -> str:
    """Generate a human-readable summary of grouped cohorts."""
    stats = result.statistics
    lines = [
        "Cohort Grouping Summary:",
        f"  Total products: {stats.get('total_products', 0)}",
        f"  Valid products: {stats.get('valid_products', 0)}",
        f"  Invalid products: {stats.get('invalid_products', 0)}",
        f"  Cohorts created: {stats.get('cohort_count', 0)}",
        f"  Avg cohort size: {stats.get('avg_cohort_size', 0.0):.2f}",
        f"  Size range: {stats.get('min_cohort_size', 0)} - {stats.get('max_cohort_size', 0)}",
        f"  Largest raw cohort size: {stats.get('largest_raw_cohort_size', 0)}",
    ]
    if result.warnings:
        lines.append(f"  Warnings: {stats.get('warnings_count', len(result.warnings))}")
    return "\n".join(lines)


def _record_invalid_product(result: CohortGroupingResult, product: ProductRecord, warning: str) -> None:
    result.warnings.append(warning)
    result.invalid_products.append(product)


def _build_statistics(
    *,
    total_products: int,
    valid_products: int,
    invalid_products: int,
    cohorts: dict[str, list[ProductRecord]],
    warnings_count: int,
    skipped_small_cohorts: int,
    split_cohorts: int,
    largest_raw_cohort_size: int,
) -> dict[str, object]:
    cohort_sizes = [len(group) for group in cohorts.values()]
    cohort_count = len(cohorts)
    grouped_products = sum(cohort_sizes)

    prefix_counts: dict[str, int] = {}
    for key, group in cohorts.items():
        prefix_counts[key] = len(group)

    return {
        "total_products": total_products,
        "valid_products": valid_products,
        "invalid_products": invalid_products,
        "grouped_products": grouped_products,
        "ungrouped_products": total_products - grouped_products,
        "cohort_count": cohort_count,
        "avg_cohort_size": grouped_products / cohort_count if cohort_count else 0.0,
        "min_cohort_size": min(cohort_sizes) if cohort_sizes else 0,
        "max_cohort_size": max(cohort_sizes) if cohort_sizes else 0,
        "largest_raw_cohort_size": largest_raw_cohort_size,
        "warnings_count": warnings_count,
        "skipped_small_cohorts": skipped_small_cohorts,
        "split_cohorts": split_cohorts,
        "cohort_sizes": prefix_counts,
    }
