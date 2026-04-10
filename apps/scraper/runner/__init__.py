from __future__ import annotations

import asyncio
import copy
import logging
import os
from dataclasses import replace
from datetime import datetime, timezone
from collections.abc import Mapping
from typing import Any, Callable, Dict, List, Optional, Tuple

from core.api_client import JobConfig
from core.events import ScraperEvent, create_emitter, event_bus
from core.settings_manager import settings
from scrapers.config.feature_flags import GeminiFeatureFlags
from scrapers.ai_search import AISearchScraper
from scrapers.cohort.processor import CohortProcessor
from scrapers.executor.workflow_executor import WorkflowExecutor
from scrapers.parser import ScraperConfigParser
from scrapers.result_collector import ResultCollector
from scrapers.models.config import ScraperConfig as ScraperConfigModel
from validation.result_quality import sanitize_product_payload
from typing import cast

logger = logging.getLogger(__name__)

USE_COHORT_PROCESSING = os.getenv("USE_COHORT_PROCESSING", "true").lower() == "true"
CohortProduct = Mapping[str, object]


class ConfigurationError(Exception):
    pass


def create_log_entry(level: str, message: str) -> Dict[str, Any]:
    return {
        "level": level,
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


LOG_LEVEL_NUMBERS = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
    "critical": logging.CRITICAL,
}


