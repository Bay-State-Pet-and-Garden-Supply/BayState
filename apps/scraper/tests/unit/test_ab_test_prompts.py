from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import cast

import pytest
import yaml

import scripts.ab_test_prompts as ab_test_prompts
from scripts.ab_test_prompts import ABTestReport, ABTestRunner, load_strategy_config, parse_args, render_console_report, run_cli
from scripts.benchmark_ai_search import BenchmarkReport, BenchmarkResultRow, MetricsCalculator


def _result(url: str, title: str, description: str) -> dict[str, object]:
    return {
        "url": url,
        "title": title,
        "description": description,
        "provider": "serper",
        "result_type": "organic",
    }


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


def _write_dataset(tmp_path: Path, entries: Sequence[Mapping[str, object]], filename: str = "golden_dataset_v1.json") -> Path:
    dataset_path = tmp_path / filename
    _ = dataset_path.write_text(json.dumps(_dataset_payload(entries), indent=2), encoding="utf-8")
    return dataset_path


def _write_companion_fixture(dataset_path: Path, query_results: Mapping[str, Sequence[Mapping[str, object]]]) -> None:
    fixture_path = dataset_path.with_suffix(".search_results.json")
    payload = {
        "schema_version": 1,
        "entries": [{"query": query, "results": [dict(result) for result in results]} for query, results in query_results.items()],
    }
    _ = fixture_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _result_row(
    *,
    index: int,
    predicted_source_url: str | None,
    exact_match: bool,
    selection_method: str,
    error: str | None = None,
) -> BenchmarkResultRow:
    expected_source_url = f"https://example.com/products/{index:03d}"
    reciprocal_rank = 1.0 if exact_match else 0.0
    precision_at_1 = 1.0 if exact_match else 0.0
    recall_at_1 = 1.0 if exact_match else 0.0
    return BenchmarkResultRow(
        index=index,
        query=f"SKU-{index:03d} Acme Product",
        expected_source_url=expected_source_url,
        predicted_source_url=predicted_source_url,
        exact_match=exact_match,
        score=10.0 if exact_match else 0.0,
        correct_rank=1 if exact_match else None,
        reciprocal_rank=reciprocal_rank,
        precision_at_1=precision_at_1,
        recall_at_1=recall_at_1,
        duration_ms=10.0 + index,
        result_count=3,
        mode=selection_method,
        selection_method=selection_method,
        selection_cost_usd=0.0 if selection_method == "heuristic" else 0.001,
        category="Tools",
        difficulty="medium",
        rationale="pytest",
        error=error,
    )


def _benchmark_report(results: list[BenchmarkResultRow], *, mode: str) -> BenchmarkReport:
    calculator = MetricsCalculator()
    summary = calculator.calculate_metrics(results, execution_duration_ms=sum(float(row["duration_ms"]) for row in results))
    payload: object = {
        "report_version": "2.0",
        "generated_at": "2026-04-16T12:00:00+00:00",
        "dataset_path": "data/golden_dataset_v1.json",
        "mode": mode,
        "cache_dir": ".cache/ai_search",
        "dataset_validation": {"valid": True, "errors": [], "entry_count": len(results), "duplicate_count": 0},
        "metadata": {
            "started_at": "2026-04-16T12:00:00+00:00",
            "completed_at": "2026-04-16T12:00:01+00:00",
            "duration_ms": summary["total_duration_ms"],
            "config": {
                "mode": mode,
                "cache_dir": ".cache/ai_search",
                "llm_model": "gpt-4o-mini",
                "llm_provider": "openai",
                "llm_base_url": None,
            },
        },
        "summary": summary,
        "category_breakdown": calculator.calculate_breakdown(results, "category"),
        "category_analysis": {
            "underperforming_threshold_pct": 70.0,
            "underperforming_categories": [],
            "comparison_visualization": "",
            "categories": {},
        },
        "difficulty_breakdown": calculator.calculate_breakdown(results, "difficulty"),
        "baseline_comparison": None,
        "results": results,
    }
    return cast(BenchmarkReport, cast(object, payload))


def _make_fake_runner(report_map: Mapping[str, BenchmarkReport]):
    class FakeRunner:
        calls: list[dict[str, object]] = []

        def __init__(
            self,
            dataset_path: Path,
            *,
            mode: str,
            cache_dir: Path | None = None,
            llm_model: str = "gpt-4o-mini",
            llm_provider: str = "openai",
            llm_base_url: str | None = None,
            llm_api_key: str | None = None,
        ) -> None:
            self.dataset_path: Path = dataset_path
            self.mode: str = mode
            type(self).calls.append(
                {
                    "dataset_path": dataset_path,
                    "mode": mode,
                    "cache_dir": cache_dir,
                    "llm_model": llm_model,
                    "llm_provider": llm_provider,
                    "llm_base_url": llm_base_url,
                    "llm_api_key": llm_api_key,
                }
            )

        async def run(self) -> BenchmarkReport:
            return report_map[self.mode]

    return FakeRunner


