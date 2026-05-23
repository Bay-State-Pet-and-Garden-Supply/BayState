"""JSON and Markdown report writer for the URL extraction benchmark."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from benchmarks.url_extraction.metrics import ExtractionScore

# Emoji status indicators
_PASS = "✓"
_FAIL = "✗"
_WARN = "⚠"


def _score_to_row(score: ExtractionScore) -> dict[str, Any]:
    """Serialize a single score to a JSON-compatible dict."""
    row = {
        "entry_id": score.entry_id,
        "success": score.success,
        "overall_score": score.overall_score,
        "hard_fails": score.hard_fails,
        "warnings": score.warnings,
        "metrics": {
            "brand_score": score.brand_score,
            "name_score": score.name_score,
            "description_score": score.description_score,
            "weight_match": score.weight_match,
            "species_match": score.species_match,
            "food_form_match": score.food_form_match,
            "flavor_score": score.flavor_score,
            "category_sane": score.category_sane,
            "category_sane_reason": score.category_sane_reason,
            "approved_image_count": score.approved_image_count,
            "image_count_in_bounds": score.image_count_in_bounds,
            "image_count_reason": score.image_count_reason,
            "forbidden_domain_hits": score.forbidden_domain_hits,
            "forbidden_path_hint_hits": score.forbidden_path_hint_hits,
            "dirty_html_hits": score.dirty_html_hits,
            "duplicate_ratio": score.duplicate_ratio,
        },
        "timing": {
            "duration_ms": score.duration_ms,
        },
        "telemetry": {
            "token_usage": score.token_usage,
        },
    }
    # Include extraction method if available
    if score.method != "unknown":
        row["method"] = score.method
    # Include image diagnostics if available
    if score.image_diagnostics is not None:
        row["telemetry"]["image_diagnostics"] = score.image_diagnostics
    return row


def _score_to_md_row(score: ExtractionScore) -> str:
    """Format a single score as a Markdown table row."""
    status = _PASS if not score.hard_fails else _FAIL
    warn_icons = ""
    if score.warnings:
        warn_icons = f" {_WARN}({len(score.warnings)})"

    hard_fail_brief = score.hard_fails[0] if score.hard_fails else "—"
    if hard_fail_brief != "—":
        hard_fail_brief = hard_fail_brief.split(":")[0]

    duration_str = f"{score.duration_ms:.0f}ms" if score.duration_ms is not None else "—"

    return (
        f"| {status} | {score.entry_id} | {score.overall_score:.2f} "
        f"| {score.brand_score:.2f} | {score.name_score:.2f} "
        f"| {score.description_score:.2f} "
        f"| {_PASS if score.weight_match else _FAIL} "
        f"| {_PASS if score.species_match else _FAIL} "
        f"| {_PASS if score.food_form_match else _FAIL} "
        f"| {score.approved_image_count} "
        f"| {score.duplicate_ratio:.2f} "
        f"| {duration_str} "
        f"| {hard_fail_brief}{warn_icons} |"
    )


def _summary_to_md(summary: dict[str, Any]) -> str:
    """Format the summary section as Markdown."""
    lines = [
        "## Summary",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| Total entries | {summary['total_entries']} |",
        f"| Pass rate (no hard fails) | {summary['overall_pass_rate']:.1%} |",
        f"| Average overall score | {summary['average_overall_score']:.3f} |",
        f"| Average brand score | {summary['average_brand_score']:.3f} |",
        f"| Average name score | {summary['average_name_score']:.3f} |",
        f"| Average description score | {summary['average_description_score']:.3f} |",
        f"| Weight match rate | {summary['weight_match_rate']:.1%} |",
        f"| Species match rate | {summary['species_match_rate']:.1%} |",
        f"| Food form match rate | {summary['food_form_match_rate']:.1%} |",
        f"| Category sane rate | {summary['category_sane_rate']:.1%} |",
        f"| Image bounds rate | {summary['image_bounds_rate']:.1%} |",
        f"| Average flavor score | {summary['average_flavor_score']:.3f} |",
        f"| Average duplicate ratio | {summary['average_duplicate_ratio']:.3f} |",
        f"| Average duration | {summary['average_duration_ms']:.0f}ms |",
        "",
    ]

    # Hard fail breakdown
    if summary.get("hard_fail_breakdown"):
        lines.append("### Hard Fail Breakdown")
        lines.append("")
        lines.append(f"| Fail type | Count |")
        lines.append(f"|-----------|-------|")
        for fail_type, count in sorted(summary["hard_fail_breakdown"].items()):
            lines.append(f"| {fail_type} | {count} |")
        lines.append("")

    # Warning breakdown
    if summary.get("warning_breakdown"):
        lines.append("### Warning Breakdown")
        lines.append("")
        lines.append(f"| Warning type | Count |")
        lines.append(f"|--------------|-------|")
        for warn_type, count in sorted(summary["warning_breakdown"].items()):
            lines.append(f"| {warn_type} | {count} |")
        lines.append("")

    return "\n".join(lines)


def _per_entry_to_md(scores: list[ExtractionScore]) -> str:
    """Format per-entry results as Markdown."""
    lines = [
        "## Per-Entry Results",
        "",
        "| Status | Entry ID | Overall | Brand | Name | Desc | Weight | Species | FoodForm | ImgCt | DupR | Dur | Failures |",
        "|--------|----------|---------|-------|------|------|--------|---------|----------|-------|------|-----|----------|",
    ]

    for score in scores:
        lines.append(_score_to_md_row(score))
        # Detailed hard fail info
        if score.hard_fails:
            for fail in score.hard_fails:
                lines.append(f"| | | **{_FAIL} {fail}** | | | | | | | | | | |")
        if score.warnings:
            for warn in score.warnings:
                lines.append(f"| | | {_WARN} {warn} | | | | | | | | | | |")
        lines.append(
            f"| | | *Images: {score.approved_image_count} approved, "
            f"{score.duplicate_ratio:.0%} dup ratio* | | | | | | | | | | |"
        )
        lines.append("")

    return "\n".join(lines)


def build_report(
    summary: dict[str, Any],
    scores: list[ExtractionScore],
    *,
    dataset_path: str = "",
    mode: str = "live",
    fail_under: float | None = None,
) -> dict[str, Any]:
    """Build the full report dict.

    Args:
        summary: Output of ``summarize_scores()``.
        scores: List of per-entry ``ExtractionScore``.
        dataset_path: Path to the dataset used.
        mode: ``"live"`` or ``"fixture"``.
        fail_under: Optional threshold the run was compared against.

    Returns:
        Report dict with keys: ``schema_version``, ``dataset_path``,
        ``mode``, ``fail_under``, ``summary``, ``entries``.
    """
    entries = [_score_to_row(score) for score in scores]

    # Compute passed: no hard fails AND (if fail_under set) pass_rate >= fail_under
    any_hard_fails = any(len(s.hard_fails) > 0 for s in scores)
    pass_rate = summary.get("overall_pass_rate", 0.0)

    if any_hard_fails:
        passed = False
    elif fail_under is not None:
        passed = pass_rate >= fail_under
    else:
        passed = True

    report: dict[str, Any] = {
        "schema_version": "url-extraction-benchmark-report-v1",
        "dataset_path": dataset_path,
        "mode": mode,
        "fail_under": fail_under,
        "passed": passed,
        "summary": summary,
        "entries": entries,
    }
    return report


def write_report(
    report: dict[str, Any],
    output_dir: Path,
    scores: list[ExtractionScore],
) -> tuple[Path, Path]:
    """Write report as JSON and Markdown files.

    Returns ``(json_path, md_path)``.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # JSON
    json_path = output_dir / "extraction-report.json"
    json_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")

    # Markdown
    md_path = output_dir / "extraction-report.md"
    md_lines = [
        "# URL Extraction Benchmark Report",
        "",
        f"- **Dataset**: `{report.get('dataset_path', '')}`",
        f"- **Mode**: {report.get('mode', 'live')}",
        f"- **Passed**: {'Yes' if report.get('passed') else 'No'}",
        f"",
    ]
    if report.get("fail_under") is not None:
        md_lines.append(f"- **Fail-under threshold**: {report['fail_under']}")
        md_lines.append("")

    md_lines.append("")
    md_lines.append(_summary_to_md(report.get("summary", {})))
    md_lines.append("")
    md_lines.append(_per_entry_to_md(scores))
    md_lines.append("")

    md_path.write_text("\n".join(md_lines), encoding="utf-8")

    return json_path, md_path