def _append_result_log(
    log_buffer: list[dict[str, Any]],
    level: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> None:
    entry = create_log_entry(level, message)
    if details:
        entry["details"] = details
    log_buffer.append(entry)


def _emit_runner_log(
    *,
    job_id: str,
    runner_name: str | None,
    job_logging: Any | None,
    log_buffer: list[dict[str, Any]],
    level: str,
    message: str,
    details: dict[str, Any] | None = None,
    scraper_name: str | None = None,
    sku: str | None = None,
    phase: str = "running",
    flush_immediately: bool = False,
) -> None:
    logger.log(
        LOG_LEVEL_NUMBERS[level],
        message,
        extra={
            "job_id": job_id,
            "runner_name": runner_name,
            "scraper_name": scraper_name,
            "sku": sku,
            "phase": phase,
            "details": details,
            "flush_immediately": flush_immediately,
        },
    )

    if job_logging is None:
        _append_result_log(log_buffer, level, message, details)


def _emit_job_progress(
    *,
    job_logging: Any | None,
    status: str,
    progress: int,
    message: str | None,
    phase: str,
    details: dict[str, Any] | None = None,
    current_sku: str | None = None,
    items_processed: int | None = None,
    items_total: int | None = None,
) -> None:
    if job_logging is None:
        return

    job_logging.emit_progress(
        status=status,
        progress=progress,
        message=message,
        phase=phase,
        details=details,
        current_sku=current_sku,
        items_processed=items_processed,
        items_total=items_total,
    )


def _progress_from_units(processed_units: int, total_units: int) -> int:
    if total_units <= 0:
        return 95
    return min(95, 10 + int((processed_units / total_units) * 85))


def _build_data_summary(payload: dict[str, Any]) -> dict[str, Any]:
    images = payload.get("images")
    image_count = len(images) if isinstance(images, list) else 0

    return {
        "title": payload.get("title"),
        "brand": payload.get("brand"),
        "weight": payload.get("weight"),
        "availability": payload.get("availability"),
        "image_count": image_count,
    }


def _normalize_selectors_payload(raw_selectors: Any) -> list[dict[str, Any]]:
    """Normalize API selectors payload into list format expected by ScraperConfig."""
    if isinstance(raw_selectors, list):
        return raw_selectors

    # API can return an empty object for "no selectors" in some paths.
    if raw_selectors is None or raw_selectors == {}:
        return []

    # Backward-compat for legacy dict format: {"Field": {"selector": "..."}}
    if isinstance(raw_selectors, dict):
        normalized: list[dict[str, Any]] = []
        for field_name, field_config in raw_selectors.items():
            if not isinstance(field_config, dict):
                continue
            item = dict(field_config)
            if "name" not in item and isinstance(field_name, str):
                item["name"] = field_name
            normalized.append(item)
        return normalized

    return []


def _build_telemetry_from_events(events: list[ScraperEvent]) -> Dict[str, Any]:
    steps_by_index: dict[int, dict[str, Any]] = {}
    selectors: list[dict[str, Any]] = []
    extractions: list[dict[str, Any]] = []

    for event in events:
        event_type = event.event_type.value
        data = event.data or {}

        if event_type in {"step.started", "step.completed", "step.failed", "step.skipped"}:
            raw_step_data = data.get("step")
            step_data: dict[str, Any] = raw_step_data if isinstance(raw_step_data, dict) else {}
            raw_timing_data = data.get("timing")
            timing_data: dict[str, Any] = raw_timing_data if isinstance(raw_timing_data, dict) else {}
            index = step_data.get("index")
            if not isinstance(index, int):
                continue

            existing = steps_by_index.get(
                index,
                {
                    "step_index": index,
                    "action_type": str(step_data.get("action") or "unknown"),
                    "status": "pending",
                    "extracted_data": {},
                },
            )

            action_value = step_data.get("action")
            if isinstance(action_value, str):
                existing["action_type"] = action_value

            if event_type == "step.started":
                existing["status"] = "running"
                started_at = timing_data.get("started_at")
                if isinstance(started_at, str):
                    existing["started_at"] = started_at
                elif isinstance(event.timestamp, str):
                    existing["started_at"] = event.timestamp
            elif event_type == "step.completed":
                existing["status"] = "completed"
                started_at = timing_data.get("started_at")
                completed_at = timing_data.get("completed_at")
                duration_ms = timing_data.get("duration_ms")
                if isinstance(started_at, str):
                    existing["started_at"] = started_at
                if isinstance(completed_at, str):
                    existing["completed_at"] = completed_at
                if isinstance(duration_ms, int):
                    existing["duration_ms"] = duration_ms
                raw_extraction_payload = data.get("extraction")
                extraction_payload: dict[str, Any] = raw_extraction_payload if isinstance(raw_extraction_payload, dict) else {}
                if extraction_payload:
                    existing["extracted_data"] = extraction_payload
                existing["sku"] = data.get("sku")
            elif event_type == "step.failed":
                existing["status"] = "failed"
                started_at = timing_data.get("started_at")
                completed_at = timing_data.get("completed_at")
                duration_ms = timing_data.get("duration_ms")
                if isinstance(started_at, str):
                    existing["started_at"] = started_at
                if isinstance(completed_at, str):
                    existing["completed_at"] = completed_at
                if isinstance(duration_ms, int):
                    existing["duration_ms"] = duration_ms
                raw_error_payload = data.get("error")
                error_payload: dict[str, Any] = raw_error_payload if isinstance(raw_error_payload, dict) else {}
                if isinstance(error_payload.get("message"), str):
                    existing["error_message"] = str(error_payload.get("message"))
                existing["sku"] = data.get("sku")
            elif event_type == "step.skipped":
                existing["status"] = "skipped"
                reason = data.get("reason")
                if isinstance(reason, str):
                    existing["error_message"] = reason
                existing["sku"] = data.get("sku")

            steps_by_index[index] = existing
            continue

        if event_type == "selector.resolved":
            raw_selector_payload = data.get("selector")
            selector_payload: dict[str, Any] = raw_selector_payload if isinstance(raw_selector_payload, dict) else {}
            found = selector_payload.get("found") is True
            status = "FOUND" if found else "MISSING"
            if isinstance(selector_payload.get("error"), str):
                status = "ERROR"

            selectors.append(
                {
                    "sku": data.get("sku") if isinstance(data.get("sku"), str) else "",
                    "selector_name": str(selector_payload.get("name") or "unknown"),
                    "selector_value": str(selector_payload.get("value") or ""),
                    "status": status,
                    "error_message": selector_payload.get("error") if isinstance(selector_payload.get("error"), str) else None,
                    "duration_ms": None,
                }
            )
            continue

        if event_type == "extraction.completed":
            raw_extraction_payload = data.get("extraction")
            extraction_payload: dict[str, Any] = raw_extraction_payload if isinstance(raw_extraction_payload, dict) else {}
            status = str(extraction_payload.get("status") or "SUCCESS")
            field_value = extraction_payload.get("value")
            extractions.append(
                {
                    "sku": data.get("sku") if isinstance(data.get("sku"), str) else "",
                    "field_name": str(extraction_payload.get("field_name") or "unknown"),
                    "field_value": str(field_value) if field_value is not None else None,
                    "status": status,
                    "error_message": extraction_payload.get("error") if isinstance(extraction_payload.get("error"), str) else None,
                    "duration_ms": None,
                }
            )

    ordered_steps = [steps_by_index[idx] for idx in sorted(steps_by_index.keys())]
    return {
        "steps": ordered_steps,
        "selectors": selectors,
        "extractions": extractions,
    }


def _job_requests_cohort_processing(job_config: JobConfig) -> bool:
    job_payload = job_config.job_config if isinstance(job_config.job_config, dict) else {}

    if isinstance(getattr(job_config, "is_cohort_batch", None), bool):
        return bool(getattr(job_config, "is_cohort_batch"))

    raw_flag = job_payload.get("is_cohort_batch")
    if isinstance(raw_flag, bool):
        return raw_flag
    if isinstance(raw_flag, str):
        return raw_flag.strip().lower() in {"1", "true", "yes", "on"}

    return job_config.job_type in {"cohort", "cohort_batch"}


def _get_cohort_products(job_config: JobConfig) -> list[CohortProduct]:
    raw_products = getattr(job_config, "products", None)
    if not isinstance(raw_products, list):
        job_payload = job_config.job_config if isinstance(job_config.job_config, dict) else {}
        raw_products = job_payload.get("products")

    if not isinstance(raw_products, list):
        return []

    return [product for product in raw_products if isinstance(product, dict)]


def _build_cohort_processor(job_config: JobConfig) -> CohortProcessor:
    job_payload = job_config.job_config if isinstance(job_config.job_config, dict) else {}
    prefix_length = job_payload.get("cohort_prefix_length", job_payload.get("prefix_length", 8))
    if not isinstance(prefix_length, int):
        try:
            prefix_length = int(prefix_length)
        except (TypeError, ValueError):
            prefix_length = 8

    return CohortProcessor(
        grouping_strategy=str(job_payload.get("cohort_grouping_strategy", job_payload.get("grouping_strategy", "upc_prefix")) or "upc_prefix"),
        prefix_length=prefix_length,
        upc_field=str(job_payload.get("cohort_upc_field", job_payload.get("upc_field", "sku")) or "sku"),
        brand_field=str(job_payload.get("cohort_brand_field", job_payload.get("brand_field", "brand")) or "brand"),
        name_field=str(job_payload.get("cohort_name_field", job_payload.get("name_field", "product_name")) or "product_name"),
    )


def _get_product_sku(product: CohortProduct) -> str | None:
    for key in ("sku", "SKU", "upc", "UPC", "item_number", "itemNumber"):
        value = product.get(key)
        if value is None:
            continue
        sku = str(value).strip()
        if sku:
            return sku
    return None


def _select_cohort_representatives(
    cohort_processor: CohortProcessor,
    products: list[CohortProduct],
) -> tuple[dict[str, list[CohortProduct]], dict[str, CohortProduct], list[str]]:
    grouped_products = cohort_processor.group_products(products)
    representatives: dict[str, CohortProduct] = {}
    representative_skus: list[str] = []

    for cohort_key, cohort_products in grouped_products.items():
        representative = next((product for product in cohort_products if _get_product_sku(product)), cohort_products[0] if cohort_products else None)
        representative_sku = _get_product_sku(representative) if representative else None
        if representative is None or representative_sku is None:
            continue

        representatives[cohort_key] = representative
        if representative_sku not in representative_skus:
            representative_skus.append(representative_sku)

    valid_grouped_products = {cohort_key: grouped_products[cohort_key] for cohort_key in representatives}
    return valid_grouped_products, representatives, representative_skus


def _expand_cohort_results(
    sequential_results: Dict[str, Any],
    cohort_processor: CohortProcessor,
    grouped_products: dict[str, list[CohortProduct]],
    representatives: dict[str, CohortProduct],
) -> Dict[str, Any]:
    expanded_results = copy.deepcopy(sequential_results)
    expanded_data = expanded_results.setdefault("data", {})
    cohort_results: dict[str, Any] = {}

    for cohort_key, cohort_products in grouped_products.items():
        representative = representatives[cohort_key]
        representative_sku = _get_product_sku(representative)
        representative_data = expanded_data.get(representative_sku, {}) if representative_sku else {}
        if not isinstance(representative_data, dict):
            representative_data = {}
        cohort_status = "completed" if representative_data else "missing"

        cohort_results[cohort_key] = {
            "status": cohort_status,
            "representative_sku": representative_sku,
            "product_count": len(cohort_products),
            "metadata": cohort_processor.get_cohort_metadata(cohort_key, cohort_products),
            "products": cohort_products,
            "result": representative_data,
        }

        for product in cohort_products:
            product_sku = _get_product_sku(product)
            if product_sku is None or product_sku in expanded_data:
                continue
            expanded_data[product_sku] = copy.deepcopy(representative_data)

    expanded_results["cohort_processing"] = True
    expanded_results["cohorts_processed"] = len(cohort_results)
    expanded_results["cohort_results"] = cohort_results
    return expanded_results


def run_job(
    job_config: JobConfig,
    runner_name: Optional[str] = None,
    log_buffer: Optional[List[Dict[str, Any]]] = None,
    progress_callback: Optional[Callable[[str, str, dict[str, Any]], bool]] = None,
    api_client: Optional[Any] = None,
    job_logging: Optional[Any] = None,
) -> Dict[str, Any]:
    if USE_COHORT_PROCESSING and _job_requests_cohort_processing(job_config):
        return _run_cohort_job(
            job_config,
            runner_name=runner_name,
            log_buffer=log_buffer,
            progress_callback=progress_callback,
            api_client=api_client,
            job_logging=job_logging,
        )

    return _run_sequential_job(
        job_config,
        runner_name=runner_name,
        log_buffer=log_buffer,
        progress_callback=progress_callback,
        api_client=api_client,
        job_logging=job_logging,
    )


def _run_cohort_job(
    job_config: JobConfig,
    runner_name: Optional[str] = None,
    log_buffer: Optional[List[Dict[str, Any]]] = None,
    progress_callback: Optional[Callable[[str, str, dict[str, Any]], bool]] = None,
    api_client: Optional[Any] = None,
    job_logging: Optional[Any] = None,
) -> Dict[str, Any]:
    products = _get_cohort_products(job_config)
    if not products:
        logger.warning("Cohort processing requested without products; falling back to sequential mode", extra={"job_id": job_config.job_id})
        return _run_sequential_job(
            job_config,
            runner_name=runner_name,
            log_buffer=log_buffer,
            progress_callback=progress_callback,
            api_client=api_client,
            job_logging=job_logging,
        )

    cohort_processor = _build_cohort_processor(job_config)
    grouped_products, representatives, representative_skus = _select_cohort_representatives(cohort_processor, products)
    if not representative_skus:
        logger.warning("Cohort processing could not determine representative SKUs; falling back to sequential mode", extra={"job_id": job_config.job_id})
        return _run_sequential_job(
            job_config,
            runner_name=runner_name,
            log_buffer=log_buffer,
            progress_callback=progress_callback,
            api_client=api_client,
            job_logging=job_logging,
        )

    cohort_job_config = replace(job_config, skus=representative_skus)
    sequential_results = _run_sequential_job(
        cohort_job_config,
        runner_name=runner_name,
        log_buffer=log_buffer,
        progress_callback=progress_callback,
        api_client=api_client,
        job_logging=job_logging,
    )
    return _expand_cohort_results(sequential_results, cohort_processor, grouped_products, representatives)


def _run_sequential_job(
    job_config: JobConfig,
    runner_name: Optional[str] = None,
    log_buffer: Optional[List[Dict[str, Any]]] = None,
    progress_callback: Optional[Callable[[str, str, dict[str, Any]], bool]] = None,
    api_client: Optional[Any] = None,
    job_logging: Optional[Any] = None,
) -> Dict[str, Any]:
    """Execute a scrape job.

    Args:
        job_config: The job configuration
        runner_name: Optional name of the runner
        log_buffer: Optional list to collect log entries
        progress_callback: Optional callback function called after each SKU is processed.
                          Signature: callback(sku: str, scraper_name: str, data: dict) -> bool
                          Should return True if progress was saved successfully.
        api_client: Optional ScraperAPIClient for fetching credentials

    Returns:
        Dictionary with job results
    """
    job_id = job_config.job_id
    emitter = create_emitter(job_id)
    parser = ScraperConfigParser()
    collector = ResultCollector(test_mode=job_config.test_mode)

    results: Dict[str, Any] = {
        "skus_processed": 0,
        "scrapers_run": [],
        "data": {},
    }

    if log_buffer is None:
        log_buffer = []

    initial_details = {
        "declared_sku_count": len(job_config.skus),
        "declared_scraper_count": len(job_config.scrapers),
        "test_mode": job_config.test_mode,
        "max_workers": job_config.max_workers,
    }
    _emit_runner_log(
        job_id=job_id,
        runner_name=runner_name,
        job_logging=job_logging,
        log_buffer=log_buffer,
        level="info",
        message=f"Job {job_id} started",
        details=initial_details,
        phase="starting",
        flush_immediately=True,
    )
    _emit_job_progress(
        job_logging=job_logging,
        status="running",
        progress=0,
        message="Job started",
        phase="starting",
        details=initial_details,
        items_total=len(job_config.skus),
    )

    skus = job_config.skus
    if not skus and job_config.test_mode:
        for scraper in job_config.scrapers:
            if scraper.test_skus:
                skus.extend(scraper.test_skus)
        skus = list(set(skus))
        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="info",
            message=f"Test mode: using {len(skus)} test SKUs from job payload",
            details={"sku_count": len(skus)},
            phase="starting",
        )

    if not skus:
        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="warning",
            message="No SKUs to process",
            phase="starting",
            flush_immediately=True,
        )
        results["logs"] = job_logging.snapshot() if job_logging else log_buffer
        results["telemetry"] = {"steps": [], "selectors": [], "extractions": []}
        return results

    is_ai_search_job = job_config.job_type in {"ai_search", "discovery", "crawl4ai"} or any(
        s.name in {"ai_search", "ai_discovery", "crawl4ai_discovery"} for s in job_config.scrapers
    )

    if is_ai_search_job:
        return _run_ai_search_job(
            job_config,
            skus,
            results,
            log_buffer,
            runner_name=runner_name,
            job_logging=job_logging,
        )

    configs: list[Any] = []
    config_errors: list[tuple[str, str]] = []

    for scraper_cfg in job_config.scrapers:
        try:
            options = scraper_cfg.options or {}

            # The coordinator API puts 'workflows' inside the 'options' object.
            # We map it to the root level expected by ScraperConfigModel.
            config_dict = {
                "name": scraper_cfg.name,
                "base_url": scraper_cfg.base_url,
                "search_url_template": scraper_cfg.search_url_template,
                "selectors": _normalize_selectors_payload(scraper_cfg.selectors),
                "workflows": options.get("workflows", []),
                "timeout": options.get("timeout", getattr(scraper_cfg, "timeout", 30)),
                "use_stealth": options.get("use_stealth", True),
                "test_skus": scraper_cfg.test_skus if scraper_cfg.test_skus is not None else [],
                "retries": getattr(scraper_cfg, "retries", 3),
                "validation": getattr(scraper_cfg, "validation", None),
                "login": getattr(scraper_cfg, "login", None),
                "credential_refs": getattr(scraper_cfg, "credential_refs", []) or [],
            }

            config = cast(ScraperConfigModel, parser.load_from_dict(config_dict))
            configs.append(config)
            cfg_name = getattr(config, "name", "unknown")
            credential_refs = getattr(config, "credential_refs", []) or []
            _emit_runner_log(
                job_id=job_id,
                runner_name=runner_name,
                job_logging=job_logging,
                log_buffer=log_buffer,
                level="info",
                message=f"Loaded scraper config: {cfg_name}",
                details={
                    "credential_refs": credential_refs,
                    "workflow_count": len(config_dict["workflows"]) if isinstance(config_dict["workflows"], list) else 0,
                    "use_stealth": config_dict["use_stealth"],
                },
                scraper_name=cfg_name,
                phase="configuring",
            )
        except Exception as e:
            config_errors.append((scraper_cfg.name, str(e)))
            _emit_runner_log(
                job_id=job_id,
                runner_name=runner_name,
                job_logging=job_logging,
                log_buffer=log_buffer,
                level="error",
                message=f"Failed to parse config for {scraper_cfg.name}: {e}",
                details={"error_type": type(e).__name__},
                scraper_name=scraper_cfg.name,
                phase="configuring",
                flush_immediately=True,
            )

    if config_errors:
        error_details = "; ".join([f"{name}: {err}" for name, err in config_errors])
        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="error",
            message=f"Configuration parsing failed for {len(config_errors)} scraper(s): {error_details}",
            details={"config_errors": config_errors},
            phase="configuring",
            flush_immediately=True,
        )
        raise ConfigurationError(f"[Runner] Configuration parsing failed for {len(config_errors)} scraper(s): {error_details}")

    if not configs:
        if not job_config.scrapers:
            error_msg = "No scrapers specified in job configuration (missing chunks?)"
        else:
            error_msg = f"No valid scraper configurations after filtering. Original scrapers: {[s.name for s in job_config.scrapers]}"
        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="error",
            message=error_msg,
            phase="configuring",
            flush_immediately=True,
        )
        raise ConfigurationError(f"[Runner] {error_msg}")

    total_work_units = max(1, len(skus) * max(1, len(configs)))
    processed_work_units = 0

    _emit_job_progress(
        job_logging=job_logging,
        status="running",
        progress=5,
        message="Configuration loaded",
        phase="configuring",
        details={"scrapers": [getattr(config, "name", "unknown") for config in configs]},
        items_processed=0,
        items_total=total_work_units,
    )

    for config in configs:
        cfg_name = getattr(config, "name", "unknown")
        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="info",
            message=f"Starting scraper: {cfg_name}",
            details={"sku_count": len(skus)},
            scraper_name=cfg_name,
            phase="scraper-start",
            flush_immediately=True,
        )
        results["scrapers_run"].append(cfg_name)

        executor = None
        scraper_processed_units = 0
        scraper_failed_units = 0
        try:
            headless = settings.browser_settings["headless"]
            if not headless:
                _emit_runner_log(
                    job_id=job_id,
                    runner_name=runner_name,
                    job_logging=job_logging,
                    log_buffer=log_buffer,
                    level="warning",
                    message="Running in VISIBLE mode - browser will be visible",
                    scraper_name=cfg_name,
                    phase="scraper-start",
                )

            executor = WorkflowExecutor(
                config,
                headless=headless,
                timeout=30,
                worker_id="API",
                debug_mode=False,
                job_id=job_id,
                event_emitter=emitter,
                api_client=api_client,
            )

            # Run all async operations in a single event loop to properly manage
            # Playwright browser subprocess lifecycle
            async def run_all_scrapes() -> List[Tuple[str, Any]]:
                if executor is None:
                    return []
                scrape_results = []
                try:
                    await executor.initialize()
                    for sku in skus:
                        _emit_runner_log(
                            job_id=job_id,
                            runner_name=runner_name,
                            job_logging=job_logging,
                            log_buffer=log_buffer,
                            level="info",
                            message=f"{cfg_name}/{sku}: Processing",
                            scraper_name=cfg_name,
                            sku=sku,
                            phase="scraping",
                        )
                        _emit_job_progress(
                            job_logging=job_logging,
                            status="running",
                            progress=_progress_from_units(processed_work_units, total_work_units),
                            message=f"Processing {cfg_name}/{sku}",
                            phase="scraping",
                            details={"scraper_name": cfg_name},
                            current_sku=sku,
                            items_processed=processed_work_units,
                            items_total=total_work_units,
                        )
                        try:
                            result = await executor.execute_workflow(
                                context={"sku": sku, "test_mode": job_config.test_mode},
                                quit_browser=False,
                            )
                            scrape_results.append((sku, result))
                        except Exception as e:
                            _emit_runner_log(
                                job_id=job_id,
                                runner_name=runner_name,
                                job_logging=job_logging,
                                log_buffer=log_buffer,
                                level="error",
                                message=f"{cfg_name}/{sku}: {type(e).__name__} - {e}",
                                details={"error_type": type(e).__name__},
                                scraper_name=cfg_name,
                                sku=sku,
                                phase="scraping",
                                flush_immediately=True,
                            )
                            scrape_results.append((sku, None))
                finally:
                    # Ensure browser is properly quit inside the async context
                    if executor.browser:
                        try:
                            await executor.browser.quit()
                        except Exception as e:
                            logger.debug(f"Browser quit error: {e}")
                return scrape_results

            scrape_results = asyncio.run(run_all_scrapes())

            # Process results after async loop completes
            for sku, result in scrape_results:
                processed_work_units += 1
                scraper_processed_units += 1

                if result is None:
                    scraper_failed_units += 1
                    _emit_job_progress(
                        job_logging=job_logging,
                        status="running",
                        progress=_progress_from_units(processed_work_units, total_work_units),
                        message=f"Failed while processing {cfg_name}/{sku}",
                        phase="scraping",
                        details={"scraper_name": cfg_name},
                        current_sku=sku,
                        items_processed=processed_work_units,
                        items_total=total_work_units,
                    )
                    continue

                results["skus_processed"] += 1

                if result.get("success"):
                    extracted_data = result.get("results", {})

                    if extracted_data.get("product_name") and not extracted_data.get("Name"):
                        extracted_data["Name"] = extracted_data.pop("product_name")
                    if extracted_data.get("price") and not extracted_data.get("Price"):
                        extracted_data["Price"] = extracted_data.pop("price")
                    if extracted_data.get("brand") and not extracted_data.get("Brand"):
                        extracted_data["Brand"] = extracted_data.pop("brand")
                    if extracted_data.get("description") and not extracted_data.get("Description"):
                        extracted_data["Description"] = extracted_data.pop("description")
                    if extracted_data.get("image_url") and not extracted_data.get("Images"):
                        extracted_data["Images"] = [extracted_data.pop("image_url")]
                    if extracted_data.get("availability") and not extracted_data.get("Availability"):
                        extracted_data["Availability"] = extracted_data.pop("availability")
                    has_data = any(extracted_data.get(field) for field in ["Name", "Brand", "Weight"])

                    if has_data:
                        if sku not in results["data"]:
                            results["data"][sku] = {}

                        # Handle both "Images" and "Image URLs" field names
                        # (scraper configs use "Image URLs" as the selector name)
                        images = extracted_data.get("Images") or extracted_data.get("Image URLs") or extracted_data.get("Image_URLs") or []

                        # Capture the product page URL from the browser if not
                        # explicitly extracted by a "URL" selector
                        page_url = extracted_data.get("URL")
                        if not page_url and executor and executor.browser:
                            try:
                                page_url = executor.browser.current_url
                            except Exception:
                                pass

                        payload = {
                            # Note: Price is NOT scraped - we use our own pricing
                            "title": extracted_data.get("Name"),
                            "brand": extracted_data.get("Brand"),
                            "weight": extracted_data.get("Weight"),
                            "description": extracted_data.get("Description"),
                            "images": images,
                            "availability": extracted_data.get("Availability"),
                            "category": extracted_data.get("Category"),
                            "item_number": extracted_data.get("ItemNumber")
                            or extracted_data.get("Item Number")
                            or extracted_data.get("BCI Item Number")
                            or extracted_data.get("Product #"),
                            "manufacturer_part_number": extracted_data.get("ManufacturerPartNumber")
                            or extracted_data.get("Manufacturer Part Number")
                            or extracted_data.get("model_number")
                            or extracted_data.get("ModelNumber")
                            or extracted_data.get("Model Number")
                            or extracted_data.get("Mfg#")
                            or extracted_data.get("Mfg Part #")
                            or extracted_data.get("Manufacturer #")
                            or extracted_data.get("Mfg No")
                            or extracted_data.get("MfgNo"),
                            "unit_of_measure": extracted_data.get("UoM") or extracted_data.get("Unit of Measure"),
                            "upc": extracted_data.get("UPC"),
                            "size": extracted_data.get("Size"),
                            "size_options": extracted_data.get("Size Options") or extracted_data.get("SizeOptions"),
                            "features": extracted_data.get("Features"),
                            "ingredients": extracted_data.get("Ingredients"),
                            "dimensions": extracted_data.get("Dimensions"),
                            "specifications": extracted_data.get("Specifications") or extracted_data.get("Technical Specs"),
                            "case_pack": extracted_data.get("Case Pack"),
                            "ratings": extracted_data.get("Rating"),
                            "reviews_count": extracted_data.get("Reviews"),
                            "url": page_url,
                            "scraped_at": datetime.now().isoformat(),
                        }
                        sanitized_payload, quality_warnings = sanitize_product_payload(payload)
                        results["data"][sku][cfg_name] = sanitized_payload

                        for quality_warning in quality_warnings:
                            message = f"{cfg_name}/{sku}: {quality_warning}"
                            emitter.warning(message, scraper=cfg_name, sku=sku)
                            _emit_runner_log(
                                job_id=job_id,
                                runner_name=runner_name,
                                job_logging=job_logging,
                                log_buffer=log_buffer,
                                level="warning",
                                message=message,
                                scraper_name=cfg_name,
                                sku=sku,
                                phase="scraping",
                            )

                        collector.add_result(sku, cfg_name, extracted_data)

                        # Call progress callback if provided (for incremental saving)
                        if progress_callback:
                            try:
                                progress_callback(sku, cfg_name, results["data"][sku][cfg_name])
                            except Exception as e:
                                _emit_runner_log(
                                    job_id=job_id,
                                    runner_name=runner_name,
                                    job_logging=job_logging,
                                    log_buffer=log_buffer,
                                    level="warning",
                                    message=f"Progress callback failed for {cfg_name}/{sku}: {e}",
                                    details={"error_type": type(e).__name__},
                                    scraper_name=cfg_name,
                                    sku=sku,
                                    phase="scraping",
                                )

                        emitter.info(f"{cfg_name}/{sku}: Found data", data=results["data"][sku][cfg_name])
                        _emit_runner_log(
                            job_id=job_id,
                            runner_name=runner_name,
                            job_logging=job_logging,
                            log_buffer=log_buffer,
                            level="info",
                            message=f"{cfg_name}/{sku}: Found data",
                            details=_build_data_summary(sanitized_payload),
                            scraper_name=cfg_name,
                            sku=sku,
                            phase="scraping",
                        )
                    else:
                        _emit_runner_log(
                            job_id=job_id,
                            runner_name=runner_name,
                            job_logging=job_logging,
                            log_buffer=log_buffer,
                            level="info",
                            message=f"{cfg_name}/{sku}: No data found",
                            scraper_name=cfg_name,
                            sku=sku,
                            phase="scraping",
                        )
                else:
                    scraper_failed_units += 1
                    _emit_runner_log(
                        job_id=job_id,
                        runner_name=runner_name,
                        job_logging=job_logging,
                        log_buffer=log_buffer,
                        level="warning",
                        message=f"{cfg_name}/{sku}: Workflow failed",
                        scraper_name=cfg_name,
                        sku=sku,
                        phase="scraping",
                    )

                _emit_job_progress(
                    job_logging=job_logging,
                    status="running",
                    progress=_progress_from_units(processed_work_units, total_work_units),
                    message=f"Processed {processed_work_units}/{total_work_units} work items",
                    phase="scraping",
                    details={"scraper_name": cfg_name},
                    current_sku=sku,
                    items_processed=processed_work_units,
                    items_total=total_work_units,
                )

            _emit_runner_log(
                job_id=job_id,
                runner_name=runner_name,
                job_logging=job_logging,
                log_buffer=log_buffer,
                level="info",
                message=f"Completed scraper: {cfg_name}",
                details={
                    "processed_units": scraper_processed_units,
                    "failed_units": scraper_failed_units,
                    "successful_units": scraper_processed_units - scraper_failed_units,
                },
                scraper_name=cfg_name,
                phase="scraper-complete",
            )

        except Exception as e:
            remaining_units = max(0, len(skus) - scraper_processed_units)
            processed_work_units += remaining_units
            scraper_failed_units += remaining_units
            _emit_runner_log(
                job_id=job_id,
                runner_name=runner_name,
                job_logging=job_logging,
                log_buffer=log_buffer,
                level="error",
                message=f"Failed to initialize {cfg_name}: {e}",
                details={"error_type": type(e).__name__},
                scraper_name=cfg_name,
                phase="scraper-start",
                flush_immediately=True,
            )
            _emit_job_progress(
                job_logging=job_logging,
                status="running",
                progress=_progress_from_units(processed_work_units, total_work_units),
                message=f"{cfg_name} failed during startup",
                phase="scraper-start",
                details={"scraper_name": cfg_name, "error_type": type(e).__name__},
                items_processed=processed_work_units,
                items_total=total_work_units,
            )

    _emit_runner_log(
        job_id=job_id,
        runner_name=runner_name,
        job_logging=job_logging,
        log_buffer=log_buffer,
        level="info",
        message=f"Job complete. Processed {results['skus_processed']} SKUs",
        details={
            "processed_work_units": processed_work_units,
            "total_work_units": total_work_units,
            "scrapers_run": results["scrapers_run"],
        },
        phase="completed",
        flush_immediately=True,
    )
    _emit_job_progress(
        job_logging=job_logging,
        status="completed",
        progress=100,
        message="Job completed",
        phase="complete",
        details={"scrapers_run": results["scrapers_run"]},
        items_processed=processed_work_units,
        items_total=total_work_units,
    )
    captured_events = event_bus.get_events(job_id=job_id, limit=2000)
    results["logs"] = job_logging.snapshot() if job_logging else log_buffer
    results["telemetry"] = _build_telemetry_from_events(captured_events)
    return results


