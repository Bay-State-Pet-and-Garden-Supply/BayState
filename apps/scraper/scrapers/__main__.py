"""
CLI entry point for running scrapers.

Usage:
    python -m src.scrapers --file /path/to/skus.xlsx    # Normal run with Excel SKUs
    python -m src.scrapers --test                        # Test mode using API-published test_skus
    python -m src.scrapers --test --scrapers amazon      # Test specific scraper(s)
"""

from __future__ import annotations


import argparse
import os
import sys
from typing import Any

from infra.api_client import $$$

# Ensure project root is in path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from infra.settings_manager import $$$


def _normalize_scraper_identifier(value: str) -> str:
    return value.strip().lower().replace("-", "_").replace(" ", "_")


def _get_api_client() -> ScraperAPIClient:
    client = ScraperAPIClient()
    if not client.api_url:
        raise RuntimeError("SCRAPER_API_URL not configured - API-backed scraper configs are required")
    if not client.api_key:
        raise RuntimeError("SCRAPER_API_KEY not configured - API-backed scraper configs are required")
    return client


def _fetch_scraper_configs(scrapers: list[str] | None = None) -> dict[str, dict[str, Any]]:
    client = _get_api_client()
    configs_data = client.list_published_configs()

    requested = {_normalize_scraper_identifier(s) for s in (scrapers or [])}
    config_map: dict[str, dict[str, Any]] = {}

    for item in configs_data:
        if not isinstance(item, dict):
            continue
        slug_raw = item.get("slug")
        slug = str(slug_raw).strip() if isinstance(slug_raw, str) else ""
        if not slug:
            continue

        normalized_slug = _normalize_scraper_identifier(slug)
        if requested and normalized_slug not in requested:
            continue

        published = client.get_published_config(slug)
        payload = published.get("config")
        if not isinstance(payload, dict):
            raise RuntimeError(f"Invalid published config payload for slug '{slug}'")

        name_raw = payload.get("name")
        if isinstance(name_raw, str) and name_raw.strip():
            key = _normalize_scraper_identifier(name_raw)
        else:
            key = normalized_slug
            payload["name"] = key
        config_map[key] = payload

    if requested and not config_map:
        raise RuntimeError("No matching scraper configs found in API")
    return config_map


def get_test_skus_from_configs(scrapers: list[str] | None = None) -> tuple[list[str], list[str]]:
    all_skus = set()
    used_scrapers = []

    configs = _fetch_scraper_configs(scrapers)
    for scraper_name, config in sorted(configs.items()):
        test_skus = config.get("test_skus", [])
        if isinstance(test_skus, list) and test_skus:
            normalized = [str(s).strip() for s in test_skus if str(s).strip()]
            if normalized:
                all_skus.update(normalized)
                used_scrapers.append(scraper_name)
                print(f"  [OK] {scraper_name}: {len(normalized)} test SKUs")

    return list(all_skus), used_scrapers


def run_test_mode(scrapers: list[str] | None = None, debug_mode: bool = False):
    from scrapers.runtime import run_scraping

    print("\n[TEST] TEST MODE - Using test_skus from API configurations\n")
    print("=" * 60)

    scraper_test_skus: dict[str, list[str]] = {}

    configs = _fetch_scraper_configs(scrapers)
    for scraper_name, config in sorted(configs.items()):
        test_skus = config.get("test_skus", [])
        if isinstance(test_skus, list):
            normalized = [str(s).strip() for s in test_skus if str(s).strip()]
            if normalized:
                scraper_test_skus[scraper_name] = normalized
                print(f"  [OK] {scraper_name}: {len(normalized)} test SKUs")

    if not scraper_test_skus:
        print("[ERROR] No test SKUs found in configurations!")
        sys.exit(1)

    total_skus = sum(len(skus) for skus in scraper_test_skus.values())
    print(f"\n[INFO] Total test SKUs across all scrapers: {total_skus}")
    print(f"[INFO] Scrapers to run: {', '.join(scraper_test_skus.keys())}")
    print("=" * 60 + "\n")

    # Run each scraper with only its own test_skus
    total_failed = 0

    for scraper_name, test_skus in scraper_test_skus.items():
        print(f"\n{'=' * 60}")
        print(f"[TEST] Running {scraper_name} with {len(test_skus)} test SKUs: {test_skus}")
        print("=" * 60)

        try:
            # Run this single scraper with only its test SKUs
            run_scraping(
                skus=test_skus,
                selected_sites=[scraper_name],
                test_mode=True,
                debug_mode=debug_mode,
            )
        except Exception as e:
            print(f"[ERROR] {scraper_name} failed: {e}")
            total_failed += len(test_skus)
            continue

    print(f"\n{'=' * 60}")
    print("[TEST] ALL SCRAPER TESTS COMPLETE")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Product Scraper CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m src.scrapers --file data/spreadsheets/products.xlsx
  python -m src.scrapers --test
  python -m src.scrapers --test --scrapers amazon petfoodex
        """,
    )

    parser.add_argument("--file", "-f", type=str, help="Path to Excel file containing SKUs")

    parser.add_argument(
        "--test",
        "-t",
        action="store_true",
        help="Run in test mode using API-published test_skus",
    )

    parser.add_argument("--scrapers", "-s", nargs="+", type=str, help="Specific scrapers to run (default: all)")

    parser.add_argument("--max-workers", "-w", type=int, help="Maximum number of concurrent worker threads")

    parser.add_argument(
        "--scraper-workers",
        nargs="+",
        help="Worker counts per scraper (e.g. 'amazon=2 chewy=1')",
    )

    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug mode",
    )

    args = parser.parse_args()

    # Validate arguments
    if not args.test and not args.file:
        parser.error("Either --file or --test must be specified")

    # Parse scraper workers if provided
    scraper_workers = {}
    if args.scraper_workers:
        for item in args.scraper_workers:
            try:
                name, count = item.split("=")
                scraper_workers[name] = int(count)
            except ValueError:
                print(f"[WARN] Invalid format for worker count: {item}. Use name=count")

    # Force reload settings to ensure we get the latest DB value
    try:
        settings.reload()
        # Fallback to DB setting if CLI flag is not set
        debug_mode = args.debug or settings.debug_mode
        if debug_mode:
            print("[INFO] Debug mode enabled")
    except Exception as e:
        print(f"[WARN] Failed to load settings: {e}")
        debug_mode = args.debug

    if args.test:
        run_test_mode(scrapers=args.scrapers, debug_mode=debug_mode)
    else:
        from scrapers.runtime import run_scraping

        if not os.path.exists(args.file):
            print(f"[ERROR] File not found: {args.file}")
            sys.exit(1)

        # Convert scraper names to title case for run_scraping
        selected = None
        if args.scrapers:
            selected = [_normalize_scraper_identifier(s) for s in args.scrapers]

        run_scraping(
            file_path=args.file,
            selected_sites=selected,
            max_workers=args.max_workers,
            scraper_workers=scraper_workers,
            debug_mode=debug_mode,
        )


if __name__ == "__main__":
    main()
