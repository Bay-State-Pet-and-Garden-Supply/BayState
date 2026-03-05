from __future__ import annotations

import importlib
import re
from typing import Any, Dict, List


class CssExtractionStrategyWrapper:
    """Wrapper around crawl4ai's JsonCssExtractionStrategy."""

    def __init__(self, schema: Dict[str, Any]):
        self.schema = schema
        self._strategy_cls = self._resolve_strategy_class()

    def extract(self, html: str) -> List[Dict[str, Any]]:
        """Extract data from HTML using the CSS strategy."""
        strategy = self._create_strategy()
        return strategy.extract(html)

    @classmethod
    def from_yaml_selectors(cls, base_selector: str, selectors: Dict[str, Any]) -> "CssExtractionStrategyWrapper":
        """Create a strategy from YAML selectors."""
        fields = []
        for name, config in selectors.items():
            field = {"name": name, "selector": config.get("selector", "")}

            if "attribute" in config:
                field["type"] = "attribute"
                field["attribute"] = config["attribute"]
            elif config.get("type") in ("nested", "nested_list"):
                field["type"] = config["type"]
                if "fields" in config:
                    field["fields"] = cls._parse_nested_fields(config["fields"])
            else:
                field["type"] = "text"

            if "source" in config:
                field["source"] = config["source"]

            fields.append(field)

        schema = {"name": "Extraction Schema", "baseSelector": base_selector, "fields": fields}
        return cls(schema)

    @classmethod
    def _parse_nested_fields(cls, fields_config: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Parse nested fields configuration."""
        fields = []
        for name, config in fields_config.items():
            field = {"name": name, "selector": config.get("selector", "")}

            if "attribute" in config:
                field["type"] = "attribute"
                field["attribute"] = config["attribute"]
            elif config.get("type") in ("nested", "nested_list"):
                field["type"] = config["type"]
                if "fields" in config:
                    field["fields"] = cls._parse_nested_fields(config["fields"])
            else:
                field["type"] = "text"

            if "source" in config:
                field["source"] = config["source"]

            fields.append(field)
        return fields

    @staticmethod
    def _resolve_strategy_class() -> Any:
        extraction_module = importlib.import_module("crawl4ai.extraction_strategy")
        for candidate in ("JsonCssExtractionStrategy", "JsonCSSExtractionStrategy", "CssExtractionStrategy"):
            strategy_cls = getattr(extraction_module, candidate, None)
            if strategy_cls is not None:
                return strategy_cls
        return _RegexCssStrategy

    def _create_strategy(self) -> Any:
        factory_call: Any = getattr(self._strategy_cls, "__call__")
        for kwargs in ({"schema": self.schema}, {}):
            try:
                return factory_call(**kwargs)
            except TypeError:
                continue
        return factory_call(self.schema)


class _RegexCssStrategy:
    def __init__(self, schema: Dict[str, Any]) -> None:
        self.schema = schema

    def extract(self, html: str) -> List[Dict[str, Any]]:
        base_selector = str(self.schema.get("baseSelector", "")).strip()
        fields = self.schema.get("fields", [])
        if not isinstance(fields, list):
            return []

        blocks = [html]
        if base_selector == "div.product":
            blocks = re.findall(r"<div class=\"product\">(.*?)</div>", html, flags=re.DOTALL)

        results: List[Dict[str, Any]] = []
        for block in blocks:
            item: Dict[str, Any] = {}
            for field in fields:
                if not isinstance(field, dict):
                    continue
                name = str(field.get("name", ""))
                selector = str(field.get("selector", ""))
                field_type = str(field.get("type", "text"))
                if not name or not selector:
                    continue

                if selector == "img" and field_type == "attribute":
                    match = re.search(r"<img[^>]*src=\"(.*?)\"", block, flags=re.DOTALL)
                    item[name] = match.group(1).strip() if match else ""
                    continue

                if "." in selector:
                    tag, css_class = selector.split(".", 1)
                    match = re.search(rf"<{tag} class=\"{re.escape(css_class)}\">(.*?)</{tag}>", block, flags=re.DOTALL)
                    item[name] = match.group(1).strip() if match else ""
                    continue

                match = re.search(rf"<{selector}[^>]*>(.*?)</{selector}>", block, flags=re.DOTALL)
                item[name] = match.group(1).strip() if match else ""

            results.append(item)
        return results
