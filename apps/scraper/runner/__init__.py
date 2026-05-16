"""Runner entry point — dispatches enrichment jobs including approved-source extraction."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from core.api_client import ClaimedEnrichment
from core.settings_manager import settings
from scrapers.product_url_extraction.extractor import ProductPageExtractor
from scrapers.ai_search.enrichment_models import (
    build_v1_from_extraction_result,
    build_error_result,
    now_iso,
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





def _run_enrichment_job(
    attempt: ClaimedEnrichment,
    runner_name: Optional[str] = None,
    log_buffer: Optional[List[Dict[str, Any]]] = None,
    progress_callback: Optional[Callable[[str, str, dict[str, Any]], bool]] = None,
    api_client: Optional[Any] = None,
    job_logging: Optional[Any] = None,
) -> Dict[str, Any]:
    """Execute a single enrichment job.

    Supports two modes:
    1. Standard URL extraction: target_url + SKU
    2. Approved Source Extraction: source_plan in payload
    """
    job_id = attempt.job_id
    skus = [attempt.sku]
    job_payload = attempt.job_config if isinstance(attempt.job_config, dict) else {}

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

    target_url = getattr(attempt, "target_url", None) or job_payload.get("target_url", "")
    target_sku = skus[0] if skus else job_payload.get("sku", "")
    domain = getattr(attempt, "domain", None) or job_payload.get("domain")
    model = getattr(attempt, "model", None) or job_payload.get("model", "deepseek-chat")
    mode_str = getattr(attempt, "mode", None) or job_payload.get("mode", "mixed")

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

    # ---- APPROVED SOURCE EXTRACTION PATH ----
    if target_url == "approved_source_extraction":
        return _run_approved_source_extraction(
            attempt=attempt,
            job_payload=job_payload,
            target_sku=target_sku,
            runner_name=runner_name,
            log_buffer=log_buffer,
            api_client=api_client,
            job_logging=job_logging,
            results=results,
        )

    # ---- STANDARD URL EXTRACTION PATH ----
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

    _emit_runner_log(
        job_id=job_id,
        runner_name=runner_name,
        job_logging=job_logging,
        log_buffer=log_buffer,
        level="info",
        message=f"Enriching SKU={target_sku} URL={target_url}",
        details={"model": model, "mode": mode_str},
        sku=target_sku,
        phase="enriching",
    )

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

    enrichment_result = build_v1_from_extraction_result(
        result=extraction_result,
        sku=target_sku,
        url=target_url,
        domain=domain,
        model=model,
        mode=mode_str,
    )

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
                "mode": mode_str,
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
                "fields_found": len(
                    [
                        f
                        for f in [
                            enrichment_result.product.name,
                            enrichment_result.product.brand,
                            enrichment_result.product.weight,
                            enrichment_result.product.description,
                        ]
                        if f
                    ]
                ),
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

    # Submit enrichment result via callback
    _submit_result(api_client, attempt, job_payload, enrichment_result)

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


# =============================================================================
# Approved Source Extraction
# =============================================================================


def _run_approved_source_extraction(
    attempt: ClaimedEnrichment,
    job_payload: dict[str, Any],
    target_sku: str,
    runner_name: str | None,
    log_buffer: list[dict[str, Any]],
    api_client: Any | None,
    job_logging: Any | None,
    results: dict[str, Any],
) -> dict[str, Any]:
    """Execute approved source extraction via the executor.

    Returns results dict with enrichment result data and always submits
    a callback (even on failure).
    """
    job_id = attempt.job_id

    source_plan_raw = getattr(attempt, "source_plan", None) or job_payload.get("source_plan")
    if not source_plan_raw:
        error_msg = f"Approved source extraction for SKU={target_sku} missing source_plan"
        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="error",
            message=error_msg,
            sku=target_sku,
            phase="failed",
        )
        results["error_message"] = error_msg
        # Build and submit a failed result
        enrichment_result = build_error_result(
            sku=target_sku,
            url="approved_source_extraction",
            error_message=error_msg,
            mode="mixed",
        )
        _submit_result(api_client, attempt, job_payload, enrichment_result)
        results["logs"] = job_logging.snapshot() if job_logging else log_buffer
        return results

    _emit_runner_log(
        job_id=job_id,
        runner_name=runner_name,
        job_logging=job_logging,
        log_buffer=log_buffer,
        level="info",
        message=f"Executing Approved Source Extraction for SKU={target_sku}",
        details={"has_source_plan": True},
        sku=target_sku,
        phase="enriching",
    )

    # Parse source plan
    try:
        from scrapers.approved_sources.types import parse_source_plan

        plan = parse_source_plan(source_plan_raw)
    except Exception as e:
        error_msg = f"Failed to parse source plan for SKU={target_sku}: {e}"
        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="error",
            message=error_msg,
            sku=target_sku,
            phase="failed",
        )
        results["error_message"] = error_msg
        enrichment_result = build_error_result(
            sku=target_sku,
            url="approved_source_extraction",
            error_message=error_msg,
            mode="mixed",
        )
        _submit_result(api_client, attempt, job_payload, enrichment_result)
        results["logs"] = job_logging.snapshot() if job_logging else log_buffer
        return results

    # Execute via executor
    try:
        from scrapers.approved_sources.executor import ApprovedSourceExecutor

        # Create extractor (needed for the adapter interface)
        model = getattr(attempt, "model", None) or job_payload.get("model", "deepseek-chat")
        extractor = ProductPageExtractor(
            headless=settings.browser_settings["headless"],
            llm_model=model,
            cache_enabled=True,
            extraction_strategy="llm",
        )

        executor = ApprovedSourceExecutor(
            plan=plan,
            extractor=extractor,
            api_client=api_client,
        )

        enrichment_result = asyncio.run(executor.execute())
    except Exception as e:
        error_msg = f"Executor failed for SKU={target_sku}: {e}"
        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="error",
            message=error_msg,
            sku=target_sku,
            phase="failed",
        )
        results["error_message"] = error_msg
        enrichment_result = build_error_result(
            sku=target_sku,
            url="approved_source_extraction",
            error_message=error_msg,
            mode="mixed",
        )

    # Merge executor result into results dict
    if enrichment_result and enrichment_result.status in ("success", "partial"):
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
                "mode": "approved_source",
                "decision": enrichment_result.decision,
                "llm_used": enrichment_result.llm_used,
                "source_results": [
                    sr.model_dump() for sr in (enrichment_result.source_results or [])
                ],
            }
        }
        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="info",
            message=f"Approved source extraction succeeded for SKU={target_sku}",
            details={
                "confidence": enrichment_result.confidence.overall,
                "decision": enrichment_result.decision,
            },
            sku=target_sku,
            phase="completed",
        )
    else:
        status = enrichment_result.status if enrichment_result else "failed"
        confidence = enrichment_result.confidence.overall if enrichment_result else 0.0
        results["data"][target_sku] = {
            "enrichment": {
                "error": "All approved sources failed",
                "confidence": confidence,
                "scraped_at": now_iso(),
                "mode": "approved_source",
                "decision": "failed",
                "source_results": (
                    [sr.model_dump() for sr in enrichment_result.source_results]
                    if enrichment_result and enrichment_result.source_results
                    else []
                ),
            }
        }
        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="warning",
            message=f"Approved source extraction failed for SKU={target_sku}",
            sku=target_sku,
            phase="failed",
        )

    # ALWAYS submit callback (even on failure)
    if enrichment_result:
        _submit_result(api_client, attempt, job_payload, enrichment_result)
        results["enrichment_results"] = [enrichment_result.model_dump()]

    results["logs"] = job_logging.snapshot() if job_logging else log_buffer
    return results


# =============================================================================
# Callback submission
# =============================================================================


def _submit_result(
    api_client: Any | None,
    attempt: ClaimedEnrichment,
    job_payload: dict[str, Any],
    enrichment_result: Any | None,
) -> None:
    """Submit enrichment result back to the coordinator via callback API."""
    if not api_client or not hasattr(api_client, "submit_enrichment_result"):
        logger.warning("No API client or submit_enrichment_result method — callback skipped")
        return

    attempt_id = job_payload.get("attempt_id", "")
    if not attempt_id:
        logger.warning("No attempt_id in job config — enrichment result not submitted")
        return

    if not enrichment_result:
        logger.warning("No enrichment result to submit for attempt %s", attempt_id)
        return

    try:
        result_json = enrichment_result.model_dump_json()
        status_str = _determine_submission_status(enrichment_result)

        submitted = api_client.submit_enrichment_result(
            attempt_id=attempt_id,
            status=status_str,
            result_json=result_json,
            lease_token=getattr(attempt, "lease_token", None),
        )
        if submitted:
            logger.info("Enrichment result submitted for attempt %s (status=%s)", attempt_id, status_str)
        else:
            logger.warning("Failed to submit enrichment result for attempt %s", attempt_id)
    except Exception as e:
        logger.error("Error submitting enrichment result for attempt %s: %s", attempt_id, e)


def _determine_submission_status(enrichment_result: Any) -> str:
    """Map EnrichmentResultV1 status to callback submission status.

    Maps:
      - success -> success
      - partial with confidence >= 0.7 -> success
      - partial with confidence < 0.7 -> partial
      - failed -> failed

    Note: we NEVER send url_review. Approved-source extraction
    is autonomous; failures stay as failed.
    """
    if enrichment_result.status == "success":
        return "success"
    if enrichment_result.status == "partial":
        if (
            enrichment_result.confidence
            and enrichment_result.confidence.overall >= 0.7
        ):
            return "success"
        return "partial"
    return "failed"


__all__ = [
    "ConfigurationError",
    "create_log_entry",
    "ENRICHMENT_JOB_TYPE",
    "ProductPageExtractor",
]
