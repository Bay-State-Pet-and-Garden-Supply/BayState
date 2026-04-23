from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

import httpx

from scrapers.providers.base import BaseSearchProvider

logger = logging.getLogger(__name__)


class SerperSearchClient(BaseSearchProvider):
    _MAX_BATCH_SIZE = 100
    _MAX_RETRIES = 3

    def __init__(
        self,
        max_results: int = 15,
        api_key: str | None = None,
        timeout_seconds: float = 15.0,
        gl: str = "us",
        hl: str = "en",
    ) -> None:
        self.max_results = max(1, max_results)
        self.api_key = (api_key or os.getenv("SERPER_API_KEY") or "").strip()
        self.timeout_seconds = timeout_seconds
        self.gl = gl
        self.hl = hl

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
            "gl": self.gl,
            "hl": self.hl,
        }

    def _extract_results(self, data: Any) -> list[dict[str, Any]]:
        if not isinstance(data, dict):
            return []

        results: list[dict[str, Any]] = []
        seen_urls: set[str] = set()

        # 1. Extract Knowledge Graph if present (highest priority)
        kg = data.get("knowledgeGraph")
        if isinstance(kg, dict):
            kg_url = str(kg.get("website") or "").strip()
            if kg_url and kg_url not in seen_urls:
                seen_urls.add(kg_url)
                results.append(
                    {
                        "url": kg_url,
                        "title": str(kg.get("title") or "Knowledge Graph").strip(),
                        "description": "Verified website from Knowledge Graph",
                        "provider": "serper",
                        "result_type": "knowledge_graph",
                    }
                )

        # 2. Extract organic results
        organic_results = data.get("organic")
        if isinstance(organic_results, list):
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

    @staticmethod
    def _format_request_error(exc: Exception) -> str:
        text = " ".join(str(exc).split())
        return text or exc.__class__.__name__

    async def _post_with_retry(
        self,
        client: httpx.AsyncClient,
        payload: dict[str, Any] | list[dict[str, Any]],
        *,
        context: str,
    ) -> tuple[Any | None, str | None]:
        for attempt in range(1, self._MAX_RETRIES + 1):
            try:
                response = await client.post("https://google.serper.dev/search", headers=self._build_headers(), json=payload)
                response.raise_for_status()
                return response.json(), None
            except httpx.HTTPStatusError as exc:
                status_code = exc.response.status_code if exc.response is not None else "unknown"
                logger.error("[AI Search] Serper %s failed with status %s", context, status_code)
                return None, f"Serper search failed with status {status_code}"
            except httpx.RequestError as exc:
                error_text = self._format_request_error(exc)
                if attempt < self._MAX_RETRIES:
                    logger.warning(
                        "[AI Search] Serper %s failed on attempt %s/%s: %s; retrying",
                        context,
                        attempt,
                        self._MAX_RETRIES,
                        error_text,
                    )
                    await asyncio.sleep(0.5 * attempt)
                    continue

                logger.warning(
                    "[AI Search] Serper %s failed after %s attempts: %s",
                    context,
                    attempt,
                    error_text,
                )
                return None, error_text
            except Exception as exc:
                error_text = self._format_request_error(exc)
                logger.error("[AI Search] Serper %s failed: %s", context, error_text)
                return None, error_text

        return None, "Serper search failed"

    async def search(self, query: str) -> tuple[list[dict[str, Any]], str | None]:
        if not self.api_key:
            return [], "SERPER_API_KEY not set"

        payload = self._build_payload(query)

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            data, error = await self._post_with_retry(client, payload, context=f"search for query {query!r}")
        if error:
            return [], error

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

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            for start in range(0, len(queries), self._MAX_BATCH_SIZE):
                batch_queries = queries[start : start + self._MAX_BATCH_SIZE]
                payload = [self._build_payload(query) for query in batch_queries]

                data, error = await self._post_with_retry(client, payload, context=f"batch search for {len(batch_queries)} queries")
                if error:
                    outputs.extend([([], error)] * len(batch_queries))
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
