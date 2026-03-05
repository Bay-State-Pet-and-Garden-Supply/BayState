from __future__ import annotations

from collections.abc import Mapping
from importlib import import_module
import json
import os
from typing import Protocol, cast

from scrapers.ai_cost_tracker import AICostTracker


class AsyncCrawlerProtocol(Protocol):
    async def arun(self, *, url: str, extraction_strategy: object, **kwargs: object) -> object: ...


class LLMConfigFactory(Protocol):
    def __call__(self, **kwargs: object) -> object: ...


class LLMStrategyFactory(Protocol):
    def __call__(self, **kwargs: object) -> object: ...


class BudgetExceededError(RuntimeError):
    pass


class LowConfidenceExtractionError(RuntimeError):
    pass


class LLMFallbackStrategy:
    schema: dict[str, object]
    provider: str
    model: str
    budget_usd: float
    confidence_threshold: float
    scraper_name: str
    tracker: AICostTracker
    _strategy: object

    def __init__(
        self,
        schema: dict[str, object],
        *,
        provider: str = "openai/gpt-4o-mini",
        api_token: str | None = None,
        instruction: str | None = None,
        extraction_type: str = "schema",
        budget_usd: float = 1.0,
        confidence_threshold: float = 0.7,
        scraper_name: str = "default",
        tracker: AICostTracker | None = None,
    ) -> None:
        if budget_usd <= 0:
            raise ValueError("budget_usd must be > 0")
        if not 0.0 <= confidence_threshold <= 1.0:
            raise ValueError("confidence_threshold must be between 0.0 and 1.0")

        self.schema = schema
        self.provider = provider
        self.model = self._model_from_provider(provider)
        self.budget_usd = budget_usd
        self.confidence_threshold = confidence_threshold
        self.scraper_name = scraper_name
        self.tracker = tracker or AICostTracker()

        crawl4ai_module = import_module("crawl4ai")
        extraction_module = import_module("crawl4ai.extraction_strategy")
        llm_config_cls = cast(LLMConfigFactory, getattr(crawl4ai_module, "LLMConfig"))
        llm_strategy_cls = cast(LLMStrategyFactory, getattr(extraction_module, "LLMExtractionStrategy"))

        resolved_token = api_token or self._resolve_api_token(provider)
        llm_config = llm_config_cls(
            provider=provider,
            api_token=resolved_token,
        )

        strategy_kwargs: dict[str, object] = {
            "llm_config": llm_config,
            "schema": schema,
            "extraction_type": extraction_type,
        }
        if instruction:
            strategy_kwargs["instruction"] = instruction

        self._strategy = llm_strategy_cls(**strategy_kwargs)

    async def extract(
        self,
        url: str,
        crawler: AsyncCrawlerProtocol,
        **run_kwargs: object,
    ) -> object:
        self._enforce_budget()

        result = await crawler.arun(url=url, extraction_strategy=self._strategy, **run_kwargs)

        content = self._parse_extracted_content(getattr(result, "extracted_content", None))
        input_tokens, output_tokens = self._extract_token_usage(result=result, content=content)

        _ = self.tracker.track_extraction(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model=self.model,
            scraper_name=self.scraper_name,
        )

        self._enforce_budget()

        confidence = self._calculate_confidence(content)
        if confidence < self.confidence_threshold:
            raise LowConfidenceExtractionError((f"LLM fallback confidence below threshold: {confidence:.2f} < {self.confidence_threshold:.2f}"))

        return content

    def _enforce_budget(self) -> None:
        total_cost = float(self.tracker.get_cost_summary().get("total_cost_usd", 0.0) or 0.0)
        if total_cost >= self.budget_usd:
            raise BudgetExceededError(f"LLM fallback budget exceeded: ${total_cost:.4f} / ${self.budget_usd:.4f}")

    @staticmethod
    def _model_from_provider(provider: str) -> str:
        if "/" not in provider:
            return provider
        return provider.split("/", 1)[1]

    @staticmethod
    def _resolve_api_token(provider: str) -> str | None:
        provider_name = provider.split("/", 1)[0].strip().lower()
        env_map = {
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "google": "GOOGLE_API_KEY",
            "gemini": "GOOGLE_API_KEY",
            "groq": "GROQ_API_KEY",
            "azure": "AZURE_OPENAI_API_KEY",
            "openrouter": "OPENROUTER_API_KEY",
            "bedrock": "AWS_ACCESS_KEY_ID",
        }
        env_name = env_map.get(provider_name)
        return os.getenv(env_name) if env_name else None

    @staticmethod
    def _parse_extracted_content(content: object) -> object:
        if isinstance(content, str):
            try:
                return cast(object, json.loads(content))
            except json.JSONDecodeError:
                return {"raw": content}
        return content

    def _extract_token_usage(self, *, result: object, content: object) -> tuple[int, int]:
        usage: object = getattr(result, "usage", None)

        if isinstance(usage, Mapping):
            usage_map = cast(Mapping[str, object], usage)
            input_tokens = self._coerce_usage_int(usage_map.get("input_tokens") or usage_map.get("prompt_tokens"))
            output_tokens = self._coerce_usage_int(usage_map.get("output_tokens") or usage_map.get("completion_tokens"))
            if input_tokens > 0 or output_tokens > 0:
                return input_tokens, output_tokens

        if usage is not None and not isinstance(usage, Mapping):
            input_tokens = self._coerce_usage_int(getattr(usage, "input_tokens", None) or getattr(usage, "prompt_tokens", None))
            output_tokens = self._coerce_usage_int(getattr(usage, "output_tokens", None) or getattr(usage, "completion_tokens", None))
            if input_tokens > 0 or output_tokens > 0:
                return input_tokens, output_tokens

        serialized = self._safe_serialize(content)
        estimated_output_tokens = max(1, len(serialized) // 4)
        estimated_input_tokens = max(1, estimated_output_tokens * 2)
        return estimated_input_tokens, estimated_output_tokens

    @staticmethod
    def _coerce_usage_int(value: object) -> int:
        try:
            if isinstance(value, bool):
                return 0
            if isinstance(value, int):
                return max(0, value)
            if isinstance(value, float):
                return max(0, int(value))
            if isinstance(value, str):
                return max(0, int(value.strip()))
            return 0
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _safe_serialize(value: object) -> str:
        if isinstance(value, str):
            return value
        try:
            return json.dumps(value)
        except (TypeError, ValueError):
            return str(value)

    def _calculate_confidence(self, content: object) -> float:
        if isinstance(content, list):
            content_list = cast(list[object], content)
            if len(content_list) == 0:
                return 0.0
            first_item = content_list[0]
            return self._calculate_confidence(first_item)

        if not isinstance(content, Mapping):
            return 0.0

        content_map = cast(Mapping[str, object], content)

        required_fields = self._extract_required_fields_from_schema(self.schema)
        if not required_fields:
            required_fields = [str(key) for key in content_map.keys()]
            if not required_fields:
                return 0.0

        filled_count = 0
        for field_name in required_fields:
            if self._has_value(content_map.get(field_name)):
                filled_count += 1

        return filled_count / max(1, len(required_fields))

    @staticmethod
    def _extract_required_fields_from_schema(schema: dict[str, object]) -> list[str]:
        required = schema.get("required")
        if isinstance(required, list):
            required_list = cast(list[object], required)
            return [str(field) for field in required_list]

        properties = schema.get("properties")
        if isinstance(properties, Mapping):
            properties_map = cast(Mapping[str, object], properties)
            return [str(name) for name in properties_map.keys()]

        fields = schema.get("fields")
        if isinstance(fields, list):
            fields_list = cast(list[object], fields)
            names: list[str] = []
            for field in fields_list:
                if isinstance(field, Mapping):
                    field_map = cast(Mapping[str, object], field)
                    field_name = field_map.get("name")
                    if field_name is not None:
                        names.append(str(field_name))
            return names

        return []

    @staticmethod
    def _has_value(value: object) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, dict):
            value_dict = cast(dict[object, object], value)
            return len(value_dict) > 0
        if isinstance(value, (list, tuple, set)):
            value_seq = cast(list[object] | tuple[object, ...] | set[object], value)
            return len(value_seq) > 0
        return True
