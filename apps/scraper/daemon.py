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
from typing import Any, TYPE_CHECKING

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
        print(f"Warning: {env_file} not found, falling back to .env")
        env_file = PROJECT_ROOT / ".env"
else:
    env_file = PROJECT_ROOT / ".env"

if env_file.exists():
    load_dotenv(env_file, override=True)


try:
    # Prefer package-relative imports when daemon.py is imported as part of the
    # `scraper` package (normal runtime).
    from core.api_client import ClaimedChunk, ClaimedCohort, ScraperAPIClient, JobConfig, RunnerBuildMismatchError
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

    # Defer metrics endpoint import to runtime branch below to avoid static
    # assignment/signature mismatches when providing fallbacks for import checks.
    # Typed no-op defaults for metrics server so static checkers accept usages
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
    from typing import Any

    api_mod = importlib.import_module("apps.scraper.core.api_client")
    ClaimedChunk = getattr(api_mod, "ClaimedChunk")
    ScraperAPIClient = getattr(api_mod, "ScraperAPIClient")
    JobConfig = getattr(api_mod, "JobConfig")
    ClaimedCohort = getattr(api_mod, "ClaimedCohort")

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
        metrics_mod = importlib.import_module("apps.scraper.engine.metrics_endpoint")
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
    from utils.logging_handlers import JobLoggingSession  # type: ignore


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


def run_job(job_config, client, log_buffer=None, job_logging=None) -> dict[str, Any]:
    """
    Execute a scrape job using the existing runner logic.

    This imports and calls the run_job function from runner.py,
    but fetches credentials from the coordinator instead of local storage.
    """
    from runner import run_job  # type: ignore

    # Fetch credentials for any scrapers that require login
    for scraper in job_config.scrapers:
        if needs_credentials(scraper.name):
            creds = client.get_credentials(scraper.name)
            if creds:
                # Inject credentials into scraper options
                if scraper.options is None:
                    scraper.options = {}
                scraper.options["_credentials"] = creds
                logger.debug(
                    f"Injected credentials for {scraper.name}",
                    extra={
                        "job_id": job_config.job_id,
                        "runner_name": client.runner_name,
                        "scraper_name": scraper.name,
                        "phase": "configuring",
                    },
                )

    return run_job(
        job_config,
        runner_name=client.runner_name,
        log_buffer=log_buffer,
        api_client=client,
        job_logging=job_logging,
    )


def run_claimed_chunk(chunk, client, log_buffer=None, job_logging=None) -> dict[str, Any]:
    job_config = client.get_job_config(chunk.job_id)
    if not job_config:
        raise RuntimeError(f"Failed to fetch job config for chunk job {chunk.job_id}")

    job_config.skus = chunk.skus
    job_config.test_mode = chunk.test_mode
    job_config.max_workers = chunk.max_workers

    if chunk.scrapers:
        job_config.scrapers = [s for s in job_config.scrapers if s.name in chunk.scrapers or (s.display_name and s.display_name in chunk.scrapers)]

    return run_job(job_config, client, log_buffer, job_logging=job_logging)


def needs_credentials(scraper_name: str) -> bool:
    """Check if a scraper requires login credentials."""
    # Known scrapers that require authentication
    LOGIN_SCRAPERS = {"petfoodex", "phillips", "orgill", "shopsite"}
    return scraper_name.lower() in LOGIN_SCRAPERS

