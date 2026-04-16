from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import cast

import pytest

from scrapers.ai_search.fixture_search_client import FixtureSearchClient
from scripts.benchmark_ai_search import BenchmarkReport, BenchmarkRunner, main, parse_args, write_report


class _FakeSelector:
    def __init__(self, response_url: str | None, cost: float = 0.0) -> None:
        self.response_url: str | None = response_url
        self.cost: float = cost
        self.calls: list[dict[str, object]] = []

    async def select_best_url(
        self,
        results: list[dict[str, object]],
        sku: str,
        product_name: str,
        brand: str | None = None,
        preferred_domains: list[str] | None = None,
    ) -> tuple[str | None, float]:
        self.calls.append(
            {
                "results": results,
                "sku": sku,
                "product_name": product_name,
                "brand": brand,
                "preferred_domains": preferred_domains,
            }
        )
        return self.response_url, self.cost


def _dataset_payload(entries: Sequence[Mapping[str, object]]) -> dict[str, object]:
    return {
        "version": "1.0",
        "created_at": "2026-04-16T12:00:00Z",
        "provenance": {
            "annotator": "pytest",
            "source": "fixtures",
            "mode": "batch",
            "product_count": len(entries),
            "max_calls": max(1, len(entries)),
            "serper_calls_used": 0,
        },
        "entries": [dict(entry) for entry in entries],
    }


def _result(url: str, title: str, description: str) -> dict[str, object]:
    return {
        "url": url,
        "title": title,
        "description": description,
        "provider": "serper",
        "result_type": "organic",
    }


def _write_dataset(tmp_path: Path, entries: Sequence[Mapping[str, object]], filename: str = "dataset.json") -> Path:
    dataset_path = tmp_path / filename
    _ = dataset_path.write_text(json.dumps(_dataset_payload(entries), indent=2), encoding="utf-8")
    return dataset_path


def test_parse_args_supports_required_flags() -> None:
    args = parse_args(["--dataset", "data/golden_dataset_v1.json", "--output", "report.json", "--mode", "llm"])

    assert args.dataset == Path("data/golden_dataset_v1.json")
    assert args.output == Path("report.json")
    assert args.mode == "llm"


@pytest.mark.asyncio
async def test_benchmark_runner_calculates_accuracy_and_timing(tmp_path: Path) -> None:
    entries = [
        {
            "query": "12345 Acme Widget Acme Tools",
            "expected_source_url": "https://acme.com/product/acme-widget",
            "category": "Tools",
            "difficulty": "easy",
            "rationale": "Official Acme page is present.",
        },
        {
            "query": "54321 Beta Mixer Beta Kitchen",
            "expected_source_url": "https://beta.com/product/beta-mixer",
            "category": "Kitchen",
            "difficulty": "medium",
            "rationale": "Ground truth intentionally differs for accuracy math.",
        },
    ]
    dataset_path = _write_dataset(tmp_path, entries)

    fixture_client = FixtureSearchClient(cache_dir=tmp_path / "cache", allow_real_api=False)
    _ = fixture_client.write_cache_entry(
        "12345 Acme Widget Acme Tools",
        [
            _result("https://www.amazon.com/acme-widget", "Acme Widget", "Amazon retailer listing"),
            _result("https://acme.com/product/acme-widget", "Acme Widget | Official Product Page", "Official Acme product page"),
        ],
    )
    _ = fixture_client.write_cache_entry(
        "54321 Beta Mixer Beta Kitchen",
        [
            _result("https://www.amazon.com/beta-mixer", "Beta Mixer", "Amazon retailer listing"),
            _result("https://www.walmart.com/ip/Beta-Mixer", "Beta Mixer", "Retailer listing for Beta Mixer"),
        ],
    )

    runner = BenchmarkRunner(dataset_path=dataset_path, search_client=fixture_client)
    report = await runner.run()

    assert report["summary"]["total_examples"] == 2
    assert report["summary"]["matched_examples"] == 1
    assert report["summary"]["accuracy_exact_match_pct"] == 50.0
    assert report["summary"]["selection_breakdown"] == {"heuristic": 2}
    assert report["results"][0]["exact_match"] is True
    assert report["results"][1]["exact_match"] is False
    assert report["results"][0]["duration_ms"] >= 0.0
    assert report["results"][1]["duration_ms"] >= 0.0


