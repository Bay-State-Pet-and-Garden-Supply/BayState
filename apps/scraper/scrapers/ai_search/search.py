"""Search provider integrations for AI Search."""

from __future__ import annotations

import logging
import os
from collections import OrderedDict
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx

logger = logging.getLogger(__name__)

SUPPORTED_SEARCH_PROVIDERS = {"auto", "serpapi", "brave"}
TRACKING_QUERY_KEYS = {"fbclid", "gclid", "ref", "srsltid"}
TRACKING_QUERY_PREFIXES = ("utm_",)


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
        if key.lower() not in TRACKING_QUERY_KEYS
        and not any(key.lower().startswith(prefix) for prefix in TRACKING_QUERY_PREFIXES)
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


def _flatten_text_fragments(value: Any) -> list[str]:
    """Flatten nested response text fragments into plain strings."""
    if value is None:
        return []
    if isinstance(value, str):
        cleaned = value.strip()
        return [cleaned] if cleaned else []
    if isinstance(value, (int, float)):
        return [str(value)]
    if isinstance(value, list):
        flattened: list[str] = []
        for item in value:
            flattened.extend(_flatten_text_fragments(item))
        return flattened
    if isinstance(value, dict):
        flattened = []
        for item in value.values():
            flattened.extend(_flatten_text_fragments(item))
        return flattened
    return []


