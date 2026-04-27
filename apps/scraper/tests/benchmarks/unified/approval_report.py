"""Manual approval report and tuning gate for benchmark-driven scraper tuning.

The generated report captures an evidence-based recommendation. A separate
recorded approval state is required before tuning is allowed to proceed.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, TypedDict, cast

from tests.benchmarks.unified.report_contract import validate_benchmark_report


ApprovalState = Literal["Approve", "Deny", "Request More Data"]


class ApprovalGateError(RuntimeError):
    """Raised when tuning is attempted without explicit approval."""


class ApprovalReport(TypedDict):
    schema_version: str
    generated_at: str
    recommended_state: ApprovalState
    approval_state: ApprovalState | None
    approval_recorded_at: str | None
    approval_note: str | None
    state_reason: str
    baseline_summary: dict[str, object]
    live_baseline_summary: dict[str, object] | None
    cost_blocker_summary: dict[str, object]
    tuning_recommendations: list[dict[str, object]]
    approval_options: list[ApprovalState]


def build_approval_report(
    *,
    cv_report: Mapping[str, object],
    baseline_evidence: str,
    cost_evidence: str,
    baseline_reports: Sequence[Mapping[str, object]] | None = None,
    generated_at: str | None = None,
) -> ApprovalReport:
    """Build a deterministic approval report from offline CV metrics and blocker evidence."""

    missing_credentials = _missing_credentials(baseline_evidence)
    live_baseline_missing = "Three baseline live runs could not be executed" in baseline_evidence or bool(missing_credentials)
    cost_preflight_missing = "No repository-supported `--max-cost`" in cost_evidence or "No repository-supported --max-cost" in cost_evidence
    recommended_state: ApprovalState = "Request More Data" if live_baseline_missing or cost_preflight_missing else "Approve"

    return {
        "schema_version": "benchmark-approval-report-v1",
        "generated_at": generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "recommended_state": recommended_state,
        "approval_state": None,
        "approval_recorded_at": None,
        "approval_note": None,
        "state_reason": _state_reason(live_baseline_missing=live_baseline_missing, cost_preflight_missing=cost_preflight_missing),
        "baseline_summary": _baseline_summary(cv_report),
        "live_baseline_summary": _live_baseline_summary(baseline_reports or []),
        "cost_blocker_summary": {
            "live_baseline_runs_completed": 0 if live_baseline_missing else 3,
            "required_live_runs": 3,
            "missing_credentials": missing_credentials,
            "max_cost_preflight_supported": not cost_preflight_missing,
            "blockers": _blockers(live_baseline_missing=live_baseline_missing, cost_preflight_missing=cost_preflight_missing),
        },
        "tuning_recommendations": _tuning_recommendations(),
        "approval_options": ["Approve", "Deny", "Request More Data"],
    }


def render_approval_markdown(report: Mapping[str, object]) -> str:
    """Render a self-contained Markdown approval report."""

    recommended_state = _recommended_state(report)
    approval_state = _approval_state(report)
    approval_recorded_at = report.get("approval_recorded_at")
    approval_note = report.get("approval_note")
    baseline = cast(Mapping[str, object], report["baseline_summary"])
    live_baseline = cast(Mapping[str, object] | None, report.get("live_baseline_summary"))
    aggregate_metrics = cast(Mapping[str, Mapping[str, object]], baseline["aggregate_metrics"])
    cost_blockers = cast(Mapping[str, object], report["cost_blocker_summary"])
    lines = [
        "# Benchmark Tuning Approval Report",
        "",
        f"- Generated At: `{report['generated_at']}`",
        f"- Recommended State: `{recommended_state}`",
        f"- Recorded Approval: `{approval_state or 'pending'}`",
        f"- Reason: {report['state_reason']}",
        f"- Approval Options: {', '.join(cast(Sequence[str], report['approval_options']))}",
        "",
        "## Baseline And Offline Metrics",
        "",
        f"- Run ID: `{baseline['run_id']}`",
        f"- Dataset: `{baseline['dataset_id']}`",
        f"- Offline examples: {baseline['examples']}",
        f"- CV folds: {baseline['fold_count']}",
        "",
        "| Metric | Overall | Mean | Std | 95% CI |",
        "| --- | ---: | ---: | ---: | --- |",
    ]

    overall_metrics = cast(Mapping[str, float], baseline["overall_metrics"])
    for metric in ("top1_official_accuracy", "retailer_false_positive_rate", "field_correctness"):
        aggregate = aggregate_metrics.get(metric, {})
        ci = cast(Mapping[str, float], aggregate.get("confidence_interval_95", {"low": 0.0, "high": 0.0}))
        lines.append(
            f"| {metric} | {overall_metrics[metric]:.6f} | {float(aggregate.get('mean', 0.0)):.6f} | {float(aggregate.get('std', 0.0)):.6f} | [{ci['low']:.6f}, {ci['high']:.6f}] |"
        )

    lines.extend([
        "",
        "## Per-Fold Metrics",
        "",
        "| Fold | Examples | Top-1 Accuracy | Retailer FPR | Field Correctness |",
        "| ---: | ---: | ---: | ---: | ---: |",
    ])
    for fold in cast(Sequence[Mapping[str, object]], baseline["folds"]):
        lines.append(
            f"| {fold['index']} | {fold['examples']} | {fold['top1_official_accuracy']:.6f} | {fold['retailer_false_positive_rate']:.6f} | {fold['field_correctness']:.6f} |"
        )

    lines.extend(["", "## Lowest Brand Accuracy", "", _breakdown_table(cast(Sequence[Mapping[str, object]], baseline["lowest_brand_accuracy"]))])
    lines.extend(["", "## Lowest Category Accuracy", "", _breakdown_table(cast(Sequence[Mapping[str, object]], baseline["lowest_category_accuracy"]))])
    lines.extend(["", "## Confusion Matrix Summary", "", "| Expected | Actual | Count |", "| --- | --- | ---: |"])
    for item in cast(Sequence[Mapping[str, object]], baseline["confusion_matrix_summary"]):
        lines.append(f"| {item['expected']} | {item['actual']} | {item['count']} |")

    if live_baseline:
        lines.extend([
            "",
            "## Live Baseline Summary",
            "",
            f"- Runs: {live_baseline['runs']}",
            f"- Dataset: `{live_baseline['dataset_id']}`",
            "",
            "| Metric | Mean | Std |",
            "| --- | ---: | ---: |",
        ])
        aggregate = cast(Mapping[str, Mapping[str, float]], live_baseline["aggregate_metrics"])
        for metric in ("top1_official_accuracy", "retailer_false_positive_rate", "field_correctness", "cost_usd", "latency_ms"):
            lines.append(f"| {metric} | {aggregate[metric]['mean']:.6f} | {aggregate[metric]['std']:.6f} |")

        lines.extend([
            "",
            "| Run | Generated At | Top-1 Accuracy | Retailer FPR | Field Correctness | Cost USD | Latency ms |",
            "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
        ])
        for run in cast(Sequence[Mapping[str, object]], live_baseline["run_summaries"]):
            lines.append(
                f"| {run['run_id']} | {run['generated_at']} | {run['top1_official_accuracy']:.6f} | {run['retailer_false_positive_rate']:.6f} | {run['field_correctness']:.6f} | {run['cost_usd']:.6f} | {run['latency_ms']:.3f} |"
            )

    lines.extend([
        "",
        "## Cost And Blockers",
        "",
        f"- Live baseline runs completed: {cost_blockers['live_baseline_runs_completed']} / {cost_blockers['required_live_runs']}",
        f"- Missing credentials: {', '.join(cast(Sequence[str], cost_blockers['missing_credentials'])) or 'none'}",
        f"- Dollar-denominated max-cost preflight supported: {str(cost_blockers['max_cost_preflight_supported']).lower()}",
    ])
    for blocker in cast(Sequence[str], cost_blockers["blockers"]):
        lines.append(f"- Blocker: {blocker}")

    if approval_recorded_at:
        lines.append(f"- Approval Recorded At: `{approval_recorded_at}`")
    if isinstance(approval_note, str) and approval_note:
        lines.append(f"- Approval Note: {approval_note}")

    lines.extend(["", "## Candidate Tuning Recommendations", "", "| Candidate | Target | Expected Impact | Risk | Status |", "| --- | --- | --- | --- | --- |"])
    for recommendation in cast(Sequence[Mapping[str, object]], report["tuning_recommendations"]):
        lines.append(
            f"| {recommendation['candidate']} | {recommendation['target']} | {recommendation['expected_impact']} | {recommendation['risk']} | {recommendation['status']} |"
        )

    lines.extend([
        "",
        "## Gate Decision",
        "",
        "T8/T9 tuning must not start until an approval JSON artifact exists with `approval_state` set to `Approve`.",
    ])
    return "\n".join(lines) + "\n"


def write_approval_artifacts(report: Mapping[str, object], output_dir: Path, *, basename: str = "approval-report") -> tuple[Path, Path]:
    """Write JSON and Markdown approval artifacts."""

    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{basename}.json"
    markdown_path = output_dir / f"{basename}.md"
    json_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    markdown_path.write_text(render_approval_markdown(report), encoding="utf-8")
    return json_path, markdown_path


def record_tuning_approval(
    approval_artifact: Path,
    *,
    approval_state: ApprovalState,
    note: str | None = None,
    recorded_at: str | None = None,
) -> tuple[Path, Path]:
    """Record an explicit approval decision on an existing approval artifact."""

    payload = _load_json_object(approval_artifact)
    payload["recommended_state"] = _recommended_state(payload)
    payload["approval_state"] = approval_state
    payload["approval_recorded_at"] = recorded_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    payload["approval_note"] = note
    return write_approval_artifacts(payload, approval_artifact.parent, basename=approval_artifact.stem)


def require_tuning_approval(approval_artifact: Path) -> None:
    """Fail unless the approval artifact exists and explicitly approves tuning."""

    if not approval_artifact.exists():
        raise ApprovalGateError(f"approval required: missing approval artifact {approval_artifact}")
    payload = _load_json_object(approval_artifact)
    state = _approval_state(payload)
    if state != "Approve":
        raise ApprovalGateError(f"approval required: approval_state is {state!r}, expected 'Approve'")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Benchmark tuning approval report and gate")
    subparsers = parser.add_subparsers(dest="command", required=True)

    generate_parser = subparsers.add_parser("generate", help="Generate approval JSON and Markdown reports")
    generate_parser.add_argument("--cv-report", type=Path, required=True)
    generate_parser.add_argument("--baseline-evidence", type=Path, required=True)
    generate_parser.add_argument("--cost-evidence", type=Path, required=True)
    generate_parser.add_argument("--baseline-artifacts-dir", type=Path, default=None)
    generate_parser.add_argument("--output-dir", type=Path, required=True)

    record_parser = subparsers.add_parser("record-approval", help="Record an explicit approval decision on an existing approval report")
    record_parser.add_argument("--approval-artifact", type=Path, required=True)
    record_parser.add_argument("--state", choices=["Approve", "Deny", "Request More Data"], required=True)
    record_parser.add_argument("--note", default=None)

    check_parser = subparsers.add_parser("check-approval", help="Fail unless tuning has explicit approval")
    check_parser.add_argument("--approval-artifact", type=Path, required=True)

    args = parser.parse_args(argv)
    if args.command == "generate":
        report = build_approval_report(
            cv_report=_load_json_object(args.cv_report),
            baseline_evidence=args.baseline_evidence.read_text(encoding="utf-8"),
            cost_evidence=args.cost_evidence.read_text(encoding="utf-8"),
            baseline_reports=_load_baseline_reports(args.baseline_artifacts_dir),
        )
        json_path, markdown_path = write_approval_artifacts(report, args.output_dir)
        sys.stdout.write(
            f"Recommended state: {report['recommended_state']}\n"
            f"Approval state: {report['approval_state']}\n"
            f"JSON report: {json_path}\n"
            f"Markdown report: {markdown_path}\n"
        )
        return 0

    if args.command == "record-approval":
        json_path, markdown_path = record_tuning_approval(
            args.approval_artifact,
            approval_state=cast(ApprovalState, args.state),
            note=args.note,
        )
        sys.stdout.write(
            f"Recorded approval state: {args.state}\n"
            f"JSON report: {json_path}\n"
            f"Markdown report: {markdown_path}\n"
        )
        return 0

    if args.command == "check-approval":
        try:
            require_tuning_approval(args.approval_artifact)
        except ApprovalGateError as error:
            sys.stderr.write(f"{error}\n")
            return 1
        sys.stdout.write("approval present\n")
        return 0

    raise ApprovalGateError(f"unsupported command: {args.command}")


def _baseline_summary(cv_report: Mapping[str, object]) -> dict[str, object]:
    return {
        "run_id": cv_report.get("run_id", "unknown"),
        "dataset_id": cv_report.get("dataset_id", "unknown"),
        "examples": _sum_examples(cast(Mapping[str, object], cv_report.get("brand_breakdown", {}))),
        "fold_count": len(cast(Sequence[object], cv_report.get("folds", []))),
        "overall_metrics": {
            "top1_official_accuracy": float(cv_report.get("top1_official_accuracy", 0.0)),
            "retailer_false_positive_rate": float(cv_report.get("retailer_false_positive_rate", 0.0)),
            "field_correctness": float(cv_report.get("field_correctness", 0.0)),
        },
        "aggregate_metrics": cv_report.get("aggregate_metrics", {}),
        "folds": cv_report.get("folds", []),
        "lowest_brand_accuracy": _lowest_accuracy_rows(cast(Mapping[str, object], cv_report.get("brand_breakdown", {}))),
        "lowest_category_accuracy": _lowest_accuracy_rows(cast(Mapping[str, object], cv_report.get("category_breakdown", {}))),
        "confusion_matrix_summary": _flatten_confusion_matrix(cast(Mapping[str, object], cv_report.get("confusion_matrix", {}))),
    }


def _live_baseline_summary(baseline_reports: Sequence[Mapping[str, object]]) -> dict[str, object] | None:
    if not baseline_reports:
        return None

    validated_reports = [validate_benchmark_report(report) for report in baseline_reports]
    validated_reports.sort(key=lambda report: str(report["run_id"]))

    def _collect(metric: str) -> list[float]:
        return [float(report[metric]) for report in validated_reports]

    aggregate_metrics = {
        metric: _aggregate_metric(_collect(metric))
        for metric in ("top1_official_accuracy", "retailer_false_positive_rate", "field_correctness", "cost_usd", "latency_ms")
    }

    run_summaries = [
        {
            "run_id": report["run_id"],
            "generated_at": report["generated_at"],
            "top1_official_accuracy": float(report["top1_official_accuracy"]),
            "retailer_false_positive_rate": float(report["retailer_false_positive_rate"]),
            "field_correctness": float(report["field_correctness"]),
            "cost_usd": float(report["cost_usd"]),
            "latency_ms": float(report["latency_ms"]),
        }
        for report in validated_reports
    ]

    return {
        "runs": len(validated_reports),
        "dataset_id": validated_reports[0]["dataset_id"],
        "aggregate_metrics": aggregate_metrics,
        "run_summaries": run_summaries,
    }


def _missing_credentials(evidence: str) -> list[str]:
    credentials = []
    for name in ("SERPER_API_KEY", "LLM_API_KEY", "SCRAPER_API_KEY"):
        if f"{name}=missing" in evidence:
            credentials.append(name)
    return credentials


def _state_reason(*, live_baseline_missing: bool, cost_preflight_missing: bool) -> str:
    reasons = []
    if live_baseline_missing:
        reasons.append("required three-run live baseline is missing")
    if cost_preflight_missing:
        reasons.append("dollar-denominated max-cost preflight support is missing")
    return "; ".join(reasons) if reasons else "live baseline and cost preflight evidence are present; awaiting explicit approval decision"


def _aggregate_metric(values: Sequence[float]) -> dict[str, float]:
    if not values:
        return {"mean": 0.0, "std": 0.0}
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / (len(values) - 1) if len(values) > 1 else 0.0
    return {"mean": round(mean, 6), "std": round(variance ** 0.5, 6)}


def _blockers(*, live_baseline_missing: bool, cost_preflight_missing: bool) -> list[str]:
    blockers = []
    if live_baseline_missing:
        blockers.append("Run three full-set live baseline benchmarks with SERPER_API_KEY, LLM_API_KEY, and SCRAPER_API_KEY available.")
    if cost_preflight_missing:
        blockers.append("Add or provide repository-supported dollar-denominated --max-cost preflight before cost-bearing live tuning runs.")
    return blockers


def _tuning_recommendations() -> list[dict[str, object]]:
    status = "blocked_pending_live_baseline_and_manual_approval"
    return [
        {
            "candidate": "Rebalance SKU match versus official-source bonuses",
            "target": "SearchScorer.score_search_result sku_match_bonus, official_exact_bonus, official_exact_prefer_manufacturer_bonus",
            "expected_impact": "Reduce retailer SKU-in-path pages outranking official sources.",
            "risk": "Could demote legitimate retailer fallback PDPs when official pages are unavailable.",
            "status": status,
        },
        {
            "candidate": "Adjust official-family and generic-official penalties",
            "target": "SearchScorer.score_search_result official_family_bonus, generic_official_penalty, official_root_missing_variant_penalty",
            "expected_impact": "Improve official source selection for brands with family or root-domain product pages.",
            "risk": "Could increase broad official category/root page selections instead of exact PDPs.",
            "status": status,
        },
        {
            "candidate": "Tighten BrandSourceSelector official-source decision criteria",
            "target": "BrandSourceSelector prompt and schema criteria",
            "expected_impact": "Reduce LLM acceptance of retailer or distributor pages as official manufacturer sources.",
            "risk": "Could increase no-result outcomes for sparse brands without live evidence.",
            "status": status,
        },
    ]


def _lowest_accuracy_rows(breakdown: Mapping[str, object], *, limit: int = 10) -> list[dict[str, object]]:
    rows = []
    for name, value in breakdown.items():
        if not isinstance(value, Mapping):
            continue
        rows.append(
            {
                "name": name,
                "examples": int(value.get("examples", 0)),
                "top1_official_accuracy": float(value.get("top1_official_accuracy", 0.0)),
                "retailer_false_positive_rate": float(value.get("retailer_false_positive_rate", 0.0)),
                "field_correctness": float(value.get("field_correctness", 0.0)),
            }
        )
    rows.sort(key=lambda row: (float(row["top1_official_accuracy"]), -int(row["examples"]), str(row["name"])))
    return rows[:limit]


def _flatten_confusion_matrix(matrix: Mapping[str, object]) -> list[dict[str, object]]:
    rows = []
    for expected, raw_actuals in sorted(matrix.items()):
        if not isinstance(raw_actuals, Mapping):
            continue
        for actual, count in sorted(raw_actuals.items()):
            rows.append({"expected": expected, "actual": actual, "count": int(count)})
    return rows


def _breakdown_table(rows: Sequence[Mapping[str, object]]) -> str:
    lines = ["| Name | Examples | Top-1 Accuracy | Retailer FPR | Field Correctness |", "| --- | ---: | ---: | ---: | ---: |"]
    for row in rows:
        lines.append(
            f"| {row['name']} | {row['examples']} | {row['top1_official_accuracy']:.6f} | {row['retailer_false_positive_rate']:.6f} | {row['field_correctness']:.6f} |"
        )
    return "\n".join(lines)


def _sum_examples(breakdown: Mapping[str, object]) -> int:
    total = 0
    for value in breakdown.values():
        if isinstance(value, Mapping):
            total += int(value.get("examples", 0))
    return total


def _load_json_object(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"expected JSON object: {path}")
    return payload


def _load_baseline_reports(path: Path | None) -> list[dict[str, Any]]:
    if path is None or not path.exists():
        return []
    reports = []
    for report_path in sorted(path.glob("baseline-*-report.json")):
        reports.append(_load_json_object(report_path))
    return reports


def _recommended_state(payload: Mapping[str, object]) -> ApprovalState:
    state = payload.get("recommended_state")
    if state in {"Approve", "Deny", "Request More Data"}:
        return cast(ApprovalState, state)
    legacy_state = payload.get("approval_state")
    if legacy_state in {"Approve", "Deny", "Request More Data"}:
        return cast(ApprovalState, legacy_state)
    return "Request More Data"


def _approval_state(payload: Mapping[str, object]) -> ApprovalState | None:
    state = payload.get("approval_state")
    if state in {"Approve", "Deny", "Request More Data"}:
        return cast(ApprovalState, state)
    return None


if __name__ == "__main__":
    raise SystemExit(main())
