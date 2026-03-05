from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import cast

from .schema_generator import YAMLToCrawl4AI


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
    args_ns = parser.parse_args(argv)

    command = cast(str | None, getattr(args_ns, "command", None)) or ""
    if command != "migrate":
        parser.print_help()
        return 1

    config_obj = cast(object, getattr(args_ns, "config", None))
    if not isinstance(config_obj, Path):
        parser.print_help()
        return 1
    config = config_obj

    output_obj = cast(object, getattr(args_ns, "output", None))
    output = output_obj if isinstance(output_obj, Path) else None

    variable_name_obj = cast(object, getattr(args_ns, "variable_name", "CRAWL4AI_SCHEMA"))
    variable_name = variable_name_obj if isinstance(variable_name_obj, str) else "CRAWL4AI_SCHEMA"

    print_json_obj = cast(object, getattr(args_ns, "print_json", False))
    print_json = bool(print_json_obj)

    transpiler = YAMLToCrawl4AI()
    schema = transpiler.transpile(config)

    if output is not None:
        _ = transpiler.transpile_to_python(
            config,
            output_path=output,
            variable_name=variable_name,
        )

    if print_json or output is None:
        print(json.dumps(schema, indent=2, default=str))

    metadata_obj = schema.get("metadata")
    manual_review = False
    if isinstance(metadata_obj, dict):
        metadata_map = cast(dict[str, object], metadata_obj)
        manual_review_obj = metadata_map.get("manual_review_required", False)
        manual_review = bool(manual_review_obj)
    return 2 if manual_review else 0


if __name__ == "__main__":
    raise SystemExit(main())
