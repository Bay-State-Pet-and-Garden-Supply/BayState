from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from core.api_client import ScraperAPIClient
from core.realtime_manager import RealtimeManager
from utils.logging_handlers import JobLoggingSession
from utils.structured_logging import generate_trace_id

from runner.job_execution import execute_claimed_job

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
            lease_token=job_data.get("lease_token"),
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

            success, _ = execute_claimed_job(
                client=client,
                job_id=job_id,
                runner_name=runner_name,
                trace_id=realtime_trace_id,
                job_trace_id=job_trace_id,
                job_logging=job_logging,
                initial_lease_token=job_data.get("lease_token"),
                config_fetch_progress=5,
                config_fetch_phase="configuring",
                config_loaded_progress=10,
                config_loaded_details_builder=lambda job_config: {
                    "skus": len(job_config.skus),
                    "scrapers": [scraper.name for scraper in job_config.scrapers],
                },
                config_loaded_items_total_builder=lambda job_config: len(job_config.skus),
                generic_failure_log_message="Realtime job failed with error",
            )
            if not success:
                return

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
