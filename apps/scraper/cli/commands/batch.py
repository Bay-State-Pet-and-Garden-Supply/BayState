"""Batch testing commands for the BayState scraper CLI."""

from __future__ import annotations

import asyncio
from dataclasses import asdict
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import time
from typing import cast

import click

from scrapers.cohort.grouping import (
    CohortGroupingConfig,
    CohortGroupingResult,
    get_cohort_summary,
    group_products_into_cohorts,
)
from scrapers.cohort.job_processor import BrowserProtocol, CohortJobProcessor, CohortJobResult
from scrapers.cohort.processor import ProductRecord
from scrapers.executor.workflow_executor import WorkflowExecutor
from scrapers.models.config import ScraperConfig
from scrapers.parser.yaml_parser import ScraperConfigParser


class VerboseWorkflowExecutor:
    """Small wrapper that emits CLI progress around workflow execution."""

    def __init__(self, executor: WorkflowExecutor, total_products: int) -> None:
        self._executor: WorkflowExecutor = executor
        self._total_products: int = total_products
        self._processed_products: int = 0
        self.browser: BrowserProtocol | None = cast(BrowserProtocol | None, executor.browser)

    async def initialize(self) -> None:
        click.echo("Initializing shared browser session...")
        await self._executor.initialize()
        self.browser = cast(BrowserProtocol | None, self._executor.browser)

    async def execute_workflow(
        self,
        context: dict[str, object] | None = None,
        quit_browser: bool = True,
    ) -> dict[str, object]:
        self._processed_products += 1
        active_context = context or {}
        sku = str(active_context.get("sku") or "unknown-sku")

        click.echo(f"  [{self._processed_products}/{self._total_products}] Processing {sku}")
        started_at = time.perf_counter()

        try:
            result = cast(
                dict[str, object],
                await self._executor.execute_workflow(context=active_context, quit_browser=quit_browser),
            )
        except Exception as exc:
            duration = time.perf_counter() - started_at
            click.secho(f"    FAILED in {duration:.2f}s: {exc}", fg="red")
            raise

        duration = time.perf_counter() - started_at
        extracted = result.get("results")
        extracted_fields = cast(dict[str, object], extracted) if isinstance(extracted, dict) else {}
        field_count = len(extracted_fields)
        click.secho(f"    OK in {duration:.2f}s ({field_count} fields)", fg="green")
        return result


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _slugify(value: str) -> str:
    sanitized = [character.lower() if character.isalnum() else "-" for character in value.strip()]
    collapsed = "".join(sanitized).strip("-")
    while "--" in collapsed:
        collapsed = collapsed.replace("--", "-")
    return collapsed or "batch-test"


def _resolve_config_path(scraper: str, config: str | None) -> Path:
    if config:
        candidate = Path(config).expanduser()
        if not candidate.exists():
            raise click.ClickException(f"Config file not found: {candidate}")
        return candidate.resolve()

    config_dir = _project_root() / "scrapers" / "configs"
    candidates = [
        config_dir / f"{scraper}.yaml",
        config_dir / f"{scraper.replace('_', '-')}.yaml",
        config_dir / f"{scraper.replace('-', '_')}.yaml",
    ]

    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()

    raise click.ClickException(f"Could not find a local config for scraper '{scraper}'. Pass --config or add scrapers/configs/{scraper}.yaml")


def _load_scraper_config(config_path: Path) -> ScraperConfig:
    os.environ["USE_YAML_CONFIGS"] = "true"
    parser = ScraperConfigParser()

    try:
        return parser.load_from_file(config_path)
    except Exception as exc:
        raise click.ClickException(f"Failed to load scraper config from {config_path}: {exc}") from exc


def _normalize_test_skus(config: ScraperConfig) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []

    for raw_sku in config.test_skus or []:
        sku = str(raw_sku).strip()
        if not sku or sku in seen:
            continue
        seen.add(sku)
        normalized.append(sku)

    return normalized


