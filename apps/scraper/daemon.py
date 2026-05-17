#!/usr/bin/env python3
"""
Bay State Scraper - Long-Running Daemon

A persistent polling daemon that continuously checks for work from the coordinator.
Designed to run inside a Docker container with `restart: unless-stopped`.

Key behaviors:
- Polls coordinator every POLL_INTERVAL seconds for new jobs
- Sends heartbeat when idle so coordinator knows runner is alive
- Fetches credentials on-demand from coordinator (never stored locally)
- Recycles browser after MAX_JOBS_BEFORE_RESTART to prevent memory leaks
- Graceful shutdown on SIGTERM/SIGINT

Usage:
    python daemon.py                    # Uses .env (production)
    python daemon.py --env dev          # Uses .env.development (local dev)
    ENVIRONMENT=dev python daemon.py    # Same as above

Environment Variables:
    SCRAPER_API_URL: Base URL for BayStateApp API (required)
    SCRAPER_API_KEY: API key for authentication (required)
    RUNNER_NAME: Identifier for this runner (defaults to hostname)
    POLL_INTERVAL: Seconds between polls when idle (default: 30)
    MAX_JOBS_BEFORE_RESTART: Recycle after N jobs to prevent leaks (default: 100)
    ENVIRONMENT: Set to 'dev' to use .env.development instead of .env
"""

from __future__ import annotations

import argparse
import logging
import os
import platform
import signal
import sys
import time
import asyncio
from pathlib import Path
from typing import TYPE_CHECKING

from dotenv import load_dotenv

# Ensure project root is in path
PROJECT_ROOT = Path(__file__).parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Also add src to path to support crawl4ai_engine imports
src_path = PROJECT_ROOT / "src"
if src_path.exists() and str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

parser = argparse.ArgumentParser(description="Bay State Scraper Daemon")
parser.add_argument(
    "--env",
    choices=["dev", "prod"],
    default=os.environ.get("ENVIRONMENT", "prod"),
    help="Environment to run in (dev=localhost, prod=production). Defaults to ENVIRONMENT env var or 'prod'",
)
parser.add_argument(
    "--debug",
    action="store_true",
    help="Enable debug logging",
)
args, remaining_argv = parser.parse_known_args()

if args.env == "dev":
    env_file = PROJECT_ROOT / ".env.development"
    if not env_file.exists():
        if "SCRAPER_API_URL" not in os.environ:
            print(f"Warning: {env_file} not found, falling back to .env")
        env_file = PROJECT_ROOT / ".env"
else:
    env_file = PROJECT_ROOT / ".env"

if env_file.exists():
    load_dotenv(env_file, override=True)


try:
    # Prefer package-relative imports when daemon.py is imported as part of the
    # `scraper` package (normal runtime).
    from core.api_client import ScraperAPIClient, RunnerBuildMismatchError
    from core.realtime_manager import RealtimeManager
    from core.version import (
        get_runner_build_id,
        get_runner_build_sha,
        get_runner_release_channel,
    )
    from utils.logger import setup_logging
    from utils.logging_handlers import JobLoggingSession
    from utils.sentry import (
        init_sentry,
        set_job_context,
        add_extraction_breadcrumb,
        capture_antibot_event,
    )

    try:
        from src.crawl4ai_engine.metrics_endpoint import start_metrics_server, stop_metrics_server
    except Exception:
        # Keep a typed no-op fallback so the daemon can still start if the
        # metrics endpoint is intentionally unavailable.
        def start_metrics_server(port: int | None = None):
            return (None, None)

        def stop_metrics_server(httpd: object | None = None) -> None:
            return None
