from __future__ import annotations

import json
from pathlib import Path

import pytest

from benchmarks.official_brand.dataset import DATASET_SCHEMA_VERSION, load_dataset


def test_load_dataset_parses_valid_entries(tmp_path: Path) -> None:
    dataset_path = tmp_path / "dataset.json"
    dataset_path.write_text(
        json.dumps(
            {
                "schema_version": DATASET_SCHEMA_VERSION,
                "entries": [
                    {
                        "sku": "SKU-1",
                        "product_name": "Test Product",
                        "expected_official_domains": ["example.com"],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    rows = load_dataset(dataset_path)
    assert len(rows) == 1
    assert rows[0].sku == "SKU-1"
    assert rows[0].expected_official_domains == ["example.com"]


def test_load_dataset_rejects_bad_schema_version(tmp_path: Path) -> None:
    dataset_path = tmp_path / "dataset.json"
    dataset_path.write_text(json.dumps({"schema_version": "wrong", "entries": []}), encoding="utf-8")

    with pytest.raises(ValueError, match="Unexpected dataset schema_version"):
        load_dataset(dataset_path)