def _select_products(
    *,
    config: ScraperConfig,
    product_line: str | None,
    upc_prefix: str | None,
    limit: int,
) -> tuple[list[ProductRecord], int]:
    selected_skus = _normalize_test_skus(config)
    available_count = len(selected_skus)

    if not selected_skus:
        raise click.ClickException(f"Scraper '{config.name}' has no test_skus configured. Add test_skus to the YAML or pass a different config.")

    if upc_prefix:
        prefix = upc_prefix.strip()
        if not prefix.isdigit():
            raise click.ClickException("--upc-prefix must contain only digits")
        selected_skus = [sku for sku in selected_skus if sku.startswith(prefix)]

    if not selected_skus:
        prefix_details = f" with UPC prefix '{upc_prefix}'" if upc_prefix else ""
        raise click.ClickException(f"No test SKUs matched scraper '{config.name}'{prefix_details}.")

    limited_skus = selected_skus[:limit]
    line_name = product_line or (upc_prefix or f"{config.name}-batch")
    products: list[ProductRecord] = [
        {
            "sku": sku,
            "product_line": line_name,
            "product_name": f"{line_name} {index + 1}",
            "scraper": config.name,
        }
        for index, sku in enumerate(limited_skus)
    ]
    return products, available_count


def _serialize_grouping(result: CohortGroupingResult) -> dict[str, object]:
    return {
        "statistics": result.statistics,
        "warnings": result.warnings,
        "invalid_products": [dict(product) for product in result.invalid_products],
        "cohorts": {cohort_key: [dict(product) for product in products] for cohort_key, products in result.cohorts.items()},
    }


def _serialize_results(results: dict[str, CohortJobResult]) -> dict[str, object]:
    return {batch_key: asdict(batch_result) for batch_key, batch_result in results.items()}


def _build_summary(results: dict[str, CohortJobResult]) -> dict[str, int]:
    products_processed = sum(result.products_processed for result in results.values())
    products_succeeded = sum(result.products_succeeded for result in results.values())
    products_failed = sum(result.products_failed for result in results.values())

    return {
        "batches_processed": len(results),
        "products_processed": products_processed,
        "products_succeeded": products_succeeded,
        "products_failed": products_failed,
        "successful_batches": sum(1 for result in results.values() if result.status == "success"),
        "partial_batches": sum(1 for result in results.values() if result.status == "partial"),
        "failed_batches": sum(1 for result in results.values() if result.status == "failed"),
    }


def _default_output_path(scraper: str, product_line: str | None, upc_prefix: str | None) -> Path:
    output_dir = _project_root() / ".artifacts" / "batch-tests"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    label = product_line or upc_prefix or "test-skus"
    return output_dir / f"{_slugify(scraper)}_{_slugify(label)}_{timestamp}.json"


def _write_report(output_path: Path, report: object) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _ = output_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")


def _print_grouping_details(grouping_result: CohortGroupingResult) -> None:
    click.echo()
    click.echo(get_cohort_summary(grouping_result))

    for cohort_key, products in grouping_result.cohorts.items():
        skus = ", ".join(str(product.get("sku") or "unknown") for product in products)
        click.echo(f"  - {cohort_key}: {skus}")

    if grouping_result.warnings:
        click.echo()
        click.secho("Grouping warnings:", fg="yellow")
        for warning in grouping_result.warnings:
            click.echo(f"  - {warning}")


def _print_result_details(results: dict[str, CohortJobResult]) -> None:
    click.echo()
    click.secho("Batch results:", bold=True)

    for cohort_key, result in results.items():
        status_color = "green" if result.status == "success" else "yellow" if result.status == "partial" else "red"
        click.secho(
            f"- {cohort_key} [{result.status}] {result.products_succeeded}/{result.products_processed} succeeded",
            fg=status_color,
        )

        for sku, payload in result.results.items():
            payload_dict = cast(dict[str, object], payload) if isinstance(payload, dict) else None

            if payload_dict and payload_dict.get("success") is False:
                error_message = str(payload_dict.get("error") or "unknown error")
                click.secho(f"    {sku}: FAILED - {error_message}", fg="red")
                continue

            extracted = payload_dict.get("results") if payload_dict else None
            extracted_fields = sorted(cast(dict[str, object], extracted).keys()) if isinstance(extracted, dict) else []
            preview = ", ".join(extracted_fields[:5]) if extracted_fields else "no extracted fields"
            click.echo(f"    {sku}: OK ({preview})")


