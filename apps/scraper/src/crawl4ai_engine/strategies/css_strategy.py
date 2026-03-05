from __future__ import annotations

from importlib import import_module
import json
from collections.abc import Mapping, Sequence
from typing import Protocol, cast

SelectorConfig = Mapping[str, object]
SelectorInput = SelectorConfig | Sequence[SelectorConfig]


class AsyncCrawlerProtocol(Protocol):
    async def arun(self, *, url: str, extraction_strategy: object, **kwargs: object) -> object: ...


class StrategyFactory(Protocol):
    def __call__(self, schema: dict[str, object]) -> object: ...


def _as_sequence(value: object) -> list[object]:
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return list(value)
    return []


class CSSExtractionStrategy:
    def __init__(self, schema: dict[str, object]):
        self.schema: dict[str, object] = schema
        extraction_module = import_module("crawl4ai.extraction_strategy")
        strategy_cls = cast(StrategyFactory, getattr(extraction_module, "JsonCssExtractionStrategy"))
        self._strategy: object = strategy_cls(schema)

    @classmethod
    def from_yaml_selectors(
        cls,
        selectors: SelectorInput,
        *,
        schema_name: str = "extraction",
        base_selector: str | None = None,
    ) -> "CSSExtractionStrategy":
        schema = cls.build_schema_from_yaml_selectors(
            selectors,
            schema_name=schema_name,
            base_selector=base_selector,
        )
        return cls(schema)

    @classmethod
    def build_schema_from_yaml_selectors(
        cls,
        selectors: SelectorInput,
        *,
        schema_name: str = "extraction",
        base_selector: str | None = None,
    ) -> dict[str, object]:
        selector_root, selector_items = cls._normalize_selector_root(selectors)
        resolved_base = base_selector or str(selector_root.get("base_selector") or selector_root.get("baseSelector") or "").strip() or None
        schema: dict[str, object] = {
            "name": str(selector_root.get("name") or schema_name),
            "fields": [cls._build_field_spec(item) for item in selector_items],
        }
        if resolved_base:
            schema["baseSelector"] = resolved_base
        return schema

    @classmethod
    def _normalize_selector_root(
        cls,
        selectors: SelectorInput,
    ) -> tuple[SelectorConfig, list[SelectorConfig]]:
        if isinstance(selectors, Mapping):
            fields = _as_sequence(selectors.get("fields") or selectors.get("selectors"))
            if fields:
                normalized_fields: list[SelectorConfig] = [cast(SelectorConfig, item) for item in fields if isinstance(item, Mapping)]
                return selectors, normalized_fields
            return {}, [selectors]

        normalized: list[SelectorConfig] = [cast(SelectorConfig, item) for item in _as_sequence(selectors) if isinstance(item, Mapping)]
        return {}, normalized

    @classmethod
    def _build_field_spec(cls, field: SelectorConfig) -> dict[str, object]:
        field_name = str(field.get("name") or field.get("field") or "field")
        selector = str(field.get("selector") or field.get("css") or "").strip()

        nested_fields = _as_sequence(field.get("fields") or field.get("children"))
        is_nested = bool(nested_fields)

        if is_nested:
            nested_type = str(field.get("type") or "").lower()
            is_list = bool(field.get("list", False)) or nested_type in {"list", "nested_list"}
            normalized_nested: list[SelectorConfig] = [cast(SelectorConfig, item) for item in nested_fields if isinstance(item, Mapping)]
            spec: dict[str, object] = {
                "name": field_name,
                "selector": selector,
                "type": "nested_list" if is_list else "nested",
                "fields": [cls._build_field_spec(item) for item in normalized_nested],
            }
            return spec

        attribute = str(field.get("attribute") or field.get("attr") or "text").strip().lower()
        if attribute in {"text", "inner_text"}:
            return {"name": field_name, "selector": selector, "type": "text"}
        if attribute in {"html", "inner_html"}:
            return {"name": field_name, "selector": selector, "type": "html"}
        return {
            "name": field_name,
            "selector": selector,
            "type": "attribute",
            "attribute": attribute,
        }

    async def extract(
        self,
        url: str,
        crawler: AsyncCrawlerProtocol,
        **run_kwargs: object,
    ) -> object:
        result = await crawler.arun(url=url, extraction_strategy=self._strategy, **run_kwargs)
        content = getattr(result, "extracted_content", None)

        if isinstance(content, str):
            try:
                return cast(object, json.loads(content))
            except json.JSONDecodeError:
                return {"raw": content}
        return content
