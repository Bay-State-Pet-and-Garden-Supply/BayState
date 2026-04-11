from __future__ import annotations

import logging
from typing import Any, Callable

from core.api_client import ConfigFetchError as APIConfigFetchError
from core.api_client import JobConfig
from core.api_client import ScraperAPIClient
from core.config_fetcher import ConfigFetchError as PublishedConfigFetchError
from core.config_fetcher import ConfigValidationError

from runner import run_job

logger = logging.getLogger(__name__)

JobConfigDetailsBuilder = Callable[[JobConfig], dict[str, Any] | None]
JobCountBuilder = Callable[[JobConfig], int | None]


def _build_log_extra(
    *,
    job_id: str,
    runner_name: str,
    trace_id: str,
    phase: str,
    job_trace_id: str | None = None,
    error_type: str | None = None,
    extra_fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    extra = {
        "job_id": job_id,
        "runner_name": runner_name,
        "trace_id": trace_id,
        "phase": phase,
        "flush_immediately": True,
    }
    if job_trace_id:
        extra["job_trace_id"] = job_trace_id
    if error_type:
        extra["error_type"] = error_type
    if extra_fields:
        extra.update({key: value for key, value in extra_fields.items() if value is not None})
    return extra


def _emit_progress(
    job_logging: Any,
    *,
    status: str,
    progress: int,
    message: str,
    phase: str,
    details: dict[str, Any] | None = None,
    items_total: int | None = None,
) -> None:
    kwargs: dict[str, Any] = {
        "status": status,
        "progress": progress,
        "message": message,
        "phase": phase,
    }
    if details:
        kwargs["details"] = details
    if items_total is not None:
        kwargs["items_total"] = items_total
    job_logging.emit_progress(**kwargs)


def _submit_failure(
    *,
    client: ScraperAPIClient,
    job_id: str,
    runner_name: str,
    lease_token: str | None,
    error_message: str,
) -> None:
    client.submit_results(
        job_id,
        "failed",
        runner_name=runner_name,
        lease_token=lease_token,
        error_message=error_message,
    )


def execute_claimed_job(
    *,
    client: ScraperAPIClient,
    job_id: str,
    runner_name: str,
    trace_id: str,
    job_logging: Any,
    job_trace_id: str | None = None,
    initial_lease_token: str | None = None,
    config_fetch_progress: int,
    config_fetch_phase: str,
    config_fetch_message: str = "Fetching job configuration",
    config_loaded_progress: int,
    config_loaded_details_builder: JobConfigDetailsBuilder | None = None,
    config_loaded_items_total_builder: JobCountBuilder | None = None,
    generic_failure_log_message: str = "Job failed with error",
) -> tuple[bool, dict[str, Any] | None]:
    lease_token = initial_lease_token

    client.update_status(job_id, "running", runner_name=runner_name)
    _emit_progress(
        job_logging,
        status="running",
        progress=config_fetch_progress,
        message=config_fetch_message,
        phase=config_fetch_phase,
    )

    job_config = client.get_job_config(job_id)
    if not job_config:
        logger.error(
            "Failed to fetch job configuration",
            extra=_build_log_extra(
                job_id=job_id,
                runner_name=runner_name,
                trace_id=trace_id,
                job_trace_id=job_trace_id,
                phase="configuring",
                error_type="ConfigFetchError",
            ),
        )
        _emit_progress(
            job_logging,
            status="failed",
            progress=0,
            message="Failed to fetch job configuration",
            phase="configuring",
        )
        _submit_failure(
            client=client,
            job_id=job_id,
            runner_name=runner_name,
            lease_token=lease_token,
            error_message="Failed to fetch job configuration",
        )
        return False, None

    lease_token = job_config.lease_token or lease_token
    config_details = config_loaded_details_builder(job_config) if config_loaded_details_builder else None
    items_total = config_loaded_items_total_builder(job_config) if config_loaded_items_total_builder else None
    _emit_progress(
        job_logging,
        status="running",
        progress=config_loaded_progress,
        message="Configuration loaded",
        phase="configuring",
        details=config_details,
        items_total=items_total,
    )

    try:
        results = run_job(
            job_config,
            runner_name=runner_name,
            api_client=client,
            job_logging=job_logging,
        )
    except ConfigValidationError as e:
        logger.error(
            f"Config validation failed: {e}",
            extra=_build_log_extra(
                job_id=job_id,
                runner_name=runner_name,
                trace_id=trace_id,
                job_trace_id=job_trace_id,
                phase="configuring",
                error_type="ConfigValidationError",
                extra_fields={
                    "config_slug": e.config_slug,
                    "schema_version": e.schema_version,
                },
            ),
        )
        _emit_progress(
            job_logging,
            status="failed",
            progress=0,
            message=f"Config validation failed: {e}",
            phase="configuring",
            details={
                "config_slug": e.config_slug,
                "schema_version": e.schema_version,
            },
        )
        _submit_failure(
            client=client,
            job_id=job_id,
            runner_name=runner_name,
            lease_token=lease_token,
            error_message=f"Config validation failed for {e.config_slug}: {e}",
        )
        return False, None
    except (APIConfigFetchError, PublishedConfigFetchError) as e:
        config_slug = getattr(e, "config_slug", None)
        logger.error(
            f"Config fetch failed: {e}",
            extra=_build_log_extra(
                job_id=job_id,
                runner_name=runner_name,
                trace_id=trace_id,
                job_trace_id=job_trace_id,
                phase="configuring",
                error_type="ConfigFetchError",
                extra_fields={"config_slug": config_slug},
            ),
        )
        _emit_progress(
            job_logging,
            status="failed",
            progress=0,
            message=f"Config fetch failed: {e}",
            phase="configuring",
            details={"config_slug": config_slug} if config_slug else None,
        )
        _submit_failure(
            client=client,
            job_id=job_id,
            runner_name=runner_name,
            lease_token=lease_token,
            error_message=f"Config fetch failed: {e}",
        )
        return False, None
    except Exception as e:
        logger.exception(
            generic_failure_log_message,
            extra=_build_log_extra(
                job_id=job_id,
                runner_name=runner_name,
                trace_id=trace_id,
                job_trace_id=job_trace_id,
                phase="failed",
                error_type=type(e).__name__,
            ),
        )
        _emit_progress(
            job_logging,
            status="failed",
            progress=0,
            message=f"Job failed: {e}",
            phase="failed",
            details={"error_type": type(e).__name__},
        )
        _submit_failure(
            client=client,
            job_id=job_id,
            runner_name=runner_name,
            lease_token=lease_token,
            error_message=str(e),
        )
        return False, None

    client.submit_results(
        job_id,
        "completed",
        runner_name=runner_name,
        lease_token=lease_token,
        results=results,
    )
    return True, results
