"""Batch testing commands for the BayState scraper CLI."""

from __future__ import annotations

import asyncio
from dataclasses import asdict
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import time
from typing import cast

import click
from core.api_client import JobConfig as RunnerJobConfig
from core.api_client import ScraperAPIClient
from core.api_client import ScraperConfig as RunnerScraperConfig
from runner import run_job
from utils.debugging.config_validator import format_local_validation_payload
from utils.logging_handlers import JobLoggingSession
from utils.structured_logging import setup_structured_logging

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

from .common import (
    load_scraper_config,
    normalize_sku_list,
    project_root,
    resolve_config_path,
    slugify,
    validate_scraper_config,
    write_json,
)

logger = logging.getLogger(__name__)


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

def _select_products(
    *,
    config: ScraperConfig,
    product_line: str | None,
    upc_prefix: str | None,
    limit: int,
) -> tuple[list[ProductRecord], int]:
    selected_skus = normalize_sku_list(config.test_skus)
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
    output_dir = project_root() / ".artifacts" / "batch-tests"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    label = product_line or upc_prefix or "test-skus"
    return output_dir / f"{slugify(scraper)}_{slugify(label)}_{timestamp}.json"


def _write_report(output_path: Path, report: object) -> None:
    write_json(output_path, report)


def _runner_scraper_config_from_local(config: ScraperConfig) -> RunnerScraperConfig:
    return RunnerScraperConfig(
        name=config.name,
        display_name=getattr(config, "display_name", None),
        base_url=config.base_url,
        search_url_template=getattr(config, "search_url_template", None),
        selectors=[
            selector.model_dump() if hasattr(selector, "model_dump") else selector
            for selector in config.selectors
        ],
        options={
            "workflows": [
                workflow.model_dump() if hasattr(workflow, "model_dump") else workflow
                for workflow in config.workflows
            ],
            "timeout": config.timeout,
            "use_stealth": config.use_stealth,
        },
        test_skus=list(config.test_skus) if config.test_skus else [],
        retries=config.retries if config.retries is not None else 2,
        validation=config.validation.model_dump() if hasattr(getattr(config, "validation", None), "model_dump") else getattr(config, "validation", None),
        login=config.login.model_dump() if hasattr(getattr(config, "login", None), "model_dump") else getattr(config, "login", None),
        credential_refs=list(config.credential_refs) if config.credential_refs else [],
    )


def _run_local_batch_through_runner(
    *,
    config: ScraperConfig,
    skus: list[str],
    debug: bool,
    no_headless: bool,
) -> dict[str, object]:
    setup_structured_logging(debug=debug)
    os_environ = __import__("os").environ
    os_environ["USE_YAML_CONFIGS"] = "true"

    credential_client = ScraperAPIClient(
        api_url=os_environ.get("SCRAPER_API_URL"),
        api_key=os_environ.get("SCRAPER_API_KEY", ""),
        runner_name="bsr-batch",
    )

    from runner import settings

    settings.browser_settings["headless"] = not no_headless
    job_id = f"batch_local_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    job_config = RunnerJobConfig(
        job_id=job_id,
        skus=skus,
        scrapers=[_runner_scraper_config_from_local(config)],
        test_mode=True,
        max_workers=1,
    )

    with JobLoggingSession(
        job_id=job_id,
        runner_name="bsr-batch",
        api_client=credential_client,
    ) as job_logging:
        logger.info(
            "Starting local batch runner execution",
            extra={
                "job_id": job_id,
                "runner_name": "bsr-batch",
                "scraper_name": config.name,
                "phase": "starting",
                "details": {
                    "sku_count": len(skus),
                    "headless": not no_headless,
                },
                "flush_immediately": True,
            },
        )
        return cast(
            dict[str, object],
            run_job(
                job_config,
                runner_name="bsr-batch",
                api_client=credential_client,
                job_logging=job_logging,
            ),
        )


def _cohort_results_from_runner_payload(
    *,
    runner_results: dict[str, object],
    products: list[ProductRecord],
) -> dict[str, CohortJobResult]:
    raw_data = runner_results.get("data")
    runner_data = cast(dict[str, object], raw_data) if isinstance(raw_data, dict) else {}
    raw_logs = runner_results.get("logs")
    runner_logs = cast(list[dict[str, object]], raw_logs) if isinstance(raw_logs, list) else []
    processed: dict[str, CohortJobResult] = {}

    def extract_runner_error(sku: str, scraper_name: str) -> str:
        for entry in runner_logs:
            if not isinstance(entry, dict):
                continue
            if str(entry.get("sku") or "") != sku:
                continue
            if str(entry.get("level") or "").lower() not in {"error", "critical", "warning"}:
                continue

            message = str(entry.get("message") or "").strip()
            if not message:
                continue
            prefix = f"{scraper_name}/{sku}: "
            if prefix.strip() and message.startswith(prefix):
                message = message[len(prefix) :]

            separator = " - "
            if separator in message:
                left, right = message.split(separator, 1)
                if left.endswith("Error"):
                    return right.strip()
            return message

        return "Local runner returned no data"

    for product in products:
        sku = str(product.get("sku") or "")
        sku_payload = runner_data.get(sku)
        scraper_payload: dict[str, object] | None = None
        if isinstance(sku_payload, dict):
            payload_dict = cast(dict[str, object], sku_payload)
            if payload_dict:
                first_key = next(iter(payload_dict.keys()))
                first_payload = payload_dict.get(first_key)
                if isinstance(first_payload, dict):
                    normalized = dict(cast(dict[str, object], first_payload))
                    normalized.setdefault("success", "error" not in normalized)
                    extracted_results = {
                        key: value
                        for key, value in normalized.items()
                        if key not in {"success", "error", "cost_usd", "scraped_at", "logs", "telemetry"}
                    }
                    normalized.setdefault("results", extracted_results)
                    scraper_payload = normalized

        if scraper_payload and scraper_payload.get("success") is not False:
            status = "success"
            products_succeeded = 1
            products_failed = 0
            errors: list[str] = []
            result_payload: dict[str, object] = {sku: scraper_payload}
        else:
            status = "failed"
            products_succeeded = 0
            products_failed = 1
            error_message = str((scraper_payload or {}).get("error") or extract_runner_error(sku, str(product.get("scraper") or "")))
            errors = [f"{sku}: {error_message}"]
            result_payload = {
                sku: {
                    "success": False,
                    "error": error_message,
                }
            }

        processed[sku] = CohortJobResult(
            cohort_id=sku,
            status=status,
            products_processed=1,
            products_succeeded=products_succeeded,
            products_failed=products_failed,
            results=result_payload,
            errors=errors,
            metadata={
                "processing_mode": "individual",
                "product_skus": [sku],
                "runner_logs": runner_logs,
            },
        )

    return processed


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


