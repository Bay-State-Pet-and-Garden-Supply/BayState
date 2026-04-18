from __future__ import annotations

import json
from pathlib import Path

from scripts.finalize_golden_dataset import main


def test_finalize_prefers_consolidated_name_in_output(tmp_path: Path) -> None:
    draft_path = tmp_path / "draft.json"
    output_path = tmp_path / "final.json"
    draft_path.write_text(
        json.dumps(
            {
                "version": "2.0-draft",
                "created_at": "2026-04-18T00:00:00+00:00",
                "provenance": {"annotator": "pytest", "source": "fixtures", "product_count": 1},
                "entries": [
                    {
                        "query": "FirstMate Limited Ingredient Pork & Apple Formula for Dogs 12.2oz",
                        "expected_source_url": "https://firstmate.com/product/pork-apple-formula-for-dogs-12-2oz-12-cans/",
                        "category": "Dog Food",
                        "difficulty": "medium",
                        "rationale": "Official product page",
                        "sku": "072318120008",
                        "product_name": "FIRSTMATE LID GF POR K/APPL 12.2OZ",
                        "consolidated_name": "FirstMate Limited Ingredient Pork & Apple Formula for Dogs 12.2oz",
                        "brand": "FirstMate",
                    }
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    exit_code = main(["--draft", str(draft_path), "--output", str(output_path)])

    payload = json.loads(output_path.read_text(encoding="utf-8"))

    assert exit_code == 0
    assert payload["entries"][0]["product_name"] == "FirstMate Limited Ingredient Pork & Apple Formula for Dogs 12.2oz"


def test_finalize_falls_back_to_original_product_name(tmp_path: Path) -> None:
    draft_path = tmp_path / "draft.json"
    output_path = tmp_path / "final.json"
    draft_path.write_text(
        json.dumps(
            {
                "version": "2.0-draft",
                "created_at": "2026-04-18T00:00:00+00:00",
                "provenance": {"annotator": "pytest", "source": "fixtures", "product_count": 1},
                "entries": [
                    {
                        "query": "Raw Product Name",
                        "expected_source_url": "https://example.com/product",
                        "category": "Misc",
                        "difficulty": "medium",
                        "rationale": "Fallback path",
                        "sku": "123",
                        "product_name": "Raw Product Name",
                        "brand": None,
                    }
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    exit_code = main(["--draft", str(draft_path), "--output", str(output_path)])

    payload = json.loads(output_path.read_text(encoding="utf-8"))

    assert exit_code == 0
    assert payload["entries"][0]["product_name"] == "Raw Product Name"
