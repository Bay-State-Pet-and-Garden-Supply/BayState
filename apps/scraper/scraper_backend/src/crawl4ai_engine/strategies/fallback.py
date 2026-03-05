from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from crawl4ai_engine.strategies.css import CssExtractionStrategyWrapper
from crawl4ai_engine.strategies.llm import LLMExtractionStrategyWrapper
from crawl4ai_engine.strategies.xpath import XPathExtractionStrategyWrapper


@dataclass
class FallbackExtractionResult:
    success: bool
    strategy: str
    data: list[dict[str, Any]] = field(default_factory=list)
    confidence: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


class ExtractionFallbackChain:
    """Fallback extraction chain: CSS -> XPath -> LLM."""

    def __init__(
        self,
        *,
        css_strategy: CssExtractionStrategyWrapper | Any | None = None,
        xpath_strategy: XPathExtractionStrategyWrapper | Any | None = None,
        llm_strategy: LLMExtractionStrategyWrapper | Any | None = None,
        confidence_threshold: float = 0.6,
    ) -> None:
        self.css_strategy = css_strategy
        self.xpath_strategy = xpath_strategy
        self.llm_strategy = llm_strategy
        self.confidence_threshold = self._clamp(confidence_threshold, 0.0, 1.0)

    @classmethod
    def from_config(cls, config: dict[str, Any]) -> "ExtractionFallbackChain":
        css_strategy = None
        xpath_strategy = None
        llm_strategy = None

        css_config = config.get("css")
        if isinstance(css_config, dict):
            base_selector = css_config.get("base_selector")
            selectors = css_config.get("selectors")
            if isinstance(base_selector, str) and isinstance(selectors, dict):
                css_strategy = CssExtractionStrategyWrapper.from_yaml_selectors(base_selector=base_selector, selectors=selectors)

        xpath_config = config.get("xpath")
        if isinstance(xpath_config, dict):
            base_selector = xpath_config.get("base_selector")
            selectors = xpath_config.get("selectors")
            if isinstance(base_selector, str) and isinstance(selectors, dict):
                xpath_strategy = XPathExtractionStrategyWrapper.from_yaml_selectors(base_selector=base_selector, selectors=selectors)

        llm_config = config.get("llm")
        if isinstance(llm_config, dict):
            provider = llm_config.get("provider")
            instruction = llm_config.get("instruction")
            if isinstance(provider, str) and isinstance(instruction, str):
                llm_strategy = LLMExtractionStrategyWrapper(
                    provider=provider,
                    instruction=instruction,
                    schema=llm_config.get("schema"),
                    extraction_type=str(llm_config.get("extraction_type", "schema")),
                    api_token=llm_config.get("api_token"),
                    base_url=llm_config.get("base_url"),
                    extra_args=llm_config.get("extra_args") if isinstance(llm_config.get("extra_args"), dict) else None,
                    confidence_threshold=float(llm_config.get("confidence_threshold", config.get("confidence_threshold", 0.6))),
                    scraper_name=str(llm_config.get("scraper_name", "default")),
                )

        return cls(
            css_strategy=css_strategy,
            xpath_strategy=xpath_strategy,
            llm_strategy=llm_strategy,
            confidence_threshold=float(config.get("confidence_threshold", 0.6)),
        )

    def extract(self, html: str, url: str = "") -> FallbackExtractionResult:
        errors: list[dict[str, str]] = []

        css_result = self._run_structured_strategy("css", self.css_strategy, html)
        if css_result is not None:
            if css_result.success:
                return css_result
            if css_result.error:
                errors.append({"strategy": "css", "error": css_result.error})

        xpath_result = self._run_structured_strategy("xpath", self.xpath_strategy, html)
        if xpath_result is not None:
            if xpath_result.success:
                return xpath_result
            if xpath_result.error:
                errors.append({"strategy": "xpath", "error": xpath_result.error})

        llm_result = self._run_llm_strategy(html=html, url=url)
        if llm_result is not None:
            if llm_result.success:
                return llm_result
            if llm_result.error:
                errors.append({"strategy": "llm", "error": llm_result.error})

        return FallbackExtractionResult(
            success=False, strategy="none", data=[], confidence=0.0, metadata={"errors": errors}, error="All extraction strategies failed"
        )

    def _run_structured_strategy(self, strategy_name: str, strategy: Any | None, html: str) -> FallbackExtractionResult | None:
        if strategy is None:
            return None

        try:
            records = strategy.extract(html)
        except Exception as exc:
            return FallbackExtractionResult(success=False, strategy=strategy_name, error=str(exc))

        if not isinstance(records, list):
            return FallbackExtractionResult(success=False, strategy=strategy_name, error="Strategy returned non-list payload")

        data = [item for item in records if isinstance(item, dict)]
        if not data:
            return FallbackExtractionResult(success=False, strategy=strategy_name, error="No records extracted")

        confidence = self._records_confidence(data)
        if confidence < self.confidence_threshold:
            return FallbackExtractionResult(success=False, strategy=strategy_name, data=data, confidence=confidence, error="Confidence below threshold")

        return FallbackExtractionResult(success=True, strategy=strategy_name, data=data, confidence=confidence)

    def _run_llm_strategy(self, html: str, url: str) -> FallbackExtractionResult | None:
        if self.llm_strategy is None:
            return None

        try:
            result = self.llm_strategy.extract_with_metadata(html=html, url=url)
        except Exception as exc:
            return FallbackExtractionResult(success=False, strategy="llm", error=str(exc))

        data = result.get("data")
        confidence = float(result.get("confidence", 0.0))
        success = bool(result.get("success", False))
        if not isinstance(data, list):
            data = []

        if not success or confidence < self.confidence_threshold:
            return FallbackExtractionResult(
                success=False,
                strategy="llm",
                data=[item for item in data if isinstance(item, dict)],
                confidence=confidence,
                metadata=result.get("metadata") if isinstance(result.get("metadata"), dict) else {},
                error=str(result.get("error") or "LLM extraction did not meet threshold"),
            )

        return FallbackExtractionResult(
            success=True,
            strategy="llm",
            data=[item for item in data if isinstance(item, dict)],
            confidence=confidence,
            metadata=result.get("metadata") if isinstance(result.get("metadata"), dict) else {},
        )

    def _records_confidence(self, records: list[dict[str, Any]]) -> float:
        scores: list[float] = []
        for record in records:
            if not record:
                scores.append(0.0)
                continue

            total = 0
            present = 0
            for value in record.values():
                total += 1
                if value is None:
                    continue
                if isinstance(value, str) and not value.strip():
                    continue
                present += 1

            scores.append(present / max(total, 1))

        return max(scores, default=0.0)

    def _clamp(self, value: float, low: float, high: float) -> float:
        return max(low, min(high, value))
