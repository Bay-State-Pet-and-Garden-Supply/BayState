from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any

from core.api_client import ConnectionError
from core.api_client import JobConfig
from core.api_client import ScraperAPIClient
from core.api_client import ScraperConfig
from utils.logging_handlers import JobLoggingSession
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

    parser.add_argument("--sku", help="SKU to extract (enrichment mode)")
    parser.add_argument("--url", help="Target URL to extract from (enrichment mode)")
    parser.add_argument("--output", help="Output file path for results JSON (default: stdout)")
    parser.add_argument("--headless", action="store_true", default=True, help="Run browser headless (default: true)")
    parser.add_argument("--no-headless", action="store_true", help="Run browser in visible mode for debugging")

    # Enrichment mode flags
    parser.add_argument(
        "--enrichment-mode",
        choices=["enrichment", "standard"],
        default="standard",
        help="Execution mode",
    )
    parser.add_argument("--model", default="deepseek-chat", help="LLM model for enrichment")
    parser.add_argument("--enrichment-strategy", default="mixed", choices=["llm", "mixed", "structured", "metadata"], help="AI extraction strategy")
    parser.add_argument("--brand", help="Expected brand for enrichment")
    parser.add_argument("--product-name", help="Expected product name for enrichment")
    parser.add_argument("--domain", help="Domain of the target URL")

    args = parser.parse_args()

    if args.mode in {"full", "chunk_worker"} and not args.job_id:
        parser.error("--job-id is required unless --mode realtime")

    return args


def run_enrichment_mode(args: argparse.Namespace) -> None:
    """Run a single enrichment (AI extraction) locally."""
    import json
    from datetime import datetime
    from runner import _run_enrichment_job
    from core.api_client import JobConfig, ScraperConfig

    if not args.sku or not args.url:
        logger.error("Enrichment mode requires --sku and --url")
        sys.exit(1)

    logger.info(
        f"[Enrichment] Running AI extraction: SKU={args.sku}, URL={args.url}, "
        f"model={args.model}, strategy={args.enrichment_strategy}"
    )

    job_id = f"enrichment_local_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    job_payload = {
        "target_url": args.url,
        "sku": args.sku,
        "model": args.model,
        "mode": args.enrichment_strategy,
        "attempt_id": f"local_{args.sku}",
    }
    if args.brand:
        job_payload["brand"] = args.brand
    if args.product_name:
        job_payload["product_name"] = args.product_name
    if args.domain:
        job_payload["domain"] = args.domain

    job_config = JobConfig(
        job_id=job_id,
        skus=[args.sku],
        scrapers=[],
        test_mode=True,
        max_workers=1,
        job_type="enrichment",
        job_config=job_payload,
    )

    from runner import settings
    if args.no_headless:
        settings.browser_settings["headless"] = False
    else:
        settings.browser_settings["headless"] = not args.no_headless

    results = _run_enrichment_job(job_config, runner_name="local-cli")

    # Output enrichment result JSON
    enrichment_results = results.get("enrichment_results", [])
    if enrichment_results:
        output_json = json.dumps(enrichment_results[0], indent=2, default=str)
    else:
        output_json = json.dumps(results.get("data", {}), indent=2, default=str)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
        logger.info(f"[Enrichment] Results written to {args.output}")
    else:
        print(output_json)

    skus_processed = results.get("skus_processed", 0)
    if skus_processed == 0:
        sys.exit(1)


def main() -> None:
    args = parse_args()
    setup_structured_logging(debug=args.debug)

    # Enrichment mode (AI extraction without YAML configs)
    if args.enrichment_mode == "enrichment":
        run_enrichment_mode(args)
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