async def process_chunk(chunk, client, rm):
    """Process a claimed chunk of SKUs."""
    from utils.logging_handlers import JobLoggingSession

    try:
        await asyncio.to_thread(client.heartbeat, current_job_id=chunk.job_id, lease_token=chunk.lease_token, status="busy")
        with JobLoggingSession(
            job_id=chunk.job_id,
            runner_name=client.runner_name,
            lease_token=chunk.lease_token,
            api_client=client,
            realtime_manager=rm,
        ) as job_logging:
            logger.info(
                f"Claimed chunk {chunk.chunk_id}",
                extra={
                    "job_id": chunk.job_id,
                    "runner_name": client.runner_name,
                    "phase": "claimed",
                    "details": {
                        "chunk_id": chunk.chunk_id,
                        "chunk_index": chunk.chunk_index,
                        "sku_count": len(chunk.skus),
                        "scrapers": chunk.scrapers,
                    },
                    "flush_immediately": True,
                },
            )
            job_logging.emit_progress(
                status="running",
                progress=0,
                message="Chunk processing started",
                phase="claimed",
                details={
                    "chunk_id": chunk.chunk_id,
                    "chunk_index": chunk.chunk_index,
                    "sku_count": len(chunk.skus),
                },
                items_total=len(chunk.skus),
            )

            start_time = time.time()
            results = await asyncio.to_thread(run_claimed_chunk, chunk, client, None, job_logging)
            elapsed = time.time() - start_time

            logger.info(
                f"Chunk {chunk.chunk_id} completed",
                extra={
                    "job_id": chunk.job_id,
                    "runner_name": client.runner_name,
                    "phase": "completed",
                    "details": {
                        "chunk_id": chunk.chunk_id,
                        "elapsed_seconds": round(elapsed, 2),
                        "skus_processed": results.get("skus_processed", 0),
                    },
                    "flush_immediately": True,
                },
            )

            chunk_results = {
                "skus_processed": results.get("skus_processed", 0),
                "skus_successful": len(results.get("data", {})),
                "skus_failed": results.get("skus_processed", 0) - len(results.get("data", {})),
                "data": results.get("data", {}),
                "telemetry": results.get("telemetry", {}),
                "logs": results.get("logs", []) or job_logging.snapshot(),
            }

            await asyncio.to_thread(
                client.submit_chunk_results,
                chunk.chunk_id,
                "completed",
                results=chunk_results,
            )

            logger.info(
                f"Chunk {chunk.chunk_id} completed in {elapsed:.1f}s",
                extra={
                    "job_id": chunk.job_id,
                    "runner_name": client.runner_name,
                    "phase": "completed",
                    "details": {"skus_processed": results.get("skus_processed", 0)},
                },
            )

    except Exception as e:
        logger.exception(
            f"Chunk {chunk.chunk_id} failed",
            extra={
                "job_id": chunk.job_id,
                "runner_name": client.runner_name,
                "phase": "failed",
                "chunk_id": chunk.chunk_id,
                "chunk_index": chunk.chunk_index,
                "flush_immediately": True,
            },
        )
        await asyncio.to_thread(
            client.submit_chunk_results,
            chunk.chunk_id,
            "failed",
            error_message=str(e),
        )


