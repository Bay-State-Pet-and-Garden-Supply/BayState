"""Runner entry point — dispatches enrichment jobs including approved-source extraction."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from core.api_client import ClaimedEnrichment, ClaimedPackagingExtraction
from core.settings_manager import settings
from scrapers.product_url_extraction.extractor import ProductPageExtractor
from scrapers.ai_search.enrichment_models import (
    build_v1_from_extraction_result,
    build_error_result,
    now_iso,
)

logger = logging.getLogger(__name__)

ENRICHMENT_JOB_TYPE = "enrichment"
PACKAGING_EXTRACTION_JOB_TYPE = "packaging_extraction"

# Re-export packaging extraction runner
from runner.packaging_extraction import _run_packaging_extraction_job  # noqa: E402, F401

# Scrape-time OCR — raw text extraction during enrichment
from runner.scrape_time_ocr import is_scrape_time_ocr_enabled, apply_scrape_time_ocr  # noqa: E402


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


def _llm_kwargs_from_attempt(
    attempt: ClaimedEnrichment,
    fallback_model: str | None = None,
) -> dict[str, Any]:
    """Return ProductPageExtractor LLM kwargs from coordinator credentials.

    The coordinator resolves and decrypts the job's traced AI provider profile
    at claim time. The runner should prefer those values over process env so a
    queued job uses the provider recorded in enrichment_jobs.config_id.
    """
    credentials = attempt.ai_credentials if isinstance(attempt.ai_credentials, dict) else {}
    provider = credentials.get("llm_provider") if isinstance(credentials.get("llm_provider"), str) else None
    model = credentials.get("llm_model") if isinstance(credentials.get("llm_model"), str) else None
    base_url = credentials.get("llm_base_url") if isinstance(credentials.get("llm_base_url"), str) else None
    api_key = credentials.get("llm_api_key") if isinstance(credentials.get("llm_api_key"), str) else None

    if not api_key and provider == "deepseek":
        api_key = credentials.get("deepseek_api_key") if isinstance(credentials.get("deepseek_api_key"), str) else None
    if not api_key and provider == "openai":
        api_key = credentials.get("openai_api_key") if isinstance(credentials.get("openai_api_key"), str) else None

    return {
        "llm_provider": provider,
        "llm_model": model or fallback_model or "deepseek-chat",
        "llm_api_key": api_key,
        "llm_base_url": base_url,
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
    upc: str | None = None,
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
            "upc": upc,
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





async def _run_enrichment_job(
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
    upcs = [attempt.upc]
    job_payload = attempt.job_config if isinstance(attempt.job_config, dict) else {}

    results: Dict[str, Any] = {
        "upcs_processed": 0,
        "scrapers_run": ["enrichment"],
        "data": {},
        "enrichment_results": [],
    }

    if log_buffer is None:
        log_buffer = []

    model = getattr(attempt, "model", None) or job_payload.get("model", "deepseek-chat")
    mode_str = (
        getattr(attempt, "mode", None)
        or job_payload.get("mode")
        or job_payload.get("extraction_mode", "mixed")
    )

    _emit_runner_log(
        job_id=job_id,
        runner_name=runner_name,
        job_logging=job_logging,
        log_buffer=log_buffer,
        level="info",
        message=f"Enrichment job {job_id} started",
        details={
            "upc_count": len(upcs),
            "mode": mode_str,
            "model": model,
        },
        phase="starting",
        flush_immediately=True,
    )

    target_url = getattr(attempt, "target_url", None) or job_payload.get("target_url", "")
    target_upc = upcs[0] if upcs else job_payload.get("upc", "")
    domain = getattr(attempt, "domain", None) or job_payload.get("domain")

    if not target_upc:
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
        return await _run_approved_source_extraction(
            attempt=attempt,
            job_payload=job_payload,
            target_upc=target_upc,
            runner_name=runner_name,
            log_buffer=log_buffer,
            api_client=api_client,
            job_logging=job_logging,
            results=results,
        )

    # All other target_urls (direct extraction) are deprecated/removed.
    error_msg = f"Direct URL extraction (url={target_url}) is deprecated. Only approved source extraction is supported."
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


# =============================================================================
# Approved Source Extraction
# =============================================================================


async def _run_approved_source_extraction(
    attempt: ClaimedEnrichment,
    job_payload: dict[str, Any],
    target_upc: str,
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
    requested_mode = (
        getattr(attempt, "mode", None)
        or job_payload.get("extraction_mode")
        or job_payload.get("mode", "mixed")
    )
    prompt_version = job_payload.get("prompt_version", "v5")

    source_plan_raw = getattr(attempt, "source_plan", None) or job_payload.get("source_plan")
    if not source_plan_raw:
        error_msg = f"Approved source extraction for SKU={target_upc} missing source_plan"
        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="error",
            message=error_msg,
            upc=target_upc,
            phase="failed",
        )
        results["error_message"] = error_msg
        enrichment_result = build_error_result(
            upc=target_upc,
            url="approved_source_extraction",
            error_message=error_msg,
            mode="mixed",
            requested_extraction_mode=requested_mode,
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
        message=f"Executing Approved Source Extraction for SKU={target_upc}",
        details={"has_source_plan": True, "requested_extraction_mode": requested_mode},
        upc=target_upc,
        phase="enriching",
    )

    try:
        from scrapers.approved_sources.types import parse_source_plan

        plan = parse_source_plan(source_plan_raw)
    except Exception as e:
        error_msg = f"Failed to parse source plan for SKU={target_upc}: {e}"
        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="error",
            message=error_msg,
            upc=target_upc,
            phase="failed",
        )
        results["error_message"] = error_msg
        enrichment_result = build_error_result(
            upc=target_upc,
            url="approved_source_extraction",
            error_message=error_msg,
            mode="mixed",
            requested_extraction_mode=requested_mode,
        )
        _submit_result(api_client, attempt, job_payload, enrichment_result)
        results["logs"] = job_logging.snapshot() if job_logging else log_buffer
        return results

    try:
        from scrapers.approved_sources.executor import ApprovedSourceExecutor

        model = getattr(attempt, "model", None) or job_payload.get("model", "deepseek-chat")
        extractor = ProductPageExtractor(
            headless=settings.browser_settings["headless"],
            cache_enabled=True,
            extraction_strategy="llm",
            prompt_version=prompt_version,
            **_llm_kwargs_from_attempt(attempt, model),
        )

        executor = ApprovedSourceExecutor(
            plan=plan,
            extractor=extractor,
            api_client=api_client,
            ai_credentials=attempt.ai_credentials,
            job_config=attempt.job_config,
        )

        enrichment_result = await executor.execute()
    except Exception as e:
        error_msg = f"Executor failed for SKU={target_upc}: {e}"
        _emit_runner_log(
            job_id=job_id,
            runner_name=runner_name,
            job_logging=job_logging,
            log_buffer=log_buffer,
            level="error",
            message=error_msg,
            upc=target_upc,
            phase="failed",
        )
        results["error_message"] = error_msg
        enrichment_result = build_error_result(
            upc=target_upc,
            url="approved_source_extraction",
            error_message=error_msg,
            mode="mixed",
            requested_extraction_mode=requested_mode,
        )

    # Hook: scrape-time OCR on enrichment result before callback
    # Non-blocking — failure never blocks enrichment
    # Only runs on successful/partial results per plan
    if (enrichment_result
            and enrichment_result.status in ("success", "partial")
            and is_scrape_time_ocr_enabled()):
        try:
            ocr_summary = await apply_scrape_time_ocr(
                enrichment_result,
                upc=target_upc,
            )
            _emit_runner_log(
                job_id=job_id,
                runner_name=runner_name,
                job_logging=job_logging,
                log_buffer=log_buffer,
                level="info",
                message=f"Scrape-time OCR for SKU={target_upc}: "
                        f"{ocr_summary.get('sources_ocr_succeeded', 0)} succeeded, "
                        f"{ocr_summary.get('sources_ocr_failed', 0)} failed "
                        f"({ocr_summary.get('sources_with_images', 0)} with images)",
                details=ocr_summary,
                upc=target_upc,
                phase="ocr",
            )
        except Exception as ocr_err:
            _emit_runner_log(
                job_id=job_id,
                runner_name=runner_name,
                job_logging=job_logging,
                log_buffer=log_buffer,
                level="warning",
                message=f"Scrape-time OCR failed for SKU={target_upc} — enrichment continues: {ocr_err}",
                details={"error": str(ocr_err)},
                upc=target_upc,
                phase="ocr",
            )

    if enrichment_result and enrichment_result.status in ("success", "partial"):
        results["upcs_processed"] = 1
        results["data"][target_upc] = {
            "enrichment": {
                "title": enrichment_result.product.name,
                "brand": enrichment_result.product.brand,
                "weight": enrichment_result.product.weight,
                "description": enrichment_result.product.description,
                "images": enrichment_result.product.image_urls,
                "confidence": enrichment_result.confidence.overall,
                "scraped_at": enrichment_result.extracted_at,
                "mode": "approved_source",
                "requested_extraction_mode": enrichment_result.requested_extraction_mode,
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
            message=f"Approved source extraction succeeded for SKU={target_upc}",
            details={
                "confidence": enrichment_result.confidence.overall,
                "decision": enrichment_result.decision,
                "requested_extraction_mode": enrichment_result.requested_extraction_mode,
            },
            upc=target_upc,
            phase="completed",
        )
    else:
        confidence = enrichment_result.confidence.overall if enrichment_result else 0.0
        results["data"][target_upc] = {
            "enrichment": {
                "error": "All approved sources failed",
                "confidence": confidence,
                "scraped_at": now_iso(),
                "mode": "approved_source",
                "requested_extraction_mode": getattr(enrichment_result, "requested_extraction_mode", None),
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
            message=f"Approved source extraction failed for SKU={target_upc}",
            upc=target_upc,
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

    attempt_id = getattr(attempt, "attempt_id", None) or (job_payload.get("attempt_id", "") if isinstance(job_payload, dict) else "")
    if not attempt_id:
        logger.warning("No attempt_id found — enrichment result not submitted")
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
