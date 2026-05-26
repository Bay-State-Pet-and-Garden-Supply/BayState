#!/usr/bin/env python3
"""Validate sandbox JSON artifacts against local schemas."""

from __future__ import annotations

import argparse
from pathlib import Path

from jsonschema import Draft202012Validator

from common import ROOT, read_json

SCHEMA_BY_KIND = {
    "packet": ROOT / "schemas" / "product_packet.schema.json",
    "agent-browser": ROOT / "schemas" / "agent_browser_result.schema.json",
    "comparison": ROOT / "schemas" / "comparison.schema.json",
    "llm": ROOT / "schemas" / "product_llm.schema.json",
}


def infer_kind(data: dict) -> str:
    schema_version = data.get("schema_version", "")
    if schema_version.startswith("product_extraction_packet"):
        return "packet"
    if schema_version.startswith("agent_browser_result"):
        return "agent-browser"
    if schema_version.startswith("comparison"):
        return "comparison"
    return "llm"


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a packet, agent-browser result, comparison, or LLM JSON file.")
    parser.add_argument("path", type=Path)
    parser.add_argument("--kind", choices=sorted(SCHEMA_BY_KIND))
    args = parser.parse_args()
    data = read_json(args.path)
    kind = args.kind or infer_kind(data)
    schema = read_json(SCHEMA_BY_KIND[kind])
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
    if errors:
        for error in errors:
            path = "/" + "/".join(str(p) for p in error.path)
            print(f"FAIL {path}: {error.message}")
        raise SystemExit(1)
    print(f"OK {args.path} ({kind})")


if __name__ == "__main__":
    main()
