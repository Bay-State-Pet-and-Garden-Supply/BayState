"""Report generation for the end-to-end AI Search benchmark."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from benchmarks.ai_search.metrics import EndToEndResultRow

REPORT_SCHEMA_VERSION = "ai-search-e2e-benchmark-report-v1"


def _row_to_dict(row: EndToEndResultRow) -> dict[str, Any]:
    """Convert a result row to a serializable dict."""
    return {
        "upc": row.upc,
        "brand": row.brand,
        "product_name": row.product_name,
        "expected_source_url": row.expected_source_url,
        "expected_official_domains": row.expected_official_domains,
        "source_type": row.source_type,
        "category": row.category,
        "difficulty": row.difficulty,
        "stages": {
            "search_success": row.stages.search_success,
            "url_selection_success": row.stages.url_selection_success,
            "domain_match": row.stages.domain_match,
            "url_match": row.stages.url_match,
            "crawl_success": row.stages.crawl_success,
            "extraction_success": row.stages.extraction_success,
            "validation_passed": row.stages.validation_passed,
            "data_quality_passed": row.stages.data_quality_passed,
            "end_to_end_success": row.stages.end_to_end_success,
        },
        "failure_stage": row.failure_stage,
        "failure_reason": row.failure_reason,
        "discovered_url": row.discovered_url,
        "selected_domain": row.selected_domain,
        "extraction_result": {
            k: v for k, v in row.extraction_result.items() if not k.startswith("_")
        },
        "field_quality": {
            "brand_score": round(row.field_quality.brand_score, 3),
            "name_score": round(row.field_quality.name_score, 3),
            "description_score": round(row.field_quality.description_score, 3),
            "size_metrics_score": round(row.field_quality.size_metrics_score, 3),
            "image_score": round(row.field_quality.image_score, 3),
            "categories_score": round(row.field_quality.categories_score, 3),
            "overall_score": round(row.field_quality.overall_score, 3),
        },
        "extraction_metadata": {
            "method": row.extraction_metadata.method,
            "confidence": round(row.extraction_metadata.confidence, 3),
            "fetch_time_ms": row.extraction_metadata.fetch_time_ms,
            "parse_time_ms": row.extraction_metadata.parse_time_ms,
            "llm_time_ms": row.extraction_metadata.llm_time_ms,
            "fallback_triggered": row.extraction_metadata.fallback_triggered,
            "extraction_error": row.extraction_metadata.extraction_error,
            "estimated_cost_usd": row.extraction_metadata.estimated_cost_usd,
        },
        "timing": {
            "search_ms": round(row.timing.search_ms, 1),
            "url_selection_ms": round(row.timing.url_selection_ms, 1),
            "crawl_ms": round(row.timing.crawl_ms, 1),
            "extraction_ms": round(row.timing.extraction_ms, 1),
            "validation_ms": round(row.timing.validation_ms, 1),
            "total_ms": round(row.timing.total_ms, 1),
        },
        "cost_usd": row.cost_usd,
    }


def build_report(
    *,
    dataset_path: Path,
    summary: dict[str, object],
    rows: list[EndToEndResultRow],
    mode: str,
) -> dict[str, Any]:
    """Build the full benchmark report dict."""
    return {
        "schema_version": REPORT_SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "benchmark_type": "ai_search_end_to_end",
        "dataset_path": str(dataset_path),
        "summary": summary,
        "entries": [_row_to_dict(row) for row in rows],
    }


def _build_markdown(report: dict[str, Any]) -> str:
    """Build a human-readable Markdown report."""
    summary = report.get("summary", {})
    rows = report.get("entries", [])
    mode = report.get("mode", "unknown")

    lines: list[str] = [
        "# AI Search End-to-End Benchmark Report",
        "",
        f"**Mode:** {mode}",
        f"**Generated:** {report.get('generated_at', 'unknown')}",
        f"**Dataset:** {report.get('dataset_path', 'unknown')}",
        "",
        "## Summary",
        "",
        f"- **Total entries:** {summary.get('total_entries', 0)}",
        f"- **End-to-end success rate:** {float(summary.get('end_to_end_success_rate', 0.0)):.2%}",
        f"- **Search success rate:** {float(summary.get('search_success_rate', 0.0)):.2%}",
        f"- **URL selection success rate:** {float(summary.get('url_selection_success_rate', 0.0)):.2%}",
        f"- **Domain match rate:** {float(summary.get('domain_match_rate', 0.0)):.2%}",
        f"- **Crawl success rate:** {float(summary.get('crawl_success_rate', 0.0)):.2%}",
        f"- **Extraction success rate:** {float(summary.get('extraction_success_rate', 0.0)):.2%}",
        f"- **Validation pass rate:** {float(summary.get('validation_pass_rate', 0.0)):.2%}",
        f"- **Data quality pass rate:** {float(summary.get('data_quality_pass_rate', 0.0)):.2%}",
        "",
        "## Data Quality Scores (Successful Extractions)",
        "",
        f"- **Average brand score:** {float(summary.get('average_brand_score', 0.0)):.3f}",
        f"- **Average name score:** {float(summary.get('average_name_score', 0.0)):.3f}",
        f"- **Average description score:** {float(summary.get('average_description_score', 0.0)):.3f}",
        f"- **Average size metrics score:** {float(summary.get('average_size_metrics_score', 0.0)):.3f}",
        f"- **Average image score:** {float(summary.get('average_image_score', 0.0)):.3f}",
        f"- **Average categories score:** {float(summary.get('average_categories_score', 0.0)):.3f}",
        f"- **Average overall quality score:** {float(summary.get('average_overall_quality_score', 0.0)):.3f}",
        "",
        "## Timing",
        "",
        f"- **Average total duration:** {float(summary.get('average_total_duration_ms', 0.0)):.0f} ms",
        f"- **P50 total duration:** {float(summary.get('p50_total_duration_ms', 0.0)):.0f} ms",
        f"- **P95 total duration:** {float(summary.get('p95_total_duration_ms', 0.0)):.0f} ms",
        f"- **Total cost:** ${float(summary.get('total_cost_usd', 0.0)):.4f}",
        "",
        "## Failure Breakdown",
        "",
    ]

    failure_breakdown = summary.get("failure_breakdown", {})
    if failure_breakdown:
        lines.append("| Stage | Count |")
        lines.append("|-------|-------|")
        for stage, count in sorted(failure_breakdown.items(), key=lambda x: -x[1]):
            lines.append(f"| {stage} | {count} |")
    else:
        lines.append("No failures.")

    lines.extend([
        "",
        "## Failed Entries",
        "",
    ])

    failed_rows = [row for row in rows if not row.get("stages", {}).get("end_to_end_success")]
    if failed_rows:
        lines.append("| UPC | Brand | Failure Stage | Reason | Discovered URL |")
        lines.append("|-----|-------|---------------|--------|----------------|")
        for row in failed_rows[:20]:  # Limit to first 20
            upc = row.get("upc", "")
            brand = row.get("brand", "")
            stage = row.get("failure_stage", "unknown")
            reason = (row.get("failure_reason") or "")[:60]
            url = (row.get("discovered_url") or "")[:50]
            lines.append(f"| {upc} | {brand} | {stage} | {reason} | {url} |")
    else:
        lines.append("All entries passed end-to-end.")

    lines.extend([
        "",
        "## Per-Entry Details",
        "",
    ])

    for row in rows:
        upc = row.get("upc", "")
        stages = row.get("stages", {})
        fq = row.get("field_quality", {})
        em = row.get("extraction_metadata", {})
        timing = row.get("timing", {})

        status = "PASS" if stages.get("end_to_end_success") else "FAIL"
        lines.append(f"### {upc} — {status}")
        lines.append("")
        lines.append(f"- **Product:** {row.get('product_name', '')}")
        lines.append(f"- **Expected URL:** {row.get('expected_source_url', '')}")
        lines.append(f"- **Discovered URL:** {row.get('discovered_url', 'N/A')}")
        lines.append(f"- **Failure stage:** {row.get('failure_stage', 'N/A')}")
        lines.append(f"- **Failure reason:** {row.get('failure_reason', 'N/A')}")
        lines.append(f"- **Extraction method:** {em.get('method', 'N/A')}")
        lines.append(f"- **Confidence:** {em.get('confidence', 0.0):.3f}")
        lines.append(f"- **Quality scores:** brand={fq.get('brand_score', 0.0):.2f}, name={fq.get('name_score', 0.0):.2f}, "
                     f"desc={fq.get('description_score', 0.0):.2f}, size={fq.get('size_metrics_score', 0.0):.2f}, "
                     f"img={fq.get('image_score', 0.0):.2f}, cat={fq.get('categories_score', 0.0):.2f}, "
                     f"overall={fq.get('overall_score', 0.0):.2f}")
        lines.append(f"- **Cost:** ${row.get('cost_usd', 0.0):.4f}")
        lines.append(f"- **Duration:** {timing.get('total_ms', 0.0):.0f} ms")
        lines.append("")

    return "\n".join(lines) + "\n"


def write_report(*, report: dict[str, Any], output_dir: Path) -> tuple[Path, Path]:
    """Write JSON and Markdown reports to disk."""
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "ai-search-e2e-benchmark.json"
    md_path = output_dir / "ai-search-e2e-benchmark.md"

    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    md_path.write_text(_build_markdown(report), encoding="utf-8")

    return json_path, md_path
