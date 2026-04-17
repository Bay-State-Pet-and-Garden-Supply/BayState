from __future__ import annotations

import scripts.benchmark_ai_search as benchmark_ai_search
import json
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import cast

import pytest

from scrapers.ai_search.fixture_search_client import FixtureSearchClient
from scripts.benchmark_ai_search import (
    BenchmarkReport,
    BenchmarkResultRow,
    BenchmarkRunner,
    CategoryAnalyzer,
    MetricsCalculator,
    generate_markdown_report,
    main,
    parse_args,
    write_report,
)


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


def _result_row(
    *,
    index: int,
    query: str,
    expected_source_url: str,
    predicted_source_url: str | None,
    exact_match: bool,
    score: float,
    correct_rank: int | None,
    reciprocal_rank: float,
    precision_at_1: float,
    recall_at_1: float,
    duration_ms: float,
    category: str,
    difficulty: str,
    error: str | None = None,
) -> BenchmarkResultRow:
    return BenchmarkResultRow(
        index=index,
        query=query,
        expected_source_url=expected_source_url,
        predicted_source_url=predicted_source_url,
        exact_match=exact_match,
        score=score,
        correct_rank=correct_rank,
        reciprocal_rank=reciprocal_rank,
        precision_at_1=precision_at_1,
        recall_at_1=recall_at_1,
        duration_ms=duration_ms,
        result_count=3,
        mode="heuristic",
        selection_method="heuristic",
        selection_cost_usd=0.0,
        category=category,
        difficulty=difficulty,
        rationale="pytest",
        error=error,
    )


def test_parse_args_supports_required_flags() -> None:
    args = parse_args(["--dataset", "data/golden_dataset_v1.json", "--output", "report.json", "--mode", "llm"])

    assert args.dataset == Path("data/golden_dataset_v1.json")
    assert args.output == Path("report.json")
    assert args.mode == "llm"


def test_metrics_calculator_computes_core_metrics_and_breakdowns() -> None:
    calculator = MetricsCalculator()
    results = [
        _result_row(
            index=0,
            query="12345 Acme Widget",
            expected_source_url="https://acme.com/widget",
            predicted_source_url="https://acme.com/widget",
            exact_match=True,
            score=8.4,
            correct_rank=1,
            reciprocal_rank=1.0,
            precision_at_1=1.0,
            recall_at_1=1.0,
            duration_ms=12.0,
            category="Tools",
            difficulty="easy",
        ),
        _result_row(
            index=1,
            query="54321 Beta Mixer",
            expected_source_url="https://beta.com/mixer",
            predicted_source_url="https://amazon.com/beta-mixer",
            exact_match=False,
            score=6.1,
            correct_rank=2,
            reciprocal_rank=0.5,
            precision_at_1=0.0,
            recall_at_1=0.0,
            duration_ms=18.0,
            category="Tools",
            difficulty="medium",
        ),
        _result_row(
            index=2,
            query="99999 Gamma Feeder",
            expected_source_url="https://gamma.com/feeder",
            predicted_source_url=None,
            exact_match=False,
            score=0.0,
            correct_rank=None,
            reciprocal_rank=0.0,
            precision_at_1=0.0,
            recall_at_1=0.0,
            duration_ms=30.0,
            category="Garden",
            difficulty="hard",
            error="cache miss",
        ),
    ]

    summary = calculator.calculate_metrics(results, execution_duration_ms=60.0)
    category_breakdown = calculator.calculate_breakdown(results, "category")
    difficulty_breakdown = calculator.calculate_breakdown(results, "difficulty")

    assert abs(summary["accuracy_exact_match_pct"] - 33.333) < 0.001
    assert abs(summary["mean_reciprocal_rank"] - 0.5) < 1e-6
    assert abs(summary["precision_at_1"] - (1 / 3)) < 1e-6
    assert abs(summary["recall_at_1"] - (1 / 3)) < 1e-6
    assert summary["accuracy_confidence_interval_95"]["sample_size"] == 3
    assert category_breakdown["Tools"]["sample_size"] == 2
    assert category_breakdown["Tools"]["accuracy_exact_match_pct"] == 50.0
    assert category_breakdown["Tools"]["mean_reciprocal_rank"] == 0.75
    assert difficulty_breakdown["hard"]["error_count"] == 1


