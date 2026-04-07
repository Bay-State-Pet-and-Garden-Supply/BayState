from __future__ import annotations

import logging
import os
from typing import Any

from google import genai
from google.genai import types

from scrapers.ai_search.google_redirects import (
    GroundingRedirectResolver,
    canonicalize_grounding_url,
    is_grounding_redirect_url,
)
from scrapers.providers.base import BaseSearchProvider

logger = logging.getLogger(__name__)


def _canonicalize_url(url: str) -> str:
    return canonicalize_grounding_url(url)


class GeminiSearchClient(BaseSearchProvider):
    def __init__(self, max_results: int = 15, model: str = "gemini-3.1-flash-lite-preview", api_key: str | None = None) -> None:
        self.max_results = max_results
        self.model = model
        self.api_key = (api_key or os.getenv("GEMINI_API_KEY") or "").strip()
        self._client = genai.Client(api_key=self.api_key) if self.api_key else None
        self._grounding_redirect_resolver = GroundingRedirectResolver(logger_instance=logger)

    async def _resolve_grounding_redirects(self, urls: list[str]) -> dict[str, str]:
        return await self._grounding_redirect_resolver.resolve_many(urls, label="search result")

    async def search(self, query: str) -> tuple[list[dict[str, Any]], str | None]:
        if not self._client:
            return [], "GEMINI_API_KEY not set"

        try:
            response = await self._client.aio.models.generate_content(
                model=self.model,
                contents=query,
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                    temperature=0.0,
                ),
            )
        except Exception as exc:
            logger.error("[AI Search] Gemini grounded search failed: %s", exc)
            return [], str(exc)

        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            return [], None

        grounding_metadata = getattr(candidates[0], "grounding_metadata", None)
        grounding_chunks = getattr(grounding_metadata, "grounding_chunks", None) or []
        search_queries = list(getattr(grounding_metadata, "web_search_queries", None) or [])
        raw_urls = [_canonicalize_url(str(getattr(getattr(chunk, "web", None), "uri", "") or "")) for chunk in grounding_chunks]
        resolved_redirects = await self._resolve_grounding_redirects(raw_urls)
        saw_grounding_redirect = any(is_grounding_redirect_url(url) for url in raw_urls)

        deduped: list[dict[str, Any]] = []
        seen_urls: set[str] = set()
        for chunk in grounding_chunks:
            web = getattr(chunk, "web", None)
            raw_uri = _canonicalize_url(str(getattr(web, "uri", "") or ""))
            uri = resolved_redirects.get(raw_uri, raw_uri)
            if raw_uri and is_grounding_redirect_url(raw_uri) and not uri:
                logger.warning(
                    "[AI Search] Skipping unresolved Google grounding redirect for %s",
                    str(getattr(web, "title", "") or "").strip() or "unknown source",
                )
                continue
            if not uri or uri in seen_urls:
                continue
            seen_urls.add(uri)
            deduped.append(
                {
                    "url": uri,
                    "title": str(getattr(web, "title", "") or ""),
                    "description": str(getattr(response, "text", "") or "").strip(),
                    "extra_snippets": search_queries,
                    "provider": "gemini",
                    "result_type": "grounded",
                }
            )
            if len(deduped) >= self.max_results:
                break

        if not deduped and saw_grounding_redirect:
            return [], "Failed to resolve Google grounding result URLs"

        return deduped, None
