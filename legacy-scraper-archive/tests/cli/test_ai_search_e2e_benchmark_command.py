from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from cli.main import cli


def test_ai_search_e2e_benchmark_command_runs(tmp_path: Path) -> None:
    dataset_path = tmp_path / "dataset.json"
    search_fixtures_path = tmp_path / "search_fixtures.json"
    output_dir = tmp_path / "reports"

    dataset_path.write_text(
        json.dumps(
            {
                "schema_version": "ai-search-e2e-benchmark-dataset-v1",
                "entries": [
                    {
                        "sku": "SKU-1",
                        "product_name": "Acme Widget",
                        "brand": "Acme",
                        "expected_official_domains": ["acme.example"],
                        "expected_source_url": "https://acme.example/products/widget",
                        "source_type": "official",
                        "ground_truth": {
                            "brand": "Acme",
                            "name": "Acme Widget",
                            "description_contains": ["widget"],
                            "size_metrics": "10 oz",
                            "image_required": False,
                            "categories": ["Widgets"],
                        },
                        "search_fixtures": [
                            {
                                "query": "site:acme.example SKU-1",
                                "results": [
                                    {
                                        "url": "https://acme.example/products/widget",
                                        "title": "Acme Widget",
                                        "description": "Official widget",
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

    search_fixtures_path.write_text(
        json.dumps({"entries": []}),
        encoding="utf-8",
    )

    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "benchmark",
            "ai-search-e2e",
            "--dataset",
            str(dataset_path),
            "--mode",
            "fixture",
            "--search-fixtures",
            str(search_fixtures_path),
            "--output-dir",
            str(output_dir),
            "--fail-under-end-to-end-rate",
            "0.0",
            "--max-concurrency",
            "1",
        ],
    )

    assert result.exit_code == 0, f"Exit code {result.exit_code}, output:\n{result.output}"
    assert "AI Search E2E benchmark complete" in result.output
    assert "JSON report:" in result.output
    assert "Markdown report:" in result.output

    # Reports should exist
    assert (output_dir / "ai-search-e2e-benchmark.json").exists()
    assert (output_dir / "ai-search-e2e-benchmark.md").exists()


def test_ai_search_e2e_benchmark_command_fails_below_threshold(tmp_path: Path) -> None:
    dataset_path = tmp_path / "dataset.json"
    search_fixtures_path = tmp_path / "search_fixtures.json"
    output_dir = tmp_path / "reports"

    # Entry with no search fixtures will fail in fixture mode
    dataset_path.write_text(
        json.dumps(
            {
                "schema_version": "ai-search-e2e-benchmark-dataset-v1",
                "entries": [
                    {
                        "sku": "SKU-FAIL",
                        "product_name": "Fail Product",
                        "brand": "Fail",
                        "expected_official_domains": ["fail.example"],
                        "expected_source_url": "https://fail.example/product",
                        "source_type": "official",
                        "search_fixtures": [],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    search_fixtures_path.write_text(json.dumps({"entries": []}), encoding="utf-8")

    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "benchmark",
            "ai-search-e2e",
            "--dataset",
            str(dataset_path),
            "--mode",
            "fixture",
            "--search-fixtures",
            str(search_fixtures_path),
            "--output-dir",
            str(output_dir),
            "--fail-under-end-to-end-rate",
            "1.0",
            "--max-concurrency",
            "1",
        ],
    )

    assert result.exit_code != 0
    assert "below threshold" in result.output or "Error" in result.output


def test_real_dataset_and_fixtures_exist() -> None:
    """Smoke test: validate the committed dataset parses and page fixtures exist."""
    dataset_path = Path("benchmarks/ai_search/fixtures/e2e_dataset.json")
    page_fixtures_dir = Path("benchmarks/ai_search/fixtures/page_fixtures")

    assert dataset_path.exists(), f"Dataset not found: {dataset_path}"
    assert page_fixtures_dir.exists(), f"Page fixtures dir not found: {page_fixtures_dir}"

    payload = json.loads(dataset_path.read_text(encoding="utf-8"))
    assert payload.get("schema_version") == "ai-search-e2e-benchmark-dataset-v1"
    entries = payload.get("entries", [])
    assert len(entries) >= 1

    missing_fixtures: list[str] = []
    for entry in entries:
        url = entry.get("expected_source_url", "")
        cache_key = hashlib.sha256(url.encode()).hexdigest()
        fixture_path = page_fixtures_dir / f"{cache_key}.json"
        if not fixture_path.exists():
            missing_fixtures.append(entry.get("sku", "unknown"))

    # Allow up to 2 missing fixtures (some URLs may be temporarily unavailable)
    assert len(missing_fixtures) <= 2, f"Too many missing page fixtures: {missing_fixtures}"


@pytest.mark.slow
@pytest.mark.skipif(
    not Path("benchmarks/ai_search/fixtures/page_fixtures").exists(),
    reason="Page fixtures not captured",
)
def test_ai_search_e2e_with_real_dataset_fixture_mode() -> None:
    """Integration test: run the benchmark with the real committed dataset and fixtures."""
    dataset_path = Path("benchmarks/ai_search/fixtures/e2e_dataset.json")
    output_dir = Path("reports/test-ai-search-e2e")

    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "benchmark",
            "ai-search-e2e",
            "--dataset",
            str(dataset_path),
            "--mode",
            "fixture",
            "--output-dir",
            str(output_dir),
            "--fail-under-end-to-end-rate",
            "0.0",
            "--max-concurrency",
            "1",
        ],
    )

    assert result.exit_code == 0, f"Exit code {result.exit_code}, output:\n{result.output}"
    assert "AI Search E2E benchmark complete" in result.output

    # Parse the JSON report and assert meaningful results
    json_path = output_dir / "ai-search-e2e-benchmark.json"
    assert json_path.exists()
    report = json.loads(json_path.read_text(encoding="utf-8"))
    summary = report.get("summary", {})

    # With captured fixtures, we expect some degree of success
    assert summary.get("total_entries", 0) >= 8
    assert summary.get("crawl_success_rate", 0.0) > 0.0
    assert summary.get("extraction_success_rate", 0.0) > 0.0
