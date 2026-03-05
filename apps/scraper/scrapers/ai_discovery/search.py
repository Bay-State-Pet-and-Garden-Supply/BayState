"""Brave Search API integration."""

import logging
import os
from collections import OrderedDict
from typing import Any, Optional

logger = logging.getLogger(__name__)


class BraveSearchClient:
    """Client for Brave Search API."""

    def __init__(self, max_results: int = 5, cache_max: int = 500):
        self.max_results = max_results
        self._cache: OrderedDict[str, list[dict[str, Any]]] = OrderedDict()
        self._cache_max = cache_max

    async def search(self, query: str) -> tuple[list[dict[str, Any]], Optional[str]]:
        """Search for products using Brave Search API.

        Args:
            query: Search query

        Returns:
            Tuple of (List of search results, Error message if any)
        """
        cached = self._cache_get(query)
        if cached is not None:
            return cached, None

        try:
            import httpx

            api_key = os.environ.get("BRAVE_API_KEY")
            if not api_key:
                logger.error("BRAVE_API_KEY not set")
                return [], "BRAVE_API_KEY not set"

            headers = {
                "Accept": "application/json",
                "X-Subscription-Token": api_key,
            }
            country = os.environ.get("BRAVE_COUNTRY", "US")
            search_lang = os.environ.get("BRAVE_SEARCH_LANG", "en")
            params = {
                "q": query,
                "count": self.max_results,
                "country": country,
                "search_lang": search_lang,
                "ui_lang": f"{search_lang}-{country}",
                "safesearch": "moderate",
                "extra_snippets": "true",
                "freshness": os.environ.get("BRAVE_FRESHNESS", "py"),
            }

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    "https://api.search.brave.com/res/v1/web/search",
                    headers=headers,
                    params=params,
                )
                response.raise_for_status()
                data = response.json()

            web_results = data.get("web", {}).get("results", [])

            search_results = []
            for result in web_results[: self.max_results]:
                if isinstance(result, dict):
                    search_results.append(
                        {
                            "url": result.get("url", ""),
                            "title": result.get("title", ""),
                            "description": result.get("description", ""),
                            "extra_snippets": result.get("extra_snippets", []),
                        }
                    )

            self._cache_set(query, search_results)
            return search_results, None

        except Exception as e:
            logger.error(f"[AI Discovery] Search failed: {e}")
            return [], str(e)

    def _cache_get(self, key: str) -> Optional[list[dict[str, Any]]]:
        """Get cached results (LRU)."""
        if key not in self._cache:
            return None
        value = self._cache.pop(key)
        self._cache[key] = value
        return value

    def _cache_set(self, key: str, value: list[dict[str, Any]]) -> None:
        """Set cached results (LRU)."""
        if key in self._cache:
            self._cache.pop(key)
        self._cache[key] = value
        while len(self._cache) > self._cache_max:
            self._cache.popitem(last=False)
