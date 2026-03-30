from __future__ import annotations

from .base import BaseExtractionStrategy


class CSSExtractionStrategy(BaseExtractionStrategy):
    """CSS-based extraction strategy using JsonCssExtractionStrategy."""

    _STRATEGY_CLASS_NAME = "JsonCssExtractionStrategy"
    _SELECTOR_KEY = "css"
