from __future__ import annotations

import json
from pathlib import Path
from typing import cast

import pytest

import scripts.compare_benchmarks as compare_benchmarks
from scripts.compare_benchmarks import BenchmarkComparator, ComparisonReport, main, parse_args


def _result_row(
    *,
    index: int,
    exact_match: bool,
    reciprocal_rank: float,
    precision_at_1: float,
    recall_at_1: float,
) -> dict[str, object]:
    return {
        "index": index,
        "query": f"SKU-{index:03d} Acme Product",
        "expected_source_url": f"https://example.com/products/{index:03d}",
        "exact_match": exact_match,
        "reciprocal_rank": reciprocal_rank,
        "precision_at_1": precision_at_1,
        "recall_at_1": recall_at_1,
    }


def _report_payload(results: list[dict[str, object]]) -> dict[str, object]:
    return {
        "generated_at": "2026-04-16T12:00:00+00:00",
        "dataset_path": "data/golden_dataset_v1.json",
        "mode": "heuristic",
        "results": results,
    }


def _write_report(tmp_path: Path, name: str, results: list[dict[str, object]]) -> Path:
    report_path = tmp_path / name
    _ = report_path.write_text(json.dumps(_report_payload(results), indent=2), encoding="utf-8")
    return report_path


def _significant_improvement_fixture() -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    report_a_results: list[dict[str, object]] = []
    report_b_results: list[dict[str, object]] = []

    improved_indexes = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9}
    for index in range(12):
        improved = index in improved_indexes
        report_a_results.append(
            _result_row(
                index=index,
                exact_match=False,
                reciprocal_rank=0.0,
                precision_at_1=0.0,
                recall_at_1=0.0,
            )
        )
        report_b_results.append(
            _result_row(
                index=index,
                exact_match=improved,
                reciprocal_rank=1.0 if improved else 0.0,
                precision_at_1=1.0 if improved else 0.0,
                recall_at_1=1.0 if improved else 0.0,
            )
        )

    return report_a_results, report_b_results


def test_parse_args_supports_positional_and_flag_inputs() -> None:
    positional_args = parse_args(["report-a.json", "report-b.json", "--output", "comparison.json"])
    flag_args = parse_args(["--report-a", "alpha.json", "--report-b", "beta.json"])

    assert positional_args.report_a == Path("report-a.json")
    assert positional_args.report_b == Path("report-b.json")
    assert positional_args.output == Path("comparison.json")
    assert flag_args.report_a == Path("alpha.json")
    assert flag_args.report_b == Path("beta.json")


def test_benchmark_comparator_reports_significant_improvement_with_effect_size(tmp_path: Path) -> None:
    report_a_results, report_b_results = _significant_improvement_fixture()
    report_a_path = _write_report(tmp_path, "report-a.json", report_a_results)
    report_b_path = _write_report(tmp_path, "report-b.json", report_b_results)

    report = BenchmarkComparator(report_a_path, report_b_path).compare()
    accuracy = report["comparisons"]["accuracy_exact_match"]

    assert report["summary"]["decision"] == "significant_improvement"
    assert report["summary"]["exit_code"] == 0
    assert accuracy["paired_t_test"]["p_value"] < 0.05
    assert accuracy["wilcoxon_signed_rank"]["p_value"] < 0.05
    assert accuracy["significant"] is True
    assert accuracy["cohens_d"] is not None
    assert accuracy["cohens_d"] > 0.8
    assert accuracy["effect_size_interpretation"] == "large"
    assert accuracy["confidence_interval_95"]["lower_bound"] > 0.0
    assert accuracy["confidence_interval_95"]["upper_bound"] > 0.0


def test_benchmark_comparator_returns_regression_exit_code_for_significant_drop(tmp_path: Path) -> None:
    report_a_results, report_b_results = _significant_improvement_fixture()
    report_a_path = _write_report(tmp_path, "baseline.json", report_b_results)
    report_b_path = _write_report(tmp_path, "challenger.json", report_a_results)

    report = BenchmarkComparator(report_a_path, report_b_path).compare()

    assert report["summary"]["decision"] == "significant_regression"
    assert report["summary"]["exit_code"] == 1


def test_benchmark_comparator_handles_identical_reports_as_no_difference(tmp_path: Path) -> None:
    report_a_results, _ = _significant_improvement_fixture()
    report_a_path = _write_report(tmp_path, "report-a.json", report_a_results)
    report_b_path = _write_report(tmp_path, "report-b.json", report_a_results)

    report = BenchmarkComparator(report_a_path, report_b_path).compare()
    accuracy = report["comparisons"]["accuracy_exact_match"]

    assert report["summary"]["decision"] == "no_significant_difference"
    assert report["summary"]["exit_code"] == 2
    assert accuracy["paired_t_test"]["p_value"] == 1.0
    assert accuracy["wilcoxon_signed_rank"]["p_value"] == 1.0
    assert accuracy["significant"] is False


def test_benchmark_comparator_requires_matching_paired_examples(tmp_path: Path) -> None:
    report_a_path = _write_report(
        tmp_path,
        "report-a.json",
        [_result_row(index=0, exact_match=False, reciprocal_rank=0.0, precision_at_1=0.0, recall_at_1=0.0)],
    )
    report_b_path = _write_report(
        tmp_path,
        "report-b.json",
        [_result_row(index=1, exact_match=True, reciprocal_rank=1.0, precision_at_1=1.0, recall_at_1=1.0)],
    )

    with pytest.raises(ValueError, match="same paired examples"):
        _ = BenchmarkComparator(report_a_path, report_b_path).compare()


def test_main_writes_reports_and_returns_neutral_exit_code(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    report_a_results, _ = _significant_improvement_fixture()
    report_a_path = _write_report(tmp_path, "report-a.json", report_a_results)
    report_b_path = _write_report(tmp_path, "report-b.json", report_a_results)
    reports_dir = tmp_path / "reports"
    reports_dir.mkdir()
    monkeypatch.setattr(compare_benchmarks, "REPORTS_DIR", reports_dir)

    exit_code = main([str(report_a_path), str(report_b_path)])
    stdout = capsys.readouterr().out
    json_reports = sorted(reports_dir.glob("benchmark_comparison_*.json"))
    markdown_reports = sorted(reports_dir.glob("benchmark_comparison_*.md"))

    assert exit_code == 2
    assert len(json_reports) == 1
    assert len(markdown_reports) == 1

    payload = cast(ComparisonReport, json.loads(json_reports[0].read_text(encoding="utf-8")))
    markdown = markdown_reports[0].read_text(encoding="utf-8")

    assert payload["summary"]["decision"] == "no_significant_difference"
    assert payload["summary"]["primary_metric"] == "accuracy_exact_match"
    assert "# Benchmark Comparison Report" in stdout
    assert "JSON report:" in stdout
    assert "Significance is claimed only when both paired tests report p < 0.05." in markdown
