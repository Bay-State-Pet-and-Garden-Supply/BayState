from __future__ import annotations

import argparse
import logging
import os
import sys

from core.api_client import ConnectionError
from core.api_client import ScraperAPIClient
from utils.structured_logging import setup_structured_logging

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bay State Scraper CLI (bsr)")
    parser.add_argument("--api-url", help="API base URL (or set SCRAPER_API_URL)")
    parser.add_argument("--runner-name", default=os.environ.get("RUNNER_NAME", "unknown"))
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")


    parser.add_argument("--upc", help="SKU to extract (enrichment mode)")
    parser.add_argument("--url", help="Target URL to extract from (enrichment mode)")
    parser.add_argument("--output", help="Output file path for results JSON (default: stdout)")
    parser.add_argument("--headless", action="store_true", default=True, help="Run browser headless (default: true)")
    parser.add_argument("--no-headless", action="store_true", help="Run browser in visible mode for debugging")

    # Enrichment mode flags
    parser.add_argument(
        "--enrichment-mode",
        choices=["enrichment"],
        default="enrichment",
        help="Execution mode",
    )
    parser.add_argument("--model", default="deepseek-chat", help="LLM model for enrichment")
    parser.add_argument("--enrichment-strategy", default="mixed", choices=["llm", "mixed", "structured", "metadata"], help="AI extraction strategy")
    parser.add_argument("--brand", help="Expected brand for enrichment")
    parser.add_argument("--product-name", help="Expected product name for enrichment")
    parser.add_argument("--domain", help="Domain of the target URL")

    args = parser.parse_args()


    return args


def run_enrichment_mode(args: argparse.Namespace) -> None:
    """Run a single enrichment (AI extraction) locally."""
    import json
    import asyncio
    from datetime import datetime
    from runner import _run_enrichment_job
    from core.api_client import ClaimedEnrichment

    if not args.upc or not args.url:
        logger.error("Enrichment mode requires --upc and --url")
        sys.exit(1)

    logger.info(
        f"[Enrichment] Running AI extraction: SKU={args.upc}, URL={args.url}, "
        f"model={args.model}, strategy={args.enrichment_strategy}"
    )

    job_id = f"enrichment_local_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    job_payload = {
        "target_url": args.url,
        "upc": args.upc,
        "model": args.model,
        "mode": args.enrichment_strategy,
        "attempt_id": f"local_{args.upc}",
    }
    if args.brand:
        job_payload["brand"] = args.brand
    if args.product_name:
        job_payload["product_name"] = args.product_name
    if args.domain:
        job_payload["domain"] = args.domain

    job_config = ClaimedEnrichment(
        attempt_id=f"local_{args.upc}",
        job_id=job_id,
        upc=args.upc,
        target_url=args.url,
        domain=args.domain,
        model=args.model,
        mode=args.enrichment_strategy,
        job_config=job_payload,
        test_mode=True,
    )

    from runner import settings
    if args.no_headless:
        settings.browser_settings["headless"] = False
    else:
        settings.browser_settings["headless"] = not args.no_headless

    results = asyncio.run(_run_enrichment_job(job_config, runner_name="local-cli"))

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

    upcs_processed = results.get("upcs_processed", 0)
    if upcs_processed == 0:
        sys.exit(1)


def main() -> None:
    args = parse_args()
    setup_structured_logging(debug=args.debug)

    # Enrichment mode (AI extraction without YAML configs)
    if args.upc and args.url:
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

    logger.info("[Runner] Local CLI initialized. Use --upc and --url for extraction.")

