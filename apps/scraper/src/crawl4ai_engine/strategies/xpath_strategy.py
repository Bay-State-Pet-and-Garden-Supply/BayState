from __future__ import annotations

from collections.abc import Mapping
from typing import cast

from .base import BaseExtractionStrategy, SelectorConfig


class XPathExtractionStrategy(BaseExtractionStrategy):
    """XPath-based extraction strategy using JsonXPathExtractionStrategy."""

    _STRATEGY_CLASS_NAME = "JsonXPathExtractionStrategy"
    _SELECTOR_KEY = "xpath"

    @classmethod
    def _get_selector_value(cls, field: SelectorConfig) -> str:
        """XPath uses 'xpath' key as primary, falling back to 'selector'."""
        return str(field.get("xpath") or field.get("selector") or "").strip()
