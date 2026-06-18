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
    python daemon.py                    # Loads .env
    python daemon.py --env dev          # Loads .env (--env is informational only)
    python daemon.py --env prod         # Loads .env (--env is informational only)

Environment Variables:
    SCRAPER_API_URL: Base URL for BayStateApp API (required)
    SCRAPER_API_KEY: API key for authentication (required)
    RUNNER_NAME: Identifier for this runner (defaults to hostname)
    POLL_INTERVAL: Seconds between polls when idle (default: 30)
    MAX_JOBS_BEFORE_RESTART: Recycle after N jobs to prevent leaks (default: 100)
    ENVIRONMENT: Set to 'dev' or 'prod' (informational; does not change env file)
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

# Single .env file for all environments.
# Production deployments set env vars via the platform, not this file.
env_file = PROJECT_ROOT / ".env"
if env_file.exists():
    load_dotenv(env_file, override=True)
else:
    print(f"Warning: {env_file} not found — relying on process environment")


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




async def _process_packaging_extraction(attempt, client, rm):
    """Process a claimed packaging extraction job (local VLM/OCR)."""
    from runner.packaging_extraction import _run_packaging_extraction_job
    from utils.logging_handlers import JobLoggingSession

    extraction_id = attempt.extraction_id
    upc = attempt.upc
    job_id = extraction_id

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
            try:
                logger.info(
                    "Processing packaging extraction %s for UPC %s",
                    extraction_id, upc,
                    extra={
                        "job_id": job_id,
                        "runner_name": client.runner_name,
                        "phase": "claimed",
                        "details": {
                            "extraction_id": extraction_id,
                            "upc": upc,
                            "image_count": len(attempt.image_urls) if attempt.image_urls else 0,
                        },
                        "flush_immediately": True,
                    },
                )

                job_logging.emit_progress(
                    status="running",
                    progress=0,
                    message=f"Packaging extraction started for UPC {upc}",
                    phase="claimed",
                    details={
                        "extraction_id": extraction_id,
                        "upc": upc,
                        "image_count": len(attempt.image_urls) if attempt.image_urls else 0,
                    },
                    items_total=1,
                )

                start_time = time.time()
                results = await _run_packaging_extraction_job(
                    attempt,
                    runner_name=client.runner_name,
                    log_buffer=None,
                    api_client=client,
                    job_logging=job_logging,
                )
                elapsed = time.time() - start_time

                logger.info(
                    "Packaging extraction %s completed in %.1fs",
                    extraction_id, elapsed,
                    extra={
                        "job_id": job_id,
                        "runner_name": client.runner_name,
                        "phase": "completed",
                        "details": {
                            "extraction_id": extraction_id,
                            "upc": upc,
                            "elapsed_seconds": round(elapsed, 2),
                            "success": results.get("upcs_processed", 0) > 0,
                        },
                        "flush_immediately": True,
                    },
                )
            except Exception as e:
                logger.exception(
                    "Packaging extraction %s failed",
                    extraction_id,
                    extra={
                        "job_id": job_id,
                        "runner_name": client.runner_name,
                        "phase": "failed",
                        "extraction_id": extraction_id,
                        "flush_immediately": True,
                    },
                )
                try:
                    client.submit_packaging_extraction_result(
                        extraction_id=extraction_id,
                        status="failed",
                        error_message=str(e),
                        lease_token=getattr(attempt, "lease_token", None),
                    )
                except Exception:
                    logger.exception("Failed to submit packaging extraction failure result")

    except Exception as e:
        logger.exception(
            "Packaging extraction job prep/heartbeat failed for %s",
            extraction_id,
            extra={
                "job_id": job_id,
                "runner_name": client.runner_name,
                "phase": "failed",
                "extraction_id": extraction_id,
            },
        )


