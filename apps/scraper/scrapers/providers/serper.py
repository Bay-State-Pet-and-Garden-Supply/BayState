from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from scrapers.providers.base import BaseSearchProvider

logger = logging.getLogger(__name__)


class SerperSearchClient(BaseSearchProvider):
    _MAX_BATCH_SIZE = 100

    def __init__(self, max_results: int = 15, api_key: str | None = None, timeout_seconds: float = 15.0) -> None:
        self.max_results = max(1, max_results)
        self.api_key = (api_key or os.getenv("SERPER_API_KEY") or "").strip()
        self.timeout_seconds = timeout_seconds

    def _build_headers(self) -> dict[str, str]:
        return {
            "X-API-KEY": self.api_key,
            "Content-Type": "application/json",
        }

    def _build_payload(self, query: str) -> dict[str, Any]:
        return {
            "q": query,
            "num": self.max_results,
            "autocorrect": False,
        }

    def _extract_results(self, data: Any) -> list[dict[str, Any]]:
        organic_results = data.get("organic") if isinstance(data, dict) else None
        if not isinstance(organic_results, list):
            return []

        results: list[dict[str, Any]] = []
        seen_urls: set[str] = set()
        for item in organic_results:
            if not isinstance(item, dict):
                continue

            url = str(item.get("link") or "").strip()
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)

            results.append(
                {
                    "url": url,
                    "title": str(item.get("title") or "").strip(),
                    "description": str(item.get("snippet") or "").strip(),
                    "provider": "serper",
                    "result_type": "organic",
                }
            )

            if len(results) >= self.max_results:
                break

        return results

    async def search(self, query: str) -> tuple[list[dict[str, Any]], str | None]:
        if not self.api_key:
            return [], "SERPER_API_KEY not set"

        headers = self._build_headers()
        payload = self._build_payload(query)

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post("https://google.serper.dev/search", headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code if exc.response is not None else "unknown"
            logger.error("[AI Search] Serper search failed with status %s for query %r", status_code, query)
            return [], f"Serper search failed with status {status_code}"
        except Exception as exc:
            logger.error("[AI Search] Serper search failed: %s", exc)
            return [], str(exc)

        return self._extract_results(data), None

    async def search_many(self, queries: list[str]) -> list[tuple[list[dict[str, Any]], str | None]]:
        if not queries:
            return []
        if not self.api_key:
            return [([], "SERPER_API_KEY not set") for _ in queries]
        if len(queries) == 1:
            results, error = await self.search(queries[0])
            return [(results, error)]

        outputs: list[tuple[list[dict[str, Any]], str | None]] = []
        headers = self._build_headers()

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            for start in range(0, len(queries), self._MAX_BATCH_SIZE):
                batch_queries = queries[start : start + self._MAX_BATCH_SIZE]
                payload = [self._build_payload(query) for query in batch_queries]

                try:
                    response = await client.post("https://google.serper.dev/search", headers=headers, json=payload)
                    response.raise_for_status()
                    data = response.json()
                except httpx.HTTPStatusError as exc:
                    status_code = exc.response.status_code if exc.response is not None else "unknown"
                    logger.error("[AI Search] Serper batch search failed with status %s for %s queries", status_code, len(batch_queries))
                    outputs.extend([([], f"Serper search failed with status {status_code}")] * len(batch_queries))
                    continue
                except Exception as exc:
                    logger.error("[AI Search] Serper batch search failed: %s", exc)
                    outputs.extend([([], str(exc))] * len(batch_queries))
                    continue

                batch_data = data if isinstance(data, list) else [data]
                if len(batch_data) != len(batch_queries):
                    logger.warning(
                        "[AI Search] Serper batch search returned %s payloads for %s queries",
                        len(batch_data),
                        len(batch_queries),
                    )

                for index, _ in enumerate(batch_queries):
                    item = batch_data[index] if index < len(batch_data) else {}
                    outputs.append((self._extract_results(item), None))

        return outputs
