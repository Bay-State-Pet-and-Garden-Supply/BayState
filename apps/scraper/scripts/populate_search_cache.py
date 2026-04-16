#!/usr/bin/env python3
"""CLI script to populate the AI Search cache with real Serper results.

This script reads queries from a file and fetches real search results from
the Serper API, storing them in the cache directory for later use.

Usage:
    python populate_search_cache.py --queries queries.txt
    python populate_search_cache.py --queries queries.txt --output-dir .cache/ai_search
    python populate_search_cache.py --queries queries.txt --verbose

Environment:
    SERPER_API_KEY: API key for Serper service. Required.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scrapers.ai_search.cache_manager import CacheManager


def setup_logging(verbose: bool) -> None:
    """Configure logging based on verbosity level."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )


def load_queries(queries_path: Path) -> list[str]:
    """Load queries from a file.

    Args:
        queries_path: Path to file containing queries (one per line).

    Returns:
        List of query strings.

    Raises:
        FileNotFoundError: If queries file doesn't exist.
    """
    with open(queries_path, "r", encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip()]


async def main() -> int:
    """Main entry point for the CLI script."""
    parser = argparse.ArgumentParser(
        description="Populate AI Search cache with real Serper results",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    %(prog)s --queries queries.txt
    %(prog)s --queries queries.txt --output-dir .cache/ai_search
    %(prog)s --queries queries.txt --verbose
    %(prog)s --validate-only
    %(prog)s --stats-only
        """,
    )

    parser.add_argument(
        "--queries",
        type=Path,
        help="Path to file containing queries (one per line)",
    )

    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Cache directory path (default: .cache/ai_search)",
    )

    parser.add_argument(
        "--ttl-days",
        type=int,
        default=30,
        help="TTL for cache entries in days (default: 30)",
    )

    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose logging",
    )

    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Only validate cache without populating",
    )

    parser.add_argument(
        "--stats-only",
        action="store_true",
        help="Only show cache statistics without populating",
    )

    parser.add_argument(
        "--clear-expired",
        action="store_true",
        help="Clear expired cache entries before populating",
    )

    parser.add_argument(
        "--max-concurrency",
        type=int,
        default=10,
        help="Max concurrent API requests (default: 10)",
    )

    args = parser.parse_args()

    setup_logging(args.verbose)
    logger = logging.getLogger(__name__)

    if args.validate_only and args.stats_only:
        parser.error("Cannot use --validate-only with --stats-only")

    if not any([args.queries, args.validate_only, args.stats_only]):
        parser.error("Either --queries, --validate-only, or --stats-only is required")

    cache_manager = CacheManager(
        cache_dir=args.output_dir,
        ttl_days=args.ttl_days,
    )

    logger.info("Using cache directory: %s", cache_manager.cache_dir)

    if args.validate_only:
        logger.info("Validating cache...")
        result = cache_manager.validate_cache()

        print("\n=== Cache Validation Results ===")
        print(f"Total files: {result.total_files}")
        print(f"Valid files: {len(result.valid_files)}")
        print(f"Corrupt files: {len(result.corrupt_files)}")
        print(f"Missing schema version: {len(result.missing_schema_version)}")

        if result.corrupt_files:
            print("\nCorrupt files:")
            for f in result.corrupt_files:
                print(f"  - {f}")

        if result.missing_schema_version:
            print("\nMissing schema version:")
            for f in result.missing_schema_version:
                print(f"  - {f}")

        return 0 if result.ishealthy else 1

    if args.stats_only:
        logger.info("Computing cache statistics...")
        stats = cache_manager.get_cache_stats()

        print("\n=== Cache Statistics ===")
        print(f"Total files: {stats.total_files}")
        print(f"Total size: {stats.total_size_mb:.2f} MB")
        print(f"Hit rate: {stats.hit_rate:.2%}")
        print(f"Oldest file: {stats.oldest_file_age_days:.1f} days")
        print(f"Newest file: {stats.newest_file_age_days:.1f} days")
        print(f"Corrupt files: {len(stats.corrupt_files)}")
        print(f"Missing schema version: {len(stats.missing_schema_version)}")

        print("\nAge distribution:")
        for bucket, count in stats.age_distribution.items():
            print(f"  {bucket}: {count}")

        return 0

    if not args.queries:
        parser.error("--queries is required for populate operation")
        return 1

    if not args.queries.exists():
        logger.error("Queries file not found: %s", args.queries)
        return 1

    queries = load_queries(args.queries)
    if not queries:
        logger.error("No queries found in file: %s", args.queries)
        return 1

    logger.info("Loaded %d queries from %s", len(queries), args.queries)

    if args.clear_expired:
        logger.info("Clearing expired cache entries...")
        deleted = cache_manager.clear_expired_cache()
        logger.info("Deleted %d expired files", len(deleted))

    logger.info("Populating cache...")
    result = await cache_manager.populate_cache(
        queries,
        max_concurrency=args.max_concurrency,
    )

    print("\n=== Cache Population Results ===")
    print(f"Success: {result['success']}")
    print(f"Failed: {result['failed']}")
    print(f"Skipped (already cached): {result['skipped']}")

    if result["errors"]:
        print("\nErrors:")
        for error in result["errors"][:10]:
            print(f"  - {error}")
        if len(result["errors"]) > 10:
            print(f"  ... and {len(result['errors']) - 10} more errors")

    final_stats = cache_manager.get_cache_stats()
    print(f"\nCache now contains {final_stats.total_files} files")
    print(f"Total cache size: {final_stats.total_size_mb:.2f} MB")

    if result["failed"] > 0:
        return 1

    return 0


if __name__ == "__main__":
    try:
        exit_code = asyncio.run(main())
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(130)
    except Exception:
        traceback.print_exc()
        sys.exit(1)
