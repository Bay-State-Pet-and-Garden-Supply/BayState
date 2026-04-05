from __future__ import annotations

import logging
import os
from typing import Any

from google import genai
from google.genai import types

from scrapers.providers.base import BaseSearchProvider

logger = logging.getLogger(__name__)


def _canonicalize_url(url: str) -> str:
    return str(url or "").strip().rstrip("/")


class GeminiSearchClient(BaseSearchProvider):
    def __init__(self, max_results: int = 15, model: str = "gemini-3.1-flash-lite-preview", api_key: str | None = None) -> None:
        self.max_results = max_results
        self.model = model
        self.api_key = (api_key or os.getenv("GEMINI_API_KEY") or "").strip()
        self._client = genai.Client(api_key=self.api_key) if self.api_key else None

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

        deduped: list[dict[str, Any]] = []
        seen_urls: set[str] = set()
        for chunk in grounding_chunks:
            web = getattr(chunk, "web", None)
            uri = _canonicalize_url(str(getattr(web, "uri", "") or ""))
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

        return deduped, None