@pytest.mark.asyncio
async def test_benchmark_runner_uses_companion_search_fixtures(tmp_path: Path) -> None:
    entries = [
        {
            "query": "12345 Acme Widget Acme Tools",
            "expected_source_url": "https://acme.com/product/acme-widget",
            "category": "Tools",
            "difficulty": "easy",
            "rationale": "Official Acme page is present.",
        }
    ]
    dataset_path = _write_dataset(tmp_path, entries, filename="golden_dataset_v1.json")
    fixture_manifest_path = tmp_path / "golden_dataset_v1.search_results.json"
    _ = fixture_manifest_path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "entries": [
                    {
                        "query": "12345 Acme Widget Acme Tools",
                        "results": [
                            _result("https://www.amazon.com/acme-widget", "Acme Widget", "Amazon retailer listing"),
                            _result("https://acme.com/product/acme-widget", "Acme Widget | Official Product Page", "Official Acme product page"),
                        ],
                    }
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    runner = BenchmarkRunner(dataset_path=dataset_path)
    report = await runner.run()

    assert report["summary"]["total_examples"] == 1
    assert report["summary"]["matched_examples"] == 1
    assert report["results"][0]["predicted_source_url"] == "https://acme.com/product/acme-widget"


@pytest.mark.asyncio
async def test_benchmark_runner_supports_llm_mode_with_selector_fallback(tmp_path: Path) -> None:
    entries = [
        {
            "query": "12345 Acme Widget Acme Tools",
            "expected_source_url": "https://acme.com/product/acme-widget",
            "category": "Tools",
            "difficulty": "easy",
            "rationale": "Official Acme page is present.",
        }
    ]
    dataset_path = _write_dataset(tmp_path, entries)

    fixture_client = FixtureSearchClient(cache_dir=tmp_path / "cache", allow_real_api=False)
    _ = fixture_client.write_cache_entry(
        "12345 Acme Widget Acme Tools",
        [
            _result("https://www.amazon.com/acme-widget", "Acme Widget", "Amazon retailer listing"),
            _result("https://acme.com/product/acme-widget", "Acme Widget | Official Product Page", "Official Acme product page"),
        ],
    )

    llm_runner = BenchmarkRunner(
        dataset_path=dataset_path,
        mode="llm",
        search_client=fixture_client,
        selector=_FakeSelector(response_url="https://acme.com/product/acme-widget", cost=0.123),
    )
    llm_report = await llm_runner.run()

    fallback_runner = BenchmarkRunner(
        dataset_path=dataset_path,
        mode="llm",
        search_client=fixture_client,
        selector=_FakeSelector(response_url=None, cost=0.0),
    )
    fallback_report = await fallback_runner.run()

    assert llm_report["summary"]["selection_breakdown"] == {"llm": 1}
    assert llm_report["summary"]["total_selection_cost_usd"] == 0.123
    assert llm_report["results"][0]["selection_method"] == "llm"
    assert fallback_report["summary"]["selection_breakdown"] == {"heuristic_fallback": 1}
    assert fallback_report["results"][0]["predicted_source_url"] == "https://acme.com/product/acme-widget"


def test_write_report_persists_json(tmp_path: Path) -> None:
    output_path = tmp_path / "reports" / "benchmark.json"
    report: dict[str, object] = {"summary": {"accuracy_exact_match_pct": 100.0}, "results": []}

    write_report(report, output_path)

    saved = cast(dict[str, object], json.loads(output_path.read_text(encoding="utf-8")))
    assert saved == report


def test_main_writes_report_and_returns_zero(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    entries = [
        {
            "query": "12345 Acme Widget Acme Tools",
            "expected_source_url": "https://acme.com/product/acme-widget",
            "category": "Tools",
            "difficulty": "easy",
            "rationale": "Official Acme page is present.",
        }
    ]
    dataset_path = _write_dataset(tmp_path, entries, filename="golden_dataset_v1.json")
    fixture_manifest_path = tmp_path / "golden_dataset_v1.search_results.json"
    _ = fixture_manifest_path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "entries": [
                    {
                        "query": "12345 Acme Widget Acme Tools",
                        "results": [
                            _result("https://www.amazon.com/acme-widget", "Acme Widget", "Amazon retailer listing"),
                            _result("https://acme.com/product/acme-widget", "Acme Widget | Official Product Page", "Official Acme product page"),
                        ],
                    }
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    output_path = tmp_path / "benchmark-report.json"

    exit_code = main(["--dataset", str(dataset_path), "--output", str(output_path)])
    stdout = capsys.readouterr().out
    saved = cast(BenchmarkReport, json.loads(output_path.read_text(encoding="utf-8")))

    assert exit_code == 0
    assert saved["summary"]["matched_examples"] == 1
    assert '"accuracy_exact_match_pct": 100.0' in stdout


def test_main_returns_nonzero_for_invalid_dataset(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    invalid_dataset_path = tmp_path / "invalid.json"
    _ = invalid_dataset_path.write_text(json.dumps({"entries": []}), encoding="utf-8")

    exit_code = main(["--dataset", str(invalid_dataset_path)])
    stderr = capsys.readouterr().err

    assert exit_code == 1
    assert "Missing required field" in stderr or "Schema validation error" in stderr
