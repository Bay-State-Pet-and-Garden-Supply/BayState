"""Cache management utilities for AI Search Scraper.

This module provides utilities for managing the Serper search result cache,
including population, validation, cleanup, and statistics.

Cache Format:
    JSON files stored in `.cache/ai_search/{hash}.json` where hash is the
    SHA256 hash of the normalized cache key.

    {
        "schema_version": 1,
        "query": "original query",
        "results": [
            {
                "url": "https://...",
                "title": "...",
                "description": "...",
                "provider": "serper",
                "result_type": "organic"
            }
        ]
    }
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from pathlib import Path
from typing import Any

from scrapers.ai_search.fixture_search_client import (
    CACHE_DIR_NAME,
    CACHE_SCHEMA_VERSION,
    CACHE_SUBDIR_NAME,
    FixtureSearchClient,
)
from scrapers.providers.serper import SerperSearchClient

logger = logging.getLogger(__name__)


@dataclass
class CacheStats:
    """Statistics about the cache."""

    total_files: int = 0
    total_size_bytes: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    oldest_file_age_days: float = 0.0
    newest_file_age_days: float = 0.0
    age_distribution: dict[str, int] = field(default_factory=dict)
    corrupt_files: list[Path] = field(default_factory=list)
    missing_schema_version: list[Path] = field(default_factory=list)

    @property
    def hit_rate(self) -> float:
        """Calculate cache hit rate."""
        total = self.cache_hits + self.cache_misses
        if total == 0:
            return 0.0
        return self.cache_hits / total

    @property
    def total_size_mb(self) -> float:
        """Return total size in megabytes."""
        return self.total_size_bytes / (1024 * 1024)


@dataclass
class ValidationResult:
    """Result of cache validation."""

    valid_files: list[Path] = field(default_factory=list)
    corrupt_files: list[Path] = field(default_factory=list)
    missing_schema_version: list[Path] = field(default_factory=list)
    expired_files: list[Path] = field(default_factory=list)
    total_files: int = 0

    @property
    def ishealthy(self) -> bool:
        """Return True if no issues found."""
        return len(self.corrupt_files) == 0 and len(self.missing_schema_version) == 0


class CacheManager:
    """Manages the AI Search cache directory.

    This class provides utilities for:
    - Populating cache with real Serper API results
    - Validating cache integrity (corrupt files, schema version)
    - Clearing expired cache entries based on TTL
    - Computing cache statistics

    Args:
        cache_dir: Root directory for cache files. Defaults to ".cache".
        ttl_days: Default TTL for cache entries in days. Defaults to 30.
        api_key: Serper API key. If None, reads from SERPER_API_KEY env var.

    Example:
        >>> manager = CacheManager()
        >>> await manager.populate_cache(["query1", "query2"])
        >>> stats = manager.get_cache_stats()
        >>> print(f"Cache size: {stats.total_size_mb:.2f} MB")
    """

    def __init__(
        self,
        cache_dir: str | Path | None = None,
        ttl_days: int = 30,
        api_key: str | None = None,
    ) -> None:
        self._cache_dir = self._resolve_cache_dir(cache_dir)
        self._ttl_days = ttl_days
        self._api_key = api_key or os.getenv("SERPER_API_KEY", "")
        self._fixture_client = FixtureSearchClient(
            cache_dir=self._cache_dir,
            schema_version=CACHE_SCHEMA_VERSION,
        )
        self._stats = CacheStats()

    @staticmethod
    def _resolve_cache_dir(cache_dir: str | Path | None) -> Path:
        """Resolve cache directory to absolute Path.

        Args:
            cache_dir: Cache directory path or None for default.

        Returns:
            Absolute Path to the cache directory.
        """
        if cache_dir is None:
            return Path(CACHE_DIR_NAME) / CACHE_SUBDIR_NAME
        return Path(cache_dir).resolve()

    @staticmethod
    def _normalize_cache_key(query: str) -> str:
        """Normalize a query string to a cache key.

        Args:
            query: The raw query string to normalize.

        Returns:
            The normalized cache key.
        """
        return " ".join(str(query or "").split()).lower()

    @staticmethod
    def _compute_cache_hash(cache_key: str) -> str:
        """Compute the SHA256 hash for a cache key.

        Args:
            cache_key: The normalized cache key.

        Returns:
            The SHA256 hex digest of the cache key.
        """
        return hashlib.sha256(cache_key.encode()).hexdigest()

    def _get_cache_path(self, cache_key: str) -> Path:
        """Get the cache file path for a normalized cache key.

        Args:
            cache_key: The normalized cache key.

        Returns:
            Path to the cache JSON file.
        """
        cache_hash = self._compute_cache_hash(cache_key)
        return self._cache_dir / f"{cache_hash}.json"

    async def populate_cache(
        self,
        queries: Sequence[str],
        *,
        max_concurrency: int = 10,
    ) -> dict[str, Any]:
        """Fetch and cache real results from Serper API.

        Args:
            queries: List of search queries to fetch and cache.
            max_concurrency: Maximum concurrent API requests. Defaults to 10.

        Returns:
            Dict with 'success', 'failed', 'skipped' counts and details.
        """
        if not self._api_key:
            logger.error("SERPER_API_KEY not set, cannot populate cache")
            return {
                "success": 0,
                "failed": len(queries),
                "skipped": 0,
                "errors": ["SERPER_API_KEY not set"],
            }

        self._cache_dir.mkdir(parents=True, exist_ok=True)

        serper_client = SerperSearchClient(api_key=self._api_key)
        results: dict[str, Any] = {
            "success": 0,
            "failed": 0,
            "skipped": 0,
            "errors": [],
        }

        import asyncio

        semaphore = asyncio.Semaphore(max_concurrency)

        async def fetch_and_cache(query: str) -> tuple[str, bool, str | None]:
            """Fetch a single query and cache the result."""
            async with semaphore:
                cache_key = self._normalize_cache_key(query)
                cache_path = self._get_cache_path(cache_key)

                if cache_path.exists():
                    results["skipped"] += 1
                    return query, False, None

                search_results, error = await serper_client.search(query)

                if error:
                    results["failed"] += 1
                    results["errors"].append(f"Query {query!r}: {error}")
                    return query, False, error

                self._fixture_client.write_cache_entry(query, search_results)
                results["success"] += 1
                return query, True, None

        tasks = [fetch_and_cache(q) for q in queries]
        await asyncio.gather(*tasks, return_exceptions=True)

        logger.info(
            "Cache population complete: %d success, %d failed, %d skipped",
            results["success"],
            results["failed"],
            results["skipped"],
        )

        return results

    def validate_cache(self) -> ValidationResult:
        """Check cache integrity and schema version.

        Validates that all cache files:
        - Are valid JSON
        - Have the expected schema_version field

        Does NOT check for expired files (use clear_expired_cache for that).

        Returns:
            ValidationResult with lists of valid/corrupt/invalid files.
        """
        result = ValidationResult()

        if not self._cache_dir.exists():
            return result

        cache_files = list(self._cache_dir.glob("*.json"))
        result.total_files = len(cache_files)

        for cache_file in cache_files:
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    data = json.load(f)

                if "schema_version" not in data:
                    result.missing_schema_version.append(cache_file)
                elif data["schema_version"] != CACHE_SCHEMA_VERSION:
                    result.missing_schema_version.append(cache_file)
                else:
                    result.valid_files.append(cache_file)

            except (json.JSONDecodeError, OSError) as e:
                logger.warning("Corrupt cache file %s: %s", cache_file, e)
                result.corrupt_files.append(cache_file)

        return result

    def clear_expired_cache(self, ttl_days: int | None = None) -> list[Path]:
        """Remove cache files older than TTL.

        Uses file modification time to determine age.

        Args:
            ttl_days: TTL in days. If None, uses self._ttl_days.
                Defaults to 30.

        Returns:
            List of deleted file paths.
        """
        ttl = ttl_days if ttl_days is not None else self._ttl_days
        cutoff_time = time.time() - (ttl * 86400)
        deleted: list[Path] = []

        if not self._cache_dir.exists():
            return deleted

        for cache_file in self._cache_dir.glob("*.json"):
            try:
                mtime = cache_file.stat().st_mtime
                if mtime < cutoff_time:
                    cache_file.unlink()
                    deleted.append(cache_file)
                    logger.debug("Deleted expired cache: %s", cache_file.name)
            except OSError as e:
                logger.warning("Failed to delete %s: %s", cache_file, e)

        if deleted:
            logger.info("Cleared %d expired cache files", len(deleted))

        return deleted

    def get_cache_stats(self) -> CacheStats:
        """Compute cache statistics.

        Returns:
            CacheStats object with size, count, age distribution, etc.
        """
        stats = CacheStats()

        if not self._cache_dir.exists():
            return stats

        now = time.time()
        age_buckets = {
            "0-7 days": 0,
            "8-30 days": 0,
            "31-90 days": 0,
            "90+ days": 0,
        }

        for cache_file in self._cache_dir.glob("*.json"):
            try:
                stat = cache_file.stat()
                stats.total_files += 1
                stats.total_size_bytes += stat.st_size

                age_days = (now - stat.st_mtime) / 86400

                if stats.oldest_file_age_days == 0 or age_days > stats.oldest_file_age_days:
                    stats.oldest_file_age_days = age_days
                if stats.newest_file_age_days == 0 or age_days < stats.newest_file_age_days:
                    stats.newest_file_age_days = age_days

                if age_days <= 7:
                    age_buckets["0-7 days"] += 1
                elif age_days <= 30:
                    age_buckets["8-30 days"] += 1
                elif age_days <= 90:
                    age_buckets["31-90 days"] += 1
                else:
                    age_buckets["90+ days"] += 1

            except OSError as e:
                logger.warning("Failed to stat %s: %s", cache_file, e)

        stats.age_distribution = age_buckets

        validation = self.validate_cache()
        stats.corrupt_files = validation.corrupt_files
        stats.missing_schema_version = validation.missing_schema_version

        return stats

    def record_cache_hit(self) -> None:
        """Record a cache hit for statistics."""
        self._stats.cache_hits += 1

    def record_cache_miss(self) -> None:
        """Record a cache miss for statistics."""
        self._stats.cache_misses += 1

    def get_cached_result(self, query: str) -> tuple[list[dict[str, Any]], bool]:
        """Get a cached result if it exists.

        Args:
            query: The search query.

        Returns:
            Tuple of (results, found) where found is True if cache hit.
        """
        cache_key = self._normalize_cache_key(query)
        cache_path = self._get_cache_path(cache_key)

        if not cache_path.exists():
            self.record_cache_miss()
            return [], False

        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            if data.get("schema_version") != CACHE_SCHEMA_VERSION:
                self.record_cache_miss()
                return [], False

            results = data.get("results", [])
            if not isinstance(results, list):
                results = []

            self.record_cache_hit()
            return results, True

        except (json.JSONDecodeError, OSError):
            self.record_cache_miss()
            return [], False

    def clear_all_cache(self) -> int:
        """Remove all cache files.

        WARNING: This deletes all cache files without confirmation.

        Returns:
            Number of files deleted.
        """
        if not self._cache_dir.exists():
            return 0

        count = 0
        for cache_file in self._cache_dir.glob("*.json"):
            try:
                cache_file.unlink()
                count += 1
            except OSError as e:
                logger.warning("Failed to delete %s: %s", cache_file, e)

        logger.info("Cleared %d cache files", count)
        return count

    @property
    def cache_dir(self) -> Path:
        """Return the cache directory path."""
        return self._cache_dir

    @property
    def ttl_days(self) -> int:
        """Return the default TTL in days."""
        return self._ttl_days
