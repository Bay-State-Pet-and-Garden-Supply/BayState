from __future__ import annotations

import json
import logging
from typing import Any

from crawl4ai_engine.login_detection import is_login_page

logger = logging.getLogger(__name__)

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


try:
    from scrapers.ai_cost_tracker import AICostTracker
except Exception:  # pragma: no cover - optional dependency in test/import contexts
    AICostTracker = Any  # type: ignore[misc,assignment]


class LLMExtractionStrategyWrapper:
    """Wrapper around crawl4ai's LLMExtractionStrategy with cost tracking.

    Uses LiteLLM provider strings (for example: ``openai/gpt-4o-mini``,
    ``anthropic/claude-3-5-sonnet``, ``ollama/llama3``).
    """

    def __init__(
        self,
        provider: str,
        instruction: str,
        *,
        schema: dict[str, Any] | None = None,
        extraction_type: str = "schema",
        api_token: str | None = None,
        base_url: str | None = None,
        input_format: str = "html",
        apply_chunking: bool = True,
        chunk_token_threshold: int = 1200,
        overlap_rate: float = 0.1,
        extra_args: dict[str, Any] | None = None,
        confidence_threshold: float = 0.6,
        scraper_name: str = "default",
        cost_tracker: AICostTracker | None = None,
        strategy_factory: Any | None = None,
        llm_config_factory: Any | None = None,
    ) -> None:
        self.provider = provider
        self.instruction = instruction
        self.schema = schema
        self.extraction_type = extraction_type
        self.api_token = api_token
        self.base_url = base_url
        self.input_format = input_format
        self.apply_chunking = apply_chunking
        self.chunk_token_threshold = chunk_token_threshold
        self.overlap_rate = overlap_rate
        self.extra_args = extra_args or {}
        self.confidence_threshold = self._clamp(confidence_threshold, 0.0, 1.0)
        self.scraper_name = scraper_name
        self._strategy_factory = strategy_factory
        self._llm_config_factory = llm_config_factory
        self._strategy: Any | None = None
        self._cost_tracker = cost_tracker or self._build_cost_tracker()

    def extract(self, html: str, url: str = "") -> list[dict[str, Any]]:
        """Extract data and return only confidence-qualified items."""
        result = self.extract_with_metadata(html=html, url=url)
        return result["data"]

    def extract_with_metadata(self, html: str, url: str = "") -> dict[str, Any]:
        """Extract data and return metadata (confidence, usage, source).

        Performs login page detection before extraction to prevent
        misclassification of login screens as product data.
        """
        # Check if this is a login page before attempting extraction
        if is_login_page(html, url):
            logger.warning("LLM extraction aborted: login page detected for %s", url or "unknown URL")
            return {
                "success": False,
                "data": [],
                "confidence": 0.0,
                "strategy": "llm",
                "error": "Login page detected - cannot extract product data",
                "metadata": {"login_page_detected": True, "provider": self.provider},
            }

        try:
            strategy = self._get_strategy()
            raw = self._run_strategy(strategy=strategy, html=html, url=url)
            records = self._normalize_records(raw)
            confidences = [self._record_confidence(record) for record in records]
            accepted = [record for record, confidence in zip(records, confidences, strict=False) if confidence >= self.confidence_threshold]
            best_confidence = max(confidences, default=0.0)

            input_tokens, output_tokens = self._extract_usage_tokens(strategy)
            if input_tokens <= 0 and output_tokens <= 0:
                input_tokens = max(1, len(html) // 4)
                output_tokens = max(1, len(json.dumps(records)) // 4)

            self._track_cost(input_tokens=input_tokens, output_tokens=output_tokens)

            return {
                "success": bool(accepted),
                "data": accepted,
                "confidence": best_confidence,
                "strategy": "llm",
                "metadata": {
                    "provider": self.provider,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                },
            }
        except Exception as exc:
            logger.warning("LLM extraction failed (%s): %s", self.provider, exc)
            return {
                "success": False,
                "data": [],
                "confidence": 0.0,
                "strategy": "llm",
                "error": str(exc),
                "metadata": {"provider": self.provider},
            }
        """Extract data and return metadata (confidence, usage, source)."""
        try:
            strategy = self._get_strategy()
            raw = self._run_strategy(strategy=strategy, html=html, url=url)
            records = self._normalize_records(raw)
            confidences = [self._record_confidence(record) for record in records]
            accepted = [record for record, confidence in zip(records, confidences, strict=False) if confidence >= self.confidence_threshold]
            best_confidence = max(confidences, default=0.0)

            input_tokens, output_tokens = self._extract_usage_tokens(strategy)
            if input_tokens <= 0 and output_tokens <= 0:
                input_tokens = max(1, len(html) // 4)
                output_tokens = max(1, len(json.dumps(records)) // 4)

            self._track_cost(input_tokens=input_tokens, output_tokens=output_tokens)

            return {
                "success": bool(accepted),
                "data": accepted,
                "confidence": best_confidence,
                "strategy": "llm",
                "metadata": {
                    "provider": self.provider,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                },
            }
        except Exception as exc:
            logger.warning("LLM extraction failed (%s): %s", self.provider, exc)
            return {
                "success": False,
                "data": [],
                "confidence": 0.0,
                "strategy": "llm",
                "error": str(exc),
                "metadata": {"provider": self.provider},
            }

    def _get_strategy(self) -> Any:
        if self._strategy is not None:
            return self._strategy

        strategy_factory = self._strategy_factory
        llm_config_factory = self._llm_config_factory

        if strategy_factory is None or llm_config_factory is None:
            strategy_factory, llm_config_factory = self._resolve_crawl4ai_factories()

        llm_config = llm_config_factory(
            provider=self.provider,
            api_token=self.api_token,
            base_url=self.base_url,
        )

        self._strategy = strategy_factory(
            llm_config=llm_config,
            schema=self.schema,
            extraction_type=self.extraction_type,
            instruction=self.instruction,
            chunk_token_threshold=self.chunk_token_threshold,
            overlap_rate=self.overlap_rate,
            apply_chunking=self.apply_chunking,
            input_format=self.input_format,
            extra_args=self.extra_args,
        )
        return self._strategy

    def _resolve_crawl4ai_factories(self) -> tuple[Any, Any]:
        from crawl4ai.extraction_strategy import LLMExtractionStrategy

        try:
            from crawl4ai import LLMConfig
        except Exception:
            from crawl4ai.async_configs import LLMConfig  # type: ignore

        return LLMExtractionStrategy, LLMConfig

    def _run_strategy(self, strategy: Any, html: str, url: str) -> Any:
        try:
            return strategy.extract(url=url, html=html)
        except TypeError:
            try:
                return strategy.extract(url, html)
            except TypeError:
                return strategy.extract(html)

    def _normalize_records(self, payload: Any) -> list[dict[str, Any]]:
        if payload is None:
            return []

        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except json.JSONDecodeError:
                return []

        if isinstance(payload, dict):
            return [payload]

        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]

        return []

    def _record_confidence(self, record: dict[str, Any]) -> float:
        explicit = record.get("_confidence")
        if isinstance(explicit, (int, float)):
            return self._clamp(float(explicit), 0.0, 1.0)

        expected_fields = self._expected_schema_fields()
        if expected_fields:
            present = 0
            for field in expected_fields:
                value = record.get(field)
                if value is None:
                    continue
                if isinstance(value, str) and not value.strip():
                    continue
                present += 1
            return self._clamp(present / max(len(expected_fields), 1), 0.0, 1.0)

        values = list(record.values())
        if not values:
            return 0.0
        non_empty = 0
        for value in values:
            if value is None:
                continue
            if isinstance(value, str) and not value.strip():
                continue
            non_empty += 1
        return self._clamp(non_empty / len(values), 0.0, 1.0)

    def _expected_schema_fields(self) -> list[str]:
        if not isinstance(self.schema, dict):
            return []

        properties = self.schema.get("properties")
        if not isinstance(properties, dict):
            return []

        return [key for key in properties.keys() if isinstance(key, str) and key]

    def _extract_usage_tokens(self, strategy: Any) -> tuple[int, int]:
        total_usage = getattr(strategy, "total_usage", None)
        if total_usage is not None:
            return self._usage_tokens(total_usage)

        usages = getattr(strategy, "usages", None)
        if isinstance(usages, list):
            total_input = 0
            total_output = 0
            for usage in usages:
                in_tokens, out_tokens = self._usage_tokens(usage)
                total_input += in_tokens
                total_output += out_tokens
            return total_input, total_output

        return 0, 0

    def _usage_tokens(self, usage: Any) -> tuple[int, int]:
        if isinstance(usage, dict):
            input_tokens = self._as_int(usage.get("input_tokens") or usage.get("prompt_tokens"))
            output_tokens = self._as_int(usage.get("output_tokens") or usage.get("completion_tokens"))
            return input_tokens, output_tokens

        input_tokens = self._as_int(getattr(usage, "input_tokens", None) or getattr(usage, "prompt_tokens", None))
        output_tokens = self._as_int(getattr(usage, "output_tokens", None) or getattr(usage, "completion_tokens", None))
        return input_tokens, output_tokens

    def _track_cost(self, input_tokens: int, output_tokens: int) -> None:
        if self._cost_tracker is None:
            return

        self._cost_tracker.track_extraction(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model=self._model_for_cost_tracking(),
            scraper_name=self.scraper_name,
        )

    def _model_for_cost_tracking(self) -> str:
        if "/" in self.provider:
            return self.provider.split("/", 1)[1]
        return self.provider

    def _build_cost_tracker(self) -> AICostTracker | None:
        try:
            return AICostTracker()  # type: ignore[operator]
        except Exception:
            return None

    def _as_int(self, value: Any) -> int:
        try:
            if isinstance(value, bool):
                return 0
            return max(0, int(value))
        except Exception:
            return 0

    def _clamp(self, value: float, low: float, high: float) -> float:
        return max(low, min(high, value))
