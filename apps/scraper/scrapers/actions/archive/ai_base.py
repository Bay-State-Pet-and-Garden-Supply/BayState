from __future__ import annotations

from abc import ABC
import importlib
import math
import os
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from scrapers.actions.base import BaseAction
from scrapers.exceptions import WorkflowExecutionError


@dataclass
class AIResolvedConfig:
    provider: str
    task: str
    llm_model: str
    max_steps: int
    confidence_threshold: float
    use_vision: bool
    headless: bool


class Crawl4AIAdapter:
    def __init__(self, *, headless: bool, llm_model: str, use_vision: bool) -> None:
        self.headless = headless
        self.llm_model = llm_model
        self.use_vision = use_vision

    async def extract_url(
        self,
        *,
        url: str,
        task: str,
        schema: dict[str, Any] | None = None,
        max_steps: int = 10,
    ) -> dict[str, Any]:
        crawl4ai_module, extraction_module = self._import_crawl4ai()
        AsyncWebCrawler = getattr(crawl4ai_module, "AsyncWebCrawler")
        BrowserConfig = getattr(crawl4ai_module, "BrowserConfig")
        CrawlerRunConfig = getattr(crawl4ai_module, "CrawlerRunConfig")
        CacheMode = getattr(crawl4ai_module, "CacheMode")
        LLMConfig = getattr(crawl4ai_module, "LLMConfig")
        LLMExtractionStrategy = getattr(extraction_module, "LLMExtractionStrategy")

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise WorkflowExecutionError("OPENAI_API_KEY is required for crawl4ai extraction")

        normalized_schema = schema or {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "brand": {"type": "string"},
                "price": {"type": "string"},
                "description": {"type": "string"},
                "images": {"type": "array", "items": {"type": "string"}},
            },
        }

        llm_strategy = LLMExtractionStrategy(
            llm_config=LLMConfig(provider=f"openai/{self.llm_model}", api_token=api_key),
            schema=normalized_schema,
            extraction_type="schema",
            instruction=f"{task}\n\nYou may take up to {max_steps} steps. Return JSON only and match schema exactly.",
            use_vision=self.use_vision,
        )

        browser_config = BrowserConfig(headless=self.headless)
        run_config_kwargs: dict[str, Any] = {
            "cache_mode": CacheMode.BYPASS,
            "extraction_strategy": llm_strategy,
            "max_steps": max_steps,
        }
        try:
            run_config = CrawlerRunConfig(**run_config_kwargs)
        except TypeError:
            run_config_kwargs.pop("max_steps", None)
            run_config = CrawlerRunConfig(**run_config_kwargs)
        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url=url, config=run_config)

        if not getattr(result, "success", False):
            raise WorkflowExecutionError(str(getattr(result, "error_message", "crawl4ai extraction failed")))

        extracted = getattr(result, "extracted_content", None)
        if isinstance(extracted, dict):
            return extracted
        if isinstance(extracted, list) and extracted and isinstance(extracted[0], dict):
            return extracted[0]
        if isinstance(extracted, str):
            import json

            loaded = json.loads(extracted)
            if isinstance(loaded, dict):
                return loaded
            if isinstance(loaded, list) and loaded and isinstance(loaded[0], dict):
                return loaded[0]

        raise WorkflowExecutionError("crawl4ai did not return structured data")

    def _import_crawl4ai(self) -> tuple[Any, Any]:
        try:
            crawl4ai_module = importlib.import_module("crawl4ai")
            extraction_module = importlib.import_module("crawl4ai.extraction_strategy")
        except ModuleNotFoundError as exc:
            raise WorkflowExecutionError("crawl4ai is not installed; AI actions unavailable") from exc
        return crawl4ai_module, extraction_module


