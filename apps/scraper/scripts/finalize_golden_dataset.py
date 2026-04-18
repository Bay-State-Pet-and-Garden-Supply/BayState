#!/usr/bin/env python3
"""Finalize the golden dataset from an annotated draft.

After manually annotating the draft dataset (filling in expected_source_url
and rationale for each entry), run this script to produce the final
golden_dataset_v2.json used by the benchmark runner.

Usage:
    python scripts/finalize_golden_dataset.py \
        --draft data/golden_dataset_v2_draft.json \
        --output data/golden_dataset_v2.json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(description="Finalize annotated draft into golden dataset v2")
    _ = parser.add_argument(
        "--draft",
        type=Path,
        default=PROJECT_ROOT / "data" / "golden_dataset_v2_draft.json",
        help="Path to the annotated draft dataset",
    )
    _ = parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "data" / "golden_dataset_v2.json",
        help="Path to write the final golden dataset",
    )
    _ = parser.add_argument(
        "--allow-incomplete",
        action="store_true",
        help="Allow entries without expected_source_url (skip them with a warning)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint."""
    args = parse_args(argv)

    draft_path: Path = args.draft
    if not draft_path.exists():
        print(f"Draft file not found: {draft_path}", file=sys.stderr)
        return 1

    draft: dict[str, Any] = json.loads(draft_path.read_text(encoding="utf-8"))
    draft_entries: list[dict[str, Any]] = draft.get("entries", [])

    if not draft_entries:
        print("No entries in draft dataset", file=sys.stderr)
        return 1

    # Validate and convert
    final_entries: list[dict[str, Any]] = []
    skipped = 0
    for index, entry in enumerate(draft_entries, start=1):
        expected_url = str(entry.get("expected_source_url") or "").strip()
        if not expected_url:
            if args.allow_incomplete:
                print(f"  [SKIP] Entry {index}: {entry.get('sku', '?')} — no expected_source_url")
                skipped += 1
                continue
            print(
                f"Entry {index} ({entry.get('sku', '?')}) is missing expected_source_url. Use --allow-incomplete to skip, or annotate the draft first.",
                file=sys.stderr,
            )
            return 1

        finalized_product_name = str(entry.get("consolidated_name") or entry.get("product_name") or "").strip() or None

        final_entries.append(
            {
                "query": entry["query"],
                "expected_source_url": expected_url,
                "category": entry.get("category") or "Uncategorized",
                "difficulty": entry.get("difficulty") or "medium",
                "rationale": str(entry.get("rationale") or ""),
                "sku": entry.get("sku"),
                # Preserve the production-like consolidated name in the final benchmark
                # dataset so scoring/ranking uses the same query context used during
                # harvest rather than the raw abbreviated pipeline name.
                "product_name": finalized_product_name,
                "brand": entry.get("brand"),
            }
        )

    if not final_entries:
        print("No annotated entries found in draft", file=sys.stderr)
        return 1

    # Build final dataset
    provenance = draft.get("provenance", {})
    provenance["finalized_at"] = datetime.now(timezone.utc).isoformat()
    provenance["annotated_count"] = len(final_entries)
    provenance["skipped_count"] = skipped

    final_dataset = {
        "version": "2.0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "provenance": provenance,
        "entries": final_entries,
    }

    output_path: Path = args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _ = output_path.write_text(json.dumps(final_dataset, indent=2), encoding="utf-8")

    print(f"Finalized {len(final_entries)} entries -> {output_path}")
    if skipped:
        print(f"Skipped {skipped} unannotated entries")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
