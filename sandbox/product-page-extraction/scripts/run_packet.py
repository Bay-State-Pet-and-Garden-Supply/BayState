#!/usr/bin/env python3
"""Orchestrate discovery + extraction for one local product packet."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path
from typing import Any

from common import env_bool, env_int, get_output_dir, load_dotenv, read_json, sandbox_path
from discover_from_sitemap import discover, load_site_config
from extract_product_page import run as extract_run


def read_yaml(path: Path) -> dict[str, Any]:
    import yaml

    return yaml.safe_load(path.read_text()) or {}


def parser_with_env() -> argparse.ArgumentParser:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Run discovery/extraction for one product packet.")
    parser.add_argument("--site-config", type=Path, default=Path("configs/site.sample.yaml"))
    parser.add_argument("--extraction-config", type=Path, default=Path("configs/extraction.sample.yaml"))
    parser.add_argument("--site-key", default="fromm-example")
    parser.add_argument("--url")
    parser.add_argument("--upc")
    parser.add_argument("--sku")
    parser.add_argument("--brand", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--fixture-id")
    parser.add_argument("--output-dir", default=str(get_output_dir()))
    parser.add_argument("--llm", choices=["off", "auto", "required"], default=os.environ.get("C4AI_LLM_MODE", "off"))
    parser.add_argument("--top", type=int, default=5)
    parser.add_argument("--timeout-ms", type=int, default=env_int("SANDBOX_PAGE_TIMEOUT_MS", 45000))
    parser.add_argument("--screenshot", action="store_true", default=env_bool("SANDBOX_SCREENSHOTS", False))
    parser.add_argument("--no-rendered", action="store_true", help="Skip Crawl4AI rendered DOM image extraction")
    parser.add_argument("--dry-run", action="store_true")
    return parser


def resolve_configs(args: argparse.Namespace) -> dict[str, Any]:
    extraction_config = read_yaml(sandbox_path(args.extraction_config)) if args.extraction_config else {}
    return {"extraction": extraction_config}


async def run_product(args: argparse.Namespace) -> Path | None:
    configs = resolve_configs(args)
    if args.dry_run:
        print(json.dumps({"dry_run": True, "args": vars(args), "configs": configs}, indent=2, default=str))
        return None

    selected_url = args.url
    candidates: list[dict[str, Any]] = []
    site = None
    if not selected_url:
        site = load_site_config(sandbox_path(args.site_config), args.site_key)
        candidates = discover(site, brand=args.brand, name=args.name, upc=args.upc)[: args.top]
        selected_url = candidates[0]["url"] if candidates else None
    if not selected_url:
        raise SystemExit("No URL supplied and discovery returned no candidates")

    discovery_metadata = {
        "used": not bool(args.url),
        "sitemap_urls": (site or {}).get("sitemap_urls", []) if site else [],
        "candidate_count": len(candidates),
        "selected_url": selected_url,
        "candidates": candidates,
    }
    extract_args = argparse.Namespace(
        url=selected_url,
        upc=args.upc,
        sku=args.sku,
        brand=args.brand,
        name=args.name,
        site_key=args.site_key,
        fixture_id=args.fixture_id,
        output_dir=args.output_dir,
        llm=args.llm,
        screenshot=args.screenshot,
        timeout_ms=args.timeout_ms,
        discovery_metadata=discovery_metadata,
        fixture_row=getattr(args, "fixture_row", None),
        no_rendered=getattr(args, "no_rendered", False),
    )
    return await extract_run(extract_args)


async def main_async() -> None:
    args = parser_with_env().parse_args()
    await run_product(args)


if __name__ == "__main__":
    asyncio.run(main_async())
