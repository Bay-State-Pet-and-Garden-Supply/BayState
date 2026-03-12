"""Site-specific search using Brave Search API with parallel retailer queries."""

import asyncio
import logging
import os
from collections import OrderedDict
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)


class SiteSpecificSearchClient:
    """Client for searching across multiple retailers in parallel using Brave Search.

    Uses site: operators to limit searches to specific retailer domains,
    with semaphore-controlled concurrency and LRU caching.
    """

    def __init__(
        self,
        max_results: int = 5,
        max_concurrent: int = 3,
        cache_max: int = 500,
    ):
        """Initialize the site-specific search client.

        Args:
            max_results: Maximum results per retailer search
            max_concurrent: Maximum concurrent API requests (semaphore limit)
            cache_max: Maximum cache entries for (query, domain) pairs
        """
        self.max_results = max_results
        self.max_concurrent = max_concurrent
        self._cache_max = cache_max
        self._cache: OrderedDict[tuple[str, str], list[dict[str, Any]]] = OrderedDict()
        self._semaphore = asyncio.Semaphore(max_concurrent)

    async def search_across_retailers(
        self,
        query: str,
        retailers: list[str],
    ) -> tuple[list[dict[str, Any]], Optional[str]]:
        """Search for products across multiple retailers in parallel.

        Args:
            query: Search query (product name, SKU, etc.)
            retailers: List of retailer domains to search (e.g., ["amazon.com", "walmart.com"])

        Returns:
            Tuple of (combined search results from all retailers, error message if any)
            Results are deduplicated by URL.
        """
        if not retailers:
            return [], None

        # Create tasks for all retailers
        tasks = [self._search_single_retailer(query, domain) for domain in retailers]

        # Execute all searches in parallel (semaphore limits concurrency)
        results_per_retailer = await asyncio.gather(*tasks, return_exceptions=True)

        # Aggregate and deduplicate results
        all_results: list[dict[str, Any]] = []
        seen_urls: set[str] = set()
        errors: list[str] = []

        for i, result in enumerate(results_per_retailer):
            retailer = retailers[i]

            if isinstance(result, Exception):
                error_msg = f"Error searching {retailer}: {result}"
                logger.error(error_msg)
                errors.append(error_msg)
                continue

            # Deduplicate by URL
            for item in result:
                url = item.get("url", "")
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    # Add metadata about which retailer this came from
                    item["source_retailer"] = retailer
                    all_results.append(item)

        error_str = "; ".join(errors) if errors else None
        return all_results, error_str

    async def _search_single_retailer(
        self,
        query: str,
        domain: str,
    ) -> list[dict[str, Any]]:
        """Search a single retailer with site: operator.

        Args:
            query: Search query
            domain: Retailer domain (e.g., "amazon.com")

        Returns:
            List of search results for this retailer
        """
        cache_key = (query, domain)

        # Check cache first
        cached = self._cache_get(cache_key)
        if cached is not None:
            logger.debug(f"Cache hit for query='{query}' domain='{domain}'")
            return cached

        # Build site-specific query: "query" site:domain
        site_query = f'"{query}" site:{domain}'

        async with self._semaphore:
            try:
                results = await self._execute_brave_search(site_query)
                self._cache_set(cache_key, results)
                return results
            except Exception as e:
                logger.error(f"Brave Search API error for {domain}: {e}")
                raise

    async def _execute_brave_search(
        self,
        query: str,
    ) -> list[dict[str, Any]]:
        """Execute a Brave Search API call.

        Args:
            query: The search query (including site: operator)

        Returns:
            List of search results
        """
        api_key = os.environ.get("BRAVE_API_KEY")
        if not api_key:
            raise RuntimeError("BRAVE_API_KEY not set")

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

        return search_results

    def _cache_get(self, key: tuple[str, str]) -> Optional[list[dict[str, Any]]]:
        """Get cached results (LRU)."""
        if key not in self._cache:
            return None
        value = self._cache.pop(key)
        self._cache[key] = value
        return value

    def _cache_set(self, key: tuple[str, str], value: list[dict[str, Any]]) -> None:
        """Set cached results (LRU)."""
        if key in self._cache:
            self._cache.pop(key)
        self._cache[key] = value
        while len(self._cache) > self._cache_max:
            self._cache.popitem(last=False)