def test_category_analyzer_flags_underperformers_and_generates_recommendations() -> None:
    analyzer = CategoryAnalyzer()
    results = [
        _result_row(
            index=0,
            query="12345 Acme Widget",
            expected_source_url="https://acme.com/widget",
            predicted_source_url="https://acme.com/widget",
            exact_match=True,
            score=8.4,
            correct_rank=1,
            reciprocal_rank=1.0,
            precision_at_1=1.0,
            recall_at_1=1.0,
            duration_ms=12.0,
            category="Garden",
            difficulty="easy",
        ),
        _result_row(
            index=1,
            query="54321 Beta Mixer",
            expected_source_url="https://beta.com/mixer",
            predicted_source_url="https://beta.com/mixer",
            exact_match=True,
            score=7.1,
            correct_rank=1,
            reciprocal_rank=1.0,
            precision_at_1=1.0,
            recall_at_1=1.0,
            duration_ms=18.0,
            category="Tools",
            difficulty="medium",
        ),
        _result_row(
            index=2,
            query="99999 Gamma Feeder",
            expected_source_url="https://gamma.com/feeder",
            predicted_source_url=None,
            exact_match=False,
            score=0.0,
            correct_rank=None,
            reciprocal_rank=0.0,
            precision_at_1=0.0,
            recall_at_1=0.0,
            duration_ms=30.0,
            category="Tools",
            difficulty="hard",
            error="cache miss",
        ),
    ]
    baseline_report = {
        "category_breakdown": {
            "Tools": {
                "sample_size": 2,
                "matched_examples": 2,
                "accuracy_exact_match_pct": 100.0,
                "mean_reciprocal_rank": 1.0,
                "precision_at_1": 1.0,
                "recall_at_1": 1.0,
                "average_duration_ms": 10.0,
                "error_count": 0,
            }
        }
    }

    analysis = analyzer.analyze_categories(results, baseline_report=baseline_report)

    tools = analysis["categories"]["Tools"]
    garden = analysis["categories"]["Garden"]

    assert analysis["underperforming_categories"] == ["Tools"]
    assert tools["underperforming"] is True
    assert tools["trend"] is not None
    assert tools["trend"]["direction"] == "declining"
    assert tools["trend"]["delta_accuracy_exact_match_pct"] == -50.0
    assert "Prioritize category-specific source-selection tuning" in tools["recommendation"]
    assert "Accuracy dropped 50.0 points versus baseline" in tools["recommendation"]
    assert garden["trend"] is not None
    assert garden["trend"]["direction"] == "new"
    assert "This category is new in the current report" in garden["recommendation"]
    assert "⚠️ Tools" in analysis["comparison_visualization"]
    assert "↓ -50.0 pts" in analysis["comparison_visualization"]


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
    assert report["summary"]["mean_reciprocal_rank"] == 0.5
    assert report["summary"]["precision_at_1"] == 0.5
    assert report["summary"]["recall_at_1"] == 0.5
    assert report["summary"]["selection_breakdown"] == {"heuristic": 2}
    assert report["summary"]["accuracy_confidence_interval_95"]["sample_size"] == 2
    assert report["category_breakdown"]["Kitchen"]["sample_size"] == 1
    assert report["category_analysis"]["underperforming_categories"] == ["Kitchen"]
    assert report["category_analysis"]["categories"]["Kitchen"]["underperforming"] is True
    assert report["category_analysis"]["categories"]["Kitchen"]["trend"] is None
    assert "No baseline history exists yet" in report["category_analysis"]["categories"]["Kitchen"]["recommendation"]
    assert report["difficulty_breakdown"]["medium"]["sample_size"] == 1
    assert report["results"][0]["exact_match"] is True
    assert report["results"][1]["exact_match"] is False
    assert report["results"][0]["score"] > 0.0
    assert report["results"][0]["correct_rank"] == 1
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
    assert report["summary"]["precision_at_1"] == 1.0
    assert report["results"][0]["predicted_source_url"] == "https://acme.com/product/acme-widget"
    assert report["results"][0]["correct_rank"] == 1


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
    assert llm_report["results"][0]["correct_rank"] == 1
    assert fallback_report["summary"]["selection_breakdown"] == {"heuristic_fallback": 1}
    assert fallback_report["results"][0]["predicted_source_url"] == "https://acme.com/product/acme-widget"


