#!/usr/bin/env python3
"""CLI script to validate golden dataset JSON files."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, NamedTuple

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scrapers.ai_search.dataset_validator import DatasetValidator, ValidationError, ValidationResult


class ValidationArgs(argparse.Namespace):
    """Typed argparse namespace for the CLI."""

    dataset: Path
    schema: Path | None
    verbose: bool


def parse_args(argv: list[str] | None = None) -> ValidationArgs:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(description="Validate a golden dataset JSON file")
    _ = parser.add_argument("--dataset", type=Path, required=True, help="Path to the dataset JSON file")
    _ = parser.add_argument("--schema", type=Path, default=None, help="Path to the JSON schema (default: data/golden_dataset_schema.json)")
    _ = parser.add_argument("--verbose", action="store_true", help="Print detailed error messages")

    args = parser.parse_args(argv)
    return ValidationArgs(
        dataset=args.dataset,
        schema=args.schema,
        verbose=args.verbose,
    )


def format_error(error: ValidationError) -> str:
    """Format a validation error for display."""
    if error.entry_index is not None:
        return f"  Entry {error.entry_index} [{error.field}]: {error.message}"
    elif error.field is not None:
        return f"  [{error.field}]: {error.message}"
    else:
        return f"  {error.message}"


def run_validation(args: ValidationArgs) -> ValidationResult:
    """Run the validation with the given arguments."""
    schema_path = args.schema or (ROOT / "data" / "golden_dataset_schema.json")

    if not args.dataset.exists():
        print(f"Error: Dataset file not found: {args.dataset}", file=sys.stderr)
        return ValidationResult(
            valid=False,
            errors=[ValidationError(entry_index=None, field=None, message=f"File not found: {args.dataset}")],
            entry_count=0,
            duplicate_count=0,
        )

    if not schema_path.exists():
        print(f"Error: Schema file not found: {schema_path}", file=sys.stderr)
        return ValidationResult(
            valid=False,
            errors=[ValidationError(entry_index=None, field=None, message=f"Schema file not found: {schema_path}")],
            entry_count=0,
            duplicate_count=0,
        )

    validator = DatasetValidator(schema_path=schema_path)
    return validator.validate_file(args.dataset)


def main(argv: list[str] | None = None) -> int:
    """CLI entry point."""
    try:
        args = parse_args(argv)
    except SystemExit:
        return 1

    result = run_validation(args)

    if result.valid:
        print(f"✓ Dataset is valid ({result.entry_count} entries)")
        if result.duplicate_count > 0:
            print(f"  Warning: {result.duplicate_count} duplicate queries found")
        if args.verbose:
            print(f"  Schema: {args.schema or 'data/golden_dataset_schema.json'}")
            print(f"  Dataset: {args.dataset}")
    else:
        print(f"✗ Dataset is invalid ({len(result.errors)} errors):")
        for error in result.errors:
            print(format_error(error))

    return 0 if result.valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
