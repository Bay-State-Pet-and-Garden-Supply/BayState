from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys

from core.api_client import *
from utils.structured_logging import setup_structured_logging

from runner.chunk_mode import run_chunk_worker_mode
from runner.full_mode import run_full_mode
from runner.realtime_mode import run_realtime_mode

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a scrape job from the API")
    parser.add_argument("--job-id", help="Job ID to execute")
    parser.add_argument("--api-url", help="API base URL (or set SCRAPER_API_URL)")
    parser.add_argument("--runner-name", default=os.environ.get("RUNNER_NAME", "unknown"))
    parser.add_argument(
        "--mode",
        choices=["full", "chunk_worker", "realtime"],
        default="full",
        help="Execution mode: 'full', 'chunk_worker', or 'realtime'",
    )
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")

    # Local mode flags
    parser.add_argument("--local", action="store_true", help="Run in local mode (no API server required)")
    parser.add_argument("--config", help="Path to local YAML scraper config (requires --local)")
    parser.add_argument("--sku", help="SKU or comma-separated SKUs to scrape (requires --local)")
    parser.add_argument("--output", help="Output file path for results JSON (default: stdout)")
    parser.add_argument("--headless", action="store_true", default=True, help="Run browser headless (default: true)")
    parser.add_argument("--no-headless", action="store_true", help="Run browser in visible mode for debugging")

    args = parser.parse_args()

    if args.local:
        if not args.config:
            parser.error("--config is required in --local mode")
    else:
        if args.mode in {"full", "chunk_worker"} and not args.job_id:
            parser.error("--job-id is required unless --mode realtime or --local")

    return args


def run_local_mode(args: argparse.Namespace) -> None:
    """Execute a scraper locally against a YAML config without requiring an API server."""
    from datetime import datetime
    from scrapers.parser.yaml_parser import ScraperConfigParser

    # Auto-enable local YAML loading
    os.environ["USE_YAML_CONFIGS"] = "true"

    config_path = args.config
    if not os.path.isfile(config_path):
        logger.error(f"Config file not found: {config_path}")
        sys.exit(1)

    parser = ScraperConfigParser()
    try:
        config = parser.load_from_file(config_path)
    except Exception as e:
        logger.error(f"Failed to load config: {e}")
        sys.exit(1)

    logger.info(f"[Local] Loaded config: {config.name} ({config_path})")

    # Determine SKUs: --sku flag > test_skus from config
    if args.sku:
        skus = [s.strip() for s in args.sku.split(",") if s.strip()]
    elif config.test_skus:
        skus = list(config.test_skus)
        logger.info(f"[Local] No --sku provided, using {len(skus)} test_skus from config")
    else:
        logger.error("[Local] No SKUs: pass --sku or define test_skus in the YAML config")
        sys.exit(1)

    logger.info(f"[Local] SKUs to scrape: {skus}")

    headless = not args.no_headless

    # Build a minimal JobConfig for the runner
    job_id = f"local_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    scraper_cfg = ScraperConfig(
        name=config.name,
        display_name=getattr(config, "display_name", None),
        base_url=config.base_url,
        search_url_template=getattr(config, "search_url_template", None),
        selectors=[s.model_dump() if hasattr(s, "model_dump") else s for s in config.selectors],
        options={
            "workflows": [w.model_dump() if hasattr(w, "model_dump") else w for w in config.workflows],
            "timeout": config.timeout,
        },
        test_skus=list(config.test_skus) if config.test_skus else [],
        retries=config.retries if config.retries is not None else 2,
        validation=config.validation.model_dump() if hasattr(getattr(config, "validation", None), "model_dump") else getattr(config, "validation", None),
        login=config.login.model_dump() if hasattr(getattr(config, "login", None), "model_dump") else getattr(config, "login", None),
        credential_refs=list(config.credential_refs) if config.credential_refs else [],
    )

    credential_client = ScraperAPIClient(
        api_url=os.environ.get("SCRAPER_API_URL"),
        api_key=os.environ.get("SCRAPER_API_KEY", ""),
        runner_name="local-cli",
    )

    # Inject credentials from coordinator/Supabase/env if available
    for ref in (scraper_cfg.credential_refs or []):
        creds = credential_client.get_credentials(ref)
        if creds:
            if scraper_cfg.options is None:
                scraper_cfg.options = {}
            scraper_cfg.options["_credentials"] = creds
            logger.info(f"[Local] Injected credentials for '{ref}'")
            break

    job_config = JobConfig(
        job_id=job_id,
        skus=skus,
        scrapers=[scraper_cfg],
        test_mode=True,
        max_workers=1,
    )

    from runner import run_job

    logger.info(f"[Local] Starting local scrape job: {job_id}")
    try:
        results = run_job(job_config, runner_name="local-cli", api_client=credential_client)
    except Exception as e:
        logger.exception(f"[Local] Job failed: {e}")
        sys.exit(1)

    output_json = json.dumps(results, indent=2, default=str)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
        logger.info(f"[Local] Results written to {args.output}")
    else:
        print(output_json)


def main() -> None:
    args = parse_args()
    setup_structured_logging(debug=args.debug)

    if args.local:
        run_local_mode(args)
        return

    api_url = args.api_url or os.environ.get("SCRAPER_API_URL")
    if not api_url:
        logger.error("No API URL provided. Set --api-url or SCRAPER_API_URL")
        sys.exit(1)

    client = ScraperAPIClient(api_url=api_url, runner_name=args.runner_name)

    logger.info(f"[Runner] Performing pre-flight health check against {api_url}")
    try:
        client.health_check()
    except ConnectionError as e:
        logger.error(f"[Runner] Pre-flight health check failed: {e}")
        sys.exit(1)

    if args.mode == "realtime":
        asyncio.run(run_realtime_mode(client, args.runner_name))
    elif args.mode == "chunk_worker":
        run_chunk_worker_mode(client, args.job_id, args.runner_name)
    else:
        run_full_mode(client, args.job_id, args.runner_name)
