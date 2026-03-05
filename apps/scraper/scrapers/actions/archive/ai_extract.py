from __future__ import annotations

from typing import Any

from scrapers.actions.handlers.ai_base import BaseAIAction
from scrapers.actions.registry import ActionRegistry


@ActionRegistry.register("ai_extract")
class AIExtractAction(BaseAIAction):
    async def execute(self, params: dict[str, Any]) -> dict[str, Any] | list[dict[str, Any]]:
        resolved = self._resolve_ai_config(params)
        adapter = self._build_adapter(resolved)
        schema = self._schema_from_params(params.get("schema"))
        visit_top_n = self._as_int(params.get("visit_top_n"), 1, 1, 10)

        urls = self._resolve_urls(params, visit_top_n)
        results: list[dict[str, Any]] = []
        for url in urls:
            extracted = await adapter.extract_url(
                url=url,
                task=resolved.task,
                schema=schema,
                max_steps=resolved.max_steps,
            )
            extracted["_source_url"] = url
            extracted["_confidence"] = self._score_confidence(extracted)
            if extracted["_confidence"] >= resolved.confidence_threshold:
                results.append(extracted)

        self.ctx.results["ai_extract_results"] = results
        self.ctx.results["ai_extracted_data"] = results[0] if results else {}

        if not results:
            return []
        if len(results) == 1:
            return results[0]
        return results

    def _resolve_urls(self, params: dict[str, Any], visit_top_n: int) -> list[str]:
        explicit_urls = params.get("urls")
        if isinstance(explicit_urls, list):
            values = [u.strip() for u in explicit_urls if isinstance(u, str) and u.strip()]
            if values:
                return values[:visit_top_n]

        explicit_url = params.get("url")
        if isinstance(explicit_url, str) and explicit_url.strip():
            return [explicit_url.strip()]

        ai_search_results = self.ctx.results.get("ai_search_results")
        if isinstance(ai_search_results, list):
            urls: list[str] = []
            for item in ai_search_results:
                if isinstance(item, dict):
                    url_value = item.get("url")
                    if isinstance(url_value, str) and url_value.strip():
                        urls.append(url_value.strip())
                if len(urls) >= visit_top_n:
                    break
            if urls:
                return urls

        current_url = getattr(getattr(self.ctx.browser, "page", None), "url", "")
        if isinstance(current_url, str) and current_url.strip():
            return [current_url.strip()]

        return []
