"""Search fixture helpers for scraper benchmarks."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

CACHE_SCHEMA_VERSION = 1


class CacheMissError(Exception):
    """Raised when a fixture lookup misses and real API fallback is disabled."""

    def __init__(self, query: str, cache_key: str) -> None:
        self.query = query
        self.cache_key = cache_key
        super().__init__(f"Cache miss for query: {query!r} (key: {cache_key!r})")


class FixtureSearchClient:
    """Small SearchClient-compatible reader for benchmark search fixtures."""

    def __init__(self, cache_dir: str | Path, *, allow_real_api: bool = False) -> None:
        self._cache_dir = Path(cache_dir).resolve()
        self._allow_real_api = allow_real_api

    @staticmethod
    def _normalize_cache_key(query: str) -> str:
        return " ".join(str(query or "").split()).lower()

    @staticmethod
    def _compute_cache_hash(cache_key: str) -> str:
        return hashlib.sha256(cache_key.encode()).hexdigest()

    def _get_cache_path(self, cache_key: str) -> Path:
        return self._cache_dir / f"{self._compute_cache_hash(cache_key)}.json"

    async def search(self, query: str) -> tuple[list[dict[str, Any]], str | None]:
        cache_key = self._normalize_cache_key(query)
        cache_path = self._get_cache_path(cache_key)

        if not cache_path.exists():
            if not self._allow_real_api:
                raise CacheMissError(query=query, cache_key=cache_key)
            return [], None

        payload = json.loads(cache_path.read_text(encoding="utf-8"))
        if payload.get("schema_version") != CACHE_SCHEMA_VERSION:
            raise ValueError(f"Unsupported search fixture schema in {cache_path}")

        results = payload.get("results", [])
        return results if isinstance(results, list) else [], None

    async def search_many(self, queries: Sequence[str]) -> list[tuple[list[dict[str, Any]], str | None]]:
        return [await self.search(query) for query in queries]

    def write_cache_entry(self, query: str, results: list[dict[str, Any]]) -> Path:
        cache_key = self._normalize_cache_key(query)
        cache_path = self._get_cache_path(cache_key)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(
            json.dumps(
                {
                    "schema_version": CACHE_SCHEMA_VERSION,
                    "query": query,
                    "results": results,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return cache_path