except Exception:
    # Support importing daemon.py as a top-level module (for quick import checks
    # used in CI/verification) where relative imports fail with "no known parent
    # package". Use importlib to load modules by full package path to avoid
    # implicit-relative-import diagnostics from static checkers.
    import importlib

    api_mod = importlib.import_module("apps.scraper.core.api_client")
    ScraperAPIClient = getattr(api_mod, "ScraperAPIClient")

    realtime_mod = importlib.import_module("apps.scraper.core.realtime_manager")
    RealtimeManager = getattr(realtime_mod, "RealtimeManager")

    version_mod = importlib.import_module("apps.scraper.core.version")
    get_runner_build_id = getattr(version_mod, "get_runner_build_id")
    get_runner_build_sha = getattr(version_mod, "get_runner_build_sha")
    get_runner_release_channel = getattr(version_mod, "get_runner_release_channel")

    # Runtime imports (use importlib to avoid implicit-relative import issues
    # when this file is executed as a top-level script during CI checks).
    utils_logger_mod = importlib.import_module("apps.scraper.utils.logger")
    setup_logging = getattr(utils_logger_mod, "setup_logging")

    utils_handlers_mod = importlib.import_module("apps.scraper.utils.logging_handlers")
    JobLoggingSession = getattr(utils_handlers_mod, "JobLoggingSession")

    sentry_mod = importlib.import_module("apps.scraper.utils.sentry")
    init_sentry = getattr(sentry_mod, "init_sentry")
    set_job_context = getattr(sentry_mod, "set_job_context")
    add_extraction_breadcrumb = getattr(sentry_mod, "add_extraction_breadcrumb")
    capture_antibot_event = getattr(sentry_mod, "capture_antibot_event")

    # Try to import the metrics endpoint if available; provide typed fallbacks
    # so static type checkers do not report assignment/signature mismatches.
    try:
        metrics_mod = importlib.import_module("apps.scraper.src.crawl4ai_engine.metrics_endpoint")
        start_metrics_server = getattr(metrics_mod, "start_metrics_server")
        stop_metrics_server = getattr(metrics_mod, "stop_metrics_server")
    except Exception:
        # Provide typed no-op fallbacks when metrics endpoint isn't available.
        def start_metrics_server(port: int | None = None):
            return (None, None)

        def stop_metrics_server(httpd: object | None = None) -> None:
            return None


if TYPE_CHECKING:
    # Provide types for static analysis without importing at runtime
    # Provide typed references; prefer infra but allow core for compatibility.
    from core.api_client import ScraperAPIClient  # type: ignore
    from core.realtime_manager import RealtimeManager  # type: ignore


# Configuration
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "30"))
MAX_POLL_INTERVAL = int(os.environ.get("MAX_POLL_INTERVAL", "300"))
MAX_JOBS_BEFORE_RESTART = int(os.environ.get("MAX_JOBS_BEFORE_RESTART", "100"))
HEARTBEAT_INTERVAL = 60  # Send heartbeat every 60 seconds when idle

# Setup logging
setup_logging(debug_mode=False)
logger = logging.getLogger("daemon")

# Global shutdown flag
_shutdown_requested = False


def signal_handler(signum, frame):
    """Handle graceful shutdown on SIGTERM/SIGINT."""
    global _shutdown_requested
    sig_name = signal.Signals(signum).name
    logger.info(f"Received {sig_name}, initiating graceful shutdown...")
    _shutdown_requested = True




