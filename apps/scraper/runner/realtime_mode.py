from __future__ import annotations

import logging
import os
from typing import Any

from core.api_client import *
from core.config_fetcher import *
from core.realtime_manager import *
from utils.logging_handlers import JobLoggingSession
from utils.structured_logging import generate_trace_id

from runner import run_job

logger = logging.getLogger(__name__)


async def run_realtime_mode(client: ScraperAPIClient, runner_name: str) -> None:
    supabase_config = client.get_supabase_config()
    if supabase_config:
        supabase_url = supabase_config.get("supabase_url")
        realtime_key = supabase_config.get("supabase_realtime_key")
        config_source = "api"
    else:
        realtime_key = os.environ.get("BSR_SUPABASE_REALTIME_KEY")
        supabase_url = os.environ.get("SUPABASE_URL")
        config_source = "env"

    if not realtime_key:
        logger.error(
            "Supabase realtime key not configured",
            extra={"runner_name": runner_name, "phase": "startup"},
        )
        return
    if not supabase_url:
        logger.error(
            "Supabase URL not configured",
            extra={"runner_name": runner_name, "phase": "startup"},
        )
        return

    realtime_trace_id = generate_trace_id()
    logger.info(
        f"Starting realtime runner: {runner_name} ({config_source})",
        extra={"runner_name": runner_name, "trace_id": realtime_trace_id, "phase": "startup"},
    )

    rm = RealtimeManager(supabase_url, realtime_key, runner_name)

    connected = await rm.connect()
    if not connected:
        logger.error(
            "Failed to connect to Supabase Realtime",
            extra={"runner_name": runner_name, "trace_id": realtime_trace_id, "phase": "startup"},
        )
        return

    if not await rm.enable_presence():
        logger.warning(
            "Failed to enable presence tracking",
            extra={"runner_name": runner_name, "trace_id": realtime_trace_id, "phase": "startup"},
        )
    if not await rm.enable_broadcast():
        logger.warning(
            "Failed to enable broadcast channels",
            extra={"runner_name": runner_name, "trace_id": realtime_trace_id, "phase": "startup"},
        )

    if rm.is_connected:
        await rm.broadcast_runner_status(
            status="starting",
            details={"message": "Runner initialized and waiting for jobs"},
        )

    async def handle_job(job_data: dict[str, Any]) -> None:
        job_id = job_data.get("job_id")
        if not job_id:
            logger.warning(
                "Received job without job_id",
                extra={"runner_name": runner_name, "trace_id": realtime_trace_id, "phase": "idle"},
            )
            return

        job_trace_id = generate_trace_id()
        lease_token: str | None = None

        with JobLoggingSession(
            job_id=job_id,
            runner_name=runner_name,
            api_client=client,
            realtime_manager=rm,
        ) as job_logging:
            logger.info(
                f"Received realtime job: {job_id}",
                extra={
                    "job_id": job_id,
                    "runner_name": runner_name,
                    "trace_id": realtime_trace_id,
                    "job_trace_id": job_trace_id,
                    "phase": "received",
                    "flush_immediately": True,
                },
            )
            job_logging.emit_progress(
                status="running",
                progress=0,
                message="Job received",
                phase="received",
            )

            try:
                client.update_status(job_id, "running", runner_name=runner_name)
                job_logging.emit_progress(
                    status="running",
                    progress=5,
                    message="Fetching job configuration",
                    phase="configuring",
                )

                job_config = client.get_job_config(job_id)
                if not job_config:
                    logger.error(
                        "Failed to fetch job configuration",
                        extra={
                            "job_id": job_id,
                            "runner_name": runner_name,
                            "trace_id": realtime_trace_id,
                            "job_trace_id": job_trace_id,
                            "phase": "configuring",
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
                        lease_token=job_data.get("lease_token"),
                        error_message="Failed to fetch job configuration",
                    )
                    return

                lease_token = job_config.lease_token
                job_logging.emit_progress(
                    status="running",
                    progress=10,
                    message="Configuration loaded",
                    phase="configuring",
                    details={"skus": len(job_config.skus), "scrapers": [s.name for s in job_config.scrapers]},
                    items_total=len(job_config.skus),
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
                    lease_token=lease_token,
                    results=results,
                )
            except ConfigValidationError as e:
                logger.error(
                    f"Config validation failed: {e}",
                    extra={
                        "job_id": job_id,
                        "runner_name": runner_name,
                        "trace_id": realtime_trace_id,
                        "job_trace_id": job_trace_id,
                        "phase": "configuring",
                        "error_type": "ConfigValidationError",
                        "flush_immediately": True,
                    },
                )
                job_logging.emit_progress(
                    status="failed",
                    progress=0,
                    message=f"Config validation failed: {e}",
                    phase="configuring",
                )
                client.submit_results(
                    job_id,
                    "failed",
                    runner_name=runner_name,
                    lease_token=lease_token,
                    error_message=f"Config validation failed: {e}",
                )
            except ConfigFetchError as e:
                logger.error(
                    f"Config fetch failed: {e}",
                    extra={
                        "job_id": job_id,
                        "runner_name": runner_name,
                        "trace_id": realtime_trace_id,
                        "job_trace_id": job_trace_id,
                        "phase": "configuring",
                        "error_type": "ConfigFetchError",
                        "flush_immediately": True,
                    },
                )
                job_logging.emit_progress(
                    status="failed",
                    progress=0,
                    message=f"Config fetch failed: {e}",
                    phase="configuring",
                )
                client.submit_results(
                    job_id,
                    "failed",
                    runner_name=runner_name,
                    lease_token=lease_token,
                    error_message=f"Config fetch failed: {e}",
                )
            except Exception as e:
                logger.exception(
                    "Realtime job failed with error",
                    extra={
                        "job_id": job_id,
                        "runner_name": runner_name,
                        "trace_id": realtime_trace_id,
                        "job_trace_id": job_trace_id,
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
                    lease_token=lease_token,
                    error_message=str(e),
                )

    def on_job(job_data: dict[str, Any]) -> None:
        asyncio.create_task(handle_job(job_data))

    await rm.subscribe_to_jobs(on_job)
    logger.info(
        "Realtime runner waiting for jobs",
        extra={"runner_name": runner_name, "trace_id": realtime_trace_id, "phase": "idle"},
    )

    try:
        await asyncio.Future()
    except KeyboardInterrupt:
        logger.info(
            "Realtime runner interrupted, shutting down",
            extra={"runner_name": runner_name, "trace_id": realtime_trace_id, "phase": "shutdown"},
        )
    finally:
        if rm.is_connected:
            await rm.broadcast_runner_status(status="stopping", details={"message": "Runner shutting down"})
        await rm.disconnect()
        logger.info(
            "Realtime runner disconnected",
            extra={"runner_name": runner_name, "trace_id": realtime_trace_id, "phase": "shutdown"},
        )
