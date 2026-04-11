from __future__ import annotations

import json
import logging
import sys

from core.api_client import ScraperAPIClient
from utils.logging_handlers import JobLoggingSession
from utils.structured_logging import generate_trace_id

from runner.job_execution import execute_claimed_job

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
        success, results = execute_claimed_job(
            client=client,
            job_id=job_id,
            runner_name=runner_name,
            trace_id=trace_id,
            job_logging=job_logging,
            config_fetch_progress=0,
            config_fetch_phase="starting",
            config_loaded_progress=5,
            config_loaded_details_builder=lambda job_config: {
                "sku_count": len(job_config.skus),
                "scraper_count": len(job_config.scrapers),
            },
        )
        if not success:
            sys.exit(1)

        print(json.dumps(results, indent=2))
