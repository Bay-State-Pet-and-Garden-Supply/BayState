from __future__ import annotations

from collections.abc import Sequence
from importlib import import_module
from typing import Protocol, cast

from .css_strategy import CSSExtractionStrategy
from .xpath_strategy import XPathExtractionStrategy

StrategyLike = object


class LLMFallbackFactory(Protocol):
    def __call__(
        self,
        schema: dict[str, object],
        *,
        provider: str = "openai/gpt-4o-mini",
        budget_usd: float = 1.0,
        confidence_threshold: float = 0.7,
        scraper_name: str = "default",
    ) -> object: ...


try:
    _llm_fallback_module = import_module("src.crawl4ai_engine.strategies.llm_fallback")
    LLMFallbackStrategy = cast(object, getattr(_llm_fallback_module, "LLMFallbackStrategy"))
except ModuleNotFoundError:
    LLMFallbackStrategy = cast(object, None)


EXTRACTION_FALLBACK_CHAIN: tuple[str, str, str] = ("css", "xpath", "llm")


def build_fallback_chain(
    *,
    css_selectors: dict[str, object] | Sequence[dict[str, object]] | None = None,
    xpath_selectors: dict[str, object] | Sequence[dict[str, object]] | None = None,
    llm_schema: dict[str, object] | None = None,
    llm_provider: str = "openai/gpt-4o-mini",
    llm_budget_usd: float = 1.0,
    llm_confidence_threshold: float = 0.7,
    llm_scraper_name: str = "default",
    llm_strategy: object | None = None,
    schema_name: str = "extraction",
) -> list[StrategyLike]:
    chain: list[StrategyLike] = []

    if css_selectors:
        chain.append(CSSExtractionStrategy.from_yaml_selectors(css_selectors, schema_name=schema_name))
    if xpath_selectors:
        chain.append(XPathExtractionStrategy.from_yaml_selectors(xpath_selectors, schema_name=schema_name))
    if llm_strategy is not None:
        chain.append(llm_strategy)
    elif llm_schema:
        llm_fallback_module = import_module("src.crawl4ai_engine.strategies.llm_fallback")
        fallback_cls = cast(LLMFallbackFactory, getattr(llm_fallback_module, "LLMFallbackStrategy"))
        chain.append(
            fallback_cls(
                llm_schema,
                provider=llm_provider,
                budget_usd=llm_budget_usd,
                confidence_threshold=llm_confidence_threshold,
                scraper_name=llm_scraper_name,
            )
        )

    return chain


__all__ = [
    "CSSExtractionStrategy",
    "XPathExtractionStrategy",
    "LLMFallbackStrategy",
    "EXTRACTION_FALLBACK_CHAIN",
    "build_fallback_chain",
]
