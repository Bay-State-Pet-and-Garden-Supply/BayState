from __future__ import annotations

import json
from pathlib import Path

from benchmarks.ai_search.metrics import (
    EndToEndResultRow,
    ExtractionMetadata,
    FieldQualityMetrics,
    PipelineStageMetrics,
    TimingMetrics,
)
from benchmarks.ai_search.report import build_report, write_report


def test_build_report_structure() -> None:
    rows = [
        EndToEndResultRow(
            upc="UPC-1",
            brand="A",
            product_name="One",
            expected_source_url="https://a.com/1",
            expected_official_domains=["a.com"],
            source_type="official",
            stages=PipelineStageMetrics(end_to_end_success=True),
            field_quality=FieldQualityMetrics(
                brand_score=1.0, name_score=0.9, overall_score=0.95
            ),
            extraction_metadata=ExtractionMetadata(method="json-ld", confidence=0.85),
            timing=TimingMetrics(total_ms=1500),
        ),
    ]
    summary = {
        "total_entries": 1,
        "end_to_end_success_rate": 1.0,
        "average_overall_quality_score": 0.95,
    }

    report = build_report(
        dataset_path=Path("fixtures/dataset.json"),
        summary=summary,
        rows=rows,
        mode="fixture",
    )

    assert report["schema_version"] == "ai-search-e2e-benchmark-report-v1"
    assert report["mode"] == "fixture"
    assert report["benchmark_type"] == "ai_search_end_to_end"
    assert report["summary"]["total_entries"] == 1
    assert len(report["entries"]) == 1

    entry = report["entries"][0]
    assert entry["upc"] == "UPC-1"
    assert entry["stages"]["end_to_end_success"] is True
    assert entry["field_quality"]["brand_score"] == 1.0
    assert entry["extraction_metadata"]["method"] == "json-ld"
    assert entry["timing"]["total_ms"] == 1500


def test_write_report_creates_json_and_md(tmp_path: Path) -> None:
    rows = [
        EndToEndResultRow(
            upc="UPC-1",
            brand="A",
            product_name="One",
            expected_source_url="https://a.com/1",
            expected_official_domains=["a.com"],
            source_type="official",
            stages=PipelineStageMetrics(end_to_end_success=True),
            field_quality=FieldQualityMetrics(overall_score=0.9),
            timing=TimingMetrics(total_ms=1000),
        ),
    ]
    summary = {
        "total_entries": 1,
        "end_to_end_success_rate": 1.0,
        "failure_breakdown": {},
    }

    report = build_report(
        dataset_path=Path("dataset.json"),
        summary=summary,
        rows=rows,
        mode="fixture",
    )

    json_path, md_path = write_report(report=report, output_dir=tmp_path)

    assert json_path.exists()
    assert md_path.exists()
    assert json_path.name == "ai-search-e2e-benchmark.json"
    assert md_path.name == "ai-search-e2e-benchmark.md"

    # Verify JSON round-trips
    loaded = json.loads(json_path.read_text(encoding="utf-8"))
    assert loaded["schema_version"] == "ai-search-e2e-benchmark-report-v1"

    # Verify Markdown contains expected sections
    md_content = md_path.read_text(encoding="utf-8")
    assert "# AI Search End-to-End Benchmark Report" in md_content
    assert "## Summary" in md_content
    assert "UPC-1" in md_content
