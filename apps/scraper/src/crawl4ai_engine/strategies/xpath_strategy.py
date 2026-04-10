from __future__ import annotations

from importlib import import_module as _stdlib_import_module

from . import base
from .base import BaseExtractionStrategy, SelectorConfig

import_module = _stdlib_import_module


class XPathExtractionStrategy(BaseExtractionStrategy):
    """XPath-based extraction strategy using JsonXPathExtractionStrategy."""

    _STRATEGY_CLASS_NAME = "JsonXPathExtractionStrategy"
    _SELECTOR_KEY = "xpath"

    @classmethod
    def _load_extraction_module(cls) -> object:
        loader = import_module if import_module is not _stdlib_import_module else base.import_module
        return loader("crawl4ai.extraction_strategy")

    @classmethod
    def _get_selector_value(cls, field: SelectorConfig) -> str:
        """XPath uses 'xpath' key as primary, falling back to 'selector'."""
        return str(field.get("xpath") or field.get("selector") or "").strip()