def _significant_reports() -> tuple[BenchmarkReport, BenchmarkReport]:
    report_a_results: list[BenchmarkResultRow] = []
    report_b_results: list[BenchmarkResultRow] = []
    improved_indexes = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9}

    for index in range(12):
        expected_url = f"https://example.com/products/{index:03d}"
        report_a_results.append(
            _result_row(
                index=index,
                predicted_source_url=f"https://fallback.example.com/{index:03d}",
                exact_match=False,
                selection_method="heuristic",
            )
        )
        report_b_results.append(
            _result_row(
                index=index,
                predicted_source_url=expected_url if index in improved_indexes else f"https://fallback.example.com/{index:03d}",
                exact_match=index in improved_indexes,
                selection_method="llm",
            )
        )

    return _benchmark_report(report_a_results, mode="heuristic"), _benchmark_report(report_b_results, mode="llm")


def test_parse_args_supports_strategy_flags() -> None:
    args = parse_args(["--dataset", "data/golden.json", "--strategy-a", "heuristic", "--strategy-b", "llm", "--output", "ab.json"])

    assert args.dataset == Path("data/golden.json")
    assert args.strategy_a == "heuristic"
    assert args.strategy_b == "llm"
    assert args.output == Path("ab.json")


def test_load_strategy_config_supports_yaml_file_and_env_prefix(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    strategy_config_path = tmp_path / "strategy-b.yaml"
    strategy_payload = {
        "name": "llm-challenger",
        "mode": "llm",
        "cache_dir": "fixtures/cache",
        "llm_model": "gpt-4.1-mini",
        "llm_provider": "openai",
    }
    _ = strategy_config_path.write_text(yaml.safe_dump(strategy_payload), encoding="utf-8")

    monkeypatch.setenv("CUSTOM_AB_MODE", "heuristic")
    monkeypatch.setenv("CUSTOM_AB_NAME", "heuristic-baseline")

    file_strategy = load_strategy_config(str(strategy_config_path), label="B")
    env_strategy = load_strategy_config("env:CUSTOM_AB", label="A")

    assert file_strategy.name == "llm-challenger"
    assert file_strategy.mode == "llm"
    assert file_strategy.cache_dir == strategy_config_path.parent / "fixtures/cache"
    assert file_strategy.llm_model == "gpt-4.1-mini"
    assert env_strategy.name == "heuristic-baseline"
    assert env_strategy.mode == "heuristic"
    assert env_strategy.source == "env:CUSTOM_AB"


@pytest.mark.asyncio
async def test_ab_test_runner_recommends_strategy_b_for_significant_improvement(tmp_path: Path) -> None:
    report_a, report_b = _significant_reports()
    fake_runner = _make_fake_runner({"heuristic": report_a, "llm": report_b})

    report = await ABTestRunner(
        dataset_path=tmp_path / "golden.json",
        strategy_a_spec="heuristic",
        strategy_b_spec="llm",
        runner_cls=fake_runner,
    ).run_ab_test()

    assert report["recommendation"]["choice"] == "Use B"
    assert report["recommendation"]["winner"] == "B"
    assert report["recommendation"]["statistically_significant"] is True
    assert report["comparison_summary"]["decision"] == "significant_improvement"
    assert report["differing_examples_count"] == 10
    assert report["differing_examples"][0]["outcome"] == "strategy_b_only_correct"
    assert fake_runner.calls[0]["mode"] == "heuristic"
    assert fake_runner.calls[1]["mode"] == "llm"


@pytest.mark.asyncio
async def test_ab_test_runner_reports_no_difference_for_identical_results(tmp_path: Path) -> None:
    report_a, _ = _significant_reports()
    fake_runner = _make_fake_runner({"heuristic": report_a, "llm": report_a})

    report = await ABTestRunner(
        dataset_path=tmp_path / "golden.json",
        strategy_a_spec="heuristic",
        strategy_b_spec="llm",
        runner_cls=fake_runner,
    ).run_ab_test()

    rendered = render_console_report(report)

    assert report["recommendation"]["choice"] == "No difference"
    assert report["recommendation"]["winner"] is None
    assert report["recommendation"]["statistically_significant"] is False
    assert report["differing_examples_count"] == 0
    assert "Recommendation: No difference" in rendered


@pytest.mark.asyncio
async def test_ab_test_runner_supports_env_strategies_with_real_benchmark_runner(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
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
    dataset_path = _write_dataset(tmp_path, entries)
    _write_companion_fixture(
        dataset_path,
        {
            "12345 Acme Widget Acme Tools": [
                _result("https://www.amazon.com/acme-widget", "Acme Widget", "Amazon retailer listing"),
                _result(
                    "https://acme.com/product/acme-widget",
                    "Acme Widget | Official Product Page",
                    "Official Acme product page",
                ),
            ]
        },
    )
    monkeypatch.setenv("AB_TEST_STRATEGY_A_MODE", "heuristic")
    monkeypatch.setenv("AB_TEST_STRATEGY_B_MODE", "heuristic")

    report = await ABTestRunner(
        dataset_path=dataset_path,
        strategy_a_spec="env",
        strategy_b_spec="env:AB_TEST_STRATEGY_B",
    ).run_ab_test()

    assert report["strategy_a"]["mode"] == "heuristic"
    assert report["strategy_b"]["mode"] == "heuristic"
    assert report["recommendation"]["choice"] == "No difference"
    assert report["differing_examples_count"] == 0


def test_run_cli_writes_report_and_prints_recommendation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    expected_report_payload: object = {
        "report_version": "1.0",
        "generated_at": "2026-04-16T12:00:00+00:00",
        "dataset_path": "data/golden_dataset_v1.json",
        "strategy_a": {
            "label": "A",
            "name": "heuristic",
            "mode": "heuristic",
            "source": "inline:heuristic",
            "cache_dir": None,
            "llm_model": "gpt-4o-mini",
            "llm_provider": "openai",
            "llm_base_url": None,
            "llm_api_key_configured": False,
            "benchmark_summary": _benchmark_report(
                [_result_row(index=0, predicted_source_url=None, exact_match=False, selection_method="heuristic")], mode="heuristic"
            )["summary"],
        },
        "strategy_b": {
            "label": "B",
            "name": "llm",
            "mode": "llm",
            "source": "inline:llm",
            "cache_dir": None,
            "llm_model": "gpt-4o-mini",
            "llm_provider": "openai",
            "llm_base_url": None,
            "llm_api_key_configured": False,
            "benchmark_summary": _benchmark_report(
                [_result_row(index=0, predicted_source_url="https://example.com/products/000", exact_match=True, selection_method="llm")], mode="llm"
            )["summary"],
        },
        "comparison_summary": {
            "primary_metric": "accuracy_exact_match",
            "decision": "significant_improvement",
            "exit_code": 0,
            "paired_examples": 12,
            "significance_alpha": 0.05,
            "significance_rule": "both_tests_p_lt_0_05",
            "significant_metrics": ["accuracy_exact_match"],
            "improved_metrics": ["accuracy_exact_match"],
            "regressed_metrics": [],
        },
        "comparison_metrics": {
            "accuracy_exact_match": {
                "label": "Accuracy (Exact Match)",
                "value_format": "percentage",
                "higher_is_better": True,
                "sample_size": 12,
                "baseline_mean": 0.0,
                "current_mean": 0.833333,
                "mean_difference": 0.833333,
                "cohens_d": 1.2,
                "effect_size_interpretation": "large",
                "paired_t_test": {"statistic": 1.0, "p_value": 0.001, "significant": True, "valid": True, "note": None},
                "wilcoxon_signed_rank": {"statistic": 0.0, "p_value": 0.002, "significant": True, "valid": True, "note": None},
                "confidence_interval_95": {
                    "confidence_level": 0.95,
                    "mean_difference": 0.833333,
                    "lower_bound": 0.6,
                    "upper_bound": 1.0,
                    "margin_of_error": 0.2,
                    "sample_size": 12,
                    "method": "paired_mean_difference_t_interval",
                },
                "significant": True,
                "claim": "significant_improvement",
                "significance_rule": "both_tests_p_lt_0_05",
            }
        },
        "recommendation": {
            "choice": "Use B",
            "winner": "B",
            "statistically_significant": True,
            "primary_metric": "accuracy_exact_match",
            "reasons": ["llm significantly improved the primary accuracy metric over heuristic."],
        },
        "differing_examples_count": 1,
        "differing_examples": [
            {
                "index": 0,
                "query": "SKU-000 Acme Product",
                "expected_source_url": "https://example.com/products/000",
                "strategy_a_predicted_source_url": None,
                "strategy_b_predicted_source_url": "https://example.com/products/000",
                "strategy_a_exact_match": False,
                "strategy_b_exact_match": True,
                "strategy_a_selection_method": "heuristic",
                "strategy_b_selection_method": "llm",
                "strategy_a_error": None,
                "strategy_b_error": None,
                "outcome": "strategy_b_only_correct",
            }
        ],
    }
    expected_report = cast(ABTestReport, cast(object, expected_report_payload))

    class FakeABTestRunner:
        def __init__(self, dataset_path: Path, *, strategy_a_spec: str, strategy_b_spec: str) -> None:
            self.dataset_path: Path = dataset_path
            self.strategy_a_spec: str = strategy_a_spec
            self.strategy_b_spec: str = strategy_b_spec

        async def run_ab_test(self) -> ABTestReport:
            return expected_report

    output_path = tmp_path / "ab-test.json"
    monkeypatch.setattr(ab_test_prompts, "ABTestRunner", FakeABTestRunner)

    exit_code = run_cli(
        [
            "--dataset",
            "data/golden.json",
            "--strategy-a",
            "heuristic",
            "--strategy-b",
            "llm",
            "--output",
            str(output_path),
        ]
    )
    stdout = capsys.readouterr().out
    payload = cast(ABTestReport, json.loads(output_path.read_text(encoding="utf-8")))

    assert exit_code == 0
    assert payload["recommendation"]["choice"] == "Use B"
    assert "Recommendation: Use B" in stdout
    assert f"JSON report: {output_path}" in stdout