def test_write_report_persists_json(tmp_path: Path) -> None:
    output_path = tmp_path / "reports" / "benchmark.json"
    report: dict[str, object] = {"summary": {"accuracy_exact_match_pct": 100.0}, "results": []}

    write_report(report, output_path)

    saved = cast(dict[str, object], json.loads(output_path.read_text(encoding="utf-8")))
    assert saved == report


def test_generate_markdown_report_renders_human_readable_tables() -> None:
    report = BenchmarkReport(
        report_version="2.0",
        generated_at="2026-04-16T12:00:00+00:00",
        dataset_path="/tmp/dataset.json",
        mode="heuristic",
        cache_dir="/tmp/cache",
        dataset_validation={"valid": True},
        metadata={
            "started_at": "2026-04-16T12:00:00+00:00",
            "completed_at": "2026-04-16T12:00:01+00:00",
            "duration_ms": 10.0,
            "config": {
                "mode": "heuristic",
                "cache_dir": "/tmp/cache",
                "llm_model": "gpt-4o-mini",
                "llm_provider": "openai",
                "llm_base_url": None,
            },
        },
        summary={
            "total_examples": 1,
            "matched_examples": 1,
            "accuracy_exact_match_pct": 100.0,
            "mean_reciprocal_rank": 1.0,
            "precision_at_1": 1.0,
            "recall_at_1": 1.0,
            "accuracy_confidence_interval_95": {
                "confidence_level": 0.95,
                "lower_bound_pct": 100.0,
                "upper_bound_pct": 100.0,
                "margin_of_error_pct": 0.0,
                "sample_size": 1,
                "method": "normal_approximation_binary_mean",
            },
            "total_duration_ms": 10.0,
            "average_duration_ms": 10.0,
            "total_selection_cost_usd": 0.0,
            "selection_breakdown": {"heuristic": 1},
            "error_count": 0,
        },
        category_breakdown={
            "Tools": {
                "sample_size": 1,
                "matched_examples": 1,
                "accuracy_exact_match_pct": 100.0,
                "mean_reciprocal_rank": 1.0,
                "precision_at_1": 1.0,
                "recall_at_1": 1.0,
                "average_duration_ms": 10.0,
                "error_count": 0,
            }
        },
        category_analysis={
            "underperforming_threshold_pct": 70.0,
            "underperforming_categories": [],
            "comparison_visualization": "Status Category          Accuracy Bar            Accuracy Trend\n------ ---------------- -------------------- -------- ----------------\n✅ Tools            ████████████████████  100.0% (1/1) ↑ +50.0 pts",
            "categories": {
                "Tools": {
                    "metrics": {
                        "sample_size": 1,
                        "matched_examples": 1,
                        "accuracy_exact_match_pct": 100.0,
                        "mean_reciprocal_rank": 1.0,
                        "precision_at_1": 1.0,
                        "recall_at_1": 1.0,
                        "average_duration_ms": 10.0,
                        "error_count": 0,
                    },
                    "underperforming": False,
                    "recommendation": "Maintain the current ranking strategy for Tools and reuse its strongest source signals in adjacent categories.",
                    "trend": {
                        "baseline_accuracy_exact_match_pct": 50.0,
                        "current_accuracy_exact_match_pct": 100.0,
                        "delta_accuracy_exact_match_pct": 50.0,
                        "baseline_sample_size": 2,
                        "current_sample_size": 1,
                        "direction": "improving",
                    },
                    "visualization": "✅ Tools            ████████████████████  100.0% (1/1) ↑ +50.0 pts",
                }
            },
        },
        difficulty_breakdown={
            "easy": {
                "sample_size": 1,
                "matched_examples": 1,
                "accuracy_exact_match_pct": 100.0,
                "mean_reciprocal_rank": 1.0,
                "precision_at_1": 1.0,
                "recall_at_1": 1.0,
                "average_duration_ms": 10.0,
                "error_count": 0,
            }
        },
        baseline_comparison={
            "baseline_path": "/tmp/reports/baseline.json",
            "compared_at": "2026-04-16T12:00:01+00:00",
            "metrics": {"accuracy_exact_match_pct": {"baseline": 50.0, "current": 100.0, "delta": 50.0}},
        },
        results=[
            _result_row(
                index=0,
                query="12345 Acme Widget",
                expected_source_url="https://acme.com/widget",
                predicted_source_url="https://acme.com/widget",
                exact_match=True,
                score=8.4,
                correct_rank=1,
                reciprocal_rank=1.0,
                precision_at_1=1.0,
                recall_at_1=1.0,
                duration_ms=10.0,
                category="Tools",
                difficulty="easy",
            )
        ],
    )

    markdown = generate_markdown_report(report)

    assert "# AI Search Benchmark Report" in markdown
    assert "## Summary Metrics" in markdown
    assert "## Baseline Comparison" in markdown
    assert "## Category Analysis" in markdown
    assert "## Category Comparison Visualization" in markdown
    assert "## Per-Example Results" in markdown
    assert "Maintain the current ranking strategy for Tools" in markdown
    assert "| Tools | 1 | 100.000 |" in markdown