def _run_ai_search_job(
    job_config: JobConfig,
    skus: List[str],
    results: Dict[str, Any],
    log_buffer: List[Dict[str, Any]],
    runner_name: str | None = None,
    job_logging: Any | None = None,
) -> Dict[str, Any]:
    def _get_optional_string(payload: Dict[str, Any], key: str) -> str | None:
        raw_value = payload.get(key)
        if not isinstance(raw_value, str):
            return None

        trimmed = raw_value.strip()
        return trimmed if trimmed else None

    search_cfg = job_config.job_config or {}
    scraper_name = "ai_search"

    max_concurrency = int(search_cfg.get("max_concurrency", job_config.max_workers) or job_config.max_workers)
    max_search_results = int(search_cfg.get("max_search_results", 5) or 5)
    max_steps = int(search_cfg.get("max_steps", 15) or 15)
    confidence_threshold = float(search_cfg.get("confidence_threshold", 0.7) or 0.7)
    runtime_credentials: Dict[str, Any] = job_config.ai_credentials or {}
    feature_flags = GeminiFeatureFlags.from_payload(job_config.feature_flags)
    llm_provider = "gemini"

    llm_model = str(search_cfg.get("llm_model") or runtime_credentials.get("llm_model") or "gemini-2.5-flash")
    if not llm_model.strip():
        llm_model = "gemini-2.5-flash"
    elif llm_model.startswith("gpt-"):
        llm_model = "gemini-2.5-flash"
    search_provider = str(search_cfg.get("search_provider", os.environ.get("AI_SEARCH_PROVIDER", "auto")) or "auto")
    if search_provider == "brave":
        search_provider = "gemini"
    elif search_provider not in {"auto", "serpapi", "gemini"}:
        search_provider = "auto"
    if search_provider == "auto":
        search_provider = "gemini"
    cache_enabled = bool(search_cfg.get("cache_enabled", True))
    extraction_strategy = str(search_cfg.get("extraction_strategy", "llm") or "llm")
    raw_prefer_manufacturer = search_cfg.get("prefer_manufacturer")
    prefer_manufacturer = True if raw_prefer_manufacturer is None else bool(raw_prefer_manufacturer)

    llm_base_url = None

    runtime_provider = _get_optional_string(runtime_credentials, "llm_provider")
    runtime_llm_api_key = _get_optional_string(runtime_credentials, "llm_api_key")
    llm_api_key = _get_optional_string(runtime_credentials, "gemini_api_key")
    if llm_api_key is None and runtime_provider == "gemini":
        llm_api_key = runtime_llm_api_key

    previous_serpapi = os.environ.get("SERPAPI_API_KEY")
    runtime_serpapi = _get_optional_string(runtime_credentials, "serpapi_api_key")

    # Debug log credential extraction
    logger.debug(f"Job payload credentials available: {bool(runtime_credentials)}")
    if llm_api_key:
        logger.debug(f"Resolved {llm_provider} LLM API key for AI Search: {llm_api_key[:4]}...")
    if runtime_serpapi:
        logger.debug(f"Setting SERPAPI_API_KEY from job payload: {runtime_serpapi[:4]}...")

    if runtime_serpapi:
        os.environ["SERPAPI_API_KEY"] = runtime_serpapi

    item_context_by_sku: Dict[str, Dict[str, Any]] = {}

    raw_items = search_cfg.get("items")
    if isinstance(raw_items, list):
        for candidate in raw_items:
            if not isinstance(candidate, dict):
                continue
            candidate_sku = str(candidate.get("sku", "")).strip()
            if not candidate_sku:
                continue
            item_context_by_sku[candidate_sku] = candidate

    raw_sku_context = search_cfg.get("sku_context")
    if isinstance(raw_sku_context, dict):
        for key, value in raw_sku_context.items():
            candidate_sku = str(key).strip()
            if not candidate_sku or not isinstance(value, dict):
                continue
            merged_context = dict(item_context_by_sku.get(candidate_sku, {}))
            merged_context.update(value)
            merged_context.setdefault("sku", candidate_sku)
            item_context_by_sku[candidate_sku] = merged_context

    items = []
    for sku in skus:
        item_context = item_context_by_sku.get(sku, {})
        items.append(
            {
                "sku": sku,
                "product_name": item_context.get("product_name", search_cfg.get("product_name")),
                "brand": item_context.get("brand", search_cfg.get("brand")),
                "category": item_context.get("category", search_cfg.get("category")),
            }
        )

    _emit_runner_log(
        job_id=job_config.job_id,
        runner_name=runner_name,
        job_logging=job_logging,
        log_buffer=log_buffer,
        level="info",
        message=f"Starting AI Search scraper for {len(items)} SKUs",
        details={
            "max_concurrency": max_concurrency,
            "max_search_results": max_search_results,
            "max_steps": max_steps,
            "confidence_threshold": confidence_threshold,
            "llm_provider": llm_provider,
            "llm_model": llm_model,
            "llm_base_url": llm_base_url,
            "search_provider": search_provider,
            "cache_enabled": cache_enabled,
            "extraction_strategy": extraction_strategy,
            "prefer_manufacturer": prefer_manufacturer,
            "feature_flags": {
                "gemini_ai_search_enabled": feature_flags.gemini_ai_search_enabled,
                "gemini_crawl4ai_enabled": feature_flags.gemini_crawl4ai_enabled,
            },
        },
        scraper_name=scraper_name,
        phase="starting",
        flush_immediately=True,
    )
    _emit_job_progress(
        job_logging=job_logging,
        status="running",
        progress=5,
        message="Starting AI Search scraper",
        phase="starting",
        details={"scraper_name": scraper_name},
        items_total=len(items),
    )
    results["scrapers_run"].append(scraper_name)

    crawl4ai_llm_provider = llm_provider
    crawl4ai_llm_model = llm_model
    crawl4ai_llm_base_url = llm_base_url
    crawl4ai_llm_api_key = llm_api_key

    async def _run() -> list[Any]:
        scraper = AISearchScraper(
            headless=settings.browser_settings["headless"],
            max_search_results=max_search_results,
            max_steps=max_steps,
            confidence_threshold=confidence_threshold,
            llm_provider=llm_provider,
            llm_model=llm_model,
            llm_base_url=llm_base_url,
            llm_api_key=llm_api_key,
            crawl4ai_llm_provider=crawl4ai_llm_provider,
            crawl4ai_llm_model=crawl4ai_llm_model,
            crawl4ai_llm_base_url=crawl4ai_llm_base_url,
            crawl4ai_llm_api_key=crawl4ai_llm_api_key,
            search_provider=search_provider,
            cache_enabled=cache_enabled,
            extraction_strategy=extraction_strategy,
            prefer_manufacturer=prefer_manufacturer,
        )
        return await scraper.scrape_products_batch(items)

    try:
        batch_results = asyncio.run(_run())
    finally:
        if runtime_serpapi:
            if previous_serpapi is None:
                os.environ.pop("SERPAPI_API_KEY", None)
            else:
                os.environ["SERPAPI_API_KEY"] = previous_serpapi

    for search_result in batch_results:
        sku = search_result.sku
        results["skus_processed"] += 1
        if not sku:
            continue

        if sku not in results["data"]:
            results["data"][sku] = {}

        if search_result.success:
            results["data"][sku][scraper_name] = {
                "title": search_result.product_name,
                "brand": search_result.brand,
                "weight": search_result.size_metrics,
                "size_metrics": search_result.size_metrics,
                "description": search_result.description,
                "images": search_result.images,
                "categories": search_result.categories,
                "url": search_result.url,
                "source_website": search_result.source_website,
                "confidence": search_result.confidence,
                "cost_usd": search_result.cost_usd,
                "scraped_at": datetime.now().isoformat(),
            }
            _emit_runner_log(
                job_id=job_config.job_id,
                runner_name=runner_name,
                job_logging=job_logging,
                log_buffer=log_buffer,
                level="info",
                message=f"{scraper_name}/{sku}: Found data",
                details={
                    "confidence": search_result.confidence,
                    "source_website": search_result.source_website,
                    "image_count": len(search_result.images or []),
                    "cost_usd": search_result.cost_usd,
                },
                scraper_name=scraper_name,
                sku=sku,
                phase="scraping",
            )
        else:
            results["data"][sku][scraper_name] = {
                "error": search_result.error,
                "cost_usd": search_result.cost_usd,
                "scraped_at": datetime.now().isoformat(),
            }
            _emit_runner_log(
                job_id=job_config.job_id,
                runner_name=runner_name,
                job_logging=job_logging,
                log_buffer=log_buffer,
                level="warning",
                message=f"{scraper_name}/{sku}: {search_result.error or 'Failed'}",
                details={"cost_usd": search_result.cost_usd},
                scraper_name=scraper_name,
                sku=sku,
                phase="scraping",
            )

        _emit_job_progress(
            job_logging=job_logging,
            status="running",
            progress=_progress_from_units(results["skus_processed"], max(1, len(items))),
            message=f"Processed {results['skus_processed']}/{len(items)} AI Search items",
            phase="scraping",
            details={"scraper_name": scraper_name},
            current_sku=sku,
            items_processed=results["skus_processed"],
            items_total=len(items),
        )

    _emit_runner_log(
        job_id=job_config.job_id,
        runner_name=runner_name,
        job_logging=job_logging,
        log_buffer=log_buffer,
        level="info",
        message=f"AI Search job complete. Processed {results['skus_processed']} SKUs",
        details={"scraper_name": scraper_name},
        scraper_name=scraper_name,
        phase="completed",
        flush_immediately=True,
    )
    _emit_job_progress(
        job_logging=job_logging,
        status="completed",
        progress=100,
        message="AI Search job completed",
        phase="complete",
        details={"scraper_name": scraper_name},
        items_processed=results["skus_processed"],
        items_total=len(items),
    )
    results["logs"] = job_logging.snapshot() if job_logging else log_buffer
    results["telemetry"] = {"steps": [], "selectors": [], "extractions": []}
    return results


# Execution engine imports
from runner.execution import (
    ExecutionResult,
    WorkerConfig,
    create_work_stealing_queues,
    execute_with_thread_pool,
    load_skus_from_excel,
    load_skus_with_metadata,
    process_sku_with_batch_restart,
    run_worker_thread,
    should_restart_browser,
)

__all__ = [
    "ConfigurationError",
    "create_emitter",
    "create_log_entry",
    "run_job",
    # Execution engine exports
    "ExecutionResult",
    "WorkerConfig",
    "create_work_stealing_queues",
    "execute_with_thread_pool",
    "load_skus_from_excel",
    "load_skus_with_metadata",
    "process_sku_with_batch_restart",
    "run_worker_thread",
    "should_restart_browser",
]
