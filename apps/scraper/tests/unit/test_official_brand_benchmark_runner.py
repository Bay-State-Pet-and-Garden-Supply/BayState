from __future__ import annotations

import json
from pathlib import Path

import pytest

from unittest.mock import AsyncMock, patch

from benchmarks.official_brand.dataset import DATASET_SCHEMA_VERSION
from benchmarks.official_brand.runner import run_official_brand_fixture_benchmark


@pytest.mark.asyncio
async def test_runner_produces_passing_report_with_fixtures(tmp_path: Path) -> None:
    dataset_path = tmp_path / "dataset.json"
    fixtures_path = tmp_path / "entries.json"
    output_dir = tmp_path / "reports"

    dataset_path.write_text(
        json.dumps(
            {
                "schema_version": DATASET_SCHEMA_VERSION,
                "entries": [
                    {
                        "sku": "SKU-1",
                        "brand": "Acme",
                        "product_name": "Acme Widget",
                        "expected_official_domains": ["acme.example"],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    fixtures_path.write_text(
        json.dumps(
            {
                "entries": [
                    {
                        "query": "SKU-1",
                        "results": [
                            {
                                "url": "https://acme.example/products/widget",
                                "title": "Acme Widget",
                                "description": "Official page",
                                "result_type": "organic",
                            }
                        ],
                    },
                    {
                        "query": "site:acme.example Acme Widget",
                        "results": [
                            {
                                "url": "https://acme.example/products/widget",
                                "title": "Acme Widget",
                                "description": "Official page",
                                "result_type": "organic",
                            }
                        ],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    report, json_path, _md_path, passed = await run_official_brand_fixture_benchmark(
        dataset_path=dataset_path,
        search_fixtures_path=fixtures_path,
        output_dir=output_dir,
        fail_under_domain_match_rate=1.0,
    )

    assert passed is True
    assert json_path.exists()
    assert report["summary"]["domain_match_rate"] == 1.0


@pytest.mark.asyncio
async def test_runner_uses_discovery_pipeline_and_records_phase_metadata(
    tmp_path: Path,
) -> None:
    dataset_path = tmp_path / "dataset.json"
    fixtures_path = tmp_path / "entries.json"
    output_dir = tmp_path / "reports"

    dataset_path.write_text(
        json.dumps(
            {
                "schema_version": DATASET_SCHEMA_VERSION,
                "entries": [
                    {
                        "sku": "SKU-1",
                        "brand": "Acme",
                        "product_name": "Acme Widget",
                        "expected_official_domains": ["acme.example"],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    fixtures_path.write_text(json.dumps({"entries": []}), encoding="utf-8")

    with (
        patch(
            "benchmarks.official_brand.runner.OfficialBrandScraper.discover_official_url_candidates",
            new=AsyncMock(
                return_value={
                    "success": True,
                    "selected_url": "https://acme.example/products/widget",
                    "predicted_name": "Acme Widget",
                    "phase1_result_count": 2,
                    "phase2_result_count": 3,
                }
            ),
        ),
        patch(
            "benchmarks.official_brand.runner.OfficialBrandScraper.identify_official_url",
            new=AsyncMock(side_effect=AssertionError("identify_official_url should not be called")),
        ),
    ):
        report, _json_path, _md_path, passed = await run_official_brand_fixture_benchmark(
            dataset_path=dataset_path,
            search_fixtures_path=fixtures_path,
            output_dir=output_dir,
            fail_under_domain_match_rate=1.0,
        )

    assert passed is True
    entry = report["entries"][0]
    assert entry["discovered_url"] == "https://acme.example/products/widget"
    assert entry["predicted_name"] == "Acme Widget"
    assert entry["phase1_result_count"] == 2
    assert entry["phase2_result_count"] == 3
