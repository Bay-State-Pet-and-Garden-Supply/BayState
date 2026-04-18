from __future__ import annotations

import json
from pathlib import Path


def test_golden_dataset_v3_expected_urls_exist_in_fixture_manifest() -> None:
    dataset_path = Path("data/golden_dataset_v3.json")
    fixtures_path = Path("data/golden_dataset_v3.search_results.json")

    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    fixtures = json.loads(fixtures_path.read_text(encoding="utf-8"))

    fixture_urls_by_query = {
        str(entry["query"]): {str(result.get("url") or "") for result in entry.get("results", [])} for entry in fixtures.get("entries", [])
    }

    missing: list[str] = []
    for entry in dataset.get("entries", []):
        query = str(entry["query"])
        expected_url = str(entry["expected_source_url"])
        candidate_urls = fixture_urls_by_query.get(query, set())
        if expected_url not in candidate_urls:
            missing.append(f"{query} -> {expected_url}")

    assert missing == []
