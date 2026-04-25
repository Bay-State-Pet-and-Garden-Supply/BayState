from __future__ import annotations

import copy

import pytest

from tests.benchmarks.unified.report_contract import (
    BenchmarkReportValidationError,
    build_pass_fail_comparison,
    generate_markdown_report,
    validate_benchmark_report,
)


def _sample_report() -> dict[str, object]:
    report: dict[str, object] = {
        "run_id": "run-20260425-001",
        "commit_sha": "abcdef1",
        "generated_at": "2026-04-25T12:00:00Z",
        "dataset_id": "golden-v3-full",
        "top1_official_accuracy": 0.91,
        "retailer_false_positive_rate": 0.04,
        "field_correctness": 0.87,
        "cost_usd": 12.345678,
        "latency_ms": 1450.25,
        "brand_breakdown": {
            "Acme": {
                "examples": 12,
                "top1_official_accuracy": 0.92,
                "retailer_false_positive_rate": 0.03,
                "field_correctness": 0.88,
            }
        },
        "category_breakdown": {
            "tools": {
                "examples": 12,
                "top1_official_accuracy": 0.92,
                "retailer_false_positive_rate": 0.03,
                "field_correctness": 0.88,
            }
        },
        "confusion_matrix": {
            "official": {"official": 11, "retailer": 1},
            "retailer": {"official": 0, "retailer": 3},
        },
        "model_provider_metadata": {
            "search_provider": "cached-serp",
            "llm_provider": "offline-fixture",
            "model": "none",
            "live_api_calls": 0,
        },
    }
    report["pass_fail"] = build_pass_fail_comparison(
        report,
        {
            "field_correctness": 0.85,
            "retailer_false_positive_rate": 0.05,
            "top1_official_accuracy": 0.9,
        },
    )
    return report


def test_sample_json_validates_against_benchmark_report_schema() -> None:
    report = _sample_report()

    validated = validate_benchmark_report(report)

    assert validated["run_id"] == "run-20260425-001"
    assert validated["top1_official_accuracy"] == 0.91
    assert validated["pass_fail"]["decision"] == "pass"


def test_missing_required_field_fails_deterministically_with_field_name() -> None:
    report = _sample_report()
    del report["top1_official_accuracy"]

    with pytest.raises(BenchmarkReportValidationError, match="missing required field: top1_official_accuracy"):
        validate_benchmark_report(report)


def test_markdown_generation_from_json_works_offline() -> None:
    markdown = generate_markdown_report(_sample_report())

    assert "# Benchmark Tuning Report" in markdown
    assert "Run ID: `run-20260425-001`" in markdown
    assert "| Top-1 official accuracy | 0.9100 |" in markdown
    assert "| retailer_false_positive_rate | 0.040000 | lte | 0.050000 | true |" in markdown
    assert "### Brand Breakdown" in markdown


def test_pass_fail_comparison_output_is_deterministic_and_machine_readable() -> None:
    report = _sample_report()
    thresholds = {
        "top1_official_accuracy": 0.95,
        "field_correctness": 0.85,
        "retailer_false_positive_rate": 0.05,
    }

    first = build_pass_fail_comparison(report, thresholds)
    second = build_pass_fail_comparison(copy.deepcopy(report), dict(reversed(thresholds.items())))

    assert first == second
    assert first["schema_version"] == "benchmark-pass-fail-v1"
    assert first["decision"] == "fail"
    assert [check["metric"] for check in first["checks"]] == [
        "field_correctness",
        "retailer_false_positive_rate",
        "top1_official_accuracy",
    ]
