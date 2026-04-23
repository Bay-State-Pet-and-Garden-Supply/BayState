#!/usr/bin/env python3
"""Benchmark dataset manager for validating, refreshing, and maintaining URLs.

This script provides comprehensive management capabilities for the benchmark dataset:
  - validate: Check all URLs in the manifest and report dead links
  - refresh: Re-validate, add new URLs, remove dead ones
  - add: Add new URLs to the dataset
  - remove: Remove URLs from the dataset
  - stats: Show manifest statistics
  - export: Export to JSON/CSV formats

The script integrates with URLValidator from tests.benchmarks.unified.url_validator
and maintains backups before any modifications.

Usage:
    # Validate all URLs with 5 concurrent checks
    python scripts/manage_benchmark_dataset.py validate --max-urls=5

    # Show statistics
    python scripts/manage_benchmark_dataset.py stats

    # Refresh the dataset (dry run)
    python scripts/manage_benchmark_dataset.py refresh --dry-run

    # Add a new URL
    python scripts/manage_benchmark_dataset.py add --sku "123456" --url "https://..."

    # Export to CSV
    python scripts/manage_benchmark_dataset.py export --format csv --output export.csv
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import logging
import shutil
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

# Add project root to path for imports
PROJECT_ROOT = Path(__file__).resolve().parents[1]
TESTS_ROOT = PROJECT_ROOT / "tests"
for import_root in (PROJECT_ROOT, TESTS_ROOT):
    if str(import_root) not in sys.path:
        sys.path.insert(0, str(import_root))

from benchmarks.unified.url_validator import URLValidator, LiveURLManifest, URLCheckResult

logger = logging.getLogger(__name__)

# Default paths
DEFAULT_MANIFEST_PATH = PROJECT_ROOT / "data" / "benchmark_live_manifest.json"
DEFAULT_GOLDEN_DATASET_PATH = PROJECT_ROOT / "data" / "golden_dataset_v3.json"
DEFAULT_REPORTS_DIR = PROJECT_ROOT / "reports" / "benchmarks"
DEFAULT_LOG_PATH = DEFAULT_REPORTS_DIR / "dataset_operations.log"
DEFAULT_BACKUP_DIR = PROJECT_ROOT / "data" / "backups"

# Constants
DEFAULT_CONCURRENCY = 10
DEFAULT_TIMEOUT = 10.0


def setup_logging(log_path: Path | None = None, verbose: bool = False) -> None:
    """Configure logging to file and console."""
    log_path = log_path or DEFAULT_LOG_PATH
    log_path.parent.mkdir(parents=True, exist_ok=True)

    level = logging.DEBUG if verbose else logging.INFO

    # File handler with detailed format
    file_handler = logging.FileHandler(log_path, mode="a")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))

    # Console handler with simpler format
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(logging.Formatter("%(message)s"))

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    root_logger.handlers = []
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)


def load_manifest(manifest_path: Path) -> dict[str, Any]:
    """Load the manifest JSON file."""
    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")

    with open(manifest_path, encoding="utf-8") as f:
        return cast(dict[str, Any], json.load(f))


def save_manifest(manifest: dict[str, Any], manifest_path: Path) -> None:
    """Save the manifest to disk."""
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, default=str)


def backup_manifest(manifest_path: Path, backup_dir: Path | None = None) -> Path:
    """Create a timestamped backup of the manifest."""
    backup_dir = backup_dir or DEFAULT_BACKUP_DIR
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"benchmark_live_manifest_backup_{timestamp}.json"

    shutil.copy2(manifest_path, backup_path)
    logger.info(f"Backup created: {backup_path}")
    return backup_path


def extract_urls_from_manifest(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract all URL entries from the manifest (both alive and dead)."""
    entries: list[dict[str, Any]] = []

    for entry in manifest.get("entries", []):
        entry_copy = dict(entry)
        entry_copy["_status"] = "alive"
        entries.append(entry_copy)

    for entry in manifest.get("dead_entries", []):
        entry_copy = dict(entry)
        entry_copy["_status"] = "dead"
        entries.append(entry_copy)

    return entries