class BaseAIAction(BaseAction, ABC):
    def _resolve_ai_config(self, params: dict[str, Any]) -> AIResolvedConfig:
        ai_cfg = getattr(self.ctx.config, "ai_config", None)
        provider = self._as_str(params.get("provider")) or self._as_str(getattr(ai_cfg, "provider", None))
        if not provider:
            provider = self._as_str(getattr(ai_cfg, "tool", None)) or "crawl4ai"

        task = self._as_str(params.get("task")) or self._as_str(getattr(ai_cfg, "task", None))
        if not task:
            raise WorkflowExecutionError("AI action requires 'task'")

        llm_model = self._as_str(params.get("llm_model")) or self._as_str(getattr(ai_cfg, "llm_model", None)) or "gpt-4o-mini"
        max_steps = self._as_int(params.get("max_steps"), self._as_int(getattr(ai_cfg, "max_steps", None), 10), 1, 50)
        confidence_threshold = self._as_float(
            params.get("confidence_threshold"),
            self._as_float(getattr(ai_cfg, "confidence_threshold", None), 0.7, 0.0, 1.0),
            0.0,
            1.0,
        )
        use_vision = self._as_bool(params.get("use_vision"), self._as_bool(getattr(ai_cfg, "use_vision", None), True))
        headless = self._as_bool(params.get("headless"), self._as_bool(getattr(ai_cfg, "headless", None), True))

        return AIResolvedConfig(
            provider=provider,
            task=task,
            llm_model=llm_model,
            max_steps=max_steps,
            confidence_threshold=confidence_threshold,
            use_vision=use_vision,
            headless=headless,
        )

    def _build_adapter(self, resolved: AIResolvedConfig) -> Crawl4AIAdapter:
        if resolved.provider != "crawl4ai":
            raise WorkflowExecutionError(f"Unsupported ai provider '{resolved.provider}'")
        return Crawl4AIAdapter(headless=resolved.headless, llm_model=resolved.llm_model, use_vision=resolved.use_vision)

    def _schema_from_params(self, schema_param: Any) -> dict[str, Any] | None:
        if schema_param is None:
            return None
        if isinstance(schema_param, dict):
            properties: dict[str, Any] = {}
            for key, value in schema_param.items():
                if isinstance(key, str):
                    properties[key] = self._schema_field(value)
            return {"type": "object", "properties": properties}
        if isinstance(schema_param, type) and issubclass(schema_param, BaseModel):
            return schema_param.model_json_schema()
        return None

    def _schema_field(self, value: Any) -> dict[str, Any]:
        if value in (list, "list", "array"):
            return {"type": "array", "items": {"type": "string"}}
        if value in (int, "int", "integer"):
            return {"type": "integer"}
        if value in (float, "float", "number"):
            return {"type": "number"}
        if value in (bool, "bool", "boolean"):
            return {"type": "boolean"}
        return {"type": "string"}

    def _score_confidence(self, payload: dict[str, Any]) -> float:
        explicit = payload.get("_confidence")
        if isinstance(explicit, (int, float)) and not math.isnan(float(explicit)):
            return max(0.0, min(1.0, float(explicit)))

        values = [v for k, v in payload.items() if not str(k).startswith("_")]
        if not values:
            return 0.0
        present = 0
        for value in values:
            if value is None:
                continue
            if isinstance(value, str) and not value.strip():
                continue
            if isinstance(value, (list, dict)) and len(value) == 0:
                continue
            present += 1
        return present / len(values)

    def _as_str(self, value: Any) -> str:
        return value.strip() if isinstance(value, str) else ""

    def _as_int(self, value: Any, default: int, min_value: int | None = None, max_value: int | None = None) -> int:
        try:
            if isinstance(value, bool):
                raise ValueError("bool is invalid")
            parsed = int(value)
        except Exception:
            parsed = default
        if min_value is not None:
            parsed = max(min_value, parsed)
        if max_value is not None:
            parsed = min(max_value, parsed)
        return parsed

    def _as_float(self, value: Any, default: float, min_value: float | None = None, max_value: float | None = None) -> float:
        try:
            if isinstance(value, bool):
                raise ValueError("bool is invalid")
            parsed = float(value)
        except Exception:
            parsed = default
        if min_value is not None:
            parsed = max(min_value, parsed)
        if max_value is not None:
            parsed = min(max_value, parsed)
        return parsed

    def _as_bool(self, value: Any, default: bool) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"1", "true", "yes", "y"}:
                return True
            if lowered in {"0", "false", "no", "n"}:
                return False
        return default
