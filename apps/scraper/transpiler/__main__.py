"""CLI entry point for YAML-to-crawl4ai transpiler."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from src.crawl4ai_engine.transpiler import YAMLToCrawl4AI


def _default_output_path(config_path: Path, output_format: str) -> Path:
    suffix = ".crawl4ai.py" if output_format == "python" else ".crawl4ai.json"
    return config_path.with_suffix(suffix)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="transpiler", description="YAML-to-crawl4ai migration CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    migrate = subparsers.add_parser("migrate", help="Transpile one YAML scraper config")
    _ = migrate.add_argument("config", type=str, help="Path to YAML config")
    _ = migrate.add_argument("--output", "-o", type=str, help="Write output to this file")
    _ = migrate.add_argument(
        "--format",
        choices=["python", "json"],
        default="python",
        help="Output format (default: python)",
    )
    _ = migrate.add_argument(
        "--stdout",
        action="store_true",
        help="Print transpiled output to stdout instead of writing a file",
    )

    return parser


def _render_payload(result_dict: dict[str, Any], output_format: str) -> str:
    if output_format == "json":
        return json.dumps(result_dict, indent=2)

    return "\n".join(
        [
            '"""Auto-generated crawl4ai migration output."""',
            "",
            "from __future__ import annotations",
            "",
            f"MIGRATED_CONFIG = {json.dumps(result_dict, indent=2)}",
            "",
        ]
    )


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args: argparse.Namespace = parser.parse_args(argv)
    command = str(args.command)

    if command != "migrate":
        parser.error("Unsupported command")

    config_path = Path(str(args.config))
    if not config_path.exists():
        print(f"[ERROR] Config file not found: {config_path}", file=sys.stderr)
        return 2

    transpiler = YAMLToCrawl4AI()
    schema = transpiler.transpile(config_path)
    output_format = str(args.format)
    rendered = _render_payload(schema, output_format)

    if bool(args.stdout):
        print(rendered)
    else:
        output_path = Path(str(args.output)) if args.output else _default_output_path(config_path, output_format)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        _ = output_path.write_text(rendered, encoding="utf-8")
        print(f"[OK] Wrote migration output: {output_path}")

    metadata = schema.get("metadata", {})
    manual_review = bool(metadata.get("manual_review_required", False))
    if manual_review:
        print("[WARN] Manual review required")
        unsupported = metadata.get("unsupported", [])
        for item in unsupported:
            print(f"  - {item.get('path', 'unknown')}: {item.get('reason', 'No details')}")

    return 2 if manual_review else 0


if __name__ == "__main__":
    raise SystemExit(main())

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from lib.transpiler import YAMLToCrawl4AITranspiler


def _default_output_path(config_path: Path, output_format: str) -> Path:
    suffix = ".crawl4ai.py" if output_format == "python" else ".crawl4ai.json"
    return config_path.with_suffix(suffix)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="transpiler", description="YAML-to-crawl4ai migration CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    migrate = subparsers.add_parser("migrate", help="Transpile one YAML scraper config")
    _ = migrate.add_argument("config", type=str, help="Path to YAML config")
    _ = migrate.add_argument("--output", "-o", type=str, help="Write output to this file")
    _ = migrate.add_argument(
        "--format",
        choices=["python", "json"],
        default="python",
        help="Output format (default: python)",
    )
    _ = migrate.add_argument(
        "--stdout",
        action="store_true",
        help="Print transpiled output to stdout instead of writing a file",
    )

    return parser


def _render_payload(result_dict: dict[str, Any], output_format: str) -> str:
    if output_format == "json":
        return json.dumps(result_dict, indent=2)

    return "\n".join(
        [
            '"""Auto-generated crawl4ai migration output."""',
            "",
            "from __future__ import annotations",
            "",
            f"MIGRATED_CONFIG = {json.dumps(result_dict, indent=2)}",
            "",
        ]
    )


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args: argparse.Namespace = parser.parse_args(argv)
    command = str(args.command)

    if command != "migrate":
        parser.error("Unsupported command")

    config_path = Path(str(args.config))
    if not config_path.exists():
        print(f"[ERROR] Config file not found: {config_path}", file=sys.stderr)
        return 2

    transpiler = YAMLToCrawl4AITranspiler()
    result = transpiler.transpile_file(config_path)
    payload = result.to_dict()
    output_format = str(args.format)
    rendered = _render_payload(payload, output_format)

    if bool(args.stdout):
        print(rendered)
    else:
        output_path = Path(str(args.output)) if args.output else _default_output_path(config_path, output_format)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        _ = output_path.write_text(rendered, encoding="utf-8")
        print(f"[OK] Wrote migration output: {output_path}")

    if result.needs_manual_review:
        print("[WARN] Manual review required")
        for issue in result.issues:
            if issue.severity in {"error", "manual"}:
                print(f"  - {issue.code}: {issue.message}")

    if not result.success:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