async def _process_enrichment(attempt, client, rm):
    """Process a claimed enrichment attempt (AI extraction)."""
    from runner import _run_enrichment_job
    from utils.logging_handlers import JobLoggingSession

    attempt_id = attempt.attempt_id
    job_id = attempt.job_id or attempt_id

    try:
        await asyncio.to_thread(
            client.heartbeat,
            current_job_id=job_id,
            lease_token=attempt.lease_token,
            status="busy",
        )

        with JobLoggingSession(
            job_id=job_id,
            runner_name=client.runner_name,
            lease_token=attempt.lease_token,
            api_client=client,
            realtime_manager=rm,
        ) as job_logging:
            logger.info(
                f"Processing enrichment attempt {attempt_id} for SKU {attempt.sku}",
                extra={
                    "job_id": job_id,
                    "runner_name": client.runner_name,
                    "phase": "claimed",
                    "details": {
                        "attempt_id": attempt_id,
                        "sku": attempt.sku,
                        "target_url": attempt.target_url,
                        "model": attempt.model,
                        "mode": attempt.mode,
                    },
                    "flush_immediately": True,
                },
            )

            job_logging.emit_progress(
                status="running",
                progress=0,
                message="Enrichment attempt started",
                phase="claimed",
                details={
                    "attempt_id": attempt_id,
                    "sku": attempt.sku,
                    "target_url": attempt.target_url,
                },
                items_total=1,
            )

            start_time = time.time()
            results = _run_enrichment_job(
                attempt,
                runner_name=client.runner_name,
                log_buffer=None,
                api_client=client,
                job_logging=job_logging,
            )
            elapsed = time.time() - start_time

            logger.info(
                f"Enrichment attempt {attempt_id} completed in {elapsed:.1f}s",
                extra={
                    "job_id": job_id,
                    "runner_name": client.runner_name,
                    "phase": "completed",
                    "details": {
                        "attempt_id": attempt_id,
                        "sku": attempt.sku,
                        "elapsed_seconds": round(elapsed, 2),
                        "success": results.get("skus_processed", 0) > 0,
                    },
                    "flush_immediately": True,
                },
            )

    except Exception as e:
        logger.exception(
            f"Enrichment attempt {attempt_id} failed",
            extra={
                "job_id": job_id,
                "runner_name": client.runner_name,
                "phase": "failed",
                "attempt_id": attempt_id,
                "flush_immediately": True,
            },
        )
        try:
            client.submit_enrichment_result(
                attempt_id=attempt_id,
                status="failed",
                error_message=str(e),
                lease_token=getattr(attempt, "lease_token", None),
            )
        except Exception:
            logger.exception("Failed to submit enrichment failure result")







