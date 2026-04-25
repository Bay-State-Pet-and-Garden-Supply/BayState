"""Manual approval report and tuning gate for benchmark-driven scraper tuning."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, TypedDict, cast


ApprovalState = Literal["Approve", "Deny", "Request More Data"]


class ApprovalGateError(RuntimeError):
    """Raised when tuning is attempted without explicit approval."""


class ApprovalReport(TypedDict):
    schema_version: str
    generated_at: str
    approval_state: ApprovalState
    state_reason: str
    baseline_summary: dict[str, object]
    cost_blocker_summary: dict[str, object]
    tuning_recommendations: list[dict[str, object]]
    approval_options: list[ApprovalState]


def build_approval_report(
    *,
    cv_report: Mapping[str, object],
    baseline_evidence: str,
    cost_evidence: str,
    generated_at: str | None = None,
) -> ApprovalReport:
    """Build a deterministic approval report from offline CV metrics and blocker evidence."""

    missing_credentials = _missing_credentials(baseline_evidence)
    live_baseline_missing = "Three baseline live runs could not be executed" in baseline_evidence or bool(missing_credentials)
    cost_preflight_missing = "No repository-supported `--max-cost`" in cost_evidence or "No repository-supported --max-cost" in cost_evidence
    approval_state: ApprovalState = "Request More Data" if live_baseline_missing or cost_preflight_missing else "Deny"

    return {
        "schema_version": "benchmark-approval-report-v1",
        "generated_at": generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "approval_state": approval_state,
        "state_reason": _state_reason(live_baseline_missing=live_baseline_missing, cost_preflight_missing=cost_preflight_missing),
        "baseline_summary": _baseline_summary(cv_report),
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

    baseline = cast(Mapping[str, object], report["baseline_summary"])
    aggregate_metrics = cast(Mapping[str, Mapping[str, object]], baseline["aggregate_metrics"])
    cost_blockers = cast(Mapping[str, object], report["cost_blocker_summary"])
    lines = [
        "# Benchmark Tuning Approval Report",
        "",
        f"- Generated At: `{report['generated_at']}`",
        f"- Recommended State: `{report['approval_state']}`",
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


def require_tuning_approval(approval_artifact: Path) -> None:
    """Fail unless the approval artifact exists and explicitly approves tuning."""

    if not approval_artifact.exists():
        raise ApprovalGateError(f"approval required: missing approval artifact {approval_artifact}")
    payload = _load_json_object(approval_artifact)
    state = payload.get("approval_state")
    if state != "Approve":
        raise ApprovalGateError(f"approval required: approval_state is {state!r}, expected 'Approve'")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Benchmark tuning approval report and gate")
    subparsers = parser.add_subparsers(dest="command", required=True)

    generate_parser = subparsers.add_parser("generate", help="Generate approval JSON and Markdown reports")
    generate_parser.add_argument("--cv-report", type=Path, required=True)
    generate_parser.add_argument("--baseline-evidence", type=Path, required=True)
    generate_parser.add_argument("--cost-evidence", type=Path, required=True)
    generate_parser.add_argument("--output-dir", type=Path, required=True)

    check_parser = subparsers.add_parser("check-approval", help="Fail unless tuning has explicit approval")
    check_parser.add_argument("--approval-artifact", type=Path, required=True)

    args = parser.parse_args(argv)
    if args.command == "generate":
        report = build_approval_report(
            cv_report=_load_json_object(args.cv_report),
            baseline_evidence=args.baseline_evidence.read_text(encoding="utf-8"),
            cost_evidence=args.cost_evidence.read_text(encoding="utf-8"),
        )
        json_path, markdown_path = write_approval_artifacts(report, args.output_dir)
        sys.stdout.write(f"Approval state: {report['approval_state']}\nJSON report: {json_path}\nMarkdown report: {markdown_path}\n")
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
    return "; ".join(reasons) if reasons else "live baseline and cost preflight evidence are present, but no approval was recorded"


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


if __name__ == "__main__":
    raise SystemExit(main())
