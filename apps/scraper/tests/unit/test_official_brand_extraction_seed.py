from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse


DATASET_PATH = Path("benchmarks/official_brand/fixtures/extraction_seed.json")


def test_extraction_seed_has_strict_curated_shape() -> None:
    payload = json.loads(DATASET_PATH.read_text(encoding="utf-8"))

    assert payload["schema_version"] == "official-brand-extraction-dataset-v1"
    assert len(payload["entries"]) >= 8

    seen_skus: set[str] = set()
    for entry in payload["entries"]:
        assert entry["sku"] not in seen_skus
        seen_skus.add(entry["sku"])
        assert entry["product_name"].strip()
        assert entry["brand"].strip()
        assert entry["source_type"] in {"official", "retailer", "distributor"}
        assert entry["source_url"].startswith("https://")
        assert not parse_qs(urlparse(entry["source_url"]).query).get("srsltid")

        ground_truth = entry["ground_truth"]
        assert ground_truth["brand"].strip()
        assert ground_truth["name"].strip()
        assert ground_truth["description_contains"]
        assert ground_truth["size_metrics"].strip()
        assert ground_truth["image_required"] is True
        assert ground_truth["categories"]
