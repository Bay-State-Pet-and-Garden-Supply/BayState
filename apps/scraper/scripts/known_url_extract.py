#!/usr/bin/env python3
"""Known-URL extraction CLI wrapper for ProductPageExtractor.

This script provides a narrow JSON stdin/stdout contract so non-Python callers
can request extraction without importing scraper internals directly.

Usage:
    uv run --with-requirements requirements.txt python scripts/known_url_extract.py --stdin
    uv run --with-requirements requirements.txt python scripts/known_url_extract.py --input request.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

# Ensure project root is in path
PROJECT_ROOT = Path(__file__).parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scrapers.product_url_extraction.known_url_wrapper import (
    KnownUrlExtractionRequest,
    run_known_url_extraction,
)

logger = logging.getLogger("known_url_extract")


def configure_logging(debug: bool = False) -> None:
    logging.basicConfig(
        level=logging.DEBUG if debug else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stderr,
    )


def load_payload(args: argparse.Namespace) -> dict:
    if args.stdin:
        raw = sys.stdin.read()
    elif args.input:
        raw = Path(args.input).read_text(encoding="utf-8")
    else:
        raise ValueError("Provide either --stdin or --input <path>")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON payload: {exc}") from exc

    if not isinstance(payload, dict):
        raise ValueError("Extraction payload must be a JSON object")

    return payload


async def async_main(args: argparse.Namespace) -> int:
    payload = load_payload(args)
    request = KnownUrlExtractionRequest.from_dict(payload)
    response = await run_known_url_extraction(request)
    json.dump(response, sys.stdout)
    sys.stdout.write("\n")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Known-URL extraction wrapper")
    parser.add_argument("--input", help="Path to request JSON file")
    parser.add_argument(
        "--stdin",
        action="store_true",
        help="Read request JSON from stdin",
    )
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    configure_logging(debug=args.debug)

    try:
        return asyncio.run(async_main(args))
    except ValueError as exc:
        logger.error("Invalid known-url extraction request: %s", exc)
        json.dump({"status": "failed", "error": str(exc), "warnings": [str(exc)]}, sys.stdout)
        sys.stdout.write("\n")
        return 2
    except Exception as exc:
        logger.exception("Known-url extraction crashed")
        json.dump(
            {
                "status": "failed",
                "error": f"Wrapper crashed: {exc}",
                "warnings": ["Known-url extraction wrapper crashed unexpectedly."],
            },
            sys.stdout,
        )
        sys.stdout.write("\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