@click.command(name="validate")
@click.option("--scraper", help="Scraper config name")
@click.option("--config", type=click.Path(path_type=Path), required=True, help="Path to a local scraper config file")
@click.option("--strict", is_flag=True, help="Treat warnings as errors")
def validate_batch_command(
    scraper: str | None,
    config: Path,
    strict: bool,
) -> None:
    """Lint and preflight-check a local scraper config without executing it."""

    resolved_config_path = resolve_config_path(scraper or config.stem, str(config))
    payload, is_valid = validate_scraper_config(resolved_config_path, strict=strict)
    click.echo(format_local_validation_payload(payload))
    click.echo()
    click.echo(json.dumps(payload, indent=2))
    if not is_valid:
        raise click.ClickException("Config validation failed")


@click.command(name="test")
@click.option("--product-line", "product_line", help="Product line label for this batch test run")
@click.option("--scraper", required=True, help="Scraper config name")
@click.option("--upc-prefix", help="UPC prefix filter for selecting a cohort from test_skus")
@click.option("--limit", default=10, show_default=True, type=click.IntRange(min=1), help="Max products to test")
@click.option("--output", type=click.Path(path_type=Path), help="Output file for the full batch test report")
@click.option("--config", type=click.Path(path_type=Path), help="Path to a local scraper config file")
@click.option("--validate", "validate_before_run", is_flag=True, help="Validate config before execution and print actionable output")
@click.option("--strict-validate", is_flag=True, help="Treat validation warnings as errors")
@click.option("--sku", help="Comma-separated list of SKUs to run instead of test_skus")
@click.option("--debug", is_flag=True, help="Enable debug logging for runner-based local execution")
@click.option("--no-headless", is_flag=True, help="Run local runner batch execution in visible mode")
def test_batch_command(
    product_line: str | None,
    scraper: str,
    upc_prefix: str | None,
    limit: int,
    output: Path | None,
    config: Path | None,
    validate_before_run: bool,
    strict_validate: bool,
    sku: str | None,
    debug: bool,
    no_headless: bool,
) -> None:
    """Test a product batch end-to-end with full local output."""

    resolved_config_path = resolve_config_path(scraper, str(config) if config else None)
    validation_payload, is_valid = validate_scraper_config(
        resolved_config_path,
        strict=strict_validate,
    )
    if validate_before_run or not is_valid:
        click.echo(format_local_validation_payload(validation_payload))
        click.echo()
        click.echo(json.dumps(validation_payload, indent=2))
        click.echo()
    if not is_valid:
        raise click.ClickException("Config validation failed")

    scraper_config = load_scraper_config(resolved_config_path)

    if product_line and not upc_prefix:
        click.secho(
            "Warning: --product-line is used as a report label unless you also pass --upc-prefix.",
            fg="yellow",
        )

    manual_skus = normalize_sku_list(sku.split(",") if sku else None)
    if manual_skus:
        selected_products: list[ProductRecord] = [
            {
                "sku": selected_sku,
                "product_line": product_line or f"{scraper_config.name}-batch",
                "product_name": f"{(product_line or scraper_config.name)} {index + 1}",
                "scraper": scraper_config.name,
            }
            for index, selected_sku in enumerate(manual_skus[:limit])
        ]
        products = selected_products
        available_count = len(manual_skus)
    else:
        products, available_count = _select_products(
            config=scraper_config,
            product_line=product_line,
            upc_prefix=upc_prefix,
            limit=limit,
        )
    prefix_length = len(upc_prefix) if upc_prefix else 6
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
    if scraper_config.requires_login():
        click.echo("Login-enabled scraper detected; routing through runner local mode for credential fallback and debug logs.")
        runner_results = _run_local_batch_through_runner(
            config=scraper_config,
            skus=[str(product["sku"]) for product in products],
            debug=debug,
            no_headless=no_headless,
        )
        processed_results = _cohort_results_from_runner_payload(
            runner_results=runner_results,
            products=products,
        )
    else:
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
    batch_group.add_command(validate_batch_command)
