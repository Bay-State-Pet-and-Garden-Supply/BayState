from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import cast

import yaml


@dataclass(slots=True)
class UnsupportedFeature:
    path: str
    reason: str
    value: object | None = None


@dataclass(slots=True)
class SelectorField:
    name: str
    selector: str
    selector_type: str = "css"
    value_type: str = "text"
    attribute: str | None = None
    required: bool = False
    children: list["SelectorField"] = field(default_factory=list)


@dataclass(slots=True)
class ParsedYAMLConfig:
    name: str
    base_url: str | None
    base_selector: str | None
    selectors: list[SelectorField]
    unsupported: list[UnsupportedFeature]
    raw_config: Mapping[str, object]


def _to_mapping(value: object) -> Mapping[str, object] | None:
    if not isinstance(value, Mapping):
        return None
    raw_map = cast(Mapping[object, object], value)
    for key in raw_map.keys():
        if not isinstance(key, str):
            return None
    return cast(Mapping[str, object], raw_map)


def _to_sequence(value: object) -> Sequence[object] | None:
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return value
    return None


class YAMLConfigParser:
    _SUPPORTED_WORKFLOW_ACTIONS: set[str] = {
        "extract",
        "navigate",
        "wait",
        "wait_for",
        "wait_for_hidden",
        "click",
        "input",
    }

    def parse_file(self, yaml_path: str | Path) -> ParsedYAMLConfig:
        path = Path(yaml_path)
        if not path.exists():
            raise FileNotFoundError(f"Config file not found: {path}")

        with open(path, encoding="utf-8") as fh:
            loaded: object = yaml.safe_load(fh) or {}

        config = _to_mapping(loaded)
        if config is None:
            raise ValueError(f"Expected YAML mapping at root: {path}")
        return self.parse_dict(config)

    def parse_dict(self, config: Mapping[str, object]) -> ParsedYAMLConfig:
        unsupported: list[UnsupportedFeature] = []
        name = str(config.get("name") or "unnamed")
        base_url = self._to_optional_str(config.get("base_url"))

        selectors_root = config.get("selectors")
        base_selector = self._extract_base_selector(selectors_root)
        selectors = self._extract_selector_fields(selectors_root, unsupported, path="selectors")

        if not selectors:
            unsupported.append(
                UnsupportedFeature(
                    path="selectors",
                    reason="No extractable selector fields were found",
                    value=selectors_root,
                )
            )

        self._flag_config_level_unsupported(config, unsupported)
        self._flag_workflow_unsupported(config.get("workflows"), unsupported)

        return ParsedYAMLConfig(
            name=name,
            base_url=base_url,
            base_selector=base_selector,
            selectors=selectors,
            unsupported=unsupported,
            raw_config=config,
        )

    def _flag_config_level_unsupported(
        self,
        config: Mapping[str, object],
        unsupported: list[UnsupportedFeature],
    ) -> None:
        if str(config.get("scraper_type") or "").strip().lower() == "agentic":
            unsupported.append(
                UnsupportedFeature(
                    path="scraper_type",
                    reason="Agentic scraper configs require manual migration",
                    value=config.get("scraper_type"),
                )
            )

        for key, reason in (
            ("ai_config", "AI extraction config is not represented in crawl4ai selector schemas"),
            ("login", "Login workflow requires manual migration"),
            ("normalization", "Normalization rules require manual migration"),
            ("anti_detection", "Anti-detection settings require manual migration"),
            ("http_status", "HTTP status handling requires manual migration"),
        ):
            if key in config and config.get(key):
                unsupported.append(UnsupportedFeature(path=key, reason=reason, value=config.get(key)))

    def _flag_workflow_unsupported(self, workflows: object, unsupported: list[UnsupportedFeature]) -> None:
        workflow_items = _to_sequence(workflows)
        if workflow_items is None:
            return

        for index, workflow in enumerate(workflow_items):
            workflow_map = _to_mapping(workflow)
            if workflow_map is None:
                unsupported.append(
                    UnsupportedFeature(
                        path=f"workflows[{index}]",
                        reason="Workflow step must be a mapping",
                        value=workflow,
                    )
                )
                continue

            action = str(workflow_map.get("action") or "").strip().lower()
            if action and action not in self._SUPPORTED_WORKFLOW_ACTIONS:
                unsupported.append(
                    UnsupportedFeature(
                        path=f"workflows[{index}].action",
                        reason="Workflow action has no automatic schema mapping",
                        value=action,
                    )
                )

    def _extract_base_selector(self, selectors_root: object) -> str | None:
        selector_map = _to_mapping(selectors_root)
        if selector_map is None:
            return None

        for key in ("base", "base_selector", "baseSelector"):
            value = self._to_optional_str(selector_map.get(key))
            if value:
                return value
        return None

    def _extract_selector_fields(
        self,
        selectors_root: object,
        unsupported: list[UnsupportedFeature],
        *,
        path: str,
    ) -> list[SelectorField]:
        if selectors_root is None:
            return []

        selector_items = _to_sequence(selectors_root)
        if selector_items is not None:
            return self._parse_selector_list(selector_items, unsupported, path=path)

        selector_map = _to_mapping(selectors_root)
        if selector_map is None:
            unsupported.append(
                UnsupportedFeature(
                    path=path,
                    reason="selectors must be a list or mapping",
                    value=selectors_root,
                )
            )
            return []

        nested_fields = _to_mapping(selector_map.get("fields"))
        if nested_fields is not None:
            return self._parse_named_selector_map(nested_fields, unsupported, path=f"{path}.fields")

        nested_fields_list = _to_sequence(selector_map.get("fields"))
        if nested_fields_list is not None:
            return self._parse_selector_list(nested_fields_list, unsupported, path=f"{path}.fields")

        nested_selectors = _to_mapping(selector_map.get("selectors"))
        if nested_selectors is not None:
            return self._parse_named_selector_map(nested_selectors, unsupported, path=f"{path}.selectors")

        nested_selectors_list = _to_sequence(selector_map.get("selectors"))
        if nested_selectors_list is not None:
            return self._parse_selector_list(nested_selectors_list, unsupported, path=f"{path}.selectors")

        return self._parse_named_selector_map(selector_map, unsupported, path=path)

    def _parse_named_selector_map(
        self,
        selector_map: Mapping[str, object],
        unsupported: list[UnsupportedFeature],
        *,
        path: str,
    ) -> list[SelectorField]:
        parsed: list[SelectorField] = []
        for name, value in selector_map.items():
            if name in {"base", "base_selector", "baseSelector"}:
                continue

            if isinstance(value, str):
                parsed.append(SelectorField(name=name, selector=value))
                continue

            selector_data = _to_mapping(value)
            if selector_data is not None:
                parsed_field = self._parse_single_selector(selector_data, unsupported, path=f"{path}.{name}", default_name=name)
                if parsed_field:
                    parsed.append(parsed_field)
                continue

            unsupported.append(
                UnsupportedFeature(
                    path=f"{path}.{name}",
                    reason="Selector entry must be string or mapping",
                    value=value,
                )
            )
        return parsed

    def _parse_selector_list(
        self,
        selectors: Sequence[object],
        unsupported: list[UnsupportedFeature],
        *,
        path: str,
    ) -> list[SelectorField]:
        parsed: list[SelectorField] = []
        for index, selector in enumerate(selectors):
            item_path = f"{path}[{index}]"
            selector_data = _to_mapping(selector)
            if selector_data is None:
                unsupported.append(
                    UnsupportedFeature(
                        path=item_path,
                        reason="Selector list entry must be mapping",
                        value=selector,
                    )
                )
                continue

            parsed_field = self._parse_single_selector(selector_data, unsupported, path=item_path)
            if parsed_field:
                parsed.append(parsed_field)
        return parsed

    def _parse_single_selector(
        self,
        selector_data: Mapping[str, object],
        unsupported: list[UnsupportedFeature],
        *,
        path: str,
        default_name: str | None = None,
    ) -> SelectorField | None:
        name = str(selector_data.get("name") or default_name or "").strip()
        selector_type = "xpath" if selector_data.get("xpath") is not None else "css"
        selector = self._to_optional_str(selector_data.get("selector"))
        if selector is None and selector_type == "xpath":
            selector = self._to_optional_str(selector_data.get("xpath"))

        if not name:
            unsupported.append(
                UnsupportedFeature(
                    path=f"{path}.name",
                    reason="Selector name is required",
                    value=selector_data,
                )
            )
            return None

        if not selector:
            unsupported.append(
                UnsupportedFeature(
                    path=f"{path}.selector",
                    reason="Selector string is required",
                    value=selector_data,
                )
            )
            return None

        nested_raw = selector_data.get("fields")
        if nested_raw is None:
            nested_raw = selector_data.get("children")

        children: list[SelectorField] = []
        nested_list = _to_sequence(nested_raw)
        nested_map = _to_mapping(nested_raw)
        if nested_list is not None:
            children = self._parse_selector_list(nested_list, unsupported, path=f"{path}.fields")
        elif nested_map is not None:
            children = self._parse_named_selector_map(nested_map, unsupported, path=f"{path}.fields")
        elif nested_raw is not None:
            unsupported.append(
                UnsupportedFeature(
                    path=f"{path}.fields",
                    reason="Nested fields must be mapping or list",
                    value=nested_raw,
                )
            )

        value_type = self._infer_value_type(selector_data, has_children=bool(children))
        attribute = self._to_optional_str(selector_data.get("attribute") or selector_data.get("attr"))

        return SelectorField(
            name=name,
            selector=selector,
            selector_type=selector_type,
            value_type=value_type,
            attribute=attribute,
            required=bool(selector_data.get("required", False)),
            children=children,
        )

    def _infer_value_type(self, selector_data: Mapping[str, object], *, has_children: bool) -> str:
        raw_type = str(selector_data.get("type") or "").strip().lower()
        if has_children:
            if raw_type in {"list", "nested_list"} or bool(selector_data.get("list", False)):
                return "nested_list"
            return "nested"

        if raw_type in {"text", "html", "attribute"}:
            return raw_type

        attribute = str(selector_data.get("attribute") or selector_data.get("attr") or "text").strip().lower()
        if attribute in {"text", "inner_text"}:
            return "text"
        if attribute in {"html", "inner_html"}:
            return "html"
        return "attribute"

    @staticmethod
    def _to_optional_str(value: object) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None
