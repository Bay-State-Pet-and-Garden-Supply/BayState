from __future__ import annotations

import json
from pathlib import Path

import pytest

from benchmarks.ai_search.dataset import DATASET_SCHEMA_VERSION, load_dataset


def test_load_dataset_parses_valid_entries(tmp_path: Path) -> None:
    dataset_path = tmp_path / "dataset.json"
    dataset_path.write_text(
        json.dumps(
            {
                "schema_version": DATASET_SCHEMA_VERSION,
                "entries": [
                    {
                        "upc": "UPC-1",
                        "product_name": "Test Product",
                        "brand": "Acme",
                        "expected_official_domains": ["acme.example"],
                        "expected_source_url": "https://acme.example/products/widget",
                        "source_type": "official",
                        "category": "widgets",
                        "difficulty": "easy",
                        "tags": ["smoke"],
                        "ground_truth": {
                            "brand": "Acme",
                            "name": "Test Product",
                            "description_contains": ["widget", "test"],
                            "size_metrics": "10 oz",
                            "image_required": True,
                            "categories": ["Widgets", "Tools"],
                        },
                        "search_fixtures": [
                            {
                                "query": "site:acme.example UPC-1",
                                "results": [
                                    {
                                        "url": "https://acme.example/products/widget",
                                        "title": "Test Product",
                                        "description": "A great widget",
                                        "provider": "fixture",
                                        "result_type": "organic",
                                    }
                                ],
                            }
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    rows = load_dataset(dataset_path)
    assert len(rows) == 1
    entry = rows[0]
    assert entry.upc == "UPC-1"
    assert entry.product_name == "Test Product"
    assert entry.brand == "Acme"
    assert entry.expected_official_domains == ["acme.example"]
    assert entry.expected_source_url == "https://acme.example/products/widget"
    assert entry.source_type == "official"
    assert entry.category == "widgets"
    assert entry.difficulty == "easy"
    assert entry.tags == ["smoke"]
    assert entry.ground_truth is not None
    assert entry.ground_truth.brand == "Acme"
    assert entry.ground_truth.name == "Test Product"
    assert entry.ground_truth.description_contains == ["widget", "test"]
    assert entry.ground_truth.size_metrics == "10 oz"
    assert entry.ground_truth.image_required is True
    assert entry.ground_truth.categories == ["Widgets", "Tools"]
    assert entry.search_fixtures is not None
    assert len(entry.search_fixtures) == 1
    assert entry.search_fixtures[0].query == "site:acme.example UPC-1"


def test_load_dataset_rejects_bad_schema_version(tmp_path: Path) -> None:
    dataset_path = tmp_path / "dataset.json"
    dataset_path.write_text(json.dumps({"schema_version": "wrong", "entries": []}), encoding="utf-8")

    with pytest.raises(ValueError, match="Unexpected dataset schema_version"):
        load_dataset(dataset_path)


def test_load_dataset_rejects_missing_required_fields(tmp_path: Path) -> None:
    dataset_path = tmp_path / "dataset.json"
    dataset_path.write_text(
        json.dumps(
            {
                "schema_version": DATASET_SCHEMA_VERSION,
                "entries": [
                    {
                        "upc": "UPC-1",
                        "product_name": "Test Product",
                        # missing brand
                        "expected_official_domains": ["acme.example"],
                        "expected_source_url": "https://acme.example/products/widget",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="missing required field 'brand'"):
        load_dataset(dataset_path)


def test_load_dataset_allows_optional_ground_truth(tmp_path: Path) -> None:
    dataset_path = tmp_path / "dataset.json"
    dataset_path.write_text(
        json.dumps(
            {
                "schema_version": DATASET_SCHEMA_VERSION,
                "entries": [
                    {
                        "upc": "UPC-1",
                        "product_name": "Test Product",
                        "brand": "Acme",
                        "expected_official_domains": ["acme.example"],
                        "expected_source_url": "https://acme.example/products/widget",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    rows = load_dataset(dataset_path)
    assert len(rows) == 1
    assert rows[0].ground_truth is None
    assert rows[0].search_fixtures is None
