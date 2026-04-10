"""Search provider integrations for AI Search."""

from __future__ import annotations

import asyncio
import logging
from collections import OrderedDict
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from scrapers.providers.gemini_search import GeminiSearchClient

logger = logging.getLogger(__name__)

SUPPORTED_SEARCH_PROVIDERS = {"auto", "gemini"}
TRACKING_QUERY_KEYS = {"fbclid", "gclid", "ref", "srsltid"}
TRACKING_QUERY_PREFIXES = ("utm_",)
DEFAULT_PROVIDER_COST_USD = {
    "gemini": 0.0,
}


def normalize_search_provider(provider: str | None) -> str:
    """Normalize configured search provider."""
    normalized = str(provider or "auto").strip().lower()
    if normalized in SUPPORTED_SEARCH_PROVIDERS:
        return normalized

    logger.warning("[AI Search] Unsupported search provider '%s', defaulting to auto", provider)
    return "auto"


def canonicalize_result_url(url: str) -> str:
    """Canonicalize URLs so results dedupe reliably across providers."""
    raw = str(url or "").strip()
    if not raw:
        return ""

    parts = urlsplit(raw)
    if not parts.scheme or not parts.netloc:
        return raw

    filtered_query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key.lower() not in TRACKING_QUERY_KEYS and not any(key.lower().startswith(prefix) for prefix in TRACKING_QUERY_PREFIXES)
    ]
    path = parts.path.rstrip("/") or "/"

    return urlunsplit(
        (
            parts.scheme.lower(),
            parts.netloc.lower(),
            path,
            urlencode(filtered_query, doseq=True),
            "",
        )
    )




def _dedupe_results(results: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    for result in results:
        url = canonicalize_result_url(str(result.get("url") or ""))
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        normalized = dict(result)
        normalized["url"] = url
        deduped.append(normalized)
        if len(deduped) >= limit:
            break

    return deduped


class SearchClient:
    """Simplified search client using Gemini for discovery."""

    def __init__(
        self,
        max_results: int = 15,
        provider: str | None = None,
        cache_max: int = 500,
        api_key: str | None = None,
    ):
        self.max_results = max_results
        self.provider = "gemini"  # Force Gemini
        self._cache: OrderedDict[str, list[dict[str, Any]]] = OrderedDict()
        self._cache_max = cache_max
        self._inflight_queries: dict[str, asyncio.Future[tuple[list[dict[str, Any]], str | None]]] = {}
        self.gemini_client = GeminiSearchClient(max_results=max_results, api_key=api_key)

    def _normalize_query_key(self, query: str) -> str:
        return " ".join(str(query or "").split()).lower()

    def _cache_get(self, key: str) -> list[dict[str, Any]] | None:
        if key not in self._cache:
            return None

        value = self._cache.pop(key)
        self._cache[key] = value
        return value

    def _cache_set(self, key: str, value: list[dict[str, Any]]) -> None:
        if key in self._cache:
            self._cache.pop(key)
        self._cache[key] = value
        while len(self._cache) > self._cache_max:
            self._cache.popitem(last=False)

    async def search_with_cost(
        self,
        query: str,
    ) -> tuple[list[dict[str, Any]], str | None, float]:
        cache_key = self._normalize_query_key(query)
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached, None, 0.0

        inflight = self._inflight_queries.get(cache_key)
        if inflight is not None:
            results, error = await inflight
            return results, error, 0.0

        loop = asyncio.get_running_loop()
        future: asyncio.Future[tuple[list[dict[str, Any]], str | None]] = loop.create_future()
        self._inflight_queries[cache_key] = future

        try:
            results, error = await self.gemini_client.search(query)
            normalized_results = _dedupe_results(results, self.max_results)
            if normalized_results:
                self._cache_set(cache_key, normalized_results)
                future.set_result((normalized_results, None))
                return normalized_results, None, 0.0
            
            if error:
                future.set_result(([], error))
                return [], error, 0.0
            
            future.set_result(([], None))
            return [], None, 0.0
        except Exception as e:
            if not future.done():
                future.set_result(([], str(e)))
            raise
        finally:
            self._inflight_queries.pop(cache_key, None)

    async def search(self, query: str) -> tuple[list[dict[str, Any]], str | None]:
        """Search using Gemini."""
        results, error, _ = await self.search_with_cost(query)
        return results, error
