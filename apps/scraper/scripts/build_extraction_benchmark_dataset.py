#!/usr/bin/env python3
"""Build a pilot crawl4ai extraction benchmark dataset from golden_dataset_v3."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, cast

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scrapers.ai_search.extraction_benchmark import build_pilot_extraction_dataset_payload
from scrapers.ai_search.scoring import SearchScorer

DEFAULT_SOURCE_DATASET = ROOT / "data" / "golden_dataset_v3.json"
DEFAULT_OUTPUT = ROOT / "data" / "golden_dataset_v3_extraction_pilot.json"

PILOT_SKUS = [
    "850012047735",  # Honest Kitchen (cat food dry)
    "072318200618",  # FirstMate cat food dry
    "045663976866",  # Four Paws cat litter accessories
    "856595005308",  # Etta Says dog treats
    "856595005902",  # Etta Says dog treats
    "813347001018",  # Stud Muffins horse treats
    "813347003043",  # Stud Muffins horse treats
    "072318100680",  # FirstMate dog food dry (control)
    "821559820358",  # Alpine fountain (control)
    "4059433816098",  # Schleich figurine (control)
    "032247886598",  # Scotts mulch (control)
    "095668480400",  # Manna Pro poultry bedding (control)
]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a pilot crawl4ai extraction benchmark dataset")
    parser.add_argument("--source-dataset", type=Path, default=DEFAULT_SOURCE_DATASET)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--skus", help="Optional comma-separated SKU override")
    return parser.parse_args(argv)


def _parse_skus(raw_skus: str | None) -> list[str]:
    if not raw_skus:
        return PILOT_SKUS
    return [sku.strip() for sku in raw_skus.split(",") if sku.strip()]


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    payload = cast(dict[str, Any], json.loads(args.source_dataset.read_text(encoding="utf-8")))
    entry_by_sku = {str(entry.get("sku")): entry for entry in payload.get("entries", [])}
    scorer = SearchScorer()
    selected_entries: list[dict[str, Any]] = []

    for sku in _parse_skus(args.skus):
        source_entry = entry_by_sku.get(sku)
        if source_entry is None:
            raise ValueError(f"SKU not found in source dataset: {sku}")

        expected_source_url = str(source_entry["expected_source_url"])
        expected_domain = scorer.domain_from_url(expected_source_url)
        source_type = "official" if scorer.classify_source_domain(expected_domain, source_entry.get("brand")) == "official" else "retailer"

        selected_entries.append(
            {
                "sku": str(source_entry["sku"]),
                "query": str(source_entry["query"]),
                "expected_source_url": expected_source_url,
                "category": str(source_entry.get("category") or "Uncategorized"),
                "difficulty": str(source_entry.get("difficulty") or "medium"),
                "source_type": source_type,
                "ground_truth": {
                    "brand": str(source_entry.get("brand") or ""),
                    "name": str(source_entry.get("product_name") or ""),
                    "description": "",
                    "size_metrics": None,
                    "images": [],
                    "categories": [str(source_entry.get("category") or "Uncategorized")],
                },
            }
        )

    output_payload = build_pilot_extraction_dataset_payload(args.source_dataset, selected_entries)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output_payload, indent=2), encoding="utf-8")
    print(f"Wrote extraction benchmark pilot dataset to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
