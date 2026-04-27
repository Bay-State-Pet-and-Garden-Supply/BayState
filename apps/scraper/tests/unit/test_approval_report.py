from __future__ import annotations

import json
from pathlib import Path

import pytest

from tests.benchmarks.unified.approval_report import (
    ApprovalGateError,
    build_approval_report,
    main,
    render_approval_markdown,
    require_tuning_approval,
    write_approval_artifacts,
)


def test_approval_report_requests_more_data_and_marks_recommendations_blocked(tmp_path: Path) -> None:
    report = build_approval_report(
        cv_report=_cv_report(),
        baseline_evidence=_baseline_blocker_evidence(),
        cost_evidence=_cost_blocker_evidence(),
        generated_at="2026-04-25T00:00:00Z",
    )
    markdown = render_approval_markdown(report)
    json_path, markdown_path = write_approval_artifacts(report, tmp_path)

    assert report["recommended_state"] == "Request More Data"
    assert report["approval_state"] is None
    assert report["live_baseline_summary"] is None
    assert report["approval_options"] == ["Approve", "Deny", "Request More Data"]
    assert report["cost_blocker_summary"]["missing_credentials"] == ["SERPER_API_KEY", "LLM_API_KEY", "SCRAPER_API_KEY"]
    assert all(item["status"] == "blocked_pending_live_baseline_and_manual_approval" for item in report["tuning_recommendations"])
    assert "## Baseline And Offline Metrics" in markdown
    assert "## Lowest Brand Accuracy" in markdown
    assert "## Lowest Category Accuracy" in markdown
    assert "## Confusion Matrix Summary" in markdown
    assert "`Request More Data`" in markdown
    payload = json.loads(json_path.read_text(encoding="utf-8"))
    assert payload["recommended_state"] == "Request More Data"
    assert payload["approval_state"] is None
    assert markdown_path.exists()


def test_approval_report_recommends_approve_when_live_baseline_and_cost_preflight_are_present() -> None:
    report = build_approval_report(
        cv_report=_cv_report(),
        baseline_evidence=_baseline_ready_evidence(),
        cost_evidence=_cost_ready_evidence(),
        generated_at="2026-04-25T00:00:00Z",
    )

    assert report["recommended_state"] == "Approve"
    assert report["approval_state"] is None
    assert report["live_baseline_summary"] is None
    assert report["cost_blocker_summary"]["live_baseline_runs_completed"] == 3
    assert report["cost_blocker_summary"]["max_cost_preflight_supported"] is True
    assert report["cost_blocker_summary"]["blockers"] == []


def test_approval_report_includes_live_baseline_summary_when_reports_are_provided() -> None:
    report = build_approval_report(
        cv_report=_cv_report(),
        baseline_evidence=_baseline_ready_evidence(),
        cost_evidence=_cost_ready_evidence(),
        baseline_reports=[_live_baseline_report("baseline-1", 0.48, 0.38, 42000.0), _live_baseline_report("baseline-2", 0.5, 0.34, 45000.0)],
        generated_at="2026-04-25T00:00:00Z",
    )
    markdown = render_approval_markdown(report)

    assert report["live_baseline_summary"] is not None
    assert report["live_baseline_summary"]["runs"] == 2
    assert report["live_baseline_summary"]["aggregate_metrics"]["top1_official_accuracy"]["mean"] == 0.49
    assert "## Live Baseline Summary" in markdown
    assert "| baseline-1 | 2026-04-27T00:00:00Z | 0.480000 | 0.380000 | 0.480000 | 0.050000 | 42000.000 |" in markdown


def test_missing_approval_artifact_blocks_tuning(tmp_path: Path) -> None:
    with pytest.raises(ApprovalGateError, match="approval required"):
        require_tuning_approval(tmp_path / "missing-approval.json")


def test_non_approved_artifact_blocks_tuning(tmp_path: Path) -> None:
    approval_path = tmp_path / "approval-report.json"
    approval_path.write_text(json.dumps({"approval_state": "Request More Data"}), encoding="utf-8")

    with pytest.raises(ApprovalGateError, match="approval required"):
        require_tuning_approval(approval_path)


