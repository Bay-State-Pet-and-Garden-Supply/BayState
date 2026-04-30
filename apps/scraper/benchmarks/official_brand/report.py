from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from benchmarks.official_brand.metrics import DiscoveryResultRow

REPORT_SCHEMA_VERSION = "official-brand-benchmark-report-v1"


def _row_to_dict(row: DiscoveryResultRow) -> dict[str, Any]:
    return {
        "sku": row.sku,
        "brand": row.brand,
        "product_name": row.product_name,
        "expected_official_domains": row.expected_official_domains,
        "expected_url": row.expected_url,
        "discovered_url": row.discovered_url,
        "discovered_domain": row.discovered_domain,
        "domain_match": row.domain_match,
        "exact_url_match": row.exact_url_match,
        "duration_ms": round(row.duration_ms, 3),
        "cost_usd": row.cost_usd,
        "error": row.error,
        "category": row.category,
        "difficulty": row.difficulty,
    }


def build_report(*, dataset_path: Path, summary: dict[str, object], rows: list[DiscoveryResultRow]) -> dict[str, Any]:
    return {
        "schema_version": REPORT_SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "fixture",
        "benchmark_type": "official_brand_discovery_only",
        "dataset_path": str(dataset_path),
        "summary": summary,
        "entries": [_row_to_dict(row) for row in rows],
    }


def write_report(*, report: dict[str, Any], output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "official-brand-benchmark.json"
    md_path = output_dir / "official-brand-benchmark.md"
    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    summary = report.get("summary", {})
    md = "\n".join(
        [
            "# Official Brand Benchmark",
            "",
            f"- Total entries: {summary.get('total_entries', 0)}",
            f"- Successful discoveries: {summary.get('successful_discoveries', 0)}",
            f"- Domain match rate: {float(summary.get('domain_match_rate', 0.0)):.2%}",
            f"- Exact URL match rate: {float(summary.get('exact_url_match_rate', 0.0)):.2%}",
            f"- Failed: {summary.get('failed_count', 0)}",
        ]
    )
    md_path.write_text(md + "\n", encoding="utf-8")
    return json_path, md_path
