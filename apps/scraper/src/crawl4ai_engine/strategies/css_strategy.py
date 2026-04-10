from __future__ import annotations

from importlib import import_module as _stdlib_import_module

from . import base
from .base import BaseExtractionStrategy

import_module = _stdlib_import_module


class CSSExtractionStrategy(BaseExtractionStrategy):
    """CSS-based extraction strategy using JsonCssExtractionStrategy."""

    _STRATEGY_CLASS_NAME = "JsonCssExtractionStrategy"
    _SELECTOR_KEY = "css"

    @classmethod
    def _load_extraction_module(cls) -> object:
        loader = import_module if import_module is not _stdlib_import_module else base.import_module
        return loader("crawl4ai.extraction_strategy")
