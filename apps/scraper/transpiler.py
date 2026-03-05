from __future__ import annotations

import argparse
import json
from pathlib import Path
from pprint import pformat
from typing import cast

import yaml


class UnsupportedFeature:
    def __init__(self, path: str, reason: str, value: object | None = None) -> None:
        self.path = path
        self.reason = reason
        self.value = value


class SelectorField:
    def __init__(
        self,
        *,
        name: str,
        selector: str,
        selector_type: str = "css",
        value_type: str = "text",
        attribute: str | None = None,
        required: bool = False,
        children: list["SelectorField"] | None = None,
    ) -> None:
        self.name = name
        self.selector = selector
        self.selector_type = selector_type
        self.value_type = value_type
        self.attribute = attribute
        self.required = required
        self.children = children or []


class ParsedYAMLConfig:
    def __init__(
        self,
        *,
        name: str,
        base_url: str | None,
        base_selector: str | None,
        selectors: list[SelectorField],
        unsupported: list[UnsupportedFeature],
        raw_config: dict[str, object],
    ) -> None:
        self.name = name
        self.base_url = base_url
        self.base_selector = base_selector
        self.selectors = selectors
        self.unsupported = unsupported
        self.raw_config = raw_config


def _to_dict(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    if not all(isinstance(k, str) for k in value.keys()):
        return None
    return cast(dict[str, object], value)


def _to_optional_str(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


class YAMLConfigParser:
    _SUPPORTED_WORKFLOW_ACTIONS = {
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
            loaded = yaml.safe_load(fh) or {}
        config = _to_dict(loaded)
        if config is None:
            raise ValueError(f"Expected YAML mapping at root: {path}")
        return self.parse_dict(config)

    def parse_dict(self, config: dict[str, object]) -> ParsedYAMLConfig:
        unsupported: list[UnsupportedFeature] = []
        name = str(config.get("name") or "unnamed")
        base_url = _to_optional_str(config.get("base_url"))

        selectors_root = config.get("selectors")
        base_selector = None
        selectors_map = _to_dict(selectors_root)
        if selectors_map is not None:
            base_selector = _to_optional_str(selectors_map.get("base") or selectors_map.get("base_selector") or selectors_map.get("baseSelector"))

        selectors = self._extract_selectors(selectors_root, unsupported, path="selectors")
        if not selectors:
            unsupported.append(UnsupportedFeature("selectors", "No extractable selector fields were found", selectors_root))

        if str(config.get("scraper_type") or "").strip().lower() == "agentic":
            unsupported.append(UnsupportedFeature("scraper_type", "Agentic scraper configs require manual migration", config.get("scraper_type")))

        for key, reason in (
            ("ai_config", "AI extraction config is not represented in crawl4ai selector schemas"),
            ("login", "Login workflow requires manual migration"),
            ("normalization", "Normalization rules require manual migration"),
            ("anti_detection", "Anti-detection settings require manual migration"),
            ("http_status", "HTTP status handling requires manual migration"),
        ):
            if key in config and config.get(key):
                unsupported.append(UnsupportedFeature(key, reason, config.get(key)))

        workflows = config.get("workflows")
        if isinstance(workflows, list):
            for idx, step in enumerate(workflows):
                step_map = _to_dict(step)
                if step_map is None:
                    unsupported.append(UnsupportedFeature(f"workflows[{idx}]", "Workflow step must be a mapping", step))
                    continue
                action = str(step_map.get("action") or "").strip().lower()
                if action and action not in self._SUPPORTED_WORKFLOW_ACTIONS:
                    unsupported.append(
                        UnsupportedFeature(
                            f"workflows[{idx}].action",
                            "Workflow action has no automatic schema mapping",
                            action,
                        )
                    )

        return ParsedYAMLConfig(
            name=name,
            base_url=base_url,
            base_selector=base_selector,
            selectors=selectors,
            unsupported=unsupported,
            raw_config=config,
        )

    def _extract_selectors(
        self,
        selectors_root: object,
        unsupported: list[UnsupportedFeature],
        *,
        path: str,
    ) -> list[SelectorField]:
        if selectors_root is None:
            return []

        if isinstance(selectors_root, list):
            return self._parse_selector_list(selectors_root, unsupported, path=path)

        selectors_map = _to_dict(selectors_root)
        if selectors_map is None:
            unsupported.append(UnsupportedFeature(path, "selectors must be a list or mapping", selectors_root))
            return []

        nested = selectors_map.get("fields")
        if isinstance(nested, list):
            return self._parse_selector_list(nested, unsupported, path=f"{path}.fields")
        nested_map = _to_dict(nested)
        if nested_map is not None:
            return self._parse_selector_map(nested_map, unsupported, path=f"{path}.fields")

        nested = selectors_map.get("selectors")
        if isinstance(nested, list):
            return self._parse_selector_list(nested, unsupported, path=f"{path}.selectors")
        nested_map = _to_dict(nested)
        if nested_map is not None:
            return self._parse_selector_map(nested_map, unsupported, path=f"{path}.selectors")

        return self._parse_selector_map(selectors_map, unsupported, path=path)

    def _parse_selector_map(
        self,
        selector_map: dict[str, object],
        unsupported: list[UnsupportedFeature],
        *,
        path: str,
    ) -> list[SelectorField]:
        fields: list[SelectorField] = []
        for key, value in selector_map.items():
            if key in {"base", "base_selector", "baseSelector"}:
                continue
            if isinstance(value, str):
                fields.append(SelectorField(name=key, selector=value))
                continue
            value_map = _to_dict(value)
            if value_map is None:
                unsupported.append(UnsupportedFeature(f"{path}.{key}", "Selector entry must be string or mapping", value))
                continue
            parsed = self._parse_single_selector(value_map, unsupported, path=f"{path}.{key}", default_name=key)
            if parsed is not None:
                fields.append(parsed)
        return fields

    def _parse_selector_list(
        self,
        selectors: list[object],
        unsupported: list[UnsupportedFeature],
        *,
        path: str,
    ) -> list[SelectorField]:
        fields: list[SelectorField] = []
        for idx, item in enumerate(selectors):
            item_map = _to_dict(item)
            if item_map is None:
                unsupported.append(UnsupportedFeature(f"{path}[{idx}]", "Selector list entry must be mapping", item))
                continue
            parsed = self._parse_single_selector(item_map, unsupported, path=f"{path}[{idx}]")
            if parsed is not None:
                fields.append(parsed)
        return fields

    def _parse_single_selector(
        self,
        selector_data: dict[str, object],
        unsupported: list[UnsupportedFeature],
        *,
        path: str,
        default_name: str | None = None,
    ) -> SelectorField | None:
        name = str(selector_data.get("name") or default_name or "").strip()
        selector_type = "xpath" if selector_data.get("xpath") is not None else "css"
        selector = _to_optional_str(selector_data.get("selector"))
        if selector is None and selector_type == "xpath":
            selector = _to_optional_str(selector_data.get("xpath"))

        if not name:
            unsupported.append(UnsupportedFeature(f"{path}.name", "Selector name is required", selector_data))
            return None
        if not selector:
            unsupported.append(UnsupportedFeature(f"{path}.selector", "Selector string is required", selector_data))
            return None

        nested_raw = selector_data.get("fields") if selector_data.get("fields") is not None else selector_data.get("children")
        children: list[SelectorField] = []
        if isinstance(nested_raw, list):
            children = self._parse_selector_list(nested_raw, unsupported, path=f"{path}.fields")
        else:
            nested_map = _to_dict(nested_raw)
            if nested_map is not None:
                children = self._parse_selector_map(nested_map, unsupported, path=f"{path}.fields")
            elif nested_raw is not None:
                unsupported.append(UnsupportedFeature(f"{path}.fields", "Nested fields must be mapping or list", nested_raw))

        raw_type = str(selector_data.get("type") or "").strip().lower()
        if children:
            value_type = "nested_list" if raw_type in {"list", "nested_list"} or bool(selector_data.get("list", False)) else "nested"
        elif raw_type in {"text", "html", "attribute"}:
            value_type = raw_type
        else:
            attr = str(selector_data.get("attribute") or selector_data.get("attr") or "text").strip().lower()
            if attr in {"text", "inner_text"}:
                value_type = "text"
            elif attr in {"html", "inner_html"}:
                value_type = "html"
            else:
                value_type = "attribute"

        attribute = _to_optional_str(selector_data.get("attribute") or selector_data.get("attr"))
        return SelectorField(
            name=name,
            selector=selector,
            selector_type=selector_type,
            value_type=value_type,
            attribute=attribute,
            required=bool(selector_data.get("required", False)),
            children=children,
        )


class YAMLToCrawl4AI:
    def __init__(self, parser: YAMLConfigParser | None = None) -> None:
        self.parser = parser or YAMLConfigParser()

    def transpile(self, yaml_path: str | Path) -> dict[str, object]:
        parsed = self.parser.parse_file(yaml_path)
        return self._build_schema(parsed)

    def transpile_to_python(
        self,
        yaml_path: str | Path,
        *,
        output_path: str | Path | None = None,
        variable_name: str = "CRAWL4AI_SCHEMA",
    ) -> str:
        schema = self.transpile(yaml_path)
        rendered = f"from __future__ import annotations\n\n{variable_name} = {pformat(schema, width=100, sort_dicts=False)}\n"
        if output_path is not None:
            target = Path(output_path)
            target.parent.mkdir(parents=True, exist_ok=True)
            _ = target.write_text(rendered, encoding="utf-8")
        return rendered

    def _build_schema(self, parsed: ParsedYAMLConfig) -> dict[str, object]:
        schema: dict[str, object] = {
            "name": parsed.name,
            "fields": [self._field_to_schema(field) for field in parsed.selectors],
            "metadata": {
                "source": "baystate_yaml",
                "manual_review_required": len(parsed.unsupported) > 0,
                "unsupported": [{"path": u.path, "reason": u.reason, "value": u.value} for u in parsed.unsupported],
            },
        }
        if parsed.base_selector:
            schema["baseSelector"] = parsed.base_selector
        if parsed.base_url:
            schema["baseUrl"] = parsed.base_url
        return schema

    def _field_to_schema(self, field: SelectorField) -> dict[str, object]:
        mapped: dict[str, object] = {
            "name": field.name,
            "selector": field.selector,
            "type": field.value_type,
            "selectorType": field.selector_type,
            "required": field.required,
        }
        if field.attribute and field.value_type == "attribute":
            mapped["attribute"] = field.attribute
        if field.children:
            mapped["fields"] = [self._field_to_schema(child) for child in field.children]
        return mapped


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="transpiler")
    subparsers = parser.add_subparsers(dest="command")
    migrate = subparsers.add_parser("migrate")
    _ = migrate.add_argument("config", type=Path)
    _ = migrate.add_argument("--output", "-o", type=Path, default=None)
    _ = migrate.add_argument("--json", action="store_true", dest="print_json")
    _ = migrate.add_argument("--variable-name", default="CRAWL4AI_SCHEMA")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if cast(str | None, getattr(args, "command", None)) != "migrate":
        parser.print_help()
        return 1

    config = cast(Path | None, getattr(args, "config", None))
    if config is None:
        parser.print_help()
        return 1

    output = cast(Path | None, getattr(args, "output", None))
    variable_name = cast(str, getattr(args, "variable_name", "CRAWL4AI_SCHEMA"))
    print_json = bool(getattr(args, "print_json", False))

    transpiler = YAMLToCrawl4AI()
    schema = transpiler.transpile(config)

    if output is not None:
        _ = transpiler.transpile_to_python(config, output_path=output, variable_name=variable_name)

    if print_json or output is None:
        print(json.dumps(schema, indent=2, default=str))

    metadata = cast(dict[str, object], schema.get("metadata", {}))
    return 2 if bool(metadata.get("manual_review_required", False)) else 0


if __name__ == "__main__":
    raise SystemExit(main())