async def process_cohort(cohort, client, rm):
    """Process a claimed cohort batch."""
    from utils.logging_handlers import JobLoggingSession

    cohort_id = cohort.cohort_id
    job_id = cohort_id  # Use cohort_id as the job identifier

    try:
        await asyncio.to_thread(client.heartbeat, current_job_id=job_id, lease_token=cohort.lease_token, status="busy")
        with JobLoggingSession(
            job_id=job_id,
            runner_name=client.runner_name,
            lease_token=cohort.lease_token,
            api_client=client,
            realtime_manager=rm,
        ) as job_logging:
            logger.info(
                f"Claimed cohort {cohort_id}",
                extra={
                    "job_id": job_id,
                    "runner_name": client.runner_name,
                    "phase": "claimed",
                    "details": {
                        "cohort_id": cohort_id,
                        "cohort_index": cohort.cohort_index,
                        "product_count": len(cohort.products),
                        "scrapers": cohort.scrapers,
                    },
                    "flush_immediately": True,
                },
            )
            job_logging.emit_progress(
                status="running",
                progress=0,
                message="Cohort processing started",
                phase="claimed",
                details={
                    "cohort_id": cohort_id,
                    "cohort_index": cohort.cohort_index,
                    "product_count": len(cohort.products),
                },
                items_total=len(cohort.products),
            )

            start_time = time.time()

            # Build job config from cohort data
            job_config = client.get_job_config(cohort_id)
            if not job_config:
                raise RuntimeError(f"Failed to fetch job config for cohort {cohort_id}")

            # Convert cohort products to SKU list
            skus = [p.get("sku") or p.get("upc") for p in cohort.products if p.get("sku") or p.get("upc")]
            job_config.skus = skus
            job_config.test_mode = cohort.test_mode
            job_config.max_workers = cohort.max_workers

            # Filter scrapers if specified
            if cohort.scrapers:
                job_config.scrapers = [s for s in job_config.scrapers if s.name in cohort.scrapers]

            results = await asyncio.to_thread(run_job, job_config, client, None, job_logging=job_logging)
            elapsed = time.time() - start_time

            logger.info(
                f"Cohort {cohort_id} completed",
                extra={
                    "job_id": job_id,
                    "runner_name": client.runner_name,
                    "phase": "completed",
                    "details": {
                        "cohort_id": cohort_id,
                        "elapsed_seconds": round(elapsed, 2),
                        "products_processed": results.get("skus_processed", 0),
                    },
                    "flush_immediately": True,
                },
            )

            cohort_results = {
                "products_processed": results.get("skus_processed", 0),
                "products_successful": len(results.get("data", {})),
                "products_failed": results.get("skus_processed", 0) - len(results.get("data", {})),
                "product_results": results.get("data", {}),
                "telemetry": results.get("telemetry", {}),
                "logs": results.get("logs", []) or job_logging.snapshot(),
            }

            await asyncio.to_thread(
                client.submit_cohort_results,
                cohort_id,
                "completed",
                results=cohort_results,
            )

            logger.info(
                f"Cohort {cohort_id} completed in {elapsed:.1f}s",
                extra={
                    "job_id": job_id,
                    "runner_name": client.runner_name,
                    "phase": "completed",
                    "details": {"products_processed": results.get("skus_processed", 0)},
                },
            )

    except Exception as e:
        logger.exception(
            f"Cohort {cohort_id} failed",
            extra={
                "job_id": job_id,
                "runner_name": client.runner_name,
                "phase": "failed",
                "cohort_id": cohort_id,
                "cohort_index": cohort.cohort_index,
                "flush_immediately": True,
            },
        )
        await asyncio.to_thread(
            client.submit_cohort_results,
            cohort_id,
            "failed",
            error_message=str(e),
        )

def validate_runtime_dependencies() -> None:
    """Fail fast when the container has an incompatible scraper runtime."""
    metrics_module = __import__("scrapers.ai_metrics", fromlist=["record_ai_extraction", "record_ai_fallback"])
    missing_symbols = [symbol for symbol in ("record_ai_extraction", "record_ai_fallback") if not hasattr(metrics_module, symbol)]
    if missing_symbols:
        raise ImportError(
            "scrapers.ai_metrics is missing required symbols: "
            + ", ".join(sorted(missing_symbols))
            + ". Rebuild/update the scraper image so daemon and scraper modules are in sync."
        )


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

    try:
        validate_runtime_dependencies()
    except Exception as e:
        logger.error(f"Runtime dependency check failed: {e}")
        logger.error("Refusing to claim chunks with an incompatible runtime. Restart with updated image/code.")
        sys.exit(1)

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

            logger.info("[Daemon] Claiming next work unit...")

            # Try cohort claiming first (if enabled), fall back to chunk claiming
            use_cohort_processing = os.environ.get("USE_COHORT_PROCESSING", "true").lower() == "true"

            work_unit = None
            is_cohort = False

            if use_cohort_processing:
                cohort = await asyncio.to_thread(client.claim_cohort, runner_name=client.runner_name)
                if cohort:
                    logger.info(f"[Cohort {cohort.cohort_id}] Claimed - index={cohort.cohort_index}, products={len(cohort.products)}")
                    work_unit = cohort
                    is_cohort = True

            if not work_unit:
                # Fall back to chunk claiming
                chunk = await asyncio.to_thread(client.claim_chunk, runner_name=client.runner_name)
                if chunk:
                    logger.info(f"[Chunk {chunk.chunk_id}] Claimed - job={chunk.job_id}, skus={len(chunk.skus)}")
                    work_unit = chunk
                    is_cohort = False

            if not work_unit:
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

            # Process the work unit (cohort or chunk)
            consecutive_idle_polls = 0

            if is_cohort:
                await process_cohort(work_unit, client, rm)
            else:
                await process_chunk(work_unit, client, rm)
            work_units_completed += 1


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