def _dedupe_fragments(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []

    for value in values:
        normalized = " ".join(value.split())
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(normalized)

    return deduped


def _format_description(primary: str, extras: list[str]) -> str:
    if primary.strip():
        return primary.strip()
    if extras:
        return " | ".join(extras[:3])
    return ""


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


class BraveSearchClient:
    """Client for Brave Search API."""

    def __init__(self, max_results: int = 15):
        self.max_results = max_results

    async def _request_json(self, query: str) -> dict[str, Any]:
        api_key = os.environ.get("BRAVE_API_KEY")
        if not api_key:
            raise ValueError("BRAVE_API_KEY not set")

        country = str(os.environ.get("AI_SEARCH_COUNTRY") or os.environ.get("BRAVE_COUNTRY") or "US").strip().upper()
        search_lang = str(os.environ.get("AI_SEARCH_LANG") or os.environ.get("BRAVE_SEARCH_LANG") or "en").strip().lower()
        headers = {
            "Accept": "application/json",
            "X-Subscription-Token": api_key,
        }
        params = {
            "q": query,
            "count": self.max_results,
            "country": country,
            "search_lang": search_lang,
            "ui_lang": f"{search_lang}-{country}",
            "safesearch": "moderate",
            "extra_snippets": "true",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                headers=headers,
                params=params,
            )
            response.raise_for_status()
            return response.json()

    def _normalize_result(self, result: dict[str, Any]) -> dict[str, Any] | None:
        url = canonicalize_result_url(str(result.get("url") or ""))
        if not url:
            return None

        extra_snippets = _dedupe_fragments(_flatten_text_fragments(result.get("extra_snippets")))
        description = _format_description(str(result.get("description") or ""), extra_snippets)

        return {
            "url": url,
            "title": str(result.get("title") or ""),
            "description": description,
            "extra_snippets": extra_snippets,
            "provider": "brave",
            "result_type": "organic",
        }

    async def search(self, query: str) -> tuple[list[dict[str, Any]], str | None]:
        """Search Brave for product candidates."""
        try:
            data = await self._request_json(query)
            web_results = data.get("web", {}).get("results", [])
            normalized = [
                normalized_result
                for result in web_results[: self.max_results]
                if isinstance(result, dict)
                for normalized_result in [self._normalize_result(result)]
                if normalized_result is not None
            ]
            return _dedupe_results(normalized, self.max_results), None
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.error("[AI Search] Brave search failed: %s", exc)
            return [], str(exc)


class SerpAPISearchClient:
    """Client for SerpAPI-backed Google search."""

    def __init__(self, max_results: int = 15):
        self.max_results = max_results

    async def _request_json(self, query: str) -> dict[str, Any]:
        api_key = os.environ.get("SERPAPI_API_KEY")
        if not api_key:
            raise ValueError("SERPAPI_API_KEY not set")

        country = str(os.environ.get("AI_SEARCH_COUNTRY") or os.environ.get("SERPAPI_COUNTRY") or "US").strip().lower()
        language = str(
            os.environ.get("AI_SEARCH_LANG")
            or os.environ.get("SERPAPI_LANGUAGE")
            or os.environ.get("SERPAPI_SEARCH_LANG")
            or "en"
        ).strip().lower()
        safe = str(os.environ.get("SERPAPI_SAFE") or "active").strip().lower() or "active"
        google_domain = str(os.environ.get("SERPAPI_GOOGLE_DOMAIN") or "google.com").strip() or "google.com"

        params = {
            "engine": "google",
            "api_key": api_key,
            "q": query,
            "num": self.max_results,
            "gl": country,
            "hl": language,
            "safe": safe,
            "google_domain": google_domain,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get("https://serpapi.com/search.json", params=params)
            response.raise_for_status()
            data = response.json()

        if isinstance(data, dict) and data.get("error"):
            raise ValueError(str(data["error"]))

        return data

    def _normalize_result(self, result: dict[str, Any], result_type: str) -> dict[str, Any] | None:
        raw_url = (
            result.get("link")
            or result.get("product_link")
            or result.get("url")
            or ""
        )
        url = canonicalize_result_url(str(raw_url))
        if not url:
            return None

        extra_snippets = _dedupe_fragments(
            _flatten_text_fragments(result.get("snippet_highlighted_words"))
            + _flatten_text_fragments(result.get("rich_snippet"))
            + _flatten_text_fragments(result.get("extensions"))
            + _flatten_text_fragments(result.get("price"))
            + _flatten_text_fragments(result.get("source"))
        )

        position_raw = result.get("position")
        position = int(position_raw) if isinstance(position_raw, int) else None
        description = _format_description(
            str(result.get("snippet") or result.get("description") or ""),
            extra_snippets,
        )

        return {
            "url": url,
            "title": str(result.get("title") or ""),
            "description": description,
            "extra_snippets": extra_snippets,
            "provider": "serpapi",
            "result_type": result_type,
            "position": position,
            "source": str(result.get("source") or ""),
        }

    async def search(self, query: str) -> tuple[list[dict[str, Any]], str | None]:
        """Search SerpAPI for product candidates."""
        try:
            data = await self._request_json(query)
            combined: list[dict[str, Any]] = []
            result_sources = (
                ("organic", data.get("organic_results", [])),
                ("shopping", data.get("shopping_results", [])),
                ("inline_shopping", data.get("inline_shopping_results", [])),
            )

            for result_type, bucket in result_sources:
                if not isinstance(bucket, list):
                    continue

                for entry in bucket:
                    if not isinstance(entry, dict):
                        continue
                    normalized = self._normalize_result(entry, result_type=result_type)
                    if normalized is not None:
                        combined.append(normalized)

            return _dedupe_results(combined, self.max_results), None
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.error("[AI Search] SerpAPI search failed: %s", exc)
            return [], str(exc)


class SearchClient:
    """Provider-aware search client with SerpAPI-first fallback behavior."""

    def __init__(self, max_results: int = 15, provider: str | None = None, cache_max: int = 500):
        self.max_results = max_results
        self.provider = normalize_search_provider(provider or os.environ.get("AI_SEARCH_PROVIDER"))
        self._cache: OrderedDict[str, list[dict[str, Any]]] = OrderedDict()
        self._cache_max = cache_max
        self._providers = {
            "serpapi": SerpAPISearchClient(max_results=max_results),
            "brave": BraveSearchClient(max_results=max_results),
        }

    def _provider_order(self) -> list[str]:
        if self.provider == "serpapi":
            return ["serpapi", "brave"]
        if self.provider == "brave":
            return ["brave", "serpapi"]

        if os.environ.get("SERPAPI_API_KEY"):
            return ["serpapi", "brave"]
        if os.environ.get("BRAVE_API_KEY"):
            return ["brave", "serpapi"]
        return ["serpapi", "brave"]

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

    async def search(self, query: str) -> tuple[list[dict[str, Any]], str | None]:
        """Search using the configured provider order."""
        cached = self._cache_get(query)
        if cached is not None:
            return cached, None

        provider_errors: list[str] = []
        for provider_name in self._provider_order():
            provider = self._providers[provider_name]
            results, error = await provider.search(query)
            if results:
                self._cache_set(query, results)
                return results, None
            if error:
                provider_errors.append(f"{provider_name}: {error}")

        error_message = "; ".join(provider_errors) if provider_errors else "No search providers configured"
        return [], error_message
