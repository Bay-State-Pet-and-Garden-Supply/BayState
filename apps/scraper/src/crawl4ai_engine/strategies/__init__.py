from __future__ import annotations

from collections.abc import Sequence
from typing import cast

from .css_strategy import CSSExtractionStrategy
from .xpath_strategy import XPathExtractionStrategy

StrategyLike = object

EXTRACTION_FALLBACK_CHAIN: tuple[str, str] = ("css", "xpath")


def build_fallback_chain(
    *,
    css_selectors: dict[str, object] | Sequence[dict[str, object]] | None = None,
    xpath_selectors: dict[str, object] | Sequence[dict[str, object]] | None = None,
    schema_name: str = "extraction",
) -> list[StrategyLike]:
    """Build a chain of extraction strategies. 
    
    AI/LLM strategies are deprecated for static scrapers and removed from the chain.
    """
    chain: list[StrategyLike] = []

    if css_selectors:
        chain.append(CSSExtractionStrategy.from_yaml_selectors(css_selectors, schema_name=schema_name))
    if xpath_selectors:
        chain.append(XPathExtractionStrategy.from_yaml_selectors(xpath_selectors, schema_name=schema_name))

    return chain


__all__ = [
    "CSSExtractionStrategy",
    "XPathExtractionStrategy",
    "EXTRACTION_FALLBACK_CHAIN",
    "build_fallback_chain",
]