async def main_async():
    """Main async daemon loop."""
    global _shutdown_requested

    # Initialize API client
    client = ScraperAPIClient()
    # Initialize Sentry as early as possible (no-op if SENTRY_DSN not set)
    try:
        init_sentry()
    except Exception:
        logger.warning("Sentry initialization failed or not installed")
    # Start metrics server in background (non-blocking)
    metrics_httpd = None
    try:
        metrics_httpd, _metrics_thread = start_metrics_server()
    except Exception as e:
        logger.warning(f"Failed to start metrics server: {e}")

    runner_build_id = get_runner_build_id()
    runner_build_sha = get_runner_build_sha()
    runner_release_channel = get_runner_release_channel()

    if not client.api_url or not client.api_key:
        logger.error("Missing SCRAPER_API_URL or SCRAPER_API_KEY. Cannot start daemon.")
        sys.exit(1)

    # Wait for API to become available (dev mode hygiene)
    max_wait_seconds = 30
    start_wait = time.time()
    logger.info(f"Waiting for API at {client.api_url} to become available...")
    while time.time() - start_wait < max_wait_seconds:
        if client.health_check():
            logger.info("API is available. Proceeding...")
            break
        logger.info("API not yet available, retrying...")
        await asyncio.sleep(2)
    else:
        logger.warning(f"API at {client.api_url} did not become healthy within {max_wait_seconds}s. Proceeding anyway, but expect initial errors.")



    logger.info("=" * 60)
    logger.info("Bay State Scraper Daemon Starting")
    logger.info("=" * 60)
    logger.info(f"Environment: {args.env.upper()}")
    logger.info(f"Runner Name: {client.runner_name}")
    logger.info(f"Release Channel: {runner_release_channel}")
    logger.info(f"Runner Build ID: {runner_build_id}")
    logger.info(f"Runner Build SHA: {runner_build_sha}")
    logger.info(f"API URL: {client.api_url}")
    logger.info(f"Platform: {platform.system()} {platform.release()}")
    logger.info(f"Poll Interval: {POLL_INTERVAL}s")
    logger.info(f"Max Jobs Before Restart: {MAX_JOBS_BEFORE_RESTART}")
    logger.info("=" * 60)

    logger.info("Daemon API handler disabled; per-job log batches enabled")

    rm = None
    try:
        supabase_config = client.get_supabase_config()
        if supabase_config:
            supabase_url = supabase_config["supabase_url"]
            logger.info(f"[Daemon] Connecting to Realtime at {supabase_url}")
            rm = RealtimeManager(supabase_url, supabase_config["supabase_realtime_key"], client.runner_name)
            connected = await rm.connect()
            if connected:
                await rm.enable_presence()
                await rm.enable_broadcast()
                logger.info("[Daemon] Persistent Realtime presence enabled")
    except Exception as e:
        logger.warning(f"[Daemon] Failed to initialize Realtime presence: {e}")

    # Track both cohort and chunk completions with the same counter
    work_units_completed = 0
    last_heartbeat = 0
    consecutive_idle_polls = 0

    logger.info("[Daemon] Entering main polling loop")

    while not _shutdown_requested:
        try:
            if work_units_completed >= MAX_JOBS_BEFORE_RESTART:
                logger.info(f"Completed {work_units_completed} work units. Exiting for container restart (memory hygiene).")
                break

            logger.info("[Daemon] Claiming next enrichment attempt...")

            enrichment_attempt = await asyncio.to_thread(client.claim_enrichment, runner_name=client.runner_name)

            if enrichment_attempt:
                # Process enrichment work immediately
                consecutive_idle_polls = 0
                logger.info(
                    f"[Enrichment {enrichment_attempt.attempt_id}] Claimed - "
                    f"job={enrichment_attempt.job_id}, sku={enrichment_attempt.sku}"
                )
                await _process_enrichment(enrichment_attempt, client, rm)
                work_units_completed += 1
                continue
            else:
                # No work available - idle backoff
                consecutive_idle_polls += 1
                now = time.time()
                if now - last_heartbeat >= HEARTBEAT_INTERVAL:
                    await asyncio.to_thread(client.heartbeat, status="idle")
                    last_heartbeat = now
                    logger.debug("Heartbeat sent")

                import random

                max_interval = MAX_POLL_INTERVAL
                base_interval = POLL_INTERVAL
                backoff = base_interval * (1.5 ** (consecutive_idle_polls - 1))
                current_interval = min(max_interval, backoff)
                jitter = current_interval * 0.1
                sleep_time = current_interval + random.uniform(-jitter, jitter)
                logger.debug(f"No jobs found. Backing off for {sleep_time:.1f}s")
                await asyncio.sleep(sleep_time)
                continue

        except RunnerBuildMismatchError as e:
            latest_build_id = getattr(e, "latest_build_id", None)
            logger.error(
                "Coordinator rejected this runner image build%s%s. Shutting down so it does not keep polling.",
                f" {getattr(e, 'runner_build_id', runner_build_id)}" if getattr(e, "runner_build_id", None) else "",
                f" (latest build: {latest_build_id})" if latest_build_id else "",
            )
            logger.error(str(e))
            break
        except Exception as e:
            logger.error(f"Daemon loop error: {e}")
            await asyncio.sleep(POLL_INTERVAL)

    if rm:
        await rm.disconnect()

    # Shutdown metrics server if running
    try:
        if metrics_httpd:
            try:
                metrics_httpd.shutdown()
            except Exception:
                logger.exception("Error shutting down metrics HTTP server")
            try:
                metrics_httpd.server_close()
            except Exception:
                logger.exception("Error closing metrics HTTP server")
    except Exception:
        logger.exception("Error while stopping metrics server")

    logger.info("=" * 60)
    logger.info(f"Daemon shutting down. Work units completed: {work_units_completed}")
    logger.info("=" * 60)


def main():
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