def test_approved_artifact_allows_tuning(tmp_path: Path) -> None:
    approval_path = tmp_path / "approval-report.json"
    approval_path.write_text(json.dumps({"approval_state": "Approve"}), encoding="utf-8")

    require_tuning_approval(approval_path)


def test_generate_and_check_approval_commands(tmp_path: Path, capsys) -> None:
    cv_path = tmp_path / "offline-cv-report.json"
    baseline_path = tmp_path / "task-6-baseline-runs.txt"
    cost_path = tmp_path / "task-6-cost-cap.txt"
    output_dir = tmp_path / "artifacts"
    cv_path.write_text(json.dumps(_cv_report()), encoding="utf-8")
    baseline_path.write_text(_baseline_blocker_evidence(), encoding="utf-8")
    cost_path.write_text(_cost_blocker_evidence(), encoding="utf-8")

    generate_exit = main(
        [
            "generate",
            "--cv-report",
            str(cv_path),
            "--baseline-evidence",
            str(baseline_path),
            "--cost-evidence",
            str(cost_path),
            "--baseline-artifacts-dir",
            str(output_dir / "missing-baselines"),
            "--output-dir",
            str(output_dir),
        ]
    )
    generate_output = capsys.readouterr().out
    check_exit = main(["check-approval", "--approval-artifact", str(output_dir / "approval-report.json")])
    check_output = capsys.readouterr()

    assert generate_exit == 0
    assert "Recommended state: Request More Data" in generate_output
    assert "Approval state: None" in generate_output
    assert (output_dir / "approval-report.json").exists()
    assert (output_dir / "approval-report.md").exists()
    assert check_exit == 1
    assert "approval required" in check_output.err


def test_record_approval_command_sets_explicit_approval_and_unblocks_check(tmp_path: Path, capsys) -> None:
    cv_path = tmp_path / "offline-cv-report.json"
    baseline_path = tmp_path / "task-6-baseline-runs.txt"
    cost_path = tmp_path / "task-6-cost-cap.txt"
    output_dir = tmp_path / "artifacts"
    cv_path.write_text(json.dumps(_cv_report()), encoding="utf-8")
    baseline_path.write_text(_baseline_ready_evidence(), encoding="utf-8")
    cost_path.write_text(_cost_ready_evidence(), encoding="utf-8")

    generate_exit = main(
        [
            "generate",
            "--cv-report",
            str(cv_path),
            "--baseline-evidence",
            str(baseline_path),
            "--cost-evidence",
            str(cost_path),
            "--baseline-artifacts-dir",
            str(output_dir / "missing-baselines"),
            "--output-dir",
            str(output_dir),
        ]
    )
    _ = capsys.readouterr()

    record_exit = main(
        [
            "record-approval",
            "--approval-artifact",
            str(output_dir / "approval-report.json"),
            "--state",
            "Approve",
            "--note",
            "Live baseline reviewed and approved",
        ]
    )
    record_output = capsys.readouterr().out

    check_exit = main(["check-approval", "--approval-artifact", str(output_dir / "approval-report.json")])
    check_output = capsys.readouterr().out

    payload = json.loads((output_dir / "approval-report.json").read_text(encoding="utf-8"))

    assert generate_exit == 0
    assert record_exit == 0
    assert "Recorded approval state: Approve" in record_output
    assert payload["recommended_state"] == "Approve"
    assert payload["approval_state"] == "Approve"
    assert payload["approval_note"] == "Live baseline reviewed and approved"
    assert check_exit == 0
    assert "approval present" in check_output


