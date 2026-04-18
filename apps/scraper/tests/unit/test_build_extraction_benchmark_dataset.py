from __future__ import annotations

import json
from pathlib import Path

from scripts.build_extraction_benchmark_dataset import main


def test_build_extraction_benchmark_dataset_writes_selected_entries(tmp_path: Path) -> None:
    source_dataset = tmp_path / "golden_dataset_v3.json"
    output_path = tmp_path / "golden_dataset_v3_extraction_pilot.json"
    source_dataset.write_text(
        json.dumps(
            {
                "version": "3.0",
                "entries": [
                    {
                        "sku": "SKU-123",
                        "query": "Acme Ultra Kibble",
                        "expected_source_url": "https://acme.com/products/sku-123",
                        "category": "Dog Food Dry",
                        "difficulty": "medium",
                        "product_name": "Acme Ultra Kibble",
                        "brand": "Acme",
                    }
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    exit_code = main(["--source-dataset", str(source_dataset), "--output", str(output_path), "--skus", "SKU-123"])

    payload = json.loads(output_path.read_text(encoding="utf-8"))

    assert exit_code == 0
    assert payload["source_dataset"] == str(source_dataset)
    assert len(payload["entries"]) == 1
    assert payload["entries"][0]["sku"] == "SKU-123"
    assert payload["entries"][0]["source_type"] == "official"