async def _preflight_packaging_vision(
    base_url: str,
    vision_model: str,
    text_model: str | None = None,
) -> bool:
    """Verify the Ollama/local VLM endpoint is reachable and models are available.
    
    Prevents a misconfigured runner from claiming packaging extraction jobs
    when the VLM endpoint is down or models are missing, which would drain
    the queue with repeated failures.
    
    Returns True if both required models are available, False otherwise.
    """
    import httpx
    
    try:
        # Step 1: Check endpoint reachability via /v1/models
        models_url = f"{base_url.rstrip('/')}/models"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(models_url)
            resp.raise_for_status()
            model_list = resp.json()
        
        # Extract model IDs (OpenAI-compatible format)
        available = set()
        for entry in model_list.get("data", []):
            model_id = entry.get("id", "")
            if model_id:
                available.add(model_id)
        
        if not available:
            logger.warning(
                "[Preflight] VLM endpoint at %s returned no models",
                base_url,
            )
            return False
        
        # Step 2: Check vision model is present (exact or prefix match for Ollama tags)
        vision_available = any(
            m == vision_model or m.startswith(f"{vision_model}:")
            for m in available
        )
        if not vision_available:
            logger.warning(
                "[Preflight] Vision model '%s' not found at %s. Available: %s",
                vision_model,
                base_url,
                ", ".join(sorted(available)[:10]),
            )
            return False
        
        logger.info("[Preflight] Vision model '%s' confirmed", vision_model)
        
        # Step 3: Check text model if two-stage pipeline
        if text_model:
            text_available = any(
                m == text_model or m.startswith(f"{text_model}:")
                for m in available
            )
            if not text_available:
                logger.warning(
                    "[Preflight] Text model '%s' not found at %s. Available: %s",
                    text_model,
                    base_url,
                    ", ".join(sorted(available)[:10]),
                )
                return False
            logger.info("[Preflight] Text model '%s' confirmed", text_model)
        
        logger.info("[Preflight] Packaging vision endpoint healthy — ready to claim jobs")
        return True
        
    except Exception as e:
        logger.warning(
            "[Preflight] VLM endpoint at %s unreachable: %s",
            base_url,
            str(e)[:120],
        )
        return False


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
            try:
                logger.info(
                    f"Processing enrichment attempt {attempt_id} for UPC {attempt.upc}",
                    extra={
                        "job_id": job_id,
                        "runner_name": client.runner_name,
                        "phase": "claimed",
                        "details": {
                            "attempt_id": attempt_id,
                            "upc": attempt.upc,
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
                        "upc": attempt.upc,
                        "target_url": attempt.target_url,
                    },
                    items_total=1,
                )

                start_time = time.time()
                results = await _run_enrichment_job(
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
                            "upc": attempt.upc,
                            "elapsed_seconds": round(elapsed, 2),
                            "success": results.get("upcs_processed", 0) > 0,
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

    except Exception as e:
        logger.exception(
            f"Enrichment job prep/heartbeat failed for attempt {attempt_id}",
            extra={
                "job_id": job_id,
                "runner_name": client.runner_name,
                "phase": "failed",
                "attempt_id": attempt_id,
            },
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
    MAX_CONCURRENT_JOBS = int(os.environ.get("MAX_CONCURRENT_JOBS", "4"))
    running_tasks: set[asyncio.Task] = set()

    # Packaging extraction concurrency tracking
    PACKAGING_VISION_ENABLED = os.environ.get("PACKAGING_VISION_ENABLED", "").lower() in ("true", "1", "yes")
    packaging_max_concurrency = int(os.environ.get("PACKAGING_VISION_MAX_CONCURRENCY", "1"))
    packaging_running_count = 0

    if PACKAGING_VISION_ENABLED:
        vision_model = os.environ.get("PACKAGING_VISION_MODEL", "glm-ocr")
        pipeline = os.environ.get("PACKAGING_VISION_PIPELINE", "ocr_then_parse")
        text_model = os.environ.get("PACKAGING_TEXT_MODEL", "llama3.2:3b") if pipeline == "ocr_then_parse" else None
        
        # Preflight: verify Ollama endpoint is reachable and models are available.
        # A misconfigured runner with ENABLED=true but no Ollama would drain packaging
        # jobs with repeated failures. Preflight prevents that.
        preflight_ok = await _preflight_packaging_vision(
            os.environ.get("PACKAGING_VISION_BASE_URL", "http://127.0.0.1:11434/v1"),
            vision_model,
            text_model,
        )
        
        if preflight_ok:
            if text_model:
                logger.info(
                    "[Daemon] Packaging vision enabled (model=%s, pipeline=%s, text_model=%s, max_concurrency=%d)",
                    vision_model,
                    pipeline,
                    text_model,
                    packaging_max_concurrency,
                )
            else:
                logger.info(
                    "[Daemon] Packaging vision enabled (model=%s, pipeline=%s, max_concurrency=%d)",
                    vision_model,
                    pipeline,
                    packaging_max_concurrency,
                )
        else:
            logger.warning(
                "[Daemon] Packaging vision preflight FAILED — endpoint or models unavailable. "
                "Disabling packaging jobs to avoid draining the queue. "
                "Fix Ollama and restart."
            )
            PACKAGING_VISION_ENABLED = False
    else:
        logger.info("[Daemon] Packaging vision disabled — will not claim packaging extraction jobs")

    logger.info("[Daemon] Entering main polling loop")

    while not _shutdown_requested:
        try:
            # Clean up completed tasks
            for t in list(running_tasks):
                if t.done():
                    running_tasks.discard(t)
                    try:
                        await t
                        work_units_completed += 1
                    except Exception as e:
                        logger.error(f"[Daemon] Task raised unhandled exception: {e}")

            if work_units_completed >= MAX_JOBS_BEFORE_RESTART:
                if running_tasks:
                    logger.info(f"Completed {work_units_completed} work units. Waiting for remaining {len(running_tasks)} tasks to finish before restarting...")
                    await asyncio.gather(*running_tasks, return_exceptions=True)
                logger.info("Exiting for container restart (memory hygiene).")
                break

            # If we've hit our concurrency limit, wait for at least one task to finish
            if len(running_tasks) >= MAX_CONCURRENT_JOBS:
                logger.debug(f"[Daemon] Concurrency limit ({MAX_CONCURRENT_JOBS}) reached. Waiting for a task to complete...")
                done, pending = await asyncio.wait(running_tasks, return_when=asyncio.FIRST_COMPLETED)
                continue

            # -------------------------------------------------------------------
            # Try to claim enrichment work
            # -------------------------------------------------------------------
            logger.info("[Daemon] Claiming next enrichment attempt...")

            enrichment_attempt = await asyncio.to_thread(client.claim_enrichment, runner_name=client.runner_name)

            claimed_any = False

            if enrichment_attempt:
                # Process enrichment work in a background task
                consecutive_idle_polls = 0
                claimed_any = True
                logger.info(
                    f"[Enrichment {enrichment_attempt.attempt_id}] Claimed - "
                    f"job={enrichment_attempt.job_id}, upc={enrichment_attempt.upc}"
                )
                task = asyncio.create_task(_process_enrichment(enrichment_attempt, client, rm))
                running_tasks.add(task)

            # -------------------------------------------------------------------
            # Try to claim packaging extraction work (if enabled and within concurrency limit)
            # -------------------------------------------------------------------
            if PACKAGING_VISION_ENABLED:
                packaging_running_count = sum(
                    1 for t in running_tasks
                    if t.get_name and "packaging_extraction" in t.get_name()
                )
                if packaging_running_count < packaging_max_concurrency:
                    packaging_attempt = await asyncio.to_thread(
                        client.claim_packaging_extraction,
                        runner_name=client.runner_name,
                    )

                    if packaging_attempt:
                        consecutive_idle_polls = 0
                        claimed_any = True
                        logger.info(
                            f"[PackagingExtraction {packaging_attempt.extraction_id}] Claimed - "
                            f"upc={packaging_attempt.upc}, images={len(packaging_attempt.image_urls)}"
                        )
                        task = asyncio.create_task(
                            _process_packaging_extraction(packaging_attempt, client, rm)
                        )
                        task.set_name(f"packaging_extraction_{packaging_attempt.extraction_id}")
                        running_tasks.add(task)

            # -------------------------------------------------------------------
            # Yield control briefly so tasks can start executing
            # -------------------------------------------------------------------
            if claimed_any:
                await asyncio.sleep(0.1)
                continue

            # -------------------------------------------------------------------
            # No work at all — idle backoff with heartbeat
            # -------------------------------------------------------------------
            consecutive_idle_polls += 1
            now = time.time()
            if now - last_heartbeat >= HEARTBEAT_INTERVAL:
                status = "busy" if running_tasks else "idle"
                await asyncio.to_thread(client.heartbeat, status=status)
                last_heartbeat = now
                logger.debug(f"Heartbeat ({status}) sent")

            import random

            max_interval = MAX_POLL_INTERVAL
            base_interval = POLL_INTERVAL
            backoff = base_interval * (1.5 ** (consecutive_idle_polls - 1))
            current_interval = min(max_interval, backoff)

            # Cap polling interval when we have active background tasks to claim new work quickly
            if running_tasks:
                current_interval = min(current_interval, 10.0)

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

    # Graceful shutdown of remaining concurrent tasks
    if running_tasks:
        logger.info(f"Shutdown requested. Waiting for {len(running_tasks)} active tasks to complete gracefully...")
        await asyncio.gather(*running_tasks, return_exceptions=True)

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
