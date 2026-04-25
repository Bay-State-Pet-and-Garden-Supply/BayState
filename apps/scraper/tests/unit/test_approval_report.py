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

    assert report["approval_state"] == "Request More Data"
    assert report["approval_options"] == ["Approve", "Deny", "Request More Data"]
    assert report["cost_blocker_summary"]["missing_credentials"] == ["SERPER_API_KEY", "LLM_API_KEY", "SCRAPER_API_KEY"]
    assert all(item["status"] == "blocked_pending_live_baseline_and_manual_approval" for item in report["tuning_recommendations"])
    assert "## Baseline And Offline Metrics" in markdown
    assert "## Lowest Brand Accuracy" in markdown
    assert "## Lowest Category Accuracy" in markdown
    assert "## Confusion Matrix Summary" in markdown
    assert "`Request More Data`" in markdown
    assert json.loads(json_path.read_text(encoding="utf-8"))["approval_state"] == "Request More Data"
    assert markdown_path.exists()


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
            "--output-dir",
            str(output_dir),
        ]
    )
    generate_output = capsys.readouterr().out
    check_exit = main(["check-approval", "--approval-artifact", str(output_dir / "approval-report.json")])
    check_output = capsys.readouterr()

    assert generate_exit == 0
    assert "Approval state: Request More Data" in generate_output
    assert (output_dir / "approval-report.json").exists()
    assert (output_dir / "approval-report.md").exists()
    assert check_exit == 1
    assert "approval required" in check_output.err


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
