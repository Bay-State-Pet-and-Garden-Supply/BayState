from __future__ import annotations

import json
import logging
import sys

from core.api_client import *
from core.config_fetcher import *
from utils.structured_logging import generate_trace_id
from utils.logging_handlers import JobLoggingSession

from runner import run_job

logger = logging.getLogger(__name__)


def run_full_mode(client: ScraperAPIClient, job_id: str, runner_name: str) -> None:
    trace_id = generate_trace_id()
    with JobLoggingSession(job_id=job_id, runner_name=runner_name, api_client=client) as job_logging:
        logger.info(
            "Starting full-mode job",
            extra={
                "job_id": job_id,
                "trace_id": trace_id,
                "runner_name": runner_name,
                "phase": "starting",
                "flush_immediately": True,
            },
        )
        job_logging.emit_progress(
            status="running",
            progress=0,
            message="Fetching job configuration",
            phase="starting",
        )
        client.update_status(job_id, "running", runner_name=runner_name)

        job_config = client.get_job_config(job_id)
        if not job_config:
            logger.error(
                "Failed to fetch job configuration",
                extra={
                    "job_id": job_id,
                    "trace_id": trace_id,
                    "runner_name": runner_name,
                    "phase": "configuring",
                    "error_type": "ConfigFetchError",
                    "flush_immediately": True,
                },
            )
            job_logging.emit_progress(
                status="failed",
                progress=0,
                message="Failed to fetch job configuration",
                phase="configuring",
            )
            client.submit_results(
                job_id,
                "failed",
                runner_name=runner_name,
                error_message="Failed to fetch job configuration",
            )
            sys.exit(1)

        try:
            job_logging.emit_progress(
                status="running",
                progress=5,
                message="Configuration loaded",
                phase="configuring",
                details={"sku_count": len(job_config.skus), "scraper_count": len(job_config.scrapers)},
            )
            results = run_job(
                job_config,
                runner_name=runner_name,
                api_client=client,
                job_logging=job_logging,
            )
            client.submit_results(
                job_id,
                "completed",
                runner_name=runner_name,
                lease_token=job_config.lease_token,
                results=results,
            )
            print(json.dumps(results, indent=2))
        except ConfigValidationError as e:
            logger.error(
                f"Config validation failed: {e}",
                extra={
                    "job_id": job_id,
                    "trace_id": trace_id,
                    "runner_name": runner_name,
                    "phase": "configuring",
                    "error_type": "ConfigValidationError",
                    "config_slug": e.config_slug,
                    "schema_version": e.schema_version,
                    "flush_immediately": True,
                },
            )
            job_logging.emit_progress(
                status="failed",
                progress=0,
                message=f"Config validation failed: {e}",
                phase="configuring",
                details={"config_slug": e.config_slug, "schema_version": e.schema_version},
            )
            client.submit_results(
                job_id,
                "failed",
                runner_name=runner_name,
                lease_token=job_config.lease_token,
                error_message=f"Config validation failed for {e.config_slug}: {e}",
            )
            sys.exit(1)
        except ConfigFetchError as e:
            logger.error(
                f"Config fetch failed: {e}",
                extra={
                    "job_id": job_id,
                    "trace_id": trace_id,
                    "runner_name": runner_name,
                    "phase": "configuring",
                    "error_type": "ConfigFetchError",
                    "config_slug": getattr(e, "config_slug", None),
                    "flush_immediately": True,
                },
            )
            job_logging.emit_progress(
                status="failed",
                progress=0,
                message=f"Config fetch failed: {e}",
                phase="configuring",
                details={"config_slug": getattr(e, "config_slug", None)},
            )
            client.submit_results(
                job_id,
                "failed",
                runner_name=runner_name,
                lease_token=job_config.lease_token,
                error_message=f"Config fetch failed: {e}",
            )
            sys.exit(1)
        except Exception as e:
            logger.exception(
                "Job failed with error",
                extra={
                    "job_id": job_id,
                    "trace_id": trace_id,
                    "runner_name": runner_name,
                    "phase": "failed",
                    "error_type": type(e).__name__,
                    "flush_immediately": True,
                },
            )
            job_logging.emit_progress(
                status="failed",
                progress=0,
                message=f"Job failed: {e}",
                phase="failed",
                details={"error_type": type(e).__name__},
            )
            client.submit_results(
                job_id,
                "failed",
                runner_name=runner_name,
                lease_token=job_config.lease_token,
                error_message=str(e),
            )
            sys.exit(1)