async def _process_batch(
    *,
    config: ScraperConfig,
    products: list[ProductRecord],
    prefix_length: int,
) -> dict[str, CohortJobResult]:
    executor = WorkflowExecutor(
        config,
        headless=True,
        timeout=config.timeout,
        worker_id="cli-batch-test",
        debug_mode=False,
    )
    verbose_executor = VerboseWorkflowExecutor(executor, total_products=len(products))
    processor = CohortJobProcessor(
        verbose_executor,
        CohortGroupingConfig(prefix_length=prefix_length, skip_invalid_upcs=False),
    )
    return await processor.process_products(products, {"name": config.name}, mode="auto")


@click.command(name="test")
@click.option("--product-line", "product_line", help="Product line label for this batch test run")
@click.option("--scraper", required=True, help="Scraper config name")
@click.option("--upc-prefix", help="UPC prefix filter for selecting a cohort from test_skus")
@click.option("--limit", default=10, show_default=True, type=click.IntRange(min=1), help="Max products to test")
@click.option("--output", type=click.Path(path_type=Path), help="Output file for the full batch test report")
@click.option("--config", type=click.Path(path_type=Path), help="Path to a local scraper config file")
def test_batch_command(
    product_line: str | None,
    scraper: str,
    upc_prefix: str | None,
    limit: int,
    output: Path | None,
    config: Path | None,
) -> None:
    """Test a product batch end-to-end with full local output."""

    resolved_config_path = _resolve_config_path(scraper, str(config) if config else None)
    scraper_config = _load_scraper_config(resolved_config_path)

    if product_line and not upc_prefix:
        click.secho(
            "Warning: --product-line is used as a report label unless you also pass --upc-prefix.",
            fg="yellow",
        )

    products, available_count = _select_products(
        config=scraper_config,
        product_line=product_line,
        upc_prefix=upc_prefix,
        limit=limit,
    )
    prefix_length = len(upc_prefix) if upc_prefix else 8
    grouping_config = CohortGroupingConfig(prefix_length=prefix_length, skip_invalid_upcs=False)
    grouping_result = group_products_into_cohorts(products, grouping_config)

    click.secho("Batch test setup", bold=True)
    click.echo(f"  Scraper: {scraper_config.name}")
    click.echo(f"  Config: {resolved_config_path}")
    click.echo(f"  Product line: {product_line or 'not specified'}")
    click.echo(f"  UPC prefix: {upc_prefix or 'not specified'}")
    click.echo(f"  Available test SKUs: {available_count}")
    click.echo(f"  Selected products: {len(products)}")

    _print_grouping_details(grouping_result)

    started_at = datetime.now(timezone.utc)
    click.echo()
    click.secho("Running cohort processing...", bold=True)
    processed_results = asyncio.run(_process_batch(config=scraper_config, products=products, prefix_length=prefix_length))
    finished_at = datetime.now(timezone.utc)

    _print_result_details(processed_results)

    summary = _build_summary(processed_results)
    duration_seconds = round((finished_at - started_at).total_seconds(), 2)
    click.echo()
    click.secho("Summary", bold=True)
    click.echo(json.dumps({**summary, "duration_seconds": duration_seconds}, indent=2))

    output_path = output or _default_output_path(scraper_config.name, product_line, upc_prefix)
    report = {
        "batch": {
            "product_line": product_line,
            "scraper": scraper_config.name,
            "upc_prefix": upc_prefix,
            "limit": limit,
            "config_path": str(resolved_config_path),
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": duration_seconds,
        },
        "products": products,
        "grouping": _serialize_grouping(grouping_result),
        "results": _serialize_results(processed_results),
        "summary": summary,
    }
    _write_report(output_path, report)

    click.echo()
    click.secho(f"Full report saved to {output_path.resolve()}", fg="green")


def register_batch_commands(batch_group: click.Group) -> None:
    batch_group.add_command(test_batch_command)
