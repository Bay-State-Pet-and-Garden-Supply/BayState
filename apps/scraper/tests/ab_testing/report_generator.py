from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from statistics import fmean
from typing import Any, Iterable


WORKSPACE_ROOT = Path(__file__).resolve().parents[3]
EVIDENCE_DIR = WORKSPACE_ROOT / ".sisyphus" / "evidence"
JSON_PATH = EVIDENCE_DIR / "t17-ab-test-report.json"
MARKDOWN_PATH = EVIDENCE_DIR / "t17-ab-test-report.md"


def _safe_mean(values: Iterable[float]) -> float:
    data = list(values)
    if not data:
        return 0.0
    return float(fmean(data))


def _system_summary(samples: list[dict[str, Any]], system_key: str) -> dict[str, float]:
    entries = [sample[system_key] for sample in samples if sample.get(system_key)]
    if not entries:
        return {
            "success_rate": 0.0,
            "avg_time_seconds": 0.0,
            "avg_cost_usd": 0.0,
            "fields_extracted_avg": 0.0,
        }

    success_rate = _safe_mean(1.0 if entry.get("success") else 0.0 for entry in entries)
    avg_time = _safe_mean(float(entry.get("duration", 0.0)) for entry in entries)
    avg_cost = _safe_mean(float(entry.get("cost", 0.0)) for entry in entries)
    avg_fields = _safe_mean(float(entry.get("fields_present", 0.0)) for entry in entries)

    return {
        "success_rate": round(success_rate, 4),
        "avg_time_seconds": round(avg_time, 4),
        "avg_cost_usd": round(avg_cost, 6),
        "fields_extracted_avg": round(avg_fields, 2),
    }


def _recommendation(crawl4ai: dict[str, float], browser_use: dict[str, float]) -> str:
    meets_success = crawl4ai["success_rate"] >= browser_use["success_rate"]
    meets_cost = crawl4ai["avg_cost_usd"] <= browser_use["avg_cost_usd"]
    meets_speed = crawl4ai["avg_time_seconds"] <= browser_use["avg_time_seconds"]
    meets_quality = crawl4ai["fields_extracted_avg"] >= browser_use["fields_extracted_avg"]

    if all([meets_success, meets_cost, meets_speed, meets_quality]):
        return "go"
    if crawl4ai["success_rate"] >= 0.7:
        return "conditional"
    return "no-go"


def build_summary(results: dict[str, Any]) -> dict[str, Any]:
    samples = results.get("samples", [])
    sku_count = len(samples)

    crawl4ai = _system_summary(samples, "crawl4ai")
    browser_use = _system_summary(samples, "browser_use")

    summary = {
        "test_date": datetime.now(timezone.utc).isoformat(),
        "sku_count": sku_count,
        "crawl4ai": crawl4ai,
        "browser_use": browser_use,
        "comparison": {
            "success_rate_diff": round(crawl4ai["success_rate"] - browser_use["success_rate"], 4),
            "avg_time_diff": round(crawl4ai["avg_time_seconds"] - browser_use["avg_time_seconds"], 4),
            "avg_cost_diff": round(crawl4ai["avg_cost_usd"] - browser_use["avg_cost_usd"], 6),
            "field_diff": round(crawl4ai["fields_extracted_avg"] - browser_use["fields_extracted_avg"], 2),
        },
        "recommendation": _recommendation(crawl4ai, browser_use),
        "samples": samples,
    }
    return summary


def _write_json(summary: dict[str, Any]) -> Path:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return JSON_PATH


def _write_markdown(summary: dict[str, Any]) -> Path:
    crawl = summary["crawl4ai"]
    legacy = summary["browser_use"]
    comp = summary["comparison"]

    markdown = [
        "# T17 A/B Test Report",
        "",
        f"**Test Date:** {summary['test_date']}",
        f"**SKU Count:** {summary['sku_count']}",
        "",
        "## Summary",
        "",
        "| Metric | crawl4ai | browser-use |",
        "|--------|----------|-------------|",
        f"| Success Rate | {crawl['success_rate']:.2f} | {legacy['success_rate']:.2f} |",
        f"| Avg Time (s) | {crawl['avg_time_seconds']:.2f} | {legacy['avg_time_seconds']:.2f} |",
        f"| Avg Cost (USD) | {crawl['avg_cost_usd']:.4f} | {legacy['avg_cost_usd']:.4f} |",
        f"| Fields Extracted (avg) | {crawl['fields_extracted_avg']:.2f} | {legacy['fields_extracted_avg']:.2f} |",
        "",
        "## Comparison",
        "",
        f"- Success Rate Δ: {comp['success_rate_diff']:+.2f}",
        f"- Avg Time Δ: {comp['avg_time_diff']:+.2f} seconds",
        f"- Avg Cost Δ: {comp['avg_cost_diff']:+.4f} USD",
        f"- Field Completeness Δ: {comp['field_diff']:+.2f}",
        "",
        "## Recommendation",
        "",
        f"**Decision:** {summary['recommendation'].upper()}",
        "",
        "Raw JSON: `t17-ab-test-report.json`",
    ]

    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    MARKDOWN_PATH.write_text("\n".join(markdown), encoding="utf-8")
    return MARKDOWN_PATH


def generate_report(results: dict[str, Any]) -> dict[str, Any]:
    summary = build_summary(results)
    json_path = _write_json(summary)
    markdown_path = _write_markdown(summary)
    return {
        "payload": summary,
        "json_path": json_path,
        "markdown_path": markdown_path,
    }
