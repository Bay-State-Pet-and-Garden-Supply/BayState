from __future__ import annotations

import os
from typing import Any

import httpx

from scrapers.actions.handlers.ai_base import BaseAIAction
from scrapers.actions.registry import ActionRegistry
from scrapers.exceptions import WorkflowExecutionError


@ActionRegistry.register("ai_search")
class AISearchAction(BaseAIAction):
    BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search"

    async def execute(self, params: dict[str, Any]) -> list[dict[str, Any]]:
        query = self._as_str(params.get("query"))
        if not query:
            raise WorkflowExecutionError("ai_search action requires 'query'")
        resolved = self._resolve_ai_config({**params, "task": params.get("task") or f"Find product pages for: {query}"})
        adapter = self._build_adapter(resolved)

        max_results = self._as_int(params.get("max_results"), 5, 1, 20)
        api_key = os.getenv("BRAVE_SEARCH_API_KEY") or os.getenv("BRAVE_API_KEY")
        if not api_key:
            raise WorkflowExecutionError("Brave Search API key required for ai_search")

        formatted_query = self._format_query(query)
        headers = {
            "Accept": "application/json",
            "X-Subscription-Token": api_key,
        }
        params_payload = {
            "q": formatted_query,
            "count": max_results,
            "offset": 0,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(self.BRAVE_API_URL, headers=headers, params=params_payload)
            response.raise_for_status()
            payload: dict[str, Any] = response.json()

        raw_results = payload.get("web", {}).get("results", [])
        parsed: list[dict[str, Any]] = []
        for item in raw_results[:max_results]:
            if not isinstance(item, dict):
                continue
            parsed.append(
                {
                    "url": item.get("url", ""),
                    "title": item.get("title", ""),
                    "description": item.get("description", ""),
                }
            )

        if parsed and os.getenv("OPENAI_API_KEY"):
            ranking_schema = {
                "type": "object",
                "properties": {
                    "score": {"type": "integer"},
                    "matched": {"type": "boolean"},
                },
            }
            for item in parsed[:3]:
                url = item.get("url")
                if not isinstance(url, str) or not url.strip():
                    continue
                try:
                    rank = await adapter.extract_url(
                        url=url,
                        task=(
                            f"{resolved.task}\n"
                            f"Query: {formatted_query}\n"
                            "Score this page relevance from 0-100 and set matched true when page is a plausible product page."
                        ),
                        schema=ranking_schema,
                        max_steps=resolved.max_steps,
                    )
                except Exception:
                    continue
                score = rank.get("score")
                if isinstance(score, int):
                    item["score"] = score
                matched = rank.get("matched")
                if isinstance(matched, bool):
                    item["matched"] = matched

            parsed.sort(key=lambda item: int(item.get("score", 0)), reverse=True)

        self.ctx.results["ai_search_results"] = parsed
        return parsed

    def _format_query(self, query: str) -> str:
        merged_context: dict[str, object] = {
            "sku": self.ctx.results.get("sku", ""),
            "placeholder_name": self.ctx.results.get("placeholder_name", ""),
            **self.ctx.results,
            **self.ctx.context,
        }
        try:
            return query.format_map(_SafeDict(merged_context)).strip()
        except Exception:
            return query


class _SafeDict(dict[str, object]):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"
