"""Golden dataset fixture client bridge for replaying search results in tests.

This module provides a bridge between the golden dataset format
(golden_dataset_v3.search_results.json) and the FixtureSearchClient cache format.

The golden dataset contains pre-recorded Serper search results that can be replayed
during testing without making live API calls.

Usage:
    from scrapers.ai_search.golden_fixture_client import GoldenDatasetFixtureClient
    
    # Load from default golden dataset
    client = GoldenDatasetFixtureClient()
    
    # Or specify a custom golden dataset file
    client = GoldenDatasetFixtureClient(golden_dataset_path="path/to/dataset.json")
    
    # Search for a query that exists in the golden dataset
    results, error = await client.search("Stud Muffins Horse Treats 45 oz Tub")
    
    # Cache misses raise CacheMissError - no fallback to real API
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from scrapers.ai_search.fixture_search_client import (
    FixtureSearchClient,
    CacheMissError,
    SchemaVersionMismatchError,
)

logger = logging.getLogger(__name__)

# Default paths relative to project root
DEFAULT_GOLDEN_DATASET_PATH = Path("data/golden_dataset_v3.search_results.json")


class GoldenDatasetLoadError(Exception):
    """Raised when the golden dataset cannot be loaded or parsed."""

    def __init__(self, path: Path, reason: str) -> None:
        self.path = path
        self.reason = reason
        super().__init__(f"Failed to load golden dataset from {path}: {reason}")


class GoldenDatasetFixtureClient:
    """A fixture search client that replays search results from a golden dataset.

    This client bridges the golden dataset format (a JSON file with an "entries"
    array) to the FixtureSearchClient cache format (individual JSON files per
    normalized query hash).

    The client ensures:
    - Cache misses fail loudly with CacheMissError (no fallback to live API)
    - Golden dataset entries are loaded into the cache directory on initialization
    - Real API calls are never made (allow_real_api is always False)

    Golden Dataset Format:
        {
            "schema_version": 1,
            "entries": [
                {
                    "query": "original search query",
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
            ]
        }

    Args:
        golden_dataset_path: Path to the golden dataset JSON file.
            Defaults to "data/golden_dataset_v3.search_results.json" relative
            to the project root (apps/scraper).
        cache_dir: Directory for cache files. Defaults to ".cache/ai_search".
            The cache directory is populated from the golden dataset on init.
    """

    def __init__(
        self,
        golden_dataset_path: str | Path | None = None,
        cache_dir: str | Path | None = None,
    ) -> None:
        self._golden_dataset_path = self._resolve_golden_dataset_path(golden_dataset_path)
        self._fixture_client = FixtureSearchClient(
            cache_dir=cache_dir,
            allow_real_api=False,  # NEVER allow real API calls
        )
        self._loaded_queries: set[str] = set()

        # Load golden dataset into cache on initialization
        self._load_golden_dataset()

    @staticmethod
    def _resolve_golden_dataset_path(path: str | Path | None) -> Path:
        """Resolve the golden dataset path to an absolute Path.

        If no path is provided, uses the default path relative to the
        scraper project root (apps/scraper).

        Args:
            path: Optional path to the golden dataset.

        Returns:
            Absolute Path to the golden dataset file.
        """
        if path is None:
            # Find the project root by looking for common markers
            current = Path.cwd()
            # Try to find apps/scraper directory
            for parent in [current] + list(current.parents):
                scraper_dir = parent / "apps" / "scraper"
                if scraper_dir.exists():
                    return scraper_dir / DEFAULT_GOLDEN_DATASET_PATH
                # Also check if we're already in apps/scraper
                if (parent / "data" / "golden_dataset_v3.search_results.json").exists():
                    return parent / "data" / "golden_dataset_v3.search_results.json"
            # Fallback: assume current working directory is apps/scraper
            return Path.cwd() / DEFAULT_GOLDEN_DATASET_PATH

        return Path(path).resolve()

    def _load_golden_dataset(self) -> None:
        """Load the golden dataset and populate the cache directory.

        This method reads the golden dataset JSON file and writes each entry
        to the cache directory in the format expected by FixtureSearchClient.

        Raises:
            GoldenDatasetLoadError: If the file cannot be read or parsed.
        """
        if not self._golden_dataset_path.exists():
            raise GoldenDatasetLoadError(
                self._golden_dataset_path,
                "File does not exist"
            )

        try:
            with open(self._golden_dataset_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            raise GoldenDatasetLoadError(
                self._golden_dataset_path,
                f"Invalid JSON: {e}"
            )
        except OSError as e:
            raise GoldenDatasetLoadError(
                self._golden_dataset_path,
                f"Cannot read file: {e}"
            )

        # Validate schema version
        schema_version = data.get("schema_version")
        if schema_version != 1:
            logger.warning(
                "[GoldenDatasetFixtureClient] Unexpected schema version %s in %s",
                schema_version,
                self._golden_dataset_path,
            )

        # Load entries into cache
        entries = data.get("entries", [])
        if not isinstance(entries, list):
            raise GoldenDatasetLoadError(
                self._golden_dataset_path,
                "'entries' field must be a list"
            )

        for entry in entries:
            if not isinstance(entry, dict):
                logger.warning("[GoldenDatasetFixtureClient] Skipping non-dict entry")
                continue

            query = entry.get("query")
            if not query:
                logger.warning("[GoldenDatasetFixtureClient] Skipping entry without query")
                continue

            results = entry.get("results", [])
            if not isinstance(results, list):
                logger.warning(
                    "[GoldenDatasetFixtureClient] Skipping entry with invalid results: %s",
                    query
                )
                continue

            # Write to cache using FixtureSearchClient's method
            self._fixture_client.write_cache_entry(query, results)
            self._loaded_queries.add(query)

        logger.info(
            "[GoldenDatasetFixtureClient] Loaded %d queries from %s",
            len(self._loaded_queries),
            self._golden_dataset_path.name,
        )

    async def search(self, query: str) -> tuple[list[dict[str, Any]], str | None]:
        """Search using cached results from the golden dataset.

        This method delegates to FixtureSearchClient, which will raise
        CacheMissError if the query is not in the cache (i.e., not in the
        golden dataset).

        Args:
            query: The search query string.

        Returns:
            A tuple of (results, error) where:
                - results: List of search result dicts with keys: url, title,
                  description, provider, result_type
                - error: None on success, error message string on failure

        Raises:
            CacheMissError: If the query is not in the golden dataset.
            SchemaVersionMismatchError: If cache file has incompatible schema version.
        """
        return await self._fixture_client.search(query)

    async def search_many(
        self, queries: list[str]
    ) -> list[tuple[list[dict[str, Any]], str | None]]:
        """Search multiple queries using cached results from the golden dataset.

        Args:
            queries: List of query strings.

        Returns:
            List of (results, error) tuples, one per query.

        Raises:
            CacheMissError: If any query is not in the golden dataset.
        """
        return await self._fixture_client.search_many(queries)

    def get_loaded_queries(self) -> set[str]:
        """Return the set of queries loaded from the golden dataset.

        Returns:
            Set of query strings that were successfully loaded into the cache.
        """
        return self._loaded_queries.copy()

    def clear_cache(self) -> None:
        """Remove all cache files from the cache directory."""
        self._fixture_client.clear_cache()

    @property
    def cache_dir(self) -> Path:
        """Return the path to the cache directory."""
        return self._fixture_client._cache_dir
