from __future__ import annotations

from pathlib import Path
from pprint import pformat

from .yaml_parser import ParsedYAMLConfig, SelectorField, YAMLConfigParser


class YAMLToCrawl4AI:
    parser: YAMLConfigParser

    def __init__(self, parser: YAMLConfigParser | None = None) -> None:
        self.parser = parser or YAMLConfigParser()

    def transpile(self, yaml_path: str | Path) -> dict[str, object]:
        parsed = self.parser.parse_file(yaml_path)
        return self._build_schema_payload(parsed)

    def transpile_to_python(
        self,
        yaml_path: str | Path,
        *,
        output_path: str | Path | None = None,
        variable_name: str = "CRAWL4AI_SCHEMA",
    ) -> str:
        payload = self.transpile(yaml_path)
        rendered = self._render_python_schema(payload, variable_name=variable_name)
        if output_path is not None:
            target = Path(output_path)
            target.parent.mkdir(parents=True, exist_ok=True)
            _ = target.write_text(rendered, encoding="utf-8")
        return rendered

    def _build_schema_payload(self, parsed: ParsedYAMLConfig) -> dict[str, object]:
        schema: dict[str, object] = {
            "name": parsed.name,
            "fields": [self._field_to_schema(field) for field in parsed.selectors],
            "metadata": {
                "source": "baystate_yaml",
                "manual_review_required": len(parsed.unsupported) > 0,
                "unsupported": [
                    {
                        "path": issue.path,
                        "reason": issue.reason,
                        "value": issue.value,
                    }
                    for issue in parsed.unsupported
                ],
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

    def _render_python_schema(self, schema: dict[str, object], *, variable_name: str) -> str:
        variable = variable_name.strip() or "CRAWL4AI_SCHEMA"
        return f"from __future__ import annotations\n\n{variable} = {pformat(schema, width=100, sort_dicts=False)}\n"