class DatasetManager:
    """Manager for benchmark dataset operations."""

    def __init__(
        self,
        manifest_path: Path | None = None,
        timeout: float = DEFAULT_TIMEOUT,
        concurrency: int = DEFAULT_CONCURRENCY,
    ) -> None:
        self.manifest_path = manifest_path or DEFAULT_MANIFEST_PATH
        self.timeout = timeout
        self.concurrency = concurrency
        self.validator = URLValidator(
            timeout=timeout,
            max_concurrency=concurrency,
        )

    async def validate_urls(
        self,
        max_urls: int | None = None,
        manifest: dict[str, Any] | None = None,
    ) -> tuple[list[URLCheckResult], list[URLCheckResult]]:
        """Validate URLs in the manifest.

        Returns:
            Tuple of (alive_results, dead_results)
        """
        if manifest is None:
            manifest = load_manifest(self.manifest_path)

        entries = extract_urls_from_manifest(manifest)

        if max_urls:
            entries = entries[:max_urls]
            logger.info(f"Validating first {max_urls} URLs...")
        else:
            logger.info(f"Validating all {len(entries)} URLs...")

        # Extract URLs for validation
        urls = [e.get("expected_source_url", "") for e in entries if e.get("expected_source_url")]

        # Validate concurrently
        semaphore = asyncio.Semaphore(self.concurrency)

        async def check_with_semaphore(url: str) -> URLCheckResult:
            async with semaphore:
                return await self.validator.check_url(url)

        tasks = [check_with_semaphore(url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Process results
        alive_results: list[URLCheckResult] = []
        dead_results: list[URLCheckResult] = []

        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Validation error: {result}")
                continue
            if result.alive:
                alive_results.append(result)
            else:
                dead_results.append(result)

        return alive_results, dead_results

    def show_stats(self, manifest: dict[str, Any] | None = None) -> dict[str, Any]:
        """Display and return manifest statistics."""
        if manifest is None:
            manifest = load_manifest(self.manifest_path)

        entries = manifest.get("entries", [])
        dead_entries = manifest.get("dead_entries", [])
        total = len(entries) + len(dead_entries)

        # Calculate statistics
        stats = {
            "manifest_path": str(self.manifest_path),
            "generated_at": manifest.get("generated_at", "unknown"),
            "dataset_version": manifest.get("dataset_version", "unknown"),
            "total_urls": total,
            "alive_urls": len(entries),
            "dead_urls": len(dead_entries),
            "alive_percentage": round(len(entries) / total * 100, 2) if total > 0 else 0,
            "dead_percentage": round(len(dead_entries) / total * 100, 2) if total > 0 else 0,
        }

        # Category breakdown
        categories: Counter[str] = Counter()
        for entry in entries + dead_entries:
            category = entry.get("category", "Unknown")
            categories[category] += 1

        stats["categories"] = dict(categories.most_common())

        # Difficulty breakdown
        difficulties: Counter[str] = Counter()
        for entry in entries + dead_entries:
            difficulty = entry.get("difficulty", "unknown")
            difficulties[difficulty] += 1

        stats["difficulties"] = dict(difficulties)

        # Brand breakdown (top 10)
        brands: Counter[str] = Counter()
        for entry in entries + dead_entries:
            brand = entry.get("brand", "Unknown")
            brands[brand] += 1

        stats["brands"] = dict(brands.most_common(10))

        # Response time statistics for alive URLs
        response_times: list[float] = []
        for entry in entries:
            validation = entry.get("_validation", {})
            if isinstance(validation, dict):
                rt = validation.get("response_time_ms")
                if rt is not None:
                    response_times.append(float(rt))

        if response_times:
            stats["response_time_ms"] = {
                "min": round(min(response_times), 2),
                "max": round(max(response_times), 2),
                "avg": round(sum(response_times) / len(response_times), 2),
                "median": round(sorted(response_times)[len(response_times) // 2], 2),
            }

        # Print formatted stats
        print("\n" + "=" * 70)
        print("BENCHMARK DATASET STATISTICS")
        print("=" * 70)
        print(f"Manifest:         {stats['manifest_path']}")
        print(f"Generated:        {stats['generated_at']}")
        print(f"Dataset Version:  {stats['dataset_version']}")
        print()
        print("URL Counts:")
        print(f"  Total:          {stats['total_urls']}")
        print(f"  Alive:          {stats['alive_urls']} ({stats['alive_percentage']}%)")
        print(f"  Dead:           {stats['dead_urls']} ({stats['dead_percentage']}%)")

        if response_times:
            print()
            print("Response Time (ms):")
            print(f"  Min:    {stats['response_time_ms']['min']}")
            print(f"  Max:    {stats['response_time_ms']['max']}")
            print(f"  Avg:    {stats['response_time_ms']['avg']}")
            print(f"  Median: {stats['response_time_ms']['median']}")

        print()
        print("Categories:")
        for category, count in categories.most_common():
            print(f"  {category}: {count}")

        print()
        print("Difficulty Distribution:")
        for difficulty, count in sorted(difficulties.items()):
            print(f"  {difficulty}: {count}")

        print()
        print("Top Brands:")
        for brand, count in brands.most_common(10):
            print(f"  {brand}: {count}")

        print("=" * 70 + "\n")

        return stats

    async def refresh_dataset(
        self,
        dry_run: bool = False,
        remove_dead: bool = True,
    ) -> LiveURLManifest:
        """Refresh the dataset by re-validating all URLs.

        Args:
            dry_run: If True, don't modify the manifest
            remove_dead: If True, remove dead URLs from the dataset

        Returns:
            The new LiveURLManifest
        """
        manifest = load_manifest(self.manifest_path)
        entries = manifest.get("entries", [])
        dead_entries = manifest.get("dead_entries", [])

        logger.info(f"Refreshing dataset with {len(entries)} alive and {len(dead_entries)} dead URLs")

        if not dry_run:
            backup_manifest(self.manifest_path)

        # Combine all entries for validation
        all_entries = entries + dead_entries

        # Validate all URLs
        alive_results: list[URLCheckResult] = []
        dead_results: list[URLCheckResult] = []

        semaphore = asyncio.Semaphore(self.concurrency)

        async def check_with_semaphore(entry: dict[str, Any]) -> tuple[dict[str, Any], URLCheckResult]:
            url = entry.get("expected_source_url", "")
            async with semaphore:
                result = await self.validator.check_url(url)
                return entry, result

        tasks = [check_with_semaphore(entry) for entry in all_entries]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        new_alive_entries: list[dict[str, Any]] = []
        new_dead_entries: list[dict[str, Any]] = []

        for item in results:
            if isinstance(item, Exception):
                logger.error(f"Validation error: {item}")
                continue

            entry, result = item

            # Update entry with new validation data
            entry["_validation"] = {
                "status_code": result.status_code,
                "response_time_ms": result.response_time_ms,
                "redirect_url": result.redirect_url,
                "content_type": result.content_type,
                "last_checked": datetime.now(timezone.utc).isoformat(),
            }

            if result.alive:
                new_alive_entries.append(entry)
                alive_results.append(result)
            else:
                entry["_validation"]["alive"] = False
                entry["_validation"]["error"] = result.error
                new_dead_entries.append(entry)
                dead_results.append(result)

        # Create new manifest
        new_manifest = LiveURLManifest(
            generated_at=datetime.now(timezone.utc).isoformat(),
            dataset_version=manifest.get("dataset_version", "unknown"),
            total_urls=len(all_entries),
            alive_urls=len(new_alive_entries),
            dead_urls=len(new_dead_entries),
            entries=new_alive_entries,
            dead_entries=new_dead_entries,
        )

        logger.info(f"Refresh complete: {len(new_alive_entries)} alive, {len(new_dead_entries)} dead")

        if dry_run:
            logger.info("[DRY RUN] Would save manifest with updated entries")
        else:
            new_manifest.save(self.manifest_path)
            logger.info(f"Manifest saved to {self.manifest_path}")

        return new_manifest

    def add_url(
        self,
        sku: str,
        url: str,
        product_name: str | None = None,
        brand: str | None = None,
        category: str | None = None,
        difficulty: str = "medium",
        rationale: str = "",
        dry_run: bool = False,
    ) -> dict[str, Any] | None:
        """Add a new URL to the dataset.

        Returns:
            The new entry or None if SKU already exists
        """
        manifest = load_manifest(self.manifest_path)
        entries = manifest.get("entries", [])

        # Check for duplicate SKU
        for entry in entries:
            if entry.get("sku") == sku:
                logger.error(f"SKU {sku} already exists in dataset")
                return None

        if not dry_run:
            backup_manifest(self.manifest_path)

        # Create new entry
        new_entry: dict[str, Any] = {
            "sku": sku,
            "expected_source_url": url,
            "product_name": product_name or sku,
            "query": product_name or sku,
            "brand": brand or "Unknown",
            "category": category or "Uncategorized",
            "difficulty": difficulty,
            "rationale": rationale or "Manually added",
        }

        if dry_run:
            logger.info(f"[DRY RUN] Would add entry: {sku} -> {url}")
        else:
            entries.append(new_entry)
            manifest["entries"] = entries
            manifest["total_urls"] = manifest.get("total_urls", 0) + 1
            manifest["alive_urls"] = manifest.get("alive_urls", 0) + 1
            manifest["generated_at"] = datetime.now(timezone.utc).isoformat()
            save_manifest(manifest, self.manifest_path)
            logger.info(f"Added entry: {sku} -> {url}")

        return new_entry

    def remove_url(
        self,
        sku: str | None = None,
        url: str | None = None,
        dry_run: bool = False,
    ) -> bool:
        """Remove a URL from the dataset by SKU or URL.

        Returns:
            True if removed, False if not found
        """
        if not sku and not url:
            logger.error("Must provide either --sku or --url")
            return False

        manifest = load_manifest(self.manifest_path)
        entries = manifest.get("entries", [])
        dead_entries = manifest.get("dead_entries", [])

        removed = False

        # Search and remove from entries
        for i, entry in enumerate(entries):
            if (sku and entry.get("sku") == sku) or (url and entry.get("expected_source_url") == url):
                if dry_run:
                    logger.info(f"[DRY RUN] Would remove entry: {entry.get('sku')} -> {entry.get('expected_source_url')}")
                else:
                    removed_entry = entries.pop(i)
                    manifest["entries"] = entries
                    manifest["total_urls"] = manifest.get("total_urls", 0) - 1
                    manifest["alive_urls"] = manifest.get("alive_urls", 0) - 1
                    logger.info(f"Removed entry: {removed_entry.get('sku')} -> {removed_entry.get('expected_source_url')}")
                removed = True
                break

        # Search and remove from dead_entries if not found in entries
        if not removed:
            for i, entry in enumerate(dead_entries):
                if (sku and entry.get("sku") == sku) or (url and entry.get("expected_source_url") == url):
                    if dry_run:
                        logger.info(f"[DRY RUN] Would remove dead entry: {entry.get('sku')} -> {entry.get('expected_source_url')}")
                    else:
                        removed_entry = dead_entries.pop(i)
                        manifest["dead_entries"] = dead_entries
                        manifest["total_urls"] = manifest.get("total_urls", 0) - 1
                        manifest["dead_urls"] = manifest.get("dead_urls", 0) - 1
                        logger.info(f"Removed dead entry: {removed_entry.get('sku')} -> {removed_entry.get('expected_source_url')}")
                    removed = True
                    break

        if not removed:
            logger.error(f"Entry not found: SKU={sku}, URL={url}")
            return False

        if not dry_run:
            if not removed:
                backup_manifest(self.manifest_path)
            manifest["generated_at"] = datetime.now(timezone.utc).isoformat()
            save_manifest(manifest, self.manifest_path)
            logger.info(f"Manifest saved to {self.manifest_path}")

        return True

    def export_dataset(
        self,
        output_path: Path,
        format: str = "json",
        manifest: dict[str, Any] | None = None,
    ) -> Path:
        """Export the dataset to a file.

        Args:
            output_path: Path to save the export
            format: 'json' or 'csv'
            manifest: Optional manifest to export (uses loaded manifest if None)

        Returns:
            Path to the exported file
        """
        if manifest is None:
            manifest = load_manifest(self.manifest_path)

        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        if format.lower() == "json":
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2, default=str)

        elif format.lower() == "csv":
            entries = manifest.get("entries", [])
            dead_entries = manifest.get("dead_entries", [])

            with open(output_path, "w", newline="", encoding="utf-8") as f:
                if entries:
                    fieldnames = list(entries[0].keys())
                    writer = csv.DictWriter(f, fieldnames=fieldnames)
                    writer.writeheader()
                    for entry in entries:
                        writer.writerow(entry)
                    for entry in dead_entries:
                        writer.writerow(entry)

        else:
            raise ValueError(f"Unsupported format: {format}")

        logger.info(f"Exported dataset to {output_path} ({format} format)")
        return output_path


# =============================================================================
# CLI Commands
# =============================================================================


def cmd_validate(args: argparse.Namespace) -> int:
    """Run the validate command."""
    manager = DatasetManager(
        manifest_path=args.manifest,
        timeout=args.timeout,
        concurrency=args.concurrency,
    )

    alive_results, dead_results = asyncio.run(manager.validate_urls(max_urls=args.max_urls))

    print("\n" + "=" * 70)
    print("VALIDATION RESULTS")
    print("=" * 70)
    print(f"Alive URLs:   {len(alive_results)}")
    print(f"Dead URLs:    {len(dead_results)}")
    print(f"Total:        {len(alive_results) + len(dead_results)}")

    if dead_results:
        print("\nDead URLs:")
        for result in dead_results:
            print(f"  - {result.url}")
            if result.error:
                print(f"    Error: {result.error}")
            elif result.status_code:
                print(f"    Status: {result.status_code}")

    print("=" * 70 + "\n")

    logger.info(f"Validation complete: {len(alive_results)} alive, {len(dead_results)} dead")
    return 0 if len(dead_results) == 0 else 1


def cmd_stats(args: argparse.Namespace) -> int:
    """Run the stats command."""
    manager = DatasetManager(manifest_path=args.manifest)
    manager.show_stats()
    return 0


def cmd_refresh(args: argparse.Namespace) -> int:
    """Run the refresh command."""
    manager = DatasetManager(
        manifest_path=args.manifest,
        timeout=args.timeout,
        concurrency=args.concurrency,
    )

    if args.dry_run:
        logger.info("[DRY RUN] No changes will be made")

    manifest = asyncio.run(
        manager.refresh_dataset(
            dry_run=args.dry_run,
            remove_dead=args.remove_dead,
        )
    )

    print("\n" + "=" * 70)
    print("REFRESH COMPLETE")
    print("=" * 70)
    print(f"Alive URLs:   {manifest.alive_urls}")
    print(f"Dead URLs:    {manifest.dead_urls}")
    print(f"Total:        {manifest.total_urls}")
    print("=" * 70 + "\n")

    return 0


def cmd_add(args: argparse.Namespace) -> int:
    """Run the add command."""
    manager = DatasetManager(manifest_path=args.manifest)

    if args.dry_run:
        logger.info("[DRY RUN] No changes will be made")

    entry = manager.add_url(
        sku=args.sku,
        url=args.url,
        product_name=args.product_name,
        brand=args.brand,
        category=args.category,
        difficulty=args.difficulty,
        rationale=args.rationale,
        dry_run=args.dry_run,
    )

    if entry is None:
        return 1

    return 0


def cmd_remove(args: argparse.Namespace) -> int:
    """Run the remove command."""
    manager = DatasetManager(manifest_path=args.manifest)

    if args.dry_run:
        logger.info("[DRY RUN] No changes will be made")

    success = manager.remove_url(
        sku=args.sku,
        url=args.url,
        dry_run=args.dry_run,
    )

    return 0 if success else 1


def cmd_export(args: argparse.Namespace) -> int:
    """Run the export command."""
    manager = DatasetManager(manifest_path=args.manifest)

    output_path = args.output or f"benchmark_export.{args.format}"

    try:
        manager.export_dataset(
            output_path=Path(output_path),
            format=args.format,
        )
        return 0
    except ValueError as e:
        logger.error(f"Export failed: {e}")
        return 1


# =============================================================================
# CLI Parser
# =============================================================================


def create_parser() -> argparse.ArgumentParser:
    """Create the argument parser with subcommands."""
    parser = argparse.ArgumentParser(
        description="Benchmark dataset manager for validating and maintaining URLs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        "--manifest",
        type=Path,
        default=DEFAULT_MANIFEST_PATH,
        help=f"Path to manifest file (default: {DEFAULT_MANIFEST_PATH})",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT,
        help=f"HTTP timeout in seconds (default: {DEFAULT_TIMEOUT})",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=DEFAULT_CONCURRENCY,
        help=f"Max concurrent URL checks (default: {DEFAULT_CONCURRENCY})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose logging",
    )
    parser.add_argument(
        "--log-path",
        type=Path,
        default=DEFAULT_LOG_PATH,
        help=f"Path to log file (default: {DEFAULT_LOG_PATH})",
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # validate command
    validate_parser = subparsers.add_parser(
        "validate",
        help="Validate all URLs in the manifest",
    )
    validate_parser.add_argument(
        "--max-urls",
        type=int,
        help="Limit validation to first N URLs",
    )
    validate_parser.set_defaults(func=cmd_validate)

    # stats command
    stats_parser = subparsers.add_parser(
        "stats",
        help="Show manifest statistics",
    )
    stats_parser.set_defaults(func=cmd_stats)

    # refresh command
    refresh_parser = subparsers.add_parser(
        "refresh",
        help="Re-validate all URLs and update the manifest",
    )
    refresh_parser.add_argument(
        "--remove-dead",
        action="store_true",
        default=True,
        help="Remove dead URLs from the dataset (default: True)",
    )
    refresh_parser.set_defaults(func=cmd_refresh)

    # add command
    add_parser = subparsers.add_parser(
        "add",
        help="Add a new URL to the dataset",
    )
    add_parser.add_argument("--sku", required=True, help="Product SKU")
    add_parser.add_argument("--url", required=True, help="Product URL")
    add_parser.add_argument("--product-name", help="Product name")
    add_parser.add_argument("--brand", help="Product brand")
    add_parser.add_argument("--category", help="Product category")
    add_parser.add_argument(
        "--difficulty",
        choices=["easy", "medium", "hard"],
        default="medium",
        help="Difficulty level",
    )
    add_parser.add_argument("--rationale", help="Rationale for this URL")
    add_parser.set_defaults(func=cmd_add)

    # remove command
    remove_parser = subparsers.add_parser(
        "remove",
        help="Remove a URL from the dataset",
    )
    remove_parser.add_argument("--sku", help="Product SKU to remove")
    remove_parser.add_argument("--url", help="URL to remove")
    remove_parser.set_defaults(func=cmd_remove)

    # export command
    export_parser = subparsers.add_parser(
        "export",
        help="Export the dataset to JSON or CSV",
    )
    export_parser.add_argument(
        "--format",
        choices=["json", "csv"],
        default="json",
        help="Export format",
    )
    export_parser.add_argument(
        "--output",
        type=Path,
        help="Output file path",
    )
    export_parser.set_defaults(func=cmd_export)

    return parser


def main(argv: list[str] | None = None) -> int:
    """Main entry point."""
    parser = create_parser()
    args = parser.parse_args(argv)

    # Setup logging
    setup_logging(log_path=args.log_path, verbose=args.verbose)

    # Log startup
    logger.info("=" * 70)
    logger.info("Benchmark Dataset Manager Started")
    logger.info(f"Command: {args.command or 'None'}")
    logger.info(f"Manifest: {args.manifest}")
    logger.info("=" * 70)

    if not args.command:
        parser.print_help()
        return 1

    try:
        return args.func(args)
    except FileNotFoundError as e:
        logger.error(f"File not found: {e}")
        return 1
    except Exception as e:
        logger.error(f"Error: {e}")
        if args.verbose:
            import traceback

            traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