def test_main_writes_reports_and_returns_zero(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
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

    reports_dir = tmp_path / "reports"
    reports_dir.mkdir()
    baseline_path = reports_dir / "baseline.json"
    _ = baseline_path.write_text(
        json.dumps(
            {
                "summary": {
                    "accuracy_exact_match_pct": 50.0,
                    "mean_reciprocal_rank": 0.5,
                    "precision_at_1": 0.5,
                    "recall_at_1": 0.5,
                },
                "category_breakdown": {
                    "Tools": {
                        "sample_size": 2,
                        "matched_examples": 1,
                        "accuracy_exact_match_pct": 50.0,
                        "mean_reciprocal_rank": 0.5,
                        "precision_at_1": 0.5,
                        "recall_at_1": 0.5,
                        "average_duration_ms": 12.0,
                        "error_count": 0,
                    }
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(benchmark_ai_search, "REPORTS_DIR", reports_dir)
    monkeypatch.setattr(benchmark_ai_search, "BASELINE_REPORT_PATH", baseline_path)

    exit_code = main(["--dataset", str(dataset_path)])
    stdout = capsys.readouterr().out
    json_reports = sorted(reports_dir.glob("benchmark_*.json"))
    markdown_reports = sorted(reports_dir.glob("benchmark_*.md"))
    assert len(json_reports) == 1
    assert len(markdown_reports) == 1

    saved = cast(BenchmarkReport, json.loads(json_reports[0].read_text(encoding="utf-8")))
    markdown = markdown_reports[0].read_text(encoding="utf-8")

    assert exit_code == 0
    assert saved["summary"]["matched_examples"] == 1
    assert saved["baseline_comparison"] is not None
    assert saved["category_breakdown"]["Tools"]["sample_size"] == 1
    tools_trend = saved["category_analysis"]["categories"]["Tools"]["trend"]
    assert tools_trend is not None
    assert tools_trend["direction"] == "improving"
    assert saved["difficulty_breakdown"]["easy"]["sample_size"] == 1
    assert saved["metadata"]["config"]["mode"] == "heuristic"
    assert "# AI Search Benchmark Report" in stdout
    assert "JSON report:" in stdout
    assert "## Baseline Comparison" in markdown
    assert "## Category Analysis" in markdown
    assert "## Per-Example Results" in markdown


def test_main_returns_nonzero_for_invalid_dataset(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    invalid_dataset_path = tmp_path / "invalid.json"
    _ = invalid_dataset_path.write_text(json.dumps({"entries": []}), encoding="utf-8")

    exit_code = main(["--dataset", str(invalid_dataset_path)])
    stderr = capsys.readouterr().err

    assert exit_code == 1
    assert "Missing required field" in stderr or "Schema validation error" in stderr
