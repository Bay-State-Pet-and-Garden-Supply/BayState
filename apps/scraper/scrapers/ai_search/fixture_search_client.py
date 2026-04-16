"""Fixture search client for zero-cost testing of AI Search Scraper."""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Sequence

logger = logging.getLogger(__name__)

# Schema version for cache file format validation
CACHE_SCHEMA_VERSION = 1

# Cache directory name
CACHE_DIR_NAME = ".cache"
CACHE_SUBDIR_NAME = "ai_search"


class CacheMissError(Exception):
    """Raised when a cache miss occurs and allow_real_api is False."""

    def __init__(self, query: str, cache_key: str) -> None:
        self.query = query
        self.cache_key = cache_key
        super().__init__(f"Cache miss for query: {query!r} (key: {cache_key!r})")


class SchemaVersionMismatchError(Exception):
    """Raised when cache file schema version doesn't match expected version."""

    def __init__(self, expected: int, found: int, cache_path: Path) -> None:
        self.expected = expected
        self.found = found
        self.cache_path = cache_path
        super().__init__(f"Schema version mismatch in {cache_path}: expected {expected}, found {found}")


class FixtureSearchClient:
    """A search client that reads cached Serper results from JSON files on disk.

    This client is designed for zero-cost testing of AI Search Scraper components
    without making real API calls. It reads pre-cached Serper search results and
    returns them in the same format as the real SerperSearchClient.

    Cache Key Normalization:
        - Query is lowercased
        - Whitespace is collapsed (multiple spaces -> single space)
        - Query is stripped of leading/trailing whitespace

    Cache File Format:
        JSON files stored in `.cache/ai_search/{hash}.json` where hash is the
        MD5 hash of the normalized cache key.

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

    Args:
        cache_dir: Root directory for cache files. Defaults to ".cache".
            Can be absolute or relative path.
        allow_real_api: If True, raises CacheMissError on cache miss.
            If False (default), this client never makes real API calls.
        schema_version: Expected schema version for cache validation.
    """

    def __init__(
        self,
        cache_dir: str | Path | None = None,
        *,
        allow_real_api: bool = False,
        schema_version: int = CACHE_SCHEMA_VERSION,
    ) -> None:
        self._cache_dir = self._resolve_cache_dir(cache_dir)
        self._allow_real_api = allow_real_api
        self._schema_version = schema_version

    @staticmethod
    def _resolve_cache_dir(cache_dir: str | Path | None) -> Path:
        """Resolve cache directory to absolute Path."""
        if cache_dir is None:
            return Path(CACHE_DIR_NAME) / CACHE_SUBDIR_NAME
        return Path(cache_dir).resolve()

    @staticmethod
    def _normalize_cache_key(query: str) -> str:
        """Normalize a query string to a cache key.

        Normalization rules:
            - Convert to lowercase
            - Collapse multiple whitespace characters to single space
            - Strip leading and trailing whitespace

        Examples:
            " Acme  Widget " -> "acme widget"
            "  test   query  " -> "test query"
            "UPPERCASE" -> "uppercase"

        Args:
            query: The raw query string to normalize.

        Returns:
            The normalized cache key.
        """
        return " ".join(str(query or "").split()).lower()

    @staticmethod
    def _compute_cache_hash(cache_key: str) -> str:
        """Compute the MD5 hash for a cache key.

        Args:
            cache_key: The normalized cache key.

        Returns:
            The MD5 hex digest of the cache key.
        """
        return hashlib.md5(cache_key.encode()).hexdigest()

    def _get_cache_path(self, cache_key: str) -> Path:
        """Get the cache file path for a normalized cache key.

        Args:
            cache_key: The normalized cache key.

        Returns:
            Path to the cache JSON file.
        """
        cache_hash = self._compute_cache_hash(cache_key)
        return self._cache_dir / f"{cache_hash}.json"

    def _validate_schema_version(self, cache_data: dict[str, Any], cache_path: Path) -> None:
        """Validate that cache file has expected schema version.

        Args:
            cache_data: Parsed JSON data from cache file.
            cache_path: Path to the cache file (for error messages).

        Raises:
            SchemaVersionMismatchError: If schema version doesn't match.
        """
        found_version = cache_data.get("schema_version")
        if found_version != self._schema_version:
            raise SchemaVersionMismatchError(
                expected=self._schema_version,
                found=found_version,
                cache_path=cache_path,
            )

    async def search(self, query: str) -> tuple[list[dict[str, Any]], str | None]:
        """Search using cached Serper results.

        This method matches the SearchClient.search interface:
            async def search(self, query: str) -> tuple[list[dict[str, Any]], str | None]

        Args:
            query: The search query string.

        Returns:
            A tuple of (results, error) where:
                - results: List of search result dicts with keys: url, title,
                  description, provider, result_type
                - error: None on success, error message string on failure

        Raises:
            CacheMissError: If no cache entry exists and allow_real_api is False.
            SchemaVersionMismatchError: If cache file has incompatible schema version.
        """
        cache_key = self._normalize_cache_key(query)
        cache_path = self._get_cache_path(cache_key)

        if not cache_path.exists():
            if not self._allow_real_api:
                raise CacheMissError(query=query, cache_key=cache_key)
            return [], None

        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cache_data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("[FixtureSearchClient] Failed to read cache %s: %s", cache_path, e)
            if not self._allow_real_api:
                raise CacheMissError(query=query, cache_key=cache_key)
            return [], None

        self._validate_schema_version(cache_data, cache_path)

        results = cache_data.get("results", [])
        if not isinstance(results, list):
            results = []

        return results, None

    async def search_many(self, queries: Sequence[str]) -> list[tuple[list[dict[str, Any]], str | None]]:
        """Search multiple queries using cached results.

        Args:
            queries: Sequence of query strings.

        Returns:
            List of (results, error) tuples, one per query.
        """
        return [await self.search(query) for query in queries]

    def preload_cache(self, cache_data: dict[str, Any] | list[dict[str, Any]]) -> None:
        """Preload cache entries into the cache directory.

        This is a utility method for tests to populate the cache directory
        with fixture data without creating actual files.

        Note: This method does NOT write files. Use write_cache_entry() instead.

        Args:
            cache_data: Either a single cache entry dict or a list of entries.
                Each entry should have 'query' and 'results' keys.
        """
        # This method exists for API compatibility and documentation.
        # Actual file writing should be done in tests directly.
        pass

    def write_cache_entry(self, query: str, results: list[dict[str, Any]]) -> Path:
        """Write a cache entry to disk.

        This is a utility method for creating cache files for testing.

        Args:
            query: The original query string (will be normalized for key).
            results: The search results to cache.

        Returns:
            Path to the created cache file.
        """
        cache_key = self._normalize_cache_key(query)
        cache_path = self._get_cache_path(cache_key)

        cache_entry = {
            "schema_version": self._schema_version,
            "query": query,
            "results": results,
        }

        self._cache_dir.mkdir(parents=True, exist_ok=True)

        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache_entry, f, indent=2)

        return cache_path

    def clear_cache(self) -> None:
        """Remove all cache files from the cache directory."""
        if self._cache_dir.exists():
            for cache_file in self._cache_dir.glob("*.json"):
                cache_file.unlink()
