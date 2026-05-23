"""Unit tests for run_distributor_adapter_smoke.py helpers.

Tests filtering, plan construction, scoring, and report output
without network or credentials.
"""
from __future__ import annotations

import json
import tempfile
from pathlib import Path


# Import helpers from the smoke script
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from run_distributor_adapter_smoke import (
    filter_entries,
    build_plan_from_entry,
    evaluate_result,
    write_json_report,
    write_markdown_report,
    SmokeTestResult,
    SmokeTestSummary,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

MINI_DATASET = {
    "schema_version": "approved-source-dataset-v1",
    "entries": [
        {
            "dataset_kind": "distributor_extraction",
            "source_slug": "bradley",
            "adapter_slug": "bradley_crawl4ai",
            "source_type": "distributor",
            "requires_auth": False,
            "upc": "001135",
            "product_name": "E-Z HANG SCALE",
            "brand": "KERBL",
            "search_input": {"upc": "001135", "name": "E-Z HANG SCALE", "brand": "KERBL"},
            "allowed_domains": ["bradleycaldwell.com"],
            "allowed_asset_domains": ["bradleycaldwell.com"],
            "allowed_fields": ["name", "brand", "upc", "images"],
            "ground_truth": {
                "title_contains": ["E-Z HANG SCALE"],
                "brand": "KERBL",
                "upc": "001135",
                "image_required": True,
            },
            "expected": {
                "should_match_identity": True,
                "minimum_confidence": 0.5,
                "llm_allowed": False,
                "expected_status": "success",
            },
        },
        {
            "dataset_kind": "distributor_extraction",
            "source_slug": "bradley",
            "adapter_slug": "bradley_crawl4ai",
            "source_type": "distributor",
            "requires_auth": False,
            "upc": "xyzabc123notexist456",
            "product_name": "",
            "brand": "",
            "search_input": {"upc": "xyzabc123notexist456", "name": "", "brand": ""},
            "allowed_domains": ["bradleycaldwell.com"],
            "allowed_asset_domains": ["bradleycaldwell.com"],
            "ground_truth": {"title_contains": [], "brand": "", "upc": "xyzabc123notexist456"},
            "expected": {
                "should_match_identity": True,
                "minimum_confidence": 0.0,
                "llm_allowed": False,
                "expected_status": "no_match",
            },
        },
        {
            "dataset_kind": "distributor_extraction",
            "source_slug": "orgill",
            "adapter_slug": "orgill_crawl4ai",
            "source_type": "distributor",
            "requires_auth": True,
            "upc": "037193347322",
            "product_name": "Premium Chicken Feed",
            "brand": "Purina",
            "search_input": {"upc": "037193347322", "name": "Premium Chicken Feed", "brand": "Purina"},
            "allowed_domains": ["orgill.com"],
            "allowed_asset_domains": ["orgill.com"],
            "ground_truth": {"title_contains": ["Premium Chicken Feed"], "brand": "Purina", "upc": "037193347322"},
            "expected": {
                "should_match_identity": True,
                "minimum_confidence": 0.5,
                "llm_allowed": False,
                "expected_status": "auth_required",
            },
        },
        {
            "dataset_kind": "distributor_extraction",
            "source_slug": "central_pet",
            "adapter_slug": "central_pet_crawl4ai",
            "source_type": "distributor",
            "requires_auth": False,
            "upc": "38777520",
            "product_name": "KONG Air Dog Squeaker Tennis Ball Dog Toy",
            "brand": "KONG",
            "search_input": {"upc": "38777520", "name": "KONG Air Dog Squeaker Tennis Ball Dog Toy", "brand": "KONG"},
            "allowed_domains": ["centralpet.com"],
            "allowed_asset_domains": ["centralpet.com"],
            "ground_truth": {
                "title_contains": ["KONG Air Dog"],
                "brand": "KONG",
                "upc": "38777520",
                "image_required": True,
            },
            "expected": {
                "should_match_identity": True,
                "minimum_confidence": 0.5,
                "llm_allowed": False,
                "expected_status": "success",
            },
        },
        {
            "dataset_kind": "official_extraction",
            "source_slug": "official",
            "upc": "SKIP_ME",
        },
    ],
}


# ---------------------------------------------------------------------------
# Filter tests
# ---------------------------------------------------------------------------

class TestFilterEntries:
    def test_filters_by_source_slug(self):
        entries = filter_entries(MINI_DATASET, source_slugs=["bradley"])
        assert len(entries) == 2
        assert all(e["source_slug"] == "bradley" for e in entries)

    def test_filters_out_non_distributor(self):
        entries = filter_entries(MINI_DATASET)
        assert all(e.get("dataset_kind") == "distributor_extraction" for e in entries)

    def test_skip_auth_required(self):
        entries = filter_entries(MINI_DATASET, skip_auth_required=True)
        assert all(not e.get("requires_auth", False) for e in entries)
        # Orgill should be excluded
        assert all(e["source_slug"] != "orgill" for e in entries)

    def test_include_auth_required(self):
        entries = filter_entries(MINI_DATASET, skip_auth_required=False)
        source_slugs = {e["source_slug"] for e in entries}
        assert "orgill" in source_slugs

    def test_filters_by_sku(self):
        entries = filter_entries(MINI_DATASET, sku_filter="001135")
        assert len(entries) == 1
        assert entries[0]["upc"] == "001135"

    def test_multiple_source_slugs(self):
        entries = filter_entries(MINI_DATASET, source_slugs=["bradley", "central_pet"])
        slugs = {e["source_slug"] for e in entries}
        assert slugs == {"bradley", "central_pet"}

    def test_no_match_returns_empty(self):
        entries = filter_entries(MINI_DATASET, source_slugs=["nonexistent"])
        assert len(entries) == 0


# ---------------------------------------------------------------------------
# Plan construction tests
# ---------------------------------------------------------------------------

class TestBuildPlanFromEntry:
    def test_builds_plan_with_brand(self):
        entry = MINI_DATASET["entries"][0]
        plan, plan_entry = build_plan_from_entry(entry)

        assert plan.upc == "001135"
        assert plan.brand is not None
        assert plan.brand.name == "KERBL"
        assert plan_entry.sourceSlug == "bradley"
        assert plan_entry.adapterSlug == "bradley_crawl4ai"
        assert plan_entry.requiresAuth is False

    def test_builds_plan_without_brand(self):
        entry = {
            "dataset_kind": "distributor_extraction",
            "source_slug": "bradley",
            "adapter_slug": "bradley_crawl4ai",
            "upc": "010199",
            "brand": "",
            "allowed_domains": ["bradleycaldwell.com"],
        }
        plan, plan_entry = build_plan_from_entry(entry)

        assert plan.upc == "010199"
        assert plan.brand is None

    def test_sets_run_first(self):
        entry = MINI_DATASET["entries"][0]
        _, plan_entry = build_plan_from_entry(entry)
        assert plan_entry.runFirst is True


# ---------------------------------------------------------------------------
# Evaluate result tests
# ---------------------------------------------------------------------------

class TestEvaluateResult:
    def test_success_expected_and_got(self):
        entry = MINI_DATASET["entries"][0]  # Bradley 001135
        passed, reason = evaluate_result(
            entry=entry,
            actual_status="success",
            confidence=0.8,
            product={"name": "E-Z HANG SCALE", "brand": "KERBL", "image_urls": ["http://img.jpg"]},
            warnings=[],
        )
        assert passed is True

    def test_success_expected_but_got_failed(self):
        entry = MINI_DATASET["entries"][0]
        passed, reason = evaluate_result(
            entry=entry,
            actual_status="failed",
            confidence=0.0,
            product={},
            warnings=["No match"],
        )
        assert passed is False
        assert "Expected success" in reason

    def test_no_match_expected_and_got_failed(self):
        entry = MINI_DATASET["entries"][1]  # Negative UPC
        passed, reason = evaluate_result(
            entry=entry,
            actual_status="failed",
            confidence=0.0,
            product={},
            warnings=["No match"],
        )
        assert passed is True
        assert "no-match" in reason.lower() or "correctly" in reason.lower()

    def test_no_match_expected_but_got_success(self):
        entry = MINI_DATASET["entries"][1]
        passed, reason = evaluate_result(
            entry=entry,
            actual_status="success",
            confidence=0.9,
            product={"name": "Something"},
            warnings=[],
        )
        assert passed is False

    def test_confidence_below_minimum(self):
        entry = MINI_DATASET["entries"][0]
        passed, reason = evaluate_result(
            entry=entry,
            actual_status="success",
            confidence=0.3,
            product={"name": "E-Z HANG SCALE", "brand": "KERBL", "image_urls": ["http://img.jpg"]},
            warnings=[],
        )
        assert passed is False
        assert "Confidence" in reason

    def test_missing_title_substring(self):
        entry = MINI_DATASET["entries"][0]
        passed, reason = evaluate_result(
            entry=entry,
            actual_status="success",
            confidence=0.8,
            product={"name": "Wrong Product", "brand": "KERBL", "image_urls": ["http://img.jpg"]},
            warnings=[],
        )
        assert passed is False
        assert "E-Z HANG SCALE" in reason

    def test_missing_brand(self):
        entry = MINI_DATASET["entries"][0]
        passed, reason = evaluate_result(
            entry=entry,
            actual_status="success",
            confidence=0.8,
            product={"name": "E-Z HANG SCALE", "brand": "Wrong", "image_urls": ["http://img.jpg"]},
            warnings=[],
        )
        assert passed is False
        assert "KERBL" in reason

    def test_missing_required_image(self):
        entry = MINI_DATASET["entries"][0]
        passed, reason = evaluate_result(
            entry=entry,
            actual_status="success",
            confidence=0.8,
            product={"name": "E-Z HANG SCALE", "brand": "KERBL", "image_urls": []},
            warnings=[],
        )
        assert passed is False
        assert "image" in reason.lower()

    def test_partial_expected_accepts_success(self):
        entry_partial = {
            "expected": {"expected_status": "partial", "minimum_confidence": 0.3},
            "ground_truth": {},
        }
        passed, _ = evaluate_result(
            entry=entry_partial,
            actual_status="success",
            confidence=0.5,
            product={"name": "Something"},
            warnings=[],
        )
        assert passed is True


# ---------------------------------------------------------------------------
# Report writer tests
# ---------------------------------------------------------------------------

class TestReportWriters:
    def _make_summary(self) -> SmokeTestSummary:
        return SmokeTestSummary(
            total=3,
            passed=2,
            failed=1,
            errors=0,
            results=[
                SmokeTestResult(
                    entry_key="bradley_001135",
                    source_slug="bradley",
                    sku="001135",
                    expected_status="success",
                    actual_status="success",
                    passed=True,
                    confidence=0.85,
                    product_name="E-Z HANG SCALE",
                    product_brand="KERBL",
                    image_count=2,
                    evidence_url="https://bradleycaldwell.com/search?term=001135",
                    matched_fields=["name", "brand"],
                    elapsed_seconds=1.2,
                ),
                SmokeTestResult(
                    entry_key="bradley_xyzabc",
                    source_slug="bradley",
                    sku="xyzabc123notexist456",
                    expected_status="no_match",
                    actual_status="failed",
                    passed=True,
                    confidence=0.0,
                    elapsed_seconds=0.8,
                ),
                SmokeTestResult(
                    entry_key="central_pet_99999",
                    source_slug="central_pet",
                    sku="99999",
                    expected_status="success",
                    actual_status="failed",
                    passed=False,
                    confidence=0.0,
                    error_message="Expected success, got failed",
                    elapsed_seconds=2.1,
                ),
            ],
        )

    def test_json_report_writes_file(self):
        summary = self._make_summary()
        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir)
            write_json_report(summary, output_dir)

            report_path = output_dir / "results.json"
            assert report_path.exists()

            report = json.loads(report_path.read_text(encoding="utf-8"))
            assert report["total"] == 3
            assert report["passed"] == 2
            assert report["failed"] == 1
            assert len(report["results"]) == 3

    def test_markdown_report_writes_file(self):
        summary = self._make_summary()
        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir)
            write_markdown_report(summary, output_dir)

            report_path = output_dir / "report.md"
            assert report_path.exists()

            content = report_path.read_text(encoding="utf-8")
            assert "Distributor Adapter Smoke Test Report" in content
            assert "66.7%" in content  # 2/3 pass rate
            assert "E-Z HANG SCALE" in content
            assert "Failure Details" in content

    def test_json_report_handles_empty(self):
        summary = SmokeTestSummary()
        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir)
            write_json_report(summary, output_dir)

            report = json.loads((output_dir / "results.json").read_text(encoding="utf-8"))
            assert report["total"] == 0
            assert report["pass_rate"] == "N/A"
