from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from core.api_client import JobConfig
from core.settings_manager import settings
from scrapers.product_url_extraction.extractor import ProductPageExtractor
from scrapers.ai_search.enrichment_models import (
    EnrichmentMode,
    build_v1_from_extraction_result,
)

logger = logging.getLogger(__name__)

ENRICHMENT_JOB_TYPE = "enrichment"


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
        LOG_LEVEL_NUMBERS.get(level, logging.INFO),
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
        entry = create_log_entry(level, message)
        if details:
            entry["details"] = details
        log_buffer.append(entry)


def run_job(
    job_config: JobConfig,
    runner_name: Optional[str] = None,
    log_buffer: Optional[List[Dict[str, Any]]] = None,
    progress_callback: Optional[Callable[[str, str, dict[str, Any]], bool]] = None,
    api_client: Optional[Any] = None,
    job_logging: Optional[Any] = None,
) -> Dict[str, Any]:
    # Only enrichment jobs are supported in the modern architecture
    if job_config.job_type == ENRICHMENT_JOB_TYPE:
        return _run_enrichment_job(
            job_config,
            runner_name=runner_name,
            log_buffer=log_buffer,
            progress_callback=progress_callback,
            api_client=api_client,
            job_logging=job_logging,
        )

    logger.error(f"Unsupported job type: {job_config.job_type}")
    return {
        "skus_processed": 0,
        "scrapers_run": [],
        "data": {},
        "error": f"Unsupported job type: {job_config.job_type} — use enrichment path instead",
    }