def _cv_report() -> dict[str, object]:
    return {
        "run_id": "offline-cv",
        "dataset_id": "fixture:4",
        "top1_official_accuracy": 0.5,
        "retailer_false_positive_rate": 0.25,
        "field_correctness": 0.5,
        "aggregate_metrics": {
            "top1_official_accuracy": {"mean": 0.5, "std": 0.2, "confidence_interval_95": {"low": 0.304, "high": 0.696}},
            "retailer_false_positive_rate": {"mean": 0.25, "std": 0.1, "confidence_interval_95": {"low": 0.152, "high": 0.348}},
            "field_correctness": {"mean": 0.5, "std": 0.2, "confidence_interval_95": {"low": 0.304, "high": 0.696}},
        },
        "folds": [
            {"index": 0, "examples": 2, "top1_official_accuracy": 0.5, "retailer_false_positive_rate": 0.0, "field_correctness": 0.5},
            {"index": 1, "examples": 2, "top1_official_accuracy": 0.5, "retailer_false_positive_rate": 0.5, "field_correctness": 0.5},
        ],
        "brand_breakdown": {
            "Acme": {"examples": 2, "top1_official_accuracy": 1.0, "retailer_false_positive_rate": 0.0, "field_correctness": 1.0},
            "Bravo": {"examples": 2, "top1_official_accuracy": 0.0, "retailer_false_positive_rate": 0.5, "field_correctness": 0.0},
        },
        "category_breakdown": {
            "Tools": {"examples": 2, "top1_official_accuracy": 1.0, "retailer_false_positive_rate": 0.0, "field_correctness": 1.0},
            "Garden": {"examples": 2, "top1_official_accuracy": 0.0, "retailer_false_positive_rate": 0.5, "field_correctness": 0.0},
        },
        "confusion_matrix": {"official": {"official": 2, "retailer": 1, "other": 1}, "retailer": {"official": 0, "retailer": 0, "other": 0}},
    }


def _baseline_blocker_evidence() -> str:
    return """SERPER_API_KEY=missing
LLM_API_KEY=missing
SCRAPER_API_KEY=missing
Three baseline live runs could not be executed because required live benchmark credentials are unavailable.
"""


def _cost_blocker_evidence() -> str:
    return "No repository-supported `--max-cost` flag or live cost preflight estimator exists yet."


def _baseline_ready_evidence() -> str:
    return """SERPER_API_KEY=present
LLM_API_KEY=present
SCRAPER_API_KEY=present
baseline-1: completed
baseline-2: completed
baseline-3: completed
"""


def _cost_ready_evidence() -> str:
    return "Repository-supported --max-cost-usd preflight is available and was validated before live runs."


def _live_baseline_report(run_id: str, accuracy: float, retailer_fpr: float, latency_ms: float) -> dict[str, object]:
    return {
        "run_id": run_id,
        "commit_sha": "abcdef1",
        "generated_at": "2026-04-27T00:00:00Z",
        "dataset_id": "golden_dataset_v3.json:50",
        "top1_official_accuracy": accuracy,
        "retailer_false_positive_rate": retailer_fpr,
        "field_correctness": accuracy,
        "cost_usd": 0.05,
        "latency_ms": latency_ms,
        "brand_breakdown": {
            "Acme": {
                "examples": 2,
                "top1_official_accuracy": accuracy,
                "retailer_false_positive_rate": retailer_fpr,
                "field_correctness": accuracy,
            }
        },
        "category_breakdown": {
            "Tools": {
                "examples": 2,
                "top1_official_accuracy": accuracy,
                "retailer_false_positive_rate": retailer_fpr,
                "field_correctness": accuracy,
            }
        },
        "confusion_matrix": {"official": {"official": 2, "retailer": 0, "other": 0}},
        "model_provider_metadata": {
            "search_provider": "live-serper",
            "llm_provider": "none",
            "model": "none",
            "live_api_calls": 50,
        },
        "pass_fail": {
            "schema_version": "benchmark-pass-fail-v1",
            "decision": "pass",
            "checks": [
                {"metric": "field_correctness", "actual": accuracy, "threshold": 0.0, "operator": "gte", "passed": True},
                {"metric": "retailer_false_positive_rate", "actual": retailer_fpr, "threshold": 1.0, "operator": "lte", "passed": True},
                {"metric": "top1_official_accuracy", "actual": accuracy, "threshold": 0.0, "operator": "gte", "passed": True},
            ],
        },
    }