def _run_enrichment_job(
    job_config: JobConfig,
    runner_name: Optional[str] = None,
    log_buffer: Optional[List[Dict[str, Any]]] = None,
    progress_callback: Optional[Callable[[str, str, dict[str, Any]], bool]] = None,
    api_client: Optional[Any] = None,
    job_logging: Optional[Any] = None,
) -> Dict[str, Any]:
    """Execute a single enrichment (AI extraction) for a URL target.

    This is the AI-only extraction path. It takes a job config with a target URL
    and SKU, fetches the page via Crawl4AI engine, extracts product data using
    the AI extraction pipeline, formats the output as EnrichmentResultV1, and
    submits the result back to the coordinator.
    """
    job_id = job_config.job_id
    skus = job_config.skus
    job_payload = job_config.job_config if isinstance(job_config.job_config, dict) else {}

    results: Dict[str, Any] = {
        "skus_processed": 0,
        "scrapers_run": ["enrichment"],
        "data": {},
        "enrichment_results": [],
    }

    if log_buffer is None:
        log_buffer = []

    _emit_runner_log(
        job_id=job_id,
        runner_name=runner_name,
        job_logging=job_logging,
        log_buffer=log_buffer,
        level="info",
        message=f"Enrichment job {job_id} started",
        details={
            "sku_count": len(skus),
            "mode": job_payload.get("mode", "mixed"),
            "model": job_payload.get("model", "deepseek-chat"),
        },
        phase="starting",
        flush_immediately=True,
    )

    # Extract single SKU and target URL from payload
    target_url = job_payload.get("target_url", "")
    target_sku = skus[0] if skus else job_payload.get("sku", "")
    domain = job_payload.get("domain")
    model = job_payload.get("model", "deepseek-chat")
    mode_str = job_payload.get("mode", "mixed")

    if not target_sku:
        error_msg = "Enrichment job missing SKU"
        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="error",
            message=error_msg,
            phase="failed",
            flush_immediately=True,
        )
        results["error_message"] = error_msg
        results["logs"] = job_logging.snapshot() if job_logging else log_buffer
        return results

    # Approved Source Extraction sentinel
    if target_url == "approved_source_extraction":
        source_plan = job_payload.get("source_plan")
        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="info",
            message=f"Approved source extraction for SKU={target_sku} (concrete adapters not yet implemented)",
            details={"has_source_plan": source_plan is not None},
            sku=target_sku,
            phase="enriching",
        )
        results["skus_processed"] = 1
        results["data"][target_sku] = {
            "enrichment": {
                "title": None,
                "brand": None,
                "weight": None,
                "description": None,
                "images": [],
                "confidence": 0.0,
                "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "mode": "approved_source_extraction",
                "decision": "not_implemented",
                "llm_used": False,
                "warnings": ["Approved source extraction adapters not yet implemented"],
            }
        }
        return results

    if not target_url:
        error_msg = "Enrichment job missing target_url"
        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="error",
            message=error_msg,
            phase="failed",
            flush_immediately=True,
        )
        results["error_message"] = error_msg
        results["logs"] = job_logging.snapshot() if job_logging else log_buffer
        return results

    # Map mode string to EnrichmentMode
    try:
        enrichment_mode = EnrichmentMode(mode_str)
    except ValueError:
        enrichment_mode = EnrichmentMode.MIXED

    _emit_runner_log(
        job_id=job_id,
        runner_name=runner_name,
        job_logging=job_logging,
        log_buffer=log_buffer,
        level="info",
        message=f"Enriching SKU={target_sku} URL={target_url}",
        details={"model": model, "mode": enrichment_mode.value},
        sku=target_sku,
        phase="enriching",
    )

    # Run extraction via ProductPageExtractor (reuses the full AI pipeline)
    extractor = ProductPageExtractor(
        headless=settings.browser_settings["headless"],
        llm_model=model,
        cache_enabled=True,
        extraction_strategy="llm",
    )

    async def _run_extraction() -> dict[str, Any]:
        return await extractor.extract(
            url=target_url,
            sku=target_sku,
            brand=job_payload.get("brand"),
            product_name=job_payload.get("product_name"),
        )

    extraction_result = asyncio.run(_run_extraction())

    # Build v1 enrichment result
    enrichment_result = build_v1_from_extraction_result(
        sku=target_sku,
        url=target_url,
        extraction_result=extraction_result,
        domain=domain,
        model=model,
        mode=enrichment_mode,
    )

    # Record in results dict for backward compatibility
    if extraction_result.get("success"):
        results["skus_processed"] = 1
        results["data"][target_sku] = {
            "enrichment": {
                "title": enrichment_result.product.name,
                "brand": enrichment_result.product.brand,
                "weight": enrichment_result.product.weight,
                "description": enrichment_result.product.description,
                "images": enrichment_result.product.image_urls,
                "confidence": enrichment_result.confidence.overall,
                "scraped_at": enrichment_result.extracted_at,
                "mode": enrichment_mode.value,
                "model": model,
            }
        }

        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="info",
            message=f"Enrichment succeeded for SKU={target_sku}",
            details={
                "confidence": enrichment_result.confidence.overall,
                "fields_found": len([f for f in [
                    enrichment_result.product.name,
                    enrichment_result.product.brand,
                    enrichment_result.product.weight,
                    enrichment_result.product.description,
                ] if f]),
            },
            sku=target_sku,
            phase="completed",
        )
    else:
        error = extraction_result.get("error", "Extraction returned no data")
        results["data"][target_sku] = {
            "enrichment": {
                "error": error,
                "confidence": 0.0,
                "scraped_at": enrichment_result.extracted_at,
            }
        }

        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="warning",
            message=f"Enrichment failed for SKU={target_sku}: {error}",
            sku=target_sku,
            phase="failed",
        )

    # Submit enrichment result back via API
    if api_client and hasattr(api_client, "submit_enrichment_result"):
        attempt_id = job_payload.get("attempt_id", "")
        if attempt_id:
            result_json = enrichment_result.model_dump_json()
            status_str = "success" if extraction_result.get("success") else "failed"
            if extraction_result.get("success") and enrichment_result.confidence.overall < 0.5:
                status_str = "partial"

            try:
                submitted = api_client.submit_enrichment_result(
                    attempt_id=attempt_id,
                    status=status_str,
                    result_json=result_json,
                    error_message=extraction_result.get("error") if not extraction_result.get("success") else None,
                    lease_token=getattr(job_config, "lease_token", None),
                )
                if submitted:
                    logger.info(f"Enrichment result submitted for attempt {attempt_id}")
                else:
                    logger.warning(f"Failed to submit enrichment result for attempt {attempt_id}")
            except Exception as e:
                logger.error(f"Error submitting enrichment result: {e}")
        else:
            logger.warning("No attempt_id in job config — enrichment result not submitted via callback")

    results["enrichment_results"] = [enrichment_result.model_dump()]
    results["logs"] = job_logging.snapshot() if job_logging else log_buffer
    results["telemetry"] = {"steps": [], "selectors": [], "extractions": []}

    _emit_runner_log(
        job_id=job_id,
        runner_name=runner_name,
        job_logging=job_logging,
        log_buffer=log_buffer,
        level="info",
        message=f"Enrichment job complete for {results['skus_processed']} SKUs",
        phase="completed",
        flush_immediately=True,
    )

    return results


__all__ = [
    "ConfigurationError",
    "create_log_entry",
    "ENRICHMENT_JOB_TYPE",
    "ProductPageExtractor",
    "run_job",
]
